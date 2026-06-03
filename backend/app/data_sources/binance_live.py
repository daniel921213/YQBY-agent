from __future__ import annotations

import pandas as pd

from app.core.config import get_settings
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.binance_client import get_binance_client

# Binance /futures/data statistics endpoints only accept these period strings.
_STATS_PERIODS = {"5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"}


def _normalize_stats_period(timeframe: str) -> str:
    return timeframe if timeframe in _STATS_PERIODS else "15m"


class BinanceLiveMarketDataSource(MarketDataSource):
    """Live USDT-M futures OHLCV + taker buy/sell split from Binance."""

    def __init__(self) -> None:
        self._client = get_binance_client()
        self._settings = get_settings()

    def list_symbols(self) -> list[str]:
        info = self._client.get_json("/fapi/v1/exchangeInfo")
        tradable = {
            s["symbol"]
            for s in info["symbols"]
            if s.get("contractType") == "PERPETUAL"
            and s.get("quoteAsset") == "USDT"
            and s.get("status") == "TRADING"
        }

        # Rank by 24h quote volume so we scan the most liquid contracts first.
        tickers = self._client.get_json("/fapi/v1/ticker/24hr")
        ranked = [
            t["symbol"]
            for t in sorted(
                (t for t in tickers if t["symbol"] in tradable),
                key=lambda t: float(t.get("quoteVolume", 0.0)),
                reverse=True,
            )
        ]
        size = self._settings.scan_universe_size
        if size and size > 0:
            ranked = ranked[:size]
        return ranked or sorted(tradable)

    def get_klines(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        rows = self._client.get_json(
            "/fapi/v1/klines",
            params={"symbol": symbol, "interval": timeframe, "limit": limit},
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
        numeric = ["open", "high", "low", "close", "volume", "taker_buy_base"]
        frame[numeric] = frame[numeric].astype(float)

        frame["timestamp"] = (frame["open_time"] // 1000).astype("int64")
        frame["buy_volume"] = frame["taker_buy_base"]
        frame["sell_volume"] = (frame["volume"] - frame["taker_buy_base"]).clip(lower=0.0)

        return frame[
            ["timestamp", "open", "high", "low", "close", "volume", "buy_volume", "sell_volume"]
        ]


class BinanceLiveDerivativesDataSource(DerivativesDataSource):
    """Live derivatives metrics (OI, long/short ratios, funding) from Binance.

    Binance's own /futures/data endpoints replace what the Coinglass mock stood
    in for: these are first-party Binance numbers, which is exactly what you want
    for a Binance-executed strategy.
    """

    def __init__(self) -> None:
        self._client = get_binance_client()

    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        period = _normalize_stats_period(timeframe)
        # /futures/data endpoints cap at 500 rows and ~30 days of history.
        stats_limit = min(limit, 500)

        oi = self._fetch_stats(
            "/futures/data/openInterestHist", symbol, period, stats_limit,
            value_field="sumOpenInterest", out_field="open_interest",
        )
        top = self._fetch_stats(
            "/futures/data/topLongShortAccountRatio", symbol, period, stats_limit,
            value_field="longShortRatio", out_field="top_trader_long_short_ratio",
        )
        glob = self._fetch_stats(
            "/futures/data/globalLongShortAccountRatio", symbol, period, stats_limit,
            value_field="longShortRatio", out_field="account_long_short_ratio",
        )
        funding = self._fetch_funding(symbol, stats_limit)

        merged = oi
        for other in (top, glob, funding):
            merged = pd.merge_asof(
                merged.sort_values("timestamp"),
                other.sort_values("timestamp"),
                on="timestamp",
                direction="nearest",
            )
        return merged

    def _fetch_stats(
        self,
        path: str,
        symbol: str,
        period: str,
        limit: int,
        *,
        value_field: str,
        out_field: str,
    ) -> pd.DataFrame:
        rows = self._client.get_json(
            path, params={"symbol": symbol, "period": period, "limit": limit}
        )
        if not rows:
            return pd.DataFrame({"timestamp": [], out_field: []})
        frame = pd.DataFrame(rows)
        frame["timestamp"] = (frame["timestamp"].astype("int64") // 1000).astype("int64")
        frame[out_field] = frame[value_field].astype(float)
        return frame[["timestamp", out_field]]

    def _fetch_funding(self, symbol: str, limit: int) -> pd.DataFrame:
        # Funding settles every 8h; merge_asof forward-fills it onto each bar.
        rows = self._client.get_json(
            "/fapi/v1/fundingRate", params={"symbol": symbol, "limit": min(limit, 1000)}
        )
        if not rows:
            return pd.DataFrame({"timestamp": [], "funding_rate": []})
        frame = pd.DataFrame(rows)
        frame["timestamp"] = (frame["fundingTime"].astype("int64") // 1000).astype("int64")
        frame["funding_rate"] = frame["fundingRate"].astype(float)
        return frame[["timestamp", "funding_rate"]]
