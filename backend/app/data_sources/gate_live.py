from __future__ import annotations

import pandas as pd

from app.core.config import get_settings
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.gate_client import get_gate_client
from app.utils.timeframes import timeframe_to_seconds

# Gate's /futures/usdt/contract_stats only accepts these interval strings.
_STATS_INTERVAL_SECONDS = {"5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1d": 86_400}
# contract_stats caps history at 100 rows per request.
_STATS_LIMIT_CAP = 100


def _to_contract(symbol: str) -> str:
    """Display symbol (BTCUSDT) -> Gate contract (BTC_USDT)."""
    s = symbol.upper()
    if s.endswith("USDT"):
        return f"{s[:-4]}_USDT"
    return s


def _to_display(contract: str) -> str:
    """Gate contract (BTC_USDT) -> display symbol (BTCUSDT)."""
    return contract.replace("_", "")


def _pick_stats_interval(frame_seconds: int) -> str | None:
    """Largest supported stats interval that tiles the candle frame exactly.

    Exact tiling lets us SUM taker flow buckets into candle-sized buckets
    (flow is additive) instead of nearest-matching a finer/coarser series,
    which would over/under-state per-candle flow. None => no compatible
    interval (frame finer than 5m); callers fall back to the candle proxy.
    """
    candidates = [
        (seconds, name)
        for name, seconds in _STATS_INTERVAL_SECONDS.items()
        if seconds <= frame_seconds and frame_seconds % seconds == 0
    ]
    if not candidates:
        return None
    return max(candidates)[1]


def _fetch_contract_stats(contract: str, timeframe: str, frame_bars: int) -> list[dict]:
    """Shared, cached contract_stats fetch (OI + long/short + taker sizes).

    Both the market source (taker sizes for CVD) and the derivatives source
    (OI / long-short ratios) call this with identical args, so the second hit is
    served from the HTTP client's TTL cache.
    """
    frame_seconds = timeframe_to_seconds(timeframe)
    interval = _pick_stats_interval(frame_seconds)
    if interval is None:
        return []
    per_bar = frame_seconds // _STATS_INTERVAL_SECONDS[interval]
    limit = min(frame_bars * per_bar, _STATS_LIMIT_CAP)
    return get_gate_client().get_json(
        "/futures/usdt/contract_stats",
        params={"contract": contract, "interval": interval, "limit": limit},
    )


