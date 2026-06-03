from __future__ import annotations

import threading
import time
from typing import Any

import httpx

from app.core.config import get_settings


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

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + self._ttl, value)


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


class BinanceHttpClient:
    """Shared, thread-safe HTTP client for Binance futures public endpoints.

    Adds a response TTL cache (so the frontend's polling reuses data), a
    requests/sec rate limiter, and automatic backoff on 429/418 (rate-limit /
    IP-ban warnings) so a full-universe scan stays within Binance's limits.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._base_url = settings.binance_base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=settings.binance_request_timeout,
            headers={"Accept": "application/json"},
        )
        self._cache = _TTLCache(settings.data_cache_ttl_seconds)
        self._limiter = _RateLimiter(settings.binance_max_requests_per_second)

    def get_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        cache: bool = True,
        max_retries: int = 3,
    ) -> Any:
        cache_key = f"{path}?{sorted((params or {}).items())}"
        if cache:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            self._limiter.acquire()
            try:
                response = self._client.get(path, params=params)
            except httpx.HTTPError as exc:  # network/timeout
                last_exc = exc
                time.sleep(0.5 * (attempt + 1))
                continue

            if response.status_code in (418, 429):
                # Rate limited / banned: respect Retry-After then back off.
                retry_after = float(response.headers.get("Retry-After", "2"))
                time.sleep(max(retry_after, 1.0) * (attempt + 1))
                continue

            response.raise_for_status()
            data = response.json()
            if cache:
                self._cache.set(cache_key, data)
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
