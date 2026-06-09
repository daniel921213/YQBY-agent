from __future__ import annotations

import threading
import time
from typing import Any

import httpx

from app.core.config import get_settings
from app.data_sources.binance_client import _RateLimiter, _TTLCache


class GateHttpClient:
    """Shared, thread-safe HTTP client for Gate's public futures v4 endpoints.

    Reuses the same TTL response cache + requests/sec limiter + 429 backoff as
    the Binance client, pointed at ``api.gateio.ws``. Public market data only —
    no API keys are ever sent.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._base_url = settings.gate_base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=settings.gate_request_timeout,
            headers={"Accept": "application/json"},
        )
        self._cache = _TTLCache(settings.data_cache_ttl_seconds)
        self._limiter = _RateLimiter(settings.gate_max_requests_per_second)

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

            if response.status_code == 429:  # rate limited
                retry_after = float(response.headers.get("Retry-After", "1"))
                time.sleep(max(retry_after, 1.0) * (attempt + 1))
                continue

            response.raise_for_status()
            data = response.json()
            if cache:
                self._cache.set(cache_key, data)
            return data

        raise RuntimeError(f"Gate request failed after {max_retries} retries: {path}") from last_exc


_client_lock = threading.Lock()
_client: GateHttpClient | None = None


def get_gate_client() -> GateHttpClient:
    """Process-wide singleton so the cache and rate limiter are shared."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = GateHttpClient()
    return _client