def _stats_frame(stats: list[dict], frame_seconds: int) -> pd.DataFrame:
    """contract_stats rows -> one row per candle bucket.

    Flow fields (taker sizes) are summed within the bucket; level fields
    (OI, ratios) take the last observation of the bucket. `open_interest`
    prefers Gate's USD notional so cross-symbol comparisons (OI movers map)
    are apples-to-apples; the raw contract count differs wildly per symbol.
    """
    rows = pd.DataFrame(
        [
            {
                "timestamp": (int(s["time"]) // frame_seconds) * frame_seconds,
                "buy_volume": float(s.get("long_taker_size", 0.0) or 0.0),
                "sell_volume": float(s.get("short_taker_size", 0.0) or 0.0),
                "open_interest": float(
                    s.get("open_interest_usd") or s.get("open_interest", 0.0) or 0.0
                ),
                "top_trader_long_short_ratio": float(s.get("top_lsr_account", 1.0) or 1.0),
                "account_long_short_ratio": float(s.get("lsr_account", 1.0) or 1.0),
                "_time": int(s["time"]),
            }
            for s in stats
        ]
    )
    if rows.empty:
        return rows
    rows = rows.sort_values("_time")
    return (
        rows.groupby("timestamp", as_index=False).agg(
            buy_volume=("buy_volume", "sum"),
            sell_volume=("sell_volume", "sum"),
            open_interest=("open_interest", "last"),
            top_trader_long_short_ratio=("top_trader_long_short_ratio", "last"),
            account_long_short_ratio=("account_long_short_ratio", "last"),
        )
    ).sort_values("timestamp")


class GateLiveMarketDataSource(MarketDataSource):
    """Live Gate USDT-M futures OHLCV + taker buy/sell split.

    Gate candlesticks have no taker split, so buy/sell volume (for CVD) comes
    from contract_stats' long_taker_size / short_taker_size — real taker flow,
    not a proxy.
    """

    def __init__(self) -> None:
        self._client = get_gate_client()
        self._settings = get_settings()

    def list_symbols(self) -> list[str]:
        tickers = self._client.get_json("/futures/usdt/tickers")
        ranked = [
            t["contract"]
            for t in sorted(
                (t for t in tickers if str(t.get("contract", "")).endswith("_USDT")),
                key=lambda t: float(t.get("volume_24h_quote", 0.0) or 0.0),
                reverse=True,
            )
        ]
        size = self._settings.scan_universe_size
        if size and size > 0:
            ranked = ranked[:size]
        return [_to_display(c) for c in ranked]

    def get_klines(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        contract = _to_contract(symbol)
        rows = self._client.get_json(
            "/futures/usdt/candlesticks",
            params={"contract": contract, "interval": timeframe, "limit": limit},
        )
        if not rows:
            raise RuntimeError(f"No candlesticks returned for {contract} {timeframe}")

        frame = pd.DataFrame(rows)
        frame["timestamp"] = frame["t"].astype("int64")
        for src, dst in (("o", "open"), ("h", "high"), ("l", "low"), ("c", "close")):
            frame[dst] = frame[src].astype(float)
        frame["volume"] = frame["v"].astype(float)
        frame = frame[["timestamp", "open", "high", "low", "close", "volume"]].sort_values(
            "timestamp"
        )

        frame = self._attach_taker_split(frame, contract, timeframe)
        return frame[
            [
                "timestamp", "open", "high", "low", "close", "volume",
                "buy_volume", "sell_volume", "cvd_proxy",
            ]
        ]

    def _attach_taker_split(
        self, frame: pd.DataFrame, contract: str, timeframe: str
    ) -> pd.DataFrame:
        frame_seconds = timeframe_to_seconds(timeframe)
        stats = _fetch_contract_stats(contract, timeframe, len(frame))
        taker = _stats_frame(stats, frame_seconds)
        if taker.empty:
            # Fallback: approximate taker flow from candle direction (up bar =>
            # buy-dominant). Lower fidelity but keeps CVD defined. cvd_proxy=1
            # tells the scoring engine CVD here is price-derived, so CVD-based
            # factors (divergence, thrust) must not treat it as real order flow.
            up = (frame["close"] >= frame["open"]).astype(float)
            frame["buy_volume"] = frame["volume"] * (0.3 + 0.4 * up)
            frame["sell_volume"] = frame["volume"] - frame["buy_volume"]
            frame["cvd_proxy"] = 1.0
            return frame

        # Exact-bucket join (stats buckets are aligned to candle open times).
        # Candles outside stats coverage (contract_stats caps at 100 rows, the
        # kline history is longer) get zero flow — an honest "no data" flat CVD
        # prefix instead of a fabricated slope from duplicating the oldest row.
        merged = frame.merge(
            taker[["timestamp", "buy_volume", "sell_volume"]], on="timestamp", how="left"
        )
        merged["buy_volume"] = merged["buy_volume"].fillna(0.0)
        merged["sell_volume"] = merged["sell_volume"].fillna(0.0)
        merged["cvd_proxy"] = 0.0
        return merged


class GateLiveDerivativesDataSource(DerivativesDataSource):
    """Live derivatives metrics (OI, long/short ratios, funding) from Gate.

    contract_stats gives OI + retail (lsr_account) + top-trader (top_lsr_account)
    ratios in one call; funding comes from the funding_rate endpoint.
    open_interest is Gate's USD notional (open_interest_usd), NOT contract count.
    """

    def __init__(self) -> None:
        self._client = get_gate_client()

    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        contract = _to_contract(symbol)
        frame_seconds = timeframe_to_seconds(timeframe)
        stats = _fetch_contract_stats(contract, timeframe, limit)
        levels = _stats_frame(stats, frame_seconds)
        if levels.empty:
            return pd.DataFrame(
                {
                    "timestamp": [],
                    "open_interest": [],
                    "top_trader_long_short_ratio": [],
                    "account_long_short_ratio": [],
                    "funding_rate": [],
                }
            )

        oi = levels[
            [
                "timestamp",
                "open_interest",
                "top_trader_long_short_ratio",
                "account_long_short_ratio",
            ]
        ]

        funding = self._fetch_funding(contract, limit)
        if funding.empty:
            merged = oi.copy()
            merged["funding_rate"] = 0.0
            return merged
        merged = pd.merge_asof(
            oi.sort_values("timestamp"),
            funding.sort_values("timestamp"),
            on="timestamp",
            direction="backward",
        )
        return merged

    def _fetch_funding(self, contract: str, limit: int) -> pd.DataFrame:
        rows = self._client.get_json(
            "/futures/usdt/funding_rate", params={"contract": contract, "limit": min(limit, 1000)}
        )
        if not rows:
            return pd.DataFrame({"timestamp": [], "funding_rate": []})
        frame = pd.DataFrame(rows)
        frame["timestamp"] = frame["t"].astype("int64")
        frame["funding_rate"] = frame["r"].astype(float)
        return frame[["timestamp", "funding_rate"]]
