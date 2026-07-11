import time

import pandas as pd
import pytest

from app.data_sources.gate_live import (
    GateLiveDerivativesDataSource,
    GateLiveMarketDataSource,
    _closed_candles,
    _fetch_contract_stats,
    _pick_stats_interval,
    _stats_frame,
    _to_contract,
    _to_display,
)
from app.services.market_data_service import MarketDataService


def test_symbol_conversion_round_trips() -> None:
    assert _to_contract("BTCUSDT") == "BTC_USDT"
    assert _to_contract("1000PEPEUSDT") == "1000PEPE_USDT"
    assert _to_display("BTC_USDT") == "BTCUSDT"
    assert _to_display("1000PEPE_USDT") == "1000PEPEUSDT"
    for symbol in ("ETHUSDT", "SOLUSDT", "1000SHIBUSDT"):
        assert _to_display(_to_contract(symbol)) == symbol


def test_stats_interval_picks_largest_exact_tile() -> None:
    assert _pick_stats_interval(60) == "1m"
    assert _pick_stats_interval(180) == "1m"
    assert _pick_stats_interval(900) == "15m"
    assert _pick_stats_interval(1_800) == "30m"
    assert _pick_stats_interval(3_600) == "1h"
    assert _pick_stats_interval(30) is None


def test_contract_stats_request_covers_full_200_bar_frame(monkeypatch) -> None:
    class FakeClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, dict]] = []

        def get_json(self, path: str, params: dict) -> list[dict]:
            self.calls.append((path, params))
            return []

    client = FakeClient()
    monkeypatch.setattr("app.data_sources.gate_live.get_gate_client", lambda: client)

    _fetch_contract_stats("BTC_USDT", "15m", 200)
    _fetch_contract_stats("BTC_USDT", "5m", 200)

    assert [call[1]["limit"] for call in client.calls] == [201, 201]
    assert [call[1]["interval"] for call in client.calls] == ["15m", "5m"]


def test_stats_frame_sums_flow_and_keeps_oi_units_separate() -> None:
    stats = [
        {
            "time": 1_800,
            "long_taker_size": 10,
            "short_taker_size": 5,
            "open_interest": 1_000,
            "open_interest_usd": 100.0,
            "top_lsr_account": 1.1,
            "top_lsr_size": 1.2,
            "lsr_account": 0.9,
        },
        {
            "time": 2_700,
            "long_taker_size": 20,
            "short_taker_size": 5,
            "open_interest": 1_300,
            "open_interest_usd": 130.0,
            "top_lsr_account": 1.3,
            "top_lsr_size": 1.4,
            "lsr_account": 0.8,
        },
    ]
    out = _stats_frame(stats, frame_seconds=1_800, stats_interval_seconds=900)

    assert len(out) == 1
    row = out.iloc[0]
    assert row["timestamp"] == 1_800
    assert row["buy_volume"] == 30.0
    assert row["sell_volume"] == 10.0
    assert row["flow_quality"] == "REAL"
    assert row["open_interest_qty"] == 1_300.0
    assert row["open_interest_usd"] == 130.0
    assert row["open_interest"] == 1_300.0
    assert row["top_trader_long_short_ratio"] == 1.3
    assert row["top_position_long_short_ratio"] == 1.4
    assert row["account_long_short_ratio"] == 0.8


def test_open_interest_never_falls_back_between_qty_and_usd() -> None:
    stats = [
        {
            "time": 900,
            "long_taker_size": 1,
            "short_taker_size": 1,
            "open_interest": 621_594_184,
            "open_interest_usd": 3_740_213_012.4,
        },
        {
            "time": 1_800,
            "long_taker_size": 1,
            "short_taker_size": 1,
            "open_interest": 700_000_000,
        },
    ]
    out = _stats_frame(stats, frame_seconds=900, stats_interval_seconds=900)

    assert out.iloc[0]["open_interest_qty"] == 621_594_184.0
    assert out.iloc[0]["open_interest_usd"] == 3_740_213_012.4
    assert out.iloc[0]["open_interest"] == 621_594_184.0
    assert out.iloc[1]["open_interest_qty"] == 700_000_000.0
    assert pd.isna(out.iloc[1]["open_interest_usd"])
    assert out.iloc[1]["open_interest"] == 700_000_000.0


