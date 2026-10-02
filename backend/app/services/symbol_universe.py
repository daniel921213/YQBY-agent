"""Bitget eligibility only. All prices, ranking and analysis still use Gate."""

from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Callable, Iterable

import httpx

from app.core.config import get_settings

logger = logging.getLogger("uvicorn.error.symbol_universe")
INSTRUMENTS_URL = "https://api.bitget.com/api/v3/market/instruments"


class UniverseUnavailable(RuntimeError):
    pass


class UnsupportedSymbol(ValueError):
    pass


def bitget_symbols(payload: dict) -> set[str]:
    if not isinstance(payload, dict) or payload.get("code") != "00000":
        raise UniverseUnavailable("Bitget instrument response failed")
    rows = payload.get("data")
    if not isinstance(rows, list) or not rows:
        raise UniverseUnavailable("Bitget instrument list is empty or invalid")
    symbols = set()
    for row in rows:
        if not isinstance(row, dict):
            raise UniverseUnavailable("Invalid Bitget instrument row")
        if (row.get("category") != "USDT-FUTURES"
                or row.get("type") != "perpetual"
                or row.get("status") != "online"
                or row.get("symbolType") != "crypto"
                or row.get("quoteCoin") != "USDT"):
            continue
        base, symbol = row.get("baseCoin", ""), row.get("symbol", "")
        # Exact base/quote identity only. Never strip numeric multipliers or
        # guess aliases for renamed coins (e.g. PEPE != 1000PEPE).
        if isinstance(base, str) and re.fullmatch(r"[A-Z0-9]+", base) and symbol == base + "USDT":
            symbols.add(symbol)
    if not symbols:
        raise UniverseUnavailable("Bitget returned no eligible crypto perpetuals")
    return symbols


def fetch_bitget_symbols() -> set[str]:
    response = httpx.get(INSTRUMENTS_URL, params={"category": "USDT-FUTURES"}, timeout=10.0)
    response.raise_for_status()
    return bitget_symbols(response.json())


class SymbolUniverse:
    """Single refresh at a time; bounded last-good fallback, never Gate-only."""

    def __init__(self, fetch=fetch_bitget_symbols, clock=time.monotonic,
                 refresh_seconds=300.0, max_age_seconds=1800.0, retry_seconds=30.0):
        self._fetch = fetch
        self._clock = clock
        self._refresh = refresh_seconds
        self._max_age = max_age_seconds
        self._retry = retry_seconds
        self._lock = threading.Lock()
        self._symbols: tuple[str, ...] = ()
        self._success_at = float("-inf")
        self._retry_at = float("-inf")

    def symbols(self, gate_loader: Callable[[], list[str]]) -> list[str]:
        with self._lock:
            now = self._clock()
            if self._symbols and now - self._success_at < self._refresh:
                return list(self._symbols)
            if now >= self._retry_at:
                try:
                    bitget = self._fetch()
                    gate = gate_loader()
                    shared = tuple(dict.fromkeys(s for s in gate if s in bitget))
                    if not shared:
                        raise UniverseUnavailable("No shared perpetual contracts")
                    self._symbols = shared
                    self._success_at = self._clock()
                    self._retry_at = self._success_at + self._refresh
                    logger.info("Symbol universe refreshed: bitget=%d gate=%d shared=%d (uncapped)",
                                len(bitget), len(gate), len(shared))
                    return list(shared)
                except Exception as exc:
                    self._retry_at = self._clock() + self._retry
                    logger.warning("Symbol universe refresh failed: %s", type(exc).__name__)
            if self._symbols and self._clock() - self._success_at < self._max_age:
                return list(self._symbols)
            raise UniverseUnavailable("幣種名單暫時無法更新，請稍後再試。")


symbol_universe = SymbolUniverse()


def allowed_symbols() -> set[str] | None:
    if get_settings().data_provider.lower() != "gate":
        return None
    from app.data_sources.gate_live import GateLiveMarketDataSource
    return set(GateLiveMarketDataSource().list_symbols())


def require_supported_symbols(symbols: Iterable[str]) -> None:
    allowed = allowed_symbols()
    if allowed is not None:
        invalid = sorted(set(symbols) - allowed)
        if invalid:
            raise UnsupportedSymbol("不在 Bitget / Gate 共同永續合約名單：" + ", ".join(invalid))
