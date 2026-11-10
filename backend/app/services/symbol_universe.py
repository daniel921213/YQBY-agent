"""Bitget eligibility for both dashboards.

Each dashboard only scans contracts Bitget also lists (members trade there).
Prices, ranking and analysis come from the data provider (Binance; Gate in
the legacy/failover pipeline) — Bitget only decides which symbols qualify.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Callable, Iterable

import httpx

from app.core.config import get_settings
from app.core.markets import Market

logger = logging.getLogger("uvicorn.error.symbol_universe")
INSTRUMENTS_URL = "https://api.bitget.com/api/v3/market/instruments"


class UniverseUnavailable(RuntimeError):
    pass


class UnsupportedSymbol(ValueError):
    pass


def bitget_symbols(payload: dict, market: Market = "crypto") -> set[str]:
    if not isinstance(payload, dict) or payload.get("code") != "00000":
        raise UniverseUnavailable("Bitget instrument response failed")
    rows = payload.get("data")
    if not isinstance(rows, list) or not rows:
        raise UniverseUnavailable("Bitget instrument list is empty or invalid")
    symbols = set()
    for row in rows:
        if not isinstance(row, dict):
            raise UniverseUnavailable("Invalid Bitget instrument row")
        symbol_type = str(row.get("symbolType") or "")
        wanted_type = symbol_type == "crypto" if market == "crypto" else (
            bool(symbol_type) and symbol_type != "crypto"
        )
        if (row.get("category") != "USDT-FUTURES"
                or row.get("type") != "perpetual"
                or row.get("status") != "online"
                or not wanted_type
                or row.get("quoteCoin") != "USDT"):
            continue
        base, symbol = row.get("baseCoin", ""), row.get("symbol", "")
        # Exact base/quote identity only. Never strip numeric multipliers or
        # guess aliases for renamed coins (e.g. PEPE != 1000PEPE).
        if isinstance(base, str) and re.fullmatch(r"[A-Z0-9]+", base) and symbol == base + "USDT":
            symbols.add(symbol)
    if not symbols:
        raise UniverseUnavailable(f"Bitget returned no eligible {market} perpetuals")
    return symbols


def fetch_bitget_symbols(market: Market = "crypto") -> set[str]:
    response = httpx.get(INSTRUMENTS_URL, params={"category": "USDT-FUTURES"}, timeout=10.0)
    response.raise_for_status()
    return bitget_symbols(response.json(), market)


class SymbolUniverse:
    """Single refresh at a time; bounded last-good fallback, never provider-only."""

    def __init__(self, fetch=fetch_bitget_symbols, clock=time.monotonic,
                 refresh_seconds=300.0, max_age_seconds=1800.0, retry_seconds=30.0):
        self._fetch = fetch
        self._clock = clock
        self._refresh = refresh_seconds
        self._max_age = max_age_seconds
        self._retry = retry_seconds
        self._lock = threading.Lock()
        self._symbols: tuple[str, ...] = ()
        self._bitget: frozenset[str] = frozenset()
        self._source_key: str | None = None
        self._success_at = float("-inf")
        self._retry_at = float("-inf")

    @property
    def bitget(self) -> frozenset[str]:
        """Last successfully fetched Bitget set (empty before the first refresh)."""
        with self._lock:
            return self._bitget

    def symbols(self, provider_loader: Callable[[], list[str]], source_key: str | None = None) -> list[str]:
        with self._lock:
            now = self._clock()
            same_source = source_key == self._source_key
            if self._symbols and same_source and now - self._success_at < self._refresh:
                return list(self._symbols)
            if now >= self._retry_at or not same_source:
                try:
                    bitget = self._fetch()
                    provider = provider_loader()
                    shared = tuple(dict.fromkeys(s for s in provider if s in bitget))
                    if not shared:
                        raise UniverseUnavailable("No shared perpetual contracts")
                    self._symbols = shared
                    self._bitget = frozenset(bitget)
                    self._source_key = source_key
                    self._success_at = self._clock()
                    self._retry_at = self._success_at + self._refresh
                    logger.info("Symbol universe refreshed: bitget=%d provider=%d shared=%d source=%s",
                                len(bitget), len(provider), len(shared), source_key)
                    return list(shared)
                except Exception as exc:
                    self._retry_at = self._clock() + self._retry
                    logger.warning("Symbol universe refresh failed: %s", type(exc).__name__)
            if self._symbols and self._clock() - self._success_at < self._max_age:
                return list(self._symbols)
            raise UniverseUnavailable("商品名單暫時無法更新，請稍後再試。")


symbol_universes: dict[Market, SymbolUniverse] = {
    "crypto": SymbolUniverse(fetch=lambda: fetch_bitget_symbols("crypto")),
    "tradfi": SymbolUniverse(fetch=lambda: fetch_bitget_symbols("tradfi")),
}
# Backward-compatible name for the crypto universe.
symbol_universe = symbol_universes["crypto"]


def allowed_symbols(market: Market = "crypto") -> set[str] | None:
    """The dashboard's current eligible symbols; None for the mock provider."""

    if not get_settings().is_live_provider:
        return None
    from app.services.market_data_service import build_market_source

    return set(build_market_source(market).list_symbols())


def require_supported_symbols(symbols: Iterable[str], market: Market = "crypto") -> None:
    allowed = allowed_symbols(market)
    if allowed is not None:
        invalid = sorted(set(symbols) - allowed)
        if invalid:
            raise UnsupportedSymbol("不在 Bitget 共同永續合約名單：" + ", ".join(invalid))