def test_liquidations_prefer_new_explicit_usd_fields_even_when_zero() -> None:
    out = _stats_frame(
        [
            {
                "time": 900,
                "long_taker_size": 1,
                "short_taker_size": 1,
                "long_liq_usd_new": 0,
                "long_liq_usd": 99,
                "short_liq_usd_new": 12,
                "short_liq_usd": 9,
            }
        ],
        frame_seconds=900,
        stats_interval_seconds=900,
    )

    assert out.iloc[0]["long_liq_usd"] == 0.0
    assert out.iloc[0]["short_liq_usd"] == 12.0


def test_incomplete_taker_bucket_is_numerically_defined_but_marked_missing() -> None:
    out = _stats_frame(
        [
            {
                "time": 900,
                "long_taker_size": 10,
                "short_taker_size": 4,
            }
        ],
        frame_seconds=1_800,
        stats_interval_seconds=900,
    )

    assert out.iloc[0]["buy_volume"] == 10.0
    assert out.iloc[0]["sell_volume"] == 4.0
    assert out.iloc[0]["flow_quality"] == "MISSING"


def test_taker_split_fallback_is_explicitly_proxy(monkeypatch) -> None:
    monkeypatch.setattr("app.data_sources.gate_live._fetch_contract_stats", lambda *a, **k: [])
    source = object.__new__(GateLiveMarketDataSource)
    frame = pd.DataFrame(
        {
            "timestamp": [900, 1_800, 2_700],
            "open": [100.0, 100.0, 100.0],
            "high": [101.0, 101.0, 101.0],
            "low": [99.0, 99.0, 99.0],
            "close": [101.0, 99.0, 101.0],
            "volume": [10.0, 10.0, 10.0],
        }
    )
    out = source._attach_taker_split(frame, "BTC_USDT", "15m")

    assert (out["flow_quality"] == "PROXY").all()
    assert (out["cvd_proxy"] == 1.0).all()
    assert out.iloc[0]["buy_volume"] > out.iloc[0]["sell_volume"]
    assert out.iloc[1]["buy_volume"] < out.iloc[1]["sell_volume"]
    assert all(abs(out["buy_volume"] + out["sell_volume"] - out["volume"]) < 1e-9)


def test_partial_taker_coverage_marks_each_missing_row(monkeypatch) -> None:
    stats = [
        {
            "time": 1_800,
            "long_taker_size": 8,
            "short_taker_size": 2,
        }
    ]
    monkeypatch.setattr(
        "app.data_sources.gate_live._fetch_contract_stats", lambda *args, **kwargs: stats
    )
    source = object.__new__(GateLiveMarketDataSource)
    frame = pd.DataFrame(
        {
            "timestamp": [900, 1_800],
            "open": [100.0, 100.0],
            "high": [101.0, 101.0],
            "low": [99.0, 99.0],
            "close": [100.0, 101.0],
            "volume": [10.0, 10.0],
        }
    )
    out = source._attach_taker_split(frame, "BTC_USDT", "15m")

    assert out["flow_quality"].tolist() == ["MISSING", "REAL"]
    assert out["cvd_proxy"].tolist() == [1.0, 0.0]
    assert out.iloc[0]["buy_volume"] == 0.0
    assert out.iloc[0]["sell_volume"] == 0.0


def test_closed_candles_excludes_currently_forming_bar() -> None:
    frame = pd.DataFrame({"timestamp": [0, 900, 1_800]})
    out = _closed_candles(frame, "15m", now_seconds=2_600)

    assert out["timestamp"].tolist() == [0, 900]
    assert out["is_closed"].all()


