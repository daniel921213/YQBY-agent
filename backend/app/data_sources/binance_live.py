"""Live Binance USDⓈ-M futures for both dashboards.

Crypto and TradFi perpetuals share every endpoint; only the contract family
differs. Statistics (OI, long/short ratios) are period snapshots: a row
stamped T is keyed to the candle that opens at T, exactly like Gate's
contract_stats, so derivatives never run ahead of the closed candles.
Liquidations come from Gate (then Bitget) because Binance's public feed is
sampled at one order per second.
"""

from __future__ import annotations

import threading
import time

import pandas as pd

from app.core.markets import TRADFI_UNDERLYING_TYPES, Market
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.binance_client import get_binance_client, seconds_until_boundary
from app.data_sources.liquidations import fetch_liquidations
from app.indicators.crowding import snap_funding_interval
from app.utils.timeframes import timeframe_to_seconds

# Binance /futures/data statistics endpoints only accept these periods.
_STATS_PERIODS = {"5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"}
_STATS_LIMIT_CAP = 500
# The 5m frame only feeds the risk radar, which never reads long/short
# ratios; skipping them there saves a third of the ratio-endpoint budget.
_NO_RATIO_TIMEFRAMES = {"5m"}
_KLINE_LIMIT_CAP = 1_500
_FUNDING_MAX_AGE_SECONDS = 86_400
_INSTRUMENT_TTL = 600.0
# Seconds after a period boundary before the new statistics row is trusted to
# be published (measured: long/short rows within ~3 min, OI within ~6 min).
_STATS_PUBLISH_LAG = {
    "/futures/data/openInterestHist": 60.0,
    "/futures/data/topLongShortAccountRatio": 45.0,
    "/futures/data/globalLongShortAccountRatio": 45.0,
}

DERIVATIVE_COLUMNS = [
    "timestamp",
    "open_interest_qty",
    "open_interest_usd",
    "open_interest",
    "top_trader_long_short_ratio",
    "top_position_long_short_ratio",
    "account_long_short_ratio",
    "long_liq_usd",
    "short_liq_usd",
    "liq_ref_oi_usd",
    "liq_ref_quote_volume",
    "liquidation_source",
    "funding_rate_settled",
    "funding_rate_current",
    "funding_rate_next",
    "funding_next_apply",
    "funding_interval",
    "funding_rate",
    "funding_rate_quality",
]


