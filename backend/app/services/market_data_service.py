from math import ceil

import pandas as pd

from app.core.config import get_settings
from app.core.markets import Market
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.binance_client import binance_block
from app.data_sources.binance_mock import BinanceMockDataSource
from app.data_sources.coinglass_mock import CoinglassMockDataSource
from app.indicators.crowding import (
    BASELINE_HOURS,
    add_ratio_baseline_columns,
    funding_to_8h,
)
from app.indicators.cvd import add_cvd_columns
from app.utils.timeframes import timeframe_to_seconds

# Neutral numeric fallbacks. `open_interest` remains a compatibility field;
# providers that expose `open_interest_qty` explicitly alias it to quantity.
_DERIVATIVE_DEFAULTS = {
    "open_interest": 0.0,
    "top_trader_long_short_ratio": 1.0,
    "top_position_long_short_ratio": 1.0,
    "account_long_short_ratio": 1.0,
    "funding_rate": 0.0,
}

# Current/next funding are intentionally unavailable rather than fabricated
# from the historical settlement endpoint. Consumers must inspect quality.
_OPTIONAL_DERIVATIVE_DEFAULTS = {
    "funding_rate_current": float("nan"),
    "funding_rate_next": float("nan"),
}

_DERIVATIVE_FLOW_DEFAULTS = {
    "long_liq_usd": 0.0,
    "short_liq_usd": 0.0,
}


def effective_provider(market: Market = "crypto") -> str:
    """The provider a dashboard actually reads right now.

    TradFi contracts only exist on the Binance pipeline. Crypto reads Binance
    unless Binance is geo-blocking this server, in which case it fails over to
    the all-Gate pipeline until the block cooldown expires.
    """

    provider = get_settings().data_provider.lower()
    if provider not in {"binance", "gate"}:
        return "mock"
    if market == "tradfi":
        return "binance"
    if provider == "binance" and binance_block.blocked:
        return "gate"
    return provider


def build_market_source(market: Market = "crypto") -> MarketDataSource:
    return _build_sources(market)[0]


def _build_sources(market: Market = "crypto") -> tuple[MarketDataSource, DerivativesDataSource]:
    provider = effective_provider(market)
    if provider == "binance":
        from app.data_sources.binance_live import (
            BinanceLiveDerivativesDataSource,
            BinanceLiveMarketDataSource,
        )

        return BinanceLiveMarketDataSource(market), BinanceLiveDerivativesDataSource(market)
    if provider == "gate":
        from app.data_sources.gate_live import (
            GateLiveDerivativesDataSource,
            GateLiveMarketDataSource,
        )

        return GateLiveMarketDataSource(), GateLiveDerivativesDataSource()
    return BinanceMockDataSource(market), CoinglassMockDataSource()


def _merge_derivatives_causally(
    klines: pd.DataFrame,
    derivatives: pd.DataFrame,
    timeframe: str,
) -> pd.DataFrame:
    """Attach level snapshots backward and per-bar flows by exact timestamp.

    A tolerance smaller than one complete bar prevents an observation from a
    prior candle being silently reused. No future observation or bfill is ever
    allowed. Liquidations are amounts, so even a causal stale match would
    double-count them; they therefore require exact bucket equality.
    """
    if derivatives.empty:
        return klines.copy()

    flow_columns = [
        column
        for column in (*_DERIVATIVE_FLOW_DEFAULTS, "liq_ref_quote_volume")
        if column in derivatives.columns
    ]
    excluded = {"timestamp", *flow_columns, "flow_quality"}
    level_columns = [column for column in derivatives.columns if column not in excluded]

    merged = klines.sort_values("timestamp").copy()
    if level_columns:
        levels = (
            derivatives[["timestamp", *level_columns]]
            .sort_values("timestamp")
            .drop_duplicates("timestamp", keep="last")
        )
        tolerance = max(timeframe_to_seconds(timeframe) - 1, 0)
        merged = pd.merge_asof(
            merged,
            levels,
            on="timestamp",
            direction="backward",
            tolerance=tolerance,
        )

    if flow_columns:
        flows = (
            derivatives[["timestamp", *flow_columns]]
            .sort_values("timestamp")
            .drop_duplicates("timestamp", keep="last")
        )
        merged = merged.merge(flows, on="timestamp", how="left")
    return merged


