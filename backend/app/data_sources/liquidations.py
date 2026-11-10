"""Liquidation flow for the Binance pipeline: Gate first, then Bitget.

Binance only publishes one liquidation per symbol per second, so its public
feed undercounts cascades. Gate's contract_stats carries complete 5m/15m
liquidation totals; Bitget's public liquidation records cover contracts Gate
does not list. When neither has the contract the frame is empty and every
consumer treats liquidations as MISSING (never as a genuine zero).

Besides the long/short notionals the frame carries the liquidation venue's own
open interest (`liq_ref_oi_usd`) and turnover (`liq_ref_quote_volume`), so
intensity ratios divide a venue's liquidations by that same venue's size.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Literal

import httpx
import pandas as pd

from app.core.config import get_settings
from app.data_sources.binance_client import _TTLCache, seconds_until_boundary
from app.data_sources.gate_client import get_gate_client
from app.utils.timeframes import timeframe_to_seconds

logger = logging.getLogger("uvicorn.error.liquidations")

LiquidationSource = Literal["GATE", "BITGET"]

LIQUIDATION_COLUMNS = [
    "timestamp",
    "long_liq_usd",
    "short_liq_usd",
    "liq_ref_oi_usd",
    "liq_ref_quote_volume",
]

_GATE_CONTRACTS_TTL = 600.0
# Liquidations always read Gate's 5m stats (also for the 15m frame): Gate
# publishes 5m buckets promptly, while its 15m rows lag a bucket behind. One
# 600-row request covers both frames, so they share a single cached call.
_GATE_LIQ_INTERVAL = 300
_GATE_LIQ_ROWS = 600
_BITGET_LIQ_PATH = "/api/v3/market/liquidations"
_BITGET_PAGE_LIMIT = 100
_BITGET_MAX_PAGES = 4
# The 5m risk radar needs ~9h of history (12-bar windows + a 96-bar baseline);
# the 15m frame only reads the latest hour.
_BITGET_MIN_COVERAGE_SECONDS = 9 * 3_600


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=LIQUIDATION_COLUMNS)


class _GateContracts:
    """Cached set of Gate USDT contracts (display symbols, e.g. BTCUSDT).

    Single-flight: a scan fans out across many threads, and only one of them
    may download the (large) contract list. A failed refresh keeps the last
    good set; with no set at all it returns None and callers try Gate anyway.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._symbols: frozenset[str] = frozenset()
        self._loaded_at = float("-inf")
        self._retry_at = float("-inf")

    def get(self) -> frozenset[str] | None:
        with self._lock:
            now = time.monotonic()
            if self._symbols and now - self._loaded_at < _GATE_CONTRACTS_TTL:
                return self._symbols
            if now < self._retry_at:
                return self._symbols or None
            try:
                rows = get_gate_client().get_json("/futures/usdt/contracts")
                symbols = frozenset(
                    str(row.get("name", "")).replace("_", "")
                    for row in rows or []
                    if str(row.get("name", "")).endswith("_USDT")
                    and not bool(row.get("in_delisting", False))
                )
                if not symbols:
                    raise RuntimeError("empty Gate contract list")
                self._symbols = symbols
                self._loaded_at = time.monotonic()
            except Exception as exc:
                self._retry_at = time.monotonic() + 30.0
                logger.warning("Gate contract list refresh failed: %s", type(exc).__name__)
            return self._symbols or None


_gate_contracts = _GateContracts()