class _Instruments:
    """Cached exchangeInfo: symbol -> (contractType, underlyingType)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._rows: dict[str, tuple[str, str]] = {}
        self._loaded_at = float("-inf")

    def get(self) -> dict[str, tuple[str, str]]:
        with self._lock:
            if self._rows and time.monotonic() - self._loaded_at < _INSTRUMENT_TTL:
                return self._rows
        info = get_binance_client().get_json("/fapi/v1/exchangeInfo", ttl=_INSTRUMENT_TTL)
        rows = {
            str(s["symbol"]): (str(s.get("contractType", "")), str(s.get("underlyingType", "")))
            for s in info.get("symbols", [])
            if s.get("status") == "TRADING" and s.get("quoteAsset") == "USDT"
        }
        with self._lock:
            self._rows = rows
            self._loaded_at = time.monotonic()
        return rows


_instruments = _Instruments()


def _belongs(market: Market, contract_type: str, underlying: str) -> bool:
    if market == "crypto":
        return contract_type == "PERPETUAL" and underlying == "COIN"
    return contract_type == "TRADIFI_PERPETUAL" and underlying in TRADFI_UNDERLYING_TYPES


def underlying_type(symbol: str) -> str | None:
    """Binance underlyingType (e.g. EQUITY, COMMODITY) or None if unknown."""

    try:
        row = _instruments.get().get(symbol)
    except Exception:
        return None
    return row[1] if row else None


def binance_ranked_symbols(market: Market) -> list[str]:
    """Tradable USDT perpetuals of one family, most 24h turnover first."""

    rows = _instruments.get()
    tradable = {
        symbol for symbol, (contract, underlying) in rows.items()
        if _belongs(market, contract, underlying)
    }
    tickers = get_binance_client().get_json("/fapi/v1/ticker/24hr", ttl=120.0)
    ranked = sorted(
        (t for t in tickers if t.get("symbol") in tradable),
        key=lambda t: float(t.get("quoteVolume", 0.0) or 0.0),
        reverse=True,
    )
    return [str(t["symbol"]) for t in ranked]


def _number(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return float("nan")


class BinanceLiveMarketDataSource(MarketDataSource):
    """Closed USDT-M candles with Binance's own taker buy/sell split."""

    def __init__(self, market: Market = "crypto") -> None:
        self._client = get_binance_client()
        self._market = market

    def list_symbols(self) -> list[str]:
        from app.services.symbol_universe import symbol_universes

        return symbol_universes[self._market].symbols(
            lambda: binance_ranked_symbols(self._market), source_key="binance"
        )

    def get_klines(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        frame_seconds = timeframe_to_seconds(timeframe)
        rows = self._client.get_json(
            "/fapi/v1/klines",
            params={
                "symbol": symbol,
                "interval": timeframe,
                "limit": min(max(limit + 1, 2), _KLINE_LIMIT_CAP),
            },
            # A new closed candle exists right after each boundary.
            ttl=seconds_until_boundary(frame_seconds, lag_seconds=2.0),
        )
        if not rows:
            raise RuntimeError(f"No klines returned for {symbol} {timeframe}")

        frame = pd.DataFrame(
            rows,
            columns=[
                "open_time", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades",
                "taker_buy_base", "taker_buy_quote", "ignore",
            ],
        )
        for column in ("open", "high", "low", "close", "volume", "quote_volume", "taker_buy_base"):
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame["timestamp"] = (frame["open_time"].astype("int64") // 1000).astype("int64")
        now = int(time.time())
        frame = frame.loc[frame["timestamp"] + frame_seconds <= now].copy()
        frame = frame.sort_values("timestamp").tail(limit).reset_index(drop=True)
        if frame.empty:
            raise RuntimeError(f"No closed klines returned for {symbol} {timeframe}")

        frame["buy_volume"] = frame["taker_buy_base"].fillna(0.0)
        frame["sell_volume"] = (frame["volume"] - frame["taker_buy_base"]).clip(lower=0.0).fillna(0.0)
        real = frame["volume"].notna() & frame["taker_buy_base"].notna()
        frame["flow_quality"] = "MISSING"
        frame.loc[real, "flow_quality"] = "REAL"
        frame["cvd_proxy"] = (~real).astype(float)
        frame["is_closed"] = True
        return frame[
            [
                "timestamp", "open", "high", "low", "close", "volume", "quote_volume",
                "buy_volume", "sell_volume", "cvd_proxy", "flow_quality", "is_closed",
            ]
        ]


class BinanceLiveDerivativesDataSource(DerivativesDataSource):
    """Binance OI, account/top-trader ratios and funding; Gate/Bitget liquidations."""

    def __init__(self, market: Market = "crypto") -> None:
        self._client = get_binance_client()
        self._market = market

    def _stats(self, path: str, symbol: str, period: str, limit: int) -> list[dict]:
        return self._client.get_json(
            path,
            params={"symbol": symbol, "period": period, "limit": min(limit, _STATS_LIMIT_CAP)},
            ttl=seconds_until_boundary(
                timeframe_to_seconds(period), lag_seconds=_STATS_PUBLISH_LAG.get(path, 45.0)
            ),
        ) or []

    def _levels(self, symbol: str, period: str, limit: int) -> pd.DataFrame:
        oi_rows = self._stats("/futures/data/openInterestHist", symbol, period, limit)
        if period in _NO_RATIO_TIMEFRAMES:
            top_rows: list[dict] = []
            account_rows: list[dict] = []
        else:
            top_rows = self._stats("/futures/data/topLongShortAccountRatio", symbol, period, limit)
            account_rows = self._stats("/futures/data/globalLongShortAccountRatio", symbol, period, limit)

        oi = pd.DataFrame(
            {
                "timestamp": [int(r["timestamp"]) // 1000 for r in oi_rows],
                "open_interest_qty": [_number(r.get("sumOpenInterest")) for r in oi_rows],
                "open_interest_usd": [_number(r.get("sumOpenInterestValue")) for r in oi_rows],
            }
        )
        top = pd.DataFrame(
            {
                "timestamp": [int(r["timestamp"]) // 1000 for r in top_rows],
                "top_trader_long_short_ratio": [_number(r.get("longShortRatio")) for r in top_rows],
            }
        )
        account = pd.DataFrame(
            {
                "timestamp": [int(r["timestamp"]) // 1000 for r in account_rows],
                "account_long_short_ratio": [_number(r.get("longShortRatio")) for r in account_rows],
            }
        )
        levels = oi
        for other in (top, account):
            levels = levels.merge(other, on="timestamp", how="outer")
        if levels.empty:
            return levels
        return (
            levels.astype({"timestamp": "int64"})
            .sort_values("timestamp")
            .drop_duplicates("timestamp", keep="last")
            .reset_index(drop=True)
        )

    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        if timeframe not in _STATS_PERIODS:
            return pd.DataFrame(columns=DERIVATIVE_COLUMNS)
        frame_seconds = timeframe_to_seconds(timeframe)
        levels = self._levels(symbol, timeframe, limit + 1)
        if not levels.empty:
            # Only snapshots keyed to an already closed candle.
            now = int(time.time())
            levels = levels.loc[levels["timestamp"] + frame_seconds <= now].tail(limit)

        liq, source = fetch_liquidations(
            symbol, timeframe, limit, bitget_symbols=self._bitget_symbols()
        )
        if levels.empty and (source is None or liq.empty):
            return pd.DataFrame(columns=DERIVATIVE_COLUMNS)

        merged = levels.copy()
        for column in ("open_interest_qty", "open_interest_usd",
                       "top_trader_long_short_ratio", "account_long_short_ratio"):
            if column not in merged.columns:
                merged[column] = pd.Series(dtype=float)
        merged["open_interest"] = merged["open_interest_qty"]
        # Not fetched: a display-only read that would cost a fourth statistics
        # endpoint per symbol. Downstream defaults it to neutral.
        merged["top_position_long_short_ratio"] = float("nan")

        if source is not None and not liq.empty:
            # Outer join: thin contracts have Binance statistics gaps (no row
            # while nothing trades), which must not drop the liquidation
            # venue's own buckets.
            merged = (
                merged.merge(liq, on="timestamp", how="outer")
                .sort_values("timestamp")
                .reset_index(drop=True)
            )
            merged["liquidation_source"] = source
        else:
            # No venue covers this contract: leave the liquidation columns out
            # so every consumer reads MISSING instead of a fabricated zero.
            merged = merged.drop(columns=[c for c in ("long_liq_usd", "short_liq_usd") if c in merged])
            merged["liq_ref_oi_usd"] = float("nan")
            merged["liq_ref_quote_volume"] = float("nan")
            merged["liquidation_source"] = ""

        merged = self._attach_funding(merged, symbol, limit)
        return merged[[c for c in DERIVATIVE_COLUMNS if c in merged.columns]]

    def _bitget_symbols(self) -> frozenset[str] | None:
        from app.services.symbol_universe import symbol_universes

        known = symbol_universes[self._market].bitget
        return known or None

    def _attach_funding(self, frame: pd.DataFrame, symbol: str, limit: int) -> pd.DataFrame:
        funding = self._fetch_funding(symbol)
        if funding.empty:
            merged = frame
            merged["funding_rate_settled"] = float("nan")
            merged["funding_interval"] = float("nan")
        else:
            merged = pd.merge_asof(
                frame.sort_values("timestamp"),
                funding.sort_values("timestamp"),
                on="timestamp",
                direction="backward",
                tolerance=_FUNDING_MAX_AGE_SECONDS,
            )
        merged["funding_rate_current"] = float("nan")
        merged["funding_rate_next"] = float("nan")
        merged["funding_next_apply"] = float("nan")
        merged["funding_rate"] = merged["funding_rate_settled"]
        merged["funding_rate_quality"] = "MISSING"
        merged.loc[merged["funding_rate_settled"].notna(), "funding_rate_quality"] = "SETTLED"

        # The indicative rate for the running period goes on the latest closed
        # bar only; broadcasting it into history would leak look-ahead.
        current = self._current_funding(symbol)
        if current is not None and len(merged):
            latest = merged.index[-1]
            merged.loc[latest, "funding_rate_current"] = current["rate"]
            merged.loc[latest, "funding_next_apply"] = current["next_apply"]
            merged.loc[latest, "funding_interval"] = current["interval"]
            merged.loc[latest, "funding_rate"] = current["rate"]
            merged.loc[latest, "funding_rate_quality"] = "CURRENT"
        return merged

    def _fetch_funding(self, symbol: str) -> pd.DataFrame:
        columns = ["timestamp", "funding_rate_settled", "funding_interval"]
        rows = self._client.get_json(
            "/fapi/v1/fundingRate",
            params={"symbol": symbol, "limit": 100},
            # Settlements happen at most hourly.
            ttl=seconds_until_boundary(3_600, lag_seconds=90.0),
        )
        if not rows:
            return pd.DataFrame(columns=columns)
        frame = pd.DataFrame(rows)
        frame["timestamp"] = (frame["fundingTime"].astype("int64") // 1000).astype("int64")
        frame["funding_rate_settled"] = pd.to_numeric(frame["fundingRate"], errors="coerce")
        frame = (
            frame.sort_values("timestamp")
            .drop_duplicates("timestamp", keep="last")
            .reset_index(drop=True)
        )
        # Contracts settle every 1h/4h/8h and can switch; each settlement's
        # interval is the gap since the previous one, snapped to a real value.
        gaps = frame["timestamp"].diff().bfill()
        frame["funding_interval"] = gaps.map(snap_funding_interval)
        return frame[columns]

    def _current_funding(self, symbol: str) -> dict[str, float] | None:
        try:
            premium = self._client.get_json("/fapi/v1/premiumIndex", ttl=60.0)
            info = self._client.get_json("/fapi/v1/fundingInfo", ttl=3_600.0)
        except Exception:
            return None
        row = next((r for r in premium or [] if r.get("symbol") == symbol), None)
        if row is None:
            return None
        rate = _number(row.get("lastFundingRate"))
        if pd.isna(rate):
            return None
        hours = next(
            (_number(r.get("fundingIntervalHours")) for r in info or [] if r.get("symbol") == symbol),
            8.0,
        )
        if pd.isna(hours) or hours <= 0:
            hours = 8.0
        next_ms = _number(row.get("nextFundingTime"))
        return {
            "rate": rate,
            "next_apply": next_ms / 1000 if pd.notna(next_ms) else float("nan"),
            "interval": hours * 3_600,
        }

    def get_ratio_history(self, symbol: str, hours: int) -> pd.DataFrame:
        """Closed 1h account / top-account long-short ratios for baselines."""

        columns = ["timestamp", "account_long_short_ratio", "top_trader_long_short_ratio"]
        limit = max(2, min(int(hours) + 1, _STATS_LIMIT_CAP))
        account = self._stats("/futures/data/globalLongShortAccountRatio", symbol, "1h", limit)
        top = self._stats("/futures/data/topLongShortAccountRatio", symbol, "1h", limit)
        a = pd.DataFrame(
            {
                "timestamp": [int(r["timestamp"]) // 1000 for r in account],
                "account_long_short_ratio": [_number(r.get("longShortRatio")) for r in account],
            }
        )
        t = pd.DataFrame(
            {
                "timestamp": [int(r["timestamp"]) // 1000 for r in top],
                "top_trader_long_short_ratio": [_number(r.get("longShortRatio")) for r in top],
            }
        )
        if a.empty and t.empty:
            return pd.DataFrame(columns=columns)
        frame = a.merge(t, on="timestamp", how="outer")
        frame = frame.loc[frame["timestamp"] + 3_600 <= int(time.time())]
        return frame.sort_values("timestamp").reset_index(drop=True)[columns]
