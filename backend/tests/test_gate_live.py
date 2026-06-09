import pandas as pd

from app.data_sources.gate_live import (
    GateLiveMarketDataSource,
    _normalize_stats_interval,
    _to_contract,
    _to_display,
)


def test_symbol_conversion_round_trips() -> None:
    assert _to_contract("BTCUSDT") == "BTC_USDT"
    assert _to_contract("1000PEPEUSDT") == "1000PEPE_USDT"
    assert _to_display("BTC_USDT") == "BTCUSDT"
    assert _to_display("1000PEPE_USDT") == "1000PEPEUSDT"
    # round-trip
    for sym in ("ETHUSDT", "SOLUSDT", "1000SHIBUSDT"):
        assert _to_display(_to_contract(sym)) == sym


def test_stats_interval_normalizes_unsupported() -> None:
    assert _normalize_stats_interval("15m") == "15m"
    assert _normalize_stats_interval("1h") == "1h"
    assert _normalize_stats_interval("3m") == "15m"  # unsupported -> default


def test_taker_split_fallback_when_stats_empty(monkeypatch) -> None:
    """With no contract_stats, buy/sell must fall back to a candle-direction
    proxy (up bar => buy-dominant) so CVD stays defined."""
    monkeypatch.setattr("app.data_sources.gate_live._fetch_contract_stats", lambda *a, **k: [])
    src = object.__new__(GateLiveMarketDataSource)  # skip __init__ (no client/network)
    frame = pd.DataFrame(
        {
            "timestamp": [1, 2, 3],
            "open": [100.0, 100.0, 100.0],
            "high": [101.0, 101.0, 101.0],
            "low": [99.0, 99.0, 99.0],
            "close": [101.0, 99.0, 101.0],  # up, down, up
            "volume": [10.0, 10.0, 10.0],
        }
    )
    out = src._attach_taker_split(frame, "BTC_USDT", "15m")
    assert {"buy_volume", "sell_volume"}.issubset(out.columns)
    # up bar => more buy than sell; down bar => the reverse
    assert out.iloc[0]["buy_volume"] > out.iloc[0]["sell_volume"]
    assert out.iloc[1]["buy_volume"] < out.iloc[1]["sell_volume"]
    # buy + sell conserves total volume
    assert all(abs(out["buy_volume"] + out["sell_volume"] - out["volume"]) < 1e-9)