def _gate_liquidations(symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
    # Reuse the Gate pipeline's contract_stats aggregation unchanged.
    from app.data_sources.gate_live import _stats_frame, _to_contract

    frame_seconds = timeframe_to_seconds(timeframe)
    if frame_seconds % _GATE_LIQ_INTERVAL:
        return _empty()
    stats = get_gate_client().get_json(
        "/futures/usdt/contract_stats",
        params={"contract": _to_contract(symbol), "interval": "5m", "limit": _GATE_LIQ_ROWS},
        # Expire right after each 5m boundary so a just-closed bucket is
        # never missing next to a fresh Binance candle.
        ttl=seconds_until_boundary(_GATE_LIQ_INTERVAL, lag_seconds=5.0),
    )
    frame = _stats_frame(stats or [], frame_seconds, _GATE_LIQ_INTERVAL)
    if frame.empty:
        return _empty()

    qty = pd.to_numeric(frame["open_interest_qty"], errors="coerce")
    usd = pd.to_numeric(frame["open_interest_usd"], errors="coerce")
    usd_per_contract = (usd / qty).where(qty > 0)
    # Every trade has exactly one taker, so taker buy + sell size is the
    # bucket's full volume in contracts; valued at the bucket's USD/contract.
    contracts = frame["buy_volume"] + frame["sell_volume"]
    turnover = (contracts * usd_per_contract).where(frame["flow_quality"] == "REAL")

    out = pd.DataFrame(
        {
            "timestamp": frame["timestamp"].astype("int64"),
            "long_liq_usd": pd.to_numeric(frame["long_liq_usd"], errors="coerce"),
            "short_liq_usd": pd.to_numeric(frame["short_liq_usd"], errors="coerce"),
            "liq_ref_oi_usd": usd.where(usd > 0),
            "liq_ref_quote_volume": turnover,
        }
    )
    now = int(time.time())
    out = out.loc[out["timestamp"] + frame_seconds <= now]
    return out.tail(limit).reset_index(drop=True)


class _BitgetLiquidations:
    """Bitget public liquidation records, bucketed into candle frames."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = httpx.Client(
            base_url=settings.bitget_base_url.rstrip("/"),
            timeout=10.0,
            headers={"Accept": "application/json"},
        )
        self._cache = _TTLCache(60.0)
        self._lock = threading.Lock()
        self._last_call = 0.0

    def _page(self, symbol: str, cursor: str | None) -> tuple[list[dict], str | None]:
        params: dict[str, object] = {
            "category": "USDT-FUTURES",
            "symbol": symbol,
            "limit": _BITGET_PAGE_LIMIT,
        }
        if cursor:
            params["cursor"] = cursor
        with self._lock:  # ~5 req/s keeps well inside Bitget's public limits
            wait = self._last_call + 0.2 - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
        response = self._client.get(_BITGET_LIQ_PATH, params=params)
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != "00000":
            raise RuntimeError(f"Bitget liquidation request failed: {payload.get('msg')}")
        data = payload.get("data") or {}
        rows = data.get("list") or []
        next_cursor = data.get("cursor")
        return rows, (str(next_cursor) if next_cursor else None)

    def records(self, symbol: str, needed_seconds: int) -> tuple[list[dict], int | None]:
        """Records plus the oldest time they fully cover (None = everything
        the venue still holds)."""

        key = f"{symbol}:{needed_seconds}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        horizon_ms = (time.time() - needed_seconds) * 1000
        rows: list[dict] = []
        cursor: str | None = None
        exhausted = False
        for _ in range(_BITGET_MAX_PAGES):
            page, cursor = self._page(symbol, cursor)
            rows.extend(page)
            if len(page) < _BITGET_PAGE_LIMIT or not cursor:
                exhausted = True  # the venue has nothing older to return
                break
            if min(int(r.get("ts", 0)) for r in page) <= horizon_ms:
                break
        covered_from: int | None = None
        if not exhausted and rows:
            covered_from = min(int(r.get("ts", 0)) for r in rows) // 1000
        result = (rows, covered_from)
        self._cache.set(key, result, seconds_until_boundary(300, lag_seconds=20.0))
        return result


_bitget_liquidations: _BitgetLiquidations | None = None
_bitget_lock = threading.Lock()


def _bitget() -> _BitgetLiquidations:
    global _bitget_liquidations
    if _bitget_liquidations is None:
        with _bitget_lock:
            if _bitget_liquidations is None:
                _bitget_liquidations = _BitgetLiquidations()
    return _bitget_liquidations


def bitget_frame(
    records: list[dict],
    covered_from: int | None,
    timeframe: str,
    limit: int,
    *,
    now: int | None = None,
) -> pd.DataFrame:
    """Bucket Bitget liquidation records into closed candle frames.

    A forced SELL closes a long position (long liquidation); a forced BUY
    closes a short. Buckets before `covered_from` are left out entirely so
    they read as MISSING rather than as zero liquidations.
    """

    frame_seconds = timeframe_to_seconds(timeframe)
    now_s = int(time.time()) if now is None else int(now)
    last_closed = (now_s // frame_seconds) * frame_seconds - frame_seconds
    first = last_closed - frame_seconds * (max(limit, 1) - 1)
    if covered_from is not None:
        first = max(first, ((covered_from // frame_seconds) + 1) * frame_seconds)
    if first > last_closed:
        return _empty()
    buckets = pd.DataFrame({"timestamp": range(first, last_closed + 1, frame_seconds)})
    buckets["long_liq_usd"] = 0.0
    buckets["short_liq_usd"] = 0.0

    parsed = []
    for row in records:
        try:
            ts = int(row["ts"]) // 1000
            notional = float(row["price"]) * float(row["amount"])
        except (KeyError, TypeError, ValueError):
            continue
        side = str(row.get("side", "")).lower()
        if side not in {"buy", "sell"} or notional <= 0:
            continue
        parsed.append(
            {
                "timestamp": (ts // frame_seconds) * frame_seconds,
                "long_liq_usd": notional if side == "sell" else 0.0,
                "short_liq_usd": notional if side == "buy" else 0.0,
            }
        )
    if parsed:
        sums = pd.DataFrame(parsed).groupby("timestamp", as_index=False).sum()
        buckets = buckets.merge(sums, on="timestamp", how="left", suffixes=("_zero", ""))
        buckets["long_liq_usd"] = buckets["long_liq_usd"].fillna(0.0)
        buckets["short_liq_usd"] = buckets["short_liq_usd"].fillna(0.0)
        buckets = buckets.drop(columns=["long_liq_usd_zero", "short_liq_usd_zero"])
    buckets["liq_ref_oi_usd"] = float("nan")
    buckets["liq_ref_quote_volume"] = float("nan")
    return buckets[LIQUIDATION_COLUMNS]


def fetch_liquidations(
    symbol: str,
    timeframe: str,
    limit: int,
    *,
    bitget_symbols: frozenset[str] | set[str] | None = None,
) -> tuple[pd.DataFrame, LiquidationSource | None]:
    """Liquidation frame for one symbol plus the venue it came from."""

    gate_symbols = _gate_contracts.get()
    if gate_symbols is None or symbol in gate_symbols:
        try:
            frame = _gate_liquidations(symbol, timeframe, limit)
            if not frame.empty:
                return frame, "GATE"
        except Exception as exc:  # Gate outage => try Bitget
            logger.warning("Gate liquidations failed for %s %s: %s", symbol, timeframe, type(exc).__name__)

    if bitget_symbols is not None and symbol not in bitget_symbols:
        return _empty(), None
    try:
        frame_seconds = timeframe_to_seconds(timeframe)
        needed = min(limit * frame_seconds, _BITGET_MIN_COVERAGE_SECONDS)
        records, covered_from = _bitget().records(symbol, needed)
        # Never report buckets older than what was requested as zero.
        horizon = int(time.time()) - needed
        covered = horizon if covered_from is None else max(covered_from, horizon)
        frame = bitget_frame(records, covered, timeframe, limit)
        if not frame.empty:
            return frame, "BITGET"
    except Exception as exc:
        logger.warning("Bitget liquidations failed for %s %s: %s", symbol, timeframe, type(exc).__name__)
    return _empty(), None
