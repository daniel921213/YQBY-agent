"""Per-IP in-memory rate limiter (single-worker deployment).

Sliding window keyed by an arbitrary string (caller prefixes with a scope,
e.g. "reg:1.2.3.4"). Matches the project's existing in-memory guard style in
activation_service — swap for Redis if the app ever runs multiple workers.
"""

from __future__ import annotations

import time

from fastapi import Request

# key -> list of monotonic hit timestamps (pruned to the active window on read)
_HITS: dict[str, list[float]] = {}


class RateLimitedError(RuntimeError):
    """Too many requests in the window (HTTP 429)."""


def client_ip(request: Request) -> str:
    """Best-effort client IP. Behind Railway's proxy the real client is the
    left-most hop of X-Forwarded-For; fall back to the socket peer."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _prune(key: str, window_seconds: float, now: float) -> list[float]:
    hits = [t for t in _HITS.get(key, []) if now - t < window_seconds]
    if hits:
        _HITS[key] = hits
    else:
        _HITS.pop(key, None)
    return hits


def is_over_limit(key: str, limit: int, window_seconds: float) -> bool:
    """True if `key` already has >= limit hits inside the window (peek only)."""
    return len(_prune(key, window_seconds, time.monotonic())) >= limit


def record_hit(key: str, window_seconds: float) -> None:
    now = time.monotonic()
    hits = _prune(key, window_seconds, now)
    hits.append(now)
    _HITS[key] = hits


def clear(key: str) -> None:
    _HITS.pop(key, None)


def reset() -> None:
    """Wipe all state (tests)."""
    _HITS.clear()