class MarketDataService:
    def __init__(self, market: Market = "crypto") -> None:
        self.market: Market = market
        self.provider = effective_provider(market)
        self.market_source, self.derivatives_source = _build_sources(market)

    def list_symbols(self) -> list[str]:
        return self.market_source.list_symbols()

    def get_enriched_market_frame(
        self,
        symbol: str,
        timeframe: str,
        limit: int,
        with_derivatives: bool = True,
        with_ratio_baseline: bool = True,
    ) -> pd.DataFrame:
        """Closed candles + causal derivatives.

        ``with_ratio_baseline`` adds each symbol's own 14-day long/short ratio
        baseline (one extra 1h request). Consumers that never read crowding,
        such as the 5m risk radar, switch it off.
        """
        klines = self.market_source.get_klines(symbol=symbol, timeframe=timeframe, limit=limit)

        if not with_derivatives:
            return add_cvd_columns(klines)

        derivatives = self.derivatives_source.get_derivatives_metrics(
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
        )
        has_explicit_oi_qty = "open_interest_qty" in derivatives.columns
        has_explicit_oi_usd = "open_interest_usd" in derivatives.columns
        has_settled_funding = "funding_rate_settled" in derivatives.columns
        merged = _merge_derivatives_causally(klines, derivatives, timeframe)

        # Missing levels stay neutral. There is deliberately no ffill/bfill:
        # the causal merge already applied a bounded tolerance.
        for column, default in _DERIVATIVE_DEFAULTS.items():
            if column not in merged.columns:
                merged[column] = default
            else:
                merged[column] = merged[column].fillna(default)

        explicit_oi_columns = {
            "open_interest_qty": has_explicit_oi_qty,
            "open_interest_usd": has_explicit_oi_usd,
        }
        for column, is_explicit in explicit_oi_columns.items():
            if not is_explicit:
                continue
            if column not in merged.columns:
                merged[column] = float("nan")
            else:
                # A missing OI observation is unknown, not zero open interest.
                # Preserve NaN so pct-change cannot fabricate a collapse/rebound.
                merged[column] = pd.to_numeric(merged[column], errors="coerce")

        if has_explicit_oi_qty or has_explicit_oi_usd:
            qty_ok = (
                merged["open_interest_qty"].notna()
                & merged["open_interest_qty"].gt(0)
                if "open_interest_qty" in merged.columns
                else pd.Series(False, index=merged.index)
            )
            usd_ok = (
                merged["open_interest_usd"].notna()
                & merged["open_interest_usd"].gt(0)
                if "open_interest_usd" in merged.columns
                else pd.Series(False, index=merged.index)
            )
            merged["oi_quality"] = "MISSING"
            merged.loc[qty_ok & usd_ok, "oi_quality"] = "REAL"

        if has_settled_funding:
            if "funding_rate_settled" not in merged.columns:
                merged["funding_rate_settled"] = 0.0
            else:
                merged["funding_rate_settled"] = merged["funding_rate_settled"].fillna(0.0)
            for column, default in _OPTIONAL_DERIVATIVE_DEFAULTS.items():
                if column not in merged.columns:
                    merged[column] = default

        liquidation_present = pd.Series(True, index=merged.index)
        for column, default in _DERIVATIVE_FLOW_DEFAULTS.items():
            if column not in merged.columns:
                liquidation_present &= False
                merged[column] = default
            else:
                liquidation_present &= merged[column].notna()
                merged[column] = merged[column].fillna(default)
        merged["liquidation_quality"] = "MISSING"
        merged.loc[liquidation_present, "liquidation_quality"] = "REAL"
        # Which venue the liquidation notionals came from (Binance pipeline:
        # GATE / BITGET; empty = none). Native single-venue providers leave it
        # blank and their own OI/turnover normalise the intensity ratios.
        if "liquidation_source" in merged.columns:
            merged["liquidation_source"] = merged["liquidation_source"].fillna("").astype(str)
        for column in ("liq_ref_oi_usd", "liq_ref_quote_volume"):
            if column in merged.columns:
                merged[column] = pd.to_numeric(merged[column], errors="coerce")

        if has_settled_funding:
            if "funding_rate_quality" not in merged.columns:
                merged["funding_rate_quality"] = "MISSING"
            else:
                merged["funding_rate_quality"] = merged["funding_rate_quality"].fillna(
                    "MISSING"
                )

        # Enforce explicit provider contracts without guessing units for older
        # providers that expose only the ambiguous compatibility field.
        if has_explicit_oi_qty:
            merged["open_interest"] = merged["open_interest_qty"]
        if has_settled_funding:
            if "funding_rate_current" in merged.columns:
                merged["funding_rate"] = merged["funding_rate_current"].combine_first(
                    merged["funding_rate_settled"]
                )
            else:
                merged["funding_rate"] = merged["funding_rate_settled"]

        # Thresholds are defined per 8h; Gate settles many contracts every 1h
        # or 4h. Raw `funding_rate` stays as the exchange reports it (display);
        # every crowding comparison reads `funding_rate_8h`.
        merged["funding_rate_8h"] = funding_to_8h(
            merged["funding_rate"],
            merged["funding_interval"] if "funding_interval" in merged.columns else None,
        )

        if with_ratio_baseline:
            hours = BASELINE_HOURS + ceil(limit * timeframe_to_seconds(timeframe) / 3_600) + 2
            try:
                history = self.derivatives_source.get_ratio_history(symbol, hours)
            except Exception:
                # A failed history request degrades to the in-frame baseline.
                history = None
            merged = add_ratio_baseline_columns(merged, history)

        return add_cvd_columns(merged)