def test_gate_klines_keep_quote_volume_and_drop_open_bar(monkeypatch) -> None:
    step = 900
    aligned_now = int(time.time()) // step * step
    rows = [
        {
            "t": aligned_now - 2 * step,
            "o": "100",
            "h": "102",
            "l": "99",
            "c": "101",
            "v": "10",
            "sum": "1010",
        },
        {
            "t": aligned_now - step,
            "o": "101",
            "h": "103",
            "l": "100",
            "c": "102",
            "v": "11",
        },
        {
            "t": aligned_now,
            "o": "102",
            "h": "104",
            "l": "101",
            "c": "103",
            "v": "12",
            "sum": "9999",
        },
    ]

    class FakeClient:
        def get_json(self, path: str, params: dict) -> list[dict]:
            assert params["limit"] == 3
            return rows

    monkeypatch.setattr("app.data_sources.gate_live._fetch_contract_stats", lambda *a, **k: [])
    source = object.__new__(GateLiveMarketDataSource)
    source._client = FakeClient()
    out = source.get_klines("BTCUSDT", "15m", 2)

    assert out["timestamp"].tolist() == [aligned_now - 2 * step, aligned_now - step]
    assert out.iloc[0]["quote_volume"] == 1010.0
    assert pd.isna(out.iloc[1]["quote_volume"])
    assert out["is_closed"].all()
    assert (out["flow_quality"] == "PROXY").all()


def test_gate_symbol_universe_excludes_tradfi_and_delisting_contracts() -> None:
    source = object.__new__(GateLiveMarketDataSource)
    source._settings = type("Settings", (), {"scan_universe_size": 0})()

    class Client:
        def get_json(self, path, params=None):
            if path.endswith("/tickers"):
                return [
                    {"contract": "XAU_USDT", "volume_24h_quote": "999"},
                    {"contract": "BTC_USDT", "volume_24h_quote": "500"},
                    {"contract": "ETH_USDT", "volume_24h_quote": "400"},
                    {"contract": "OLD_USDT", "volume_24h_quote": "300"},
                ]
            return [
                {"name": "XAU_USDT", "contract_type": "metals", "status": "trading"},
                {"name": "BTC_USDT", "contract_type": "", "status": "trading"},
                {"name": "ETH_USDT", "contract_type": "crypto", "status": "trading"},
                {"name": "OLD_USDT", "contract_type": "", "status": "trading", "in_delisting": True},
            ]

    source._client = Client()

    assert source.list_symbols() == ["BTCUSDT", "ETHUSDT"]


def test_gate_funding_is_labelled_settled_not_current(monkeypatch) -> None:
    stats = [
        {
            "time": 900,
            "open_interest": 100,
            "open_interest_usd": 1_000,
            "long_taker_size": 1,
            "short_taker_size": 1,
        }
    ]
    monkeypatch.setattr(
        "app.data_sources.gate_live._fetch_contract_stats", lambda *args, **kwargs: stats
    )
    source = object.__new__(GateLiveDerivativesDataSource)
    monkeypatch.setattr(
        source,
        "_fetch_funding",
        lambda *args, **kwargs: pd.DataFrame(
            {"timestamp": [0], "funding_rate_settled": [0.0001]}
        ),
    )

    out = source.get_derivatives_metrics("BTCUSDT", "15m", 1)

    assert out.iloc[0]["funding_rate_settled"] == 0.0001
    assert out.iloc[0]["funding_rate"] == 0.0001
    assert pd.isna(out.iloc[0]["funding_rate_current"])
    assert pd.isna(out.iloc[0]["funding_rate_next"])
    assert out.iloc[0]["funding_rate_quality"] == "SETTLED"


def test_gate_current_funding_only_overrides_latest_closed_bucket(monkeypatch) -> None:
    stats = [
        {"time": 0, "open_interest": "100", "open_interest_usd": 1_000},
        {"time": 900, "open_interest": "110", "open_interest_usd": 1_100},
    ]
    monkeypatch.setattr(
        "app.data_sources.gate_live._fetch_contract_stats",
        lambda *args, **kwargs: stats,
    )
    source = object.__new__(GateLiveDerivativesDataSource)
    monkeypatch.setattr(
        source,
        "_fetch_funding",
        lambda *args, **kwargs: pd.DataFrame(
            {"timestamp": [0], "funding_rate_settled": [0.0001]}
        ),
    )
    monkeypatch.setattr(
        source,
        "_fetch_current_funding",
        lambda *args, **kwargs: {"rate": 0.0003, "next_apply": 7200.0, "interval": 3600.0},
    )

    out = source.get_derivatives_metrics("BTCUSDT", "15m", 2)

    assert out["funding_rate"].tolist() == [0.0001, 0.0003]
    assert out["funding_rate_quality"].tolist() == ["SETTLED", "CURRENT"]
    assert pd.isna(out.iloc[0]["funding_rate_current"])
    assert out.iloc[1]["funding_rate_current"] == 0.0003


