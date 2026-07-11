from __future__ import annotations

import time

import pandas as pd

from app.core.config import get_settings
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.gate_client import get_gate_client
from app.utils.timeframes import timeframe_to_seconds

# Intervals accepted by Gate's /futures/usdt/contract_stats endpoint. Prefer an
# exact candle-sized interval; otherwise aggregate an interval that tiles it.
_STATS_INTERVAL_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1_800,
    "1h": 3_600,
    "4h": 14_400,
    "8h": 28_800,
    "1d": 86_400,
    "3d": 259_200,
    "7d": 604_800,
}
# Gate currently accepts at least 2,000 rows. The old 100-row cap truncated a
# 200-candle scan and silently flattened the older half of CVD/OI history.
_STATS_LIMIT_CAP = 2_000
_KLINE_LIMIT_CAP = 2_000

# Gate also lists TradFi perpetuals (stocks, metals, forex, etc.) beside crypto
# contracts. Their sessions and price behaviour are not comparable with the
# always-on crypto universe, so the crypto dashboard excludes them by default.
_NON_CRYPTO_CONTRACT_TYPES = {
    "stock", "stocks", "equity", "equities", "metal", "metals",
    "forex", "commodity", "commodities", "index", "indices",
}
_FUNDING_MAX_AGE_SECONDS = 86_400

_STATS_COLUMNS = [
    "timestamp",
    "buy_volume",
    "sell_volume",
    "flow_quality",
    "open_interest_qty",
    "open_interest_usd",
    "open_interest",
    "top_trader_long_short_ratio",
    "top_position_long_short_ratio",
    "account_long_short_ratio",
    "long_liq_usd",
    "short_liq_usd",
]


def _to_contract(symbol: str) -> str:
    """Display symbol (BTCUSDT) -> Gate contract (BTC_USDT)."""
    value = symbol.upper()
    if value.endswith("USDT"):
        return f"{value[:-4]}_USDT"
    return value


def _to_display(contract: str) -> str:
    """Gate contract (BTC_USDT) -> display symbol (BTCUSDT)."""
    return contract.replace("_", "")


def _pick_stats_interval(frame_seconds: int) -> str | None:
    """Return the largest Gate stats interval that exactly tiles a candle."""
    candidates = [
        (seconds, name)
        for name, seconds in _STATS_INTERVAL_SECONDS.items()
        if seconds <= frame_seconds and frame_seconds % seconds == 0
    ]
    if not candidates:
        return None
    return max(candidates)[1]


def _fetch_contract_stats(contract: str, timeframe: str, frame_bars: int) -> list[dict]:
    """Fetch enough shared stats for N closed candles plus the open bucket."""
    frame_seconds = timeframe_to_seconds(timeframe)
    interval = _pick_stats_interval(frame_seconds)
    if interval is None:
        return []
    per_bar = frame_seconds // _STATS_INTERVAL_SECONDS[interval]
    limit = min(max(frame_bars + 1, 1) * per_bar, _STATS_LIMIT_CAP)
    return get_gate_client().get_json(
        "/futures/usdt/contract_stats",
        params={"contract": contract, "interval": interval, "limit": limit},
    )


def _number(value: object, *, default: float = float("nan")) -> float:
    """Parse a Gate numeric field without confusing missing data with zero."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _preferred_number(row: dict, primary: str, fallback: str) -> float:
    """Use Gate's new explicit field, including a legitimate numeric zero."""
    primary_value = _number(row.get(primary))
    if pd.notna(primary_value):
        return primary_value
    return _number(row.get(fallback), default=0.0)


