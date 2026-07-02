import pandas as pd

from app.core.config import get_settings
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.binance_mock import BinanceMockDataSource
from app.data_sources.coinglass_mock import CoinglassMockDataSource
from app.indicators.cvd import add_cvd_columns

# Neutral fallbacks so a symbol with missing derivatives data scores NEUTRAL
# instead of raising. Ratios of 1.0 = balanced, funding 0 = flat.
_DERIVATIVE_DEFAULTS = {
    "open_interest": 0.0,
    "top_trader_long_short_ratio": 1.0,
    "account_long_short_ratio": 1.0,
    "funding_rate": 0.0,
}

# Flow columns (per-bar amounts, not levels): a gap means "nothing happened",
# so they fill with 0 — ffill would duplicate one bar's liquidations across
# the gap and inflate the totals. Gate provides these; Binance's public liq
# feed was retired, so the fallback provider reads 0 = "no data".
_DERIVATIVE_FLOW_DEFAULTS = {
    "long_liq_usd": 0.0,
    "short_liq_usd": 0.0,
}


def _build_sources() -> tuple[MarketDataSource, DerivativesDataSource]:
    provider = get_settings().data_provider.lower()
    if provider == "binance":
        # Imported lazily so the mock path never needs httpx / network.
        from app.data_sources.binance_live import (
            BinanceLiveDerivativesDataSource,
            BinanceLiveMarketDataSource,
        )

        return BinanceLiveMarketDataSource(), BinanceLiveDerivativesDataSource()
    if provider == "gate":
        from app.data_sources.gate_live import (
            GateLiveDerivativesDataSource,
            GateLiveMarketDataSource,
        )

        return GateLiveMarketDataSource(), GateLiveDerivativesDataSource()
    return BinanceMockDataSource(), CoinglassMockDataSource()


class MarketDataService:
    def __init__(self) -> None:
        self.market_source, self.derivatives_source = _build_sources()

    def list_symbols(self) -> list[str]:
        return self.market_source.list_symbols()

    def get_enriched_market_frame(
        self,
        symbol: str,
        timeframe: str,
        limit: int,
        with_derivatives: bool = True,
    ) -> pd.DataFrame:
        klines = self.market_source.get_klines(symbol=symbol, timeframe=timeframe, limit=limit)

        if not with_derivatives:
            # Trigger (5m) and trend (1h) frames only need price + CVD, so we skip
            # the derivatives calls entirely — a big saving on a full scan.
            return add_cvd_columns(klines)

        derivatives = self.derivatives_source.get_derivatives_metrics(
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
        )

        if derivatives.empty:
            merged = klines.copy()
        else:
            merged = pd.merge_asof(
                klines.sort_values("timestamp"),
                derivatives.sort_values("timestamp"),
                on="timestamp",
                direction="nearest",
            )

        # ffill covers in-series gaps with PAST values only. After ffill the sole
        # remaining NaNs are the pre-coverage prefix (klines reach further back
        # than the stats history); bfill flattens that prefix to the first real
        # observation, which keeps pct-change reads across the boundary at zero
        # instead of fabricating a jump. Indicators window well inside coverage.
        for column, default in _DERIVATIVE_DEFAULTS.items():
            if column not in merged.columns:
                merged[column] = default
            else:
                merged[column] = merged[column].ffill().bfill().fillna(default)

        for column, default in _DERIVATIVE_FLOW_DEFAULTS.items():
            if column not in merged.columns:
                merged[column] = default
            else:
                merged[column] = merged[column].fillna(default)

        return add_cvd_columns(merged)
