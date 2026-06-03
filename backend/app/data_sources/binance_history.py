"""Paginated historical fetch for backtesting.

Binance's /futures/data statistics endpoints cap at 500 rows per call, so a
multi-week 15m backtest needs startTime paging. This lives outside the live
data sources (which only need the most recent window) and is used by
scripts/backtest.py to assemble a long, derivatives-enriched history frame.
"""

from __future__ import annotations

import time

import pandas as pd

from app.data_sources.binance_client import get_binance_client
from app.indicators.cvd import add_cvd_columns
from app.utils.timeframes import timeframe_to_seconds

_MAX_PAGES = 200


def _klines_history(client, symbol: str, timeframe: str, start_ms: int) -> pd.DataFrame:
    step_ms = timeframe_to_seconds(timeframe) * 1000
    cursor = start_ms
    chunks: list[pd.DataFrame] = []
    for _ in range(_MAX_PAGES):
        rows = client.get_json(
            "/fapi/v1/klines",
            params={"symbol": symbol, "interval": timeframe, "startTime": cursor, "limit": 1500},
            cache=False,
        )
        if not rows:
            break
        frame = pd.DataFrame(
            rows,
            columns=[
                "open_time", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades",
                "taker_buy_base", "taker_buy_quote", "ignore",
            ],
        )
        chunks.append(frame)
        last_open = int(frame["open_time"].iloc[-1])
        cursor = last_open + step_ms
        if len(rows) < 1500 or cursor > int(time.time() * 1000):
            break

    if not chunks:
        return pd.DataFrame()

    df = pd.concat(chunks, ignore_index=True).drop_duplicates("open_time")
    numeric = ["open", "high", "low", "close", "volume", "taker_buy_base"]
    df[numeric] = df[numeric].astype(float)
    df["timestamp"] = (df["open_time"] // 1000).astype("int64")
    df["buy_volume"] = df["taker_buy_base"]
    df["sell_volume"] = (df["volume"] - df["taker_buy_base"]).clip(lower=0.0)
    return df[["timestamp", "open", "high", "low", "close", "volume", "buy_volume", "sell_volume"]]


def _stats_history(
    client, path: str, symbol: str, period: str, start_ms: int, value_field: str, out_field: str
) -> pd.DataFrame:
    cursor = start_ms
    chunks: list[pd.DataFrame] = []
    for _ in range(_MAX_PAGES):
        rows = client.get_json(
            path,
            params={"symbol": symbol, "period": period, "startTime": cursor, "limit": 500},
            cache=False,
        )
        if not rows:
            break
        frame = pd.DataFrame(rows)
        chunks.append(frame[["timestamp", value_field]])
        last_ts = int(frame["timestamp"].iloc[-1])
        next_cursor = last_ts + 1
        if next_cursor <= cursor or len(rows) < 500 or last_ts > int(time.time() * 1000):
            break
        cursor = next_cursor

    if not chunks:
        return pd.DataFrame({"timestamp": [], out_field: []})
    df = pd.concat(chunks, ignore_index=True).drop_duplicates("timestamp")
    df["timestamp"] = (df["timestamp"].astype("int64") // 1000).astype("int64")
    df[out_field] = df[value_field].astype(float)
    return df[["timestamp", out_field]]


def _funding_history(client, symbol: str, start_ms: int) -> pd.DataFrame:
    rows = client.get_json(
        "/fapi/v1/fundingRate",
        params={"symbol": symbol, "startTime": start_ms, "limit": 1000},
        cache=False,
    )
    if not rows:
        return pd.DataFrame({"timestamp": [], "funding_rate": []})
    df = pd.DataFrame(rows)
    df["timestamp"] = (df["fundingTime"].astype("int64") // 1000).astype("int64")
    df["funding_rate"] = df["fundingRate"].astype(float)
    return df[["timestamp", "funding_rate"]]


def fetch_klines_history(symbol: str, timeframe: str, days: int) -> pd.DataFrame:
    """Klines + CVD only (no derivatives) — for trigger/trend replay frames."""
    client = get_binance_client()
    start_ms = int((time.time() - days * 86_400) * 1000)
    klines = _klines_history(client, symbol, timeframe, start_ms)
    if klines.empty:
        return klines
    return add_cvd_columns(klines)


def fetch_history_frame(symbol: str, timeframe: str, days: int) -> pd.DataFrame:
    """Assemble a derivatives-enriched OHLCV history of roughly `days` length."""
    client = get_binance_client()
    start_ms = int((time.time() - days * 86_400) * 1000)

    klines = _klines_history(client, symbol, timeframe, start_ms)
    if klines.empty:
        return klines

    oi = _stats_history(
        client, "/futures/data/openInterestHist", symbol, timeframe, start_ms,
        "sumOpenInterest", "open_interest",
    )
    top = _stats_history(
        client, "/futures/data/topLongShortAccountRatio", symbol, timeframe, start_ms,
        "longShortRatio", "top_trader_long_short_ratio",
    )
    glob = _stats_history(
        client, "/futures/data/globalLongShortAccountRatio", symbol, timeframe, start_ms,
        "longShortRatio", "account_long_short_ratio",
    )
    funding = _funding_history(client, symbol, start_ms)

    merged = klines
    for other in (oi, top, glob, funding):
        if other.empty:
            continue
        merged = pd.merge_asof(
            merged.sort_values("timestamp"),
            other.sort_values("timestamp"),
            on="timestamp",
            direction="nearest",
        )

    defaults = {
        "open_interest": 0.0,
        "top_trader_long_short_ratio": 1.0,
        "account_long_short_ratio": 1.0,
        "funding_rate": 0.0,
    }
    for column, default in defaults.items():
        if column not in merged.columns:
            merged[column] = default
        else:
            merged[column] = merged[column].ffill().bfill().fillna(default)

    return add_cvd_columns(merged)
