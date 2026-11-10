from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("uvicorn.error.binance")


class _TTLCache:
    """Tiny thread-safe TTL cache for parsed JSON responses."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.monotonic() > expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        lifetime = self._ttl if ttl is None else max(float(ttl), 0.0)
        with self._lock:
            self._store[key] = (time.monotonic() + lifetime, value)
            if len(self._store) > 20_000:
                # Bounded memory: drop expired entries once the map grows large.
                now = time.monotonic()
                for stale in [k for k, (exp, _v) in self._store.items() if exp < now]:
                    self._store.pop(stale, None)


class _RateLimiter:
    """Spaces outbound requests to stay under a requests/sec soft cap."""

    def __init__(self, max_per_second: float) -> None:
        self._min_interval = 1.0 / max_per_second if max_per_second > 0 else 0.0
        self._lock = threading.Lock()
        self._next_allowed = 0.0

    def acquire(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                time.sleep(wait)
                now = time.monotonic()
            self._next_allowed = now + self._min_interval


class BinanceRestricted(RuntimeError):
    """Binance refused the server's location (HTTP 451)."""


class _BlockState:
    """Process-wide memory of a Binance geo-block so callers can fail over."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._blocked_until = 0.0

    def mark(self, seconds: float) -> None:
        with self._lock:
            self._blocked_until = time.monotonic() + max(seconds, 1.0)

    def clear(self) -> None:
        with self._lock:
            self._blocked_until = 0.0

    @property
    def blocked(self) -> bool:
        with self._lock:
            return time.monotonic() < self._blocked_until


binance_block = _BlockState()


def seconds_until_boundary(period_seconds: int, lag_seconds: float = 45.0) -> float:
    """Cache lifetime that expires just after the next `period` boundary.

    Binance statistics only gain a row once per period, so re-fetching inside
    the same period returns identical data; `lag` gives the exchange time to
    publish the new row.
    """

    now = time.time()
    next_boundary = (int(now // period_seconds) + 1) * period_seconds
    return max(next_boundary + lag_seconds - now, 5.0)


class BinanceHttpClient:
    """Shared, thread-safe HTTP client for Binance futures public endpoints.

    Adds a response TTL cache (so the frontend's polling reuses data), a
    global requests/sec limiter plus per-endpoint limiters for the separately
    budgeted statistics/funding endpoints, and automatic backoff on 429/418.
    HTTP 451 (geo-block) raises BinanceRestricted and short-circuits further
    calls for a cooldown so the scanner can fail over to Gate.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._base_url = settings.binance_base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=settings.binance_request_timeout,
            headers={"Accept": "application/json"},
        )
        self._cache = _TTLCache(settings.data_cache_ttl_seconds)
        self._limiter = _RateLimiter(settings.binance_max_requests_per_second)
        self._path_limiters: dict[str, _RateLimiter] = {}
        self._path_lock = threading.Lock()
        # Network requests per endpoint since the last stats() call (cache
        # hits excluded) — logged after every scan to watch the budgets.
        self._counts: Counter[str] = Counter()

    def stats(self) -> dict[str, int]:
        with self._path_lock:
            counts = dict(self._counts)
            self._counts.clear()
        return counts

    def _path_limiter(self, path: str) -> _RateLimiter | None:
        if path.startswith("/futures/data/"):
            rate = self._settings.binance_stats_max_requests_per_second
        elif path in ("/fapi/v1/fundingRate", "/fapi/v1/fundingInfo"):
            rate = self._settings.binance_funding_max_requests_per_second
            path = "/fapi/v1/funding*"  # these two share one budget
        else:
            return None
        with self._path_lock:
            limiter = self._path_limiters.get(path)
            if limiter is None:
                limiter = _RateLimiter(rate)
                self._path_limiters[path] = limiter
            return limiter

    def get_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        cache: bool = True,
        ttl: float | None = None,
        max_retries: int = 3,
    ) -> Any:
        cache_key = f"{path}?{sorted((params or {}).items())}"
        if cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        if binance_block.blocked:
            raise BinanceRestricted("Binance is geo-blocking this server")

        path_limiter = self._path_limiter(path)
        last_exc: Exception | None = None
        for attempt in range(max_retries):
            if path_limiter is not None:
                path_limiter.acquire()
            self._limiter.acquire()
            with self._path_lock:
                self._counts[path] += 1
            try:
                response = self._client.get(path, params=params)
            except httpx.HTTPError as exc:  # network/timeout
                last_exc = exc
                time.sleep(0.5 * (attempt + 1))
                continue

            if response.status_code == 451:
                binance_block.mark(self._settings.binance_block_cooldown_seconds)
                raise BinanceRestricted(
                    "Binance returned HTTP 451 (restricted location)"
                )
            if response.status_code in (418, 429):
                # Rate limited / banned: respect Retry-After then back off.
                retry_after = float(response.headers.get("Retry-After", "2"))
                logger.warning("Binance %s on %s (retry-after %.0fs)", response.status_code, path, retry_after)
                time.sleep(max(retry_after, 1.0) * (attempt + 1))
                continue

            response.raise_for_status()
            data = response.json()
            if cache:
                self._cache.set(cache_key, data, ttl)
            return data

        raise RuntimeError(
            f"Binance request failed after {max_retries} retries: {path}"
        ) from last_exc


_client_lock = threading.Lock()
_client: BinanceHttpClient | None = None


def get_binance_client() -> BinanceHttpClient:
    """Process-wide singleton so the cache and rate limiter are shared."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = BinanceHttpClient()
    return _client
