import pandas as pd

from app.data_sources.gate_live import (
    GateLiveMarketDataSource,
    _pick_stats_interval,
    _stats_frame,
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


def test_stats_interval_picks_largest_exact_tile() -> None:
    assert _pick_stats_interval(900) == "15m"     # 15m -> 15m, 1:1
    assert _pick_stats_interval(3_600) == "1h"    # 1h -> 1h
    assert _pick_stats_interval(1_800) == "15m"   # 30m -> two 15m buckets summed
    assert _pick_stats_interval(60) is None       # finer than stats => proxy path


def test_stats_frame_sums_flow_and_keeps_last_levels() -> None:
    # Two 15m stats rows must roll up into one 30m candle bucket:
    # taker flow adds; OI / ratios take the bucket's last observation.
    stats = [
        {"time": 1_800, "long_taker_size": 10, "short_taker_size": 5,
         "open_interest_usd": 100.0, "top_lsr_account": 1.1, "lsr_account": 0.9},
        {"time": 2_700, "long_taker_size": 20, "short_taker_size": 5,
         "open_interest_usd": 130.0, "top_lsr_account": 1.3, "lsr_account": 0.8},
    ]
    out = _stats_frame(stats, frame_seconds=1_800)
    assert len(out) == 1
    row = out.iloc[0]
    assert row["timestamp"] == 1_800
    assert row["buy_volume"] == 30.0 and row["sell_volume"] == 10.0
    assert row["open_interest"] == 130.0  # USD notional, last of bucket
    assert row["top_trader_long_short_ratio"] == 1.3


def test_open_interest_prefers_usd_notional() -> None:
    stats = [
        {"time": 900, "long_taker_size": 1, "short_taker_size": 1,
         "open_interest": 621_594_184, "open_interest_usd": 3_740_213_012.4,
         "top_lsr_account": 1.0, "lsr_account": 1.0},
    ]
    out = _stats_frame(stats, frame_seconds=900)
    # Contract count would make cross-symbol OI rankings meaningless.
    assert out.iloc[0]["open_interest"] == 3_740_213_012.4


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
    # Proxy CVD must be flagged so the engine skips CVD-derived factors.
    assert (out["cvd_proxy"] == 1.0).all()
    # up bar => more buy than sell; down bar => the reverse
    assert out.iloc[0]["buy_volume"] > out.iloc[0]["sell_volume"]
    assert out.iloc[1]["buy_volume"] < out.iloc[1]["sell_volume"]
    # buy + sell conserves total volume
    assert all(abs(out["buy_volume"] + out["sell_volume"] - out["volume"]) < 1e-9)