def test_gate_derivatives_drop_currently_forming_stats_bucket(monkeypatch) -> None:
    step = 900
    aligned_now = int(time.time()) // step * step
    stats = [
        {"time": aligned_now - step, "open_interest": "100", "open_interest_usd": 1_000},
        {"time": aligned_now, "open_interest": "110", "open_interest_usd": 1_100},
    ]
    monkeypatch.setattr(
        "app.data_sources.gate_live._fetch_contract_stats",
        lambda *args, **kwargs: stats,
    )
    source = object.__new__(GateLiveDerivativesDataSource)
    monkeypatch.setattr(
        source,
        "_fetch_funding",
        lambda *args, **kwargs: pd.DataFrame(
            columns=["timestamp", "funding_rate_settled"]
        ),
    )
    monkeypatch.setattr(
        source,
        "_fetch_current_funding",
        lambda *args, **kwargs: {"rate": 0.0002, "next_apply": 0.0, "interval": 28_800.0},
    )

    out = source.get_derivatives_metrics("BTCUSDT", "15m", 2)

    assert out["timestamp"].tolist() == [aligned_now - step]
    assert out.iloc[-1]["funding_rate_quality"] == "CURRENT"


def test_market_data_merge_is_causal_bounded_and_does_not_repeat_flows() -> None:
    class MarketSource:
        def get_klines(self, **kwargs) -> pd.DataFrame:
            return pd.DataFrame(
                {
                    "timestamp": [0, 900, 1_800],
                    "open": [1.0, 1.0, 1.0],
                    "high": [1.0, 1.0, 1.0],
                    "low": [1.0, 1.0, 1.0],
                    "close": [1.0, 1.0, 1.0],
                    "volume": [1.0, 1.0, 1.0],
                    "buy_volume": [1.0, 1.0, 1.0],
                    "sell_volume": [0.0, 0.0, 0.0],
                }
            )

    class DerivativesSource:
        def get_derivatives_metrics(self, **kwargs) -> pd.DataFrame:
            return pd.DataFrame(
                {
                    "timestamp": [900],
                    "open_interest_qty": [25.0],
                    "open_interest_usd": [2_500.0],
                    "open_interest": [25.0],
                    "top_trader_long_short_ratio": [1.2],
                    "top_position_long_short_ratio": [1.3],
                    "account_long_short_ratio": [0.8],
                    "long_liq_usd": [7.0],
                    "short_liq_usd": [3.0],
                    "funding_rate_settled": [0.0001],
                    "funding_rate": [0.0001],
                    "funding_rate_quality": ["SETTLED"],
                }
            )

    service = object.__new__(MarketDataService)
    service.market_source = MarketSource()
    service.derivatives_source = DerivativesSource()
    out = service.get_enriched_market_frame("BTCUSDT", "15m", 3)

    # The observation at t=900 cannot travel backward to t=0 or a complete bar
    # forward to t=1800. Liquidation flow is attached only at exact t=900.
    assert pd.isna(out.iloc[0]["open_interest"])
    assert out.iloc[1]["open_interest"] == 25.0
    assert pd.isna(out.iloc[2]["open_interest"])
    assert out["open_interest_qty"].isna().tolist() == [True, False, True]
    assert out["open_interest_usd"].isna().tolist() == [True, False, True]
    assert out["oi_quality"].tolist() == ["MISSING", "REAL", "MISSING"]
    assert out["long_liq_usd"].tolist() == [0.0, 7.0, 0.0]
    assert out["short_liq_usd"].tolist() == [0.0, 3.0, 0.0]
    assert out["liquidation_quality"].tolist() == ["MISSING", "REAL", "MISSING"]
    assert out["funding_rate_quality"].tolist() == ["MISSING", "SETTLED", "MISSING"]
    assert pd.isna(out.iloc[0]["funding_rate_current"])
    assert out["cvd"].tolist() == [1.0, 2.0, 3.0]