def _stats_frame(
    stats: list[dict],
    frame_seconds: int,
    stats_interval_seconds: int | None = None,
) -> pd.DataFrame:
    """Aggregate contract_stats into causal candle buckets.

    Flow is additive; levels use the last observation in the bucket. OI
    quantity and USD notional never substitute for one another. The legacy
    `open_interest` alias is contract quantity for position-flow analysis.
    """
    parsed: list[dict] = []
    for stat in stats:
        if "time" not in stat:
            continue
        buy_volume = _number(stat.get("long_taker_size"))
        sell_volume = _number(stat.get("short_taker_size"))
        parsed.append(
            {
                "timestamp": (int(stat["time"]) // frame_seconds) * frame_seconds,
                "buy_volume": buy_volume,
                "sell_volume": sell_volume,
                "_flow_real": pd.notna(buy_volume) and pd.notna(sell_volume),
                "open_interest_qty": _number(stat.get("open_interest")),
                "open_interest_usd": _number(stat.get("open_interest_usd")),
                # Account ratio, top-account ratio and top-position ratio are
                # separate populations and must remain separate fields.
                "top_trader_long_short_ratio": _number(stat.get("top_lsr_account")),
                "top_position_long_short_ratio": _number(stat.get("top_lsr_size")),
                "account_long_short_ratio": _number(stat.get("lsr_account")),
                # Prefer Gate's explicit multiplier * mark-price notionals.
                "long_liq_usd": _preferred_number(
                    stat, "long_liq_usd_new", "long_liq_usd"
                ),
                "short_liq_usd": _preferred_number(
                    stat, "short_liq_usd_new", "short_liq_usd"
                ),
                "_time": int(stat["time"]),
            }
        )

    rows = pd.DataFrame(parsed)
    if rows.empty:
        return pd.DataFrame(columns=_STATS_COLUMNS)

    rows = rows.sort_values("_time")
    grouped = rows.groupby("timestamp", as_index=False).agg(
        buy_volume=("buy_volume", lambda values: values.sum(min_count=1)),
        sell_volume=("sell_volume", lambda values: values.sum(min_count=1)),
        _flow_real_count=("_flow_real", "sum"),
        _sample_count=("_time", "size"),
        open_interest_qty=("open_interest_qty", "last"),
        open_interest_usd=("open_interest_usd", "last"),
        top_trader_long_short_ratio=("top_trader_long_short_ratio", "last"),
        top_position_long_short_ratio=("top_position_long_short_ratio", "last"),
        account_long_short_ratio=("account_long_short_ratio", "last"),
        long_liq_usd=("long_liq_usd", "sum"),
        short_liq_usd=("short_liq_usd", "sum"),
    )

    expected_samples = 1
    if stats_interval_seconds:
        expected_samples = max(frame_seconds // stats_interval_seconds, 1)
    real_flow = (
        (grouped["_sample_count"] == expected_samples)
        & (grouped["_flow_real_count"] == expected_samples)
    )
    grouped["flow_quality"] = "MISSING"
    grouped.loc[real_flow, "flow_quality"] = "REAL"

    # Zero is only a numeric CVD bridge here; flow_quality preserves the fact
    # that the source was absent rather than reporting genuine zero flow.
    grouped["buy_volume"] = grouped["buy_volume"].fillna(0.0)
    grouped["sell_volume"] = grouped["sell_volume"].fillna(0.0)
    grouped["open_interest"] = grouped["open_interest_qty"]
    return grouped[_STATS_COLUMNS].sort_values("timestamp").reset_index(drop=True)


def _closed_candles(
    frame: pd.DataFrame,
    timeframe: str,
    *,
    now_seconds: int | None = None,
) -> pd.DataFrame:
    """Remove Gate's currently forming candle using its open timestamp."""
    frame_seconds = timeframe_to_seconds(timeframe)
    now = int(time.time()) if now_seconds is None else int(now_seconds)
    closed = frame.loc[frame["timestamp"] + frame_seconds <= now].copy()
    closed["is_closed"] = True
    return closed


class GateLiveMarketDataSource(MarketDataSource):
    """Live Gate USDT perpetual OHLCV and taker flow."""

    def __init__(self) -> None:
        self._client = get_gate_client()
        self._settings = get_settings()

    def list_symbols(self) -> list[str]:
        tickers = self._client.get_json("/futures/usdt/tickers")
        # Gate returns the complete contract list from this endpoint and does
        # not accept a ``limit`` query parameter. Sending one produces HTTP
        # 400, which prevents the background scan from discovering any symbol.
        contracts = self._client.get_json("/futures/usdt/contracts")
        crypto_contracts = {
            str(row.get("name", ""))
            for row in contracts
            if str(row.get("name", "")).endswith("_USDT")
            and str(row.get("status", "trading")).lower() == "trading"
            and not bool(row.get("in_delisting", False))
            and str(row.get("contract_type") or "").strip().lower()
            not in _NON_CRYPTO_CONTRACT_TYPES
        }
        ranked = [
            ticker["contract"]
            for ticker in sorted(
                (
                    ticker
                    for ticker in tickers
                    if str(ticker.get("contract", "")) in crypto_contracts
                ),
                key=lambda ticker: float(ticker.get("volume_24h_quote", 0.0) or 0.0),
                reverse=True,
            )
        ]
        size = self._settings.scan_universe_size
        if size and size > 0:
            ranked = ranked[:size]
        return [_to_display(contract) for contract in ranked]

    def get_klines(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        contract = _to_contract(symbol)
        request_limit = min(max(limit + 1, 1), _KLINE_LIMIT_CAP)
        rows = self._client.get_json(
            "/futures/usdt/candlesticks",
            params={"contract": contract, "interval": timeframe, "limit": request_limit},
        )
        if not rows:
            raise RuntimeError(f"No candlesticks returned for {contract} {timeframe}")

        frame = pd.DataFrame(rows)
        frame["timestamp"] = frame["t"].astype("int64")
        for source, target in (("o", "open"), ("h", "high"), ("l", "low"), ("c", "close")):
            frame[target] = frame[source].astype(float)
        frame["volume"] = frame["v"].astype(float)
        # Gate `sum` is quote-currency turnover; unlike contract-count volume,
        # it is suitable for liquidation/turnover normalization.
        if "sum" in frame.columns:
            frame["quote_volume"] = pd.to_numeric(frame["sum"], errors="coerce")
        else:
            frame["quote_volume"] = float("nan")
        frame = frame[
            ["timestamp", "open", "high", "low", "close", "volume", "quote_volume"]
        ].sort_values("timestamp")

        frame = _closed_candles(frame, timeframe).tail(limit).reset_index(drop=True)
        if frame.empty:
            raise RuntimeError(f"No closed candlesticks returned for {contract} {timeframe}")
        frame = self._attach_taker_split(frame, contract, timeframe)
        return frame[
            [
                "timestamp",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "quote_volume",
                "buy_volume",
                "sell_volume",
                "cvd_proxy",
                "flow_quality",
                "is_closed",
            ]
        ]

    def _attach_taker_split(
        self, frame: pd.DataFrame, contract: str, timeframe: str
    ) -> pd.DataFrame:
        frame_seconds = timeframe_to_seconds(timeframe)
        interval = _pick_stats_interval(frame_seconds)
        stats = _fetch_contract_stats(contract, timeframe, len(frame))
        interval_seconds = _STATS_INTERVAL_SECONDS.get(interval) if interval else None
        taker = _stats_frame(stats, frame_seconds, interval_seconds)
        if taker.empty:
            # Retain the old numeric proxy only as an explicitly marked
            # fallback. The scoring engine sees cvd_proxy=1 and skips CVD-based
            # factors; consumers can make the same decision from flow_quality.
            up = (frame["close"] >= frame["open"]).astype(float)
            frame["buy_volume"] = frame["volume"] * (0.3 + 0.4 * up)
            frame["sell_volume"] = frame["volume"] - frame["buy_volume"]
            frame["flow_quality"] = "PROXY"
            frame["cvd_proxy"] = 1.0
            return frame

        # Flow is a per-bucket amount, so only an exact timestamp may attach.
        merged = frame.merge(
            taker[["timestamp", "buy_volume", "sell_volume", "flow_quality"]],
            on="timestamp",
            how="left",
        )
        merged["flow_quality"] = merged["flow_quality"].fillna("MISSING")
        merged["buy_volume"] = merged["buy_volume"].fillna(0.0)
        merged["sell_volume"] = merged["sell_volume"].fillna(0.0)
        merged["cvd_proxy"] = (merged["flow_quality"] != "REAL").astype(float)
        return merged


class GateLiveDerivativesDataSource(DerivativesDataSource):
    """Gate OI, participant ratios, liquidation flow and settled funding."""

    def __init__(self) -> None:
        self._client = get_gate_client()

    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        contract = _to_contract(symbol)
        frame_seconds = timeframe_to_seconds(timeframe)
        interval = _pick_stats_interval(frame_seconds)
        stats = _fetch_contract_stats(contract, timeframe, limit)
        interval_seconds = _STATS_INTERVAL_SECONDS.get(interval) if interval else None
        levels = _stats_frame(stats, frame_seconds, interval_seconds)
        output_columns = [
            "timestamp",
            "open_interest_qty",
            "open_interest_usd",
            "open_interest",
            "top_trader_long_short_ratio",
            "top_position_long_short_ratio",
            "account_long_short_ratio",
            "long_liq_usd",
            "short_liq_usd",
            "funding_rate_settled",
            "funding_rate_current",
            "funding_rate_next",
            "funding_next_apply",
            "funding_interval",
            "funding_rate",
            "funding_rate_quality",
        ]
        if not levels.empty:
            # contract_stats may include the currently forming bucket. Keep the
            # derivatives frame on the same closed-bar boundary as candlesticks.
            now = int(time.time())
            levels = levels.loc[levels["timestamp"] + frame_seconds <= now].tail(limit)
        if levels.empty:
            return pd.DataFrame(columns=output_columns)

        derivatives = levels[
            [
                "timestamp",
                "open_interest_qty",
                "open_interest_usd",
                "open_interest",
                "top_trader_long_short_ratio",
                "top_position_long_short_ratio",
                "account_long_short_ratio",
                "long_liq_usd",
                "short_liq_usd",
            ]
        ].copy()

        # This endpoint is historical settlement data, not an indicative next
        # rate. Keep those concepts separate instead of labelling settled data
        # as live/current funding.
        funding = self._fetch_funding(contract, limit)
        if funding.empty:
            merged = derivatives
            merged["funding_rate_settled"] = float("nan")
        else:
            merged = pd.merge_asof(
                derivatives.sort_values("timestamp"),
                funding.sort_values("timestamp"),
                on="timestamp",
                direction="backward",
                tolerance=_FUNDING_MAX_AGE_SECONDS,
            )
        merged["funding_rate_current"] = float("nan")
        merged["funding_rate_next"] = float("nan")
        merged["funding_next_apply"] = float("nan")
        merged["funding_interval"] = float("nan")
        merged["funding_rate"] = merged["funding_rate_settled"]
        merged["funding_rate_quality"] = "MISSING"
        merged.loc[merged["funding_rate_settled"].notna(), "funding_rate_quality"] = "SETTLED"

        # The contract endpoint is the official current funding read. Attach it
        # only to the latest closed bucket; broadcasting it into history would
        # create look-ahead in walk-forward tests.
        try:
            current = self._fetch_current_funding(contract)
        except Exception:
            current = None
        if current is not None and len(merged):
            latest = merged.index[-1]
            merged.loc[latest, "funding_rate_current"] = current["rate"]
            merged.loc[latest, "funding_next_apply"] = current["next_apply"]
            merged.loc[latest, "funding_interval"] = current["interval"]
            merged.loc[latest, "funding_rate"] = current["rate"]
            merged.loc[latest, "funding_rate_quality"] = "CURRENT"
        return merged[output_columns]

    def _fetch_current_funding(self, contract: str) -> dict[str, float] | None:
        row = self._client.get_json(f"/futures/usdt/contracts/{contract}")
        if not isinstance(row, dict):
            return None
        rate = _number(row.get("funding_rate"))
        if pd.isna(rate):
            return None
        return {
            "rate": rate,
            "next_apply": _number(row.get("funding_next_apply")),
            "interval": _number(row.get("funding_interval")),
        }

    def _fetch_funding(self, contract: str, limit: int) -> pd.DataFrame:
        rows = self._client.get_json(
            "/futures/usdt/funding_rate",
            params={"contract": contract, "limit": min(limit, 1_000)},
        )
        if not rows:
            return pd.DataFrame(columns=["timestamp", "funding_rate_settled"])
        frame = pd.DataFrame(rows)
        frame["timestamp"] = frame["t"].astype("int64")
        frame["funding_rate_settled"] = frame["r"].astype(float)
        return frame[["timestamp", "funding_rate_settled"]]
