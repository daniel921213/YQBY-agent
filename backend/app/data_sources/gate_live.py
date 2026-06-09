from __future__ import annotations

import pandas as pd

from app.core.config import get_settings
from app.data_sources.base import DerivativesDataSource, MarketDataSource
from app.data_sources.gate_client import get_gate_client

# Gate's /futures/usdt/contract_stats only accepts these interval strings.
_STATS_INTERVALS = {"5m", "15m", "1h", "4h", "1d"}
# contract_stats caps history; keep both data sources requesting the same value
# so the shared client cache serves the second call for free.
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


def _normalize_stats_interval(timeframe: str) -> str:
    return timeframe if timeframe in _STATS_INTERVALS else "15m"


def _fetch_contract_stats(contract: str, timeframe: str, limit: int) -> list[dict]:
    """Shared, cached contract_stats fetch (OI + long/short + taker sizes).

    Both the market source (taker sizes for CVD) and the derivatives source
    (OI / long-short ratios) call this with identical args, so the second hit is
    served from the HTTP client's TTL cache.
    """
    return get_gate_client().get_json(
        "/futures/usdt/contract_stats",
        params={
            "contract": contract,
            "interval": _normalize_stats_interval(timeframe),
            "limit": min(limit, _STATS_LIMIT_CAP),
        },
    )


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
            ["timestamp", "open", "high", "low", "close", "volume", "buy_volume", "sell_volume"]
        ]

    def _attach_taker_split(
        self, frame: pd.DataFrame, contract: str, timeframe: str
    ) -> pd.DataFrame:
        stats = _fetch_contract_stats(contract, timeframe, len(frame))
        taker = pd.DataFrame(
            [
                {
                    "timestamp": int(s["time"]),
                    "buy_volume": float(s.get("long_taker_size", 0.0) or 0.0),
                    "sell_volume": float(s.get("short_taker_size", 0.0) or 0.0),
                }
                for s in stats
            ]
        )
        if taker.empty:
            # Fallback: approximate taker flow from candle direction (up bar =>
            # buy-dominant). Lower fidelity but keeps CVD defined.
            up = (frame["close"] >= frame["open"]).astype(float)
            frame["buy_volume"] = frame["volume"] * (0.3 + 0.4 * up)
            frame["sell_volume"] = frame["volume"] - frame["buy_volume"]
            return frame

        merged = pd.merge_asof(
            frame.sort_values("timestamp"),
            taker.sort_values("timestamp"),
            on="timestamp",
            direction="nearest",
        )
        merged["buy_volume"] = merged["buy_volume"].ffill().bfill().fillna(0.0)
        merged["sell_volume"] = merged["sell_volume"].ffill().bfill().fillna(0.0)
        return merged


class GateLiveDerivativesDataSource(DerivativesDataSource):
    """Live derivatives metrics (OI, long/short ratios, funding) from Gate.

    contract_stats gives OI + retail (lsr_account) + top-trader (top_lsr_account)
    ratios in one call; funding comes from the funding_rate endpoint.
    """

    def __init__(self) -> None:
        self._client = get_gate_client()

    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        contract = _to_contract(symbol)
        stats = _fetch_contract_stats(contract, timeframe, limit)
        if not stats:
            return pd.DataFrame(
                {
                    "timestamp": [],
                    "open_interest": [],
                    "top_trader_long_short_ratio": [],
                    "account_long_short_ratio": [],
                    "funding_rate": [],
                }
            )

        oi = pd.DataFrame(
            [
                {
                    "timestamp": int(s["time"]),
                    "open_interest": float(s.get("open_interest", 0.0) or 0.0),
                    "top_trader_long_short_ratio": float(s.get("top_lsr_account", 1.0) or 1.0),
                    "account_long_short_ratio": float(s.get("lsr_account", 1.0) or 1.0),
                }
                for s in stats
            ]
        ).sort_values("timestamp")

        funding = self._fetch_funding(contract, limit)
        merged = pd.merge_asof(
            oi, funding.sort_values("timestamp"), on="timestamp", direction="nearest"
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
