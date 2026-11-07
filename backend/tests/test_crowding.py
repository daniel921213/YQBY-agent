"""Exchange-normalised crowding: 8h funding and self-relative long/short ratios."""

import math

import numpy as np
import pandas as pd
import pytest

from app.data_sources.gate_live import GateLiveDerivativesDataSource
from app.indicators.crowding import (
    add_ratio_baseline_columns,
    describe_funding,
    funding_to_8h,
    latest_ratio_read,
    snap_funding_interval,
)
from app.indicators.funding_rate import analyze_funding_rate_extreme
from app.indicators.long_short_ratio import analyze_participant_contrast
from app.services.market_data_service import MarketDataService

_HOUR = 3_600
_BAR = 900


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (28_800, 28_800),
        (28_799, 28_800),     # settlement-time jitter
        (25_200, 28_800),     # a 7h gap
        (57_600, 28_800),     # one missing settlement record
        (14_400, 14_400),
        (3_500, 3_600),
    ],
)
def test_settlement_gaps_snap_to_real_intervals(seconds: int, expected: int) -> None:
    assert snap_funding_interval(seconds) == expected


@pytest.mark.parametrize("seconds", [0, -5, float("nan"), None, "x"])
def test_unknown_settlement_gap_is_nan(seconds) -> None:
    assert math.isnan(snap_funding_interval(seconds))


def test_funding_is_converted_to_an_8h_equivalent() -> None:
    rate = pd.Series([0.0001, 0.0001, 0.0001, 0.0001])
    interval = pd.Series([28_800, 14_400, 3_600, float("nan")])

    assert funding_to_8h(rate, interval).tolist() == pytest.approx([0.0001, 0.0002, 0.0008, 0.0001])
    assert funding_to_8h(rate, None).tolist() == pytest.approx(rate.tolist())
    assert describe_funding(0.0003, 0.0006, 4.0) == "0.0300%／4h（約 0.0600%／8h）"
    assert describe_funding(0.0003, 0.0003, 8.0) == "0.0300%／8h"


def test_gate_settlement_interval_is_inferred_from_history() -> None:
    class FakeClient:
        def get_json(self, path, params=None):  # noqa: ANN001
            # Newest first, like Gate: a contract that moved from 8h to 4h.
            stamps = [0, 28_800, 57_600, 72_000, 86_400]
            return [{"t": t, "r": "0.0001"} for t in reversed(stamps)]

    source = object.__new__(GateLiveDerivativesDataSource)
    source._client = FakeClient()

    out = source._fetch_funding("BTC_USDT", 5)

    assert out["timestamp"].tolist() == [0, 28_800, 57_600, 72_000, 86_400]
    assert out["funding_interval"].tolist() == [28_800, 28_800, 28_800, 14_400, 14_400]


def test_four_hour_funding_trips_the_8h_threshold_once_normalised() -> None:
    n = 60
    frame = pd.DataFrame(
        {
            "timestamp": np.arange(n) * _BAR,
            "funding_rate": np.full(n, 0.0002),         # per 4h settlement
            "funding_interval": np.full(n, 14_400.0),
        }
    )
    raw_only = analyze_funding_rate_extreme(frame)
    frame["funding_rate_8h"] = funding_to_8h(frame["funding_rate"], frame["funding_interval"])
    normalised = analyze_funding_rate_extreme(frame)

    assert raw_only.direction == "NEUTRAL"           # 0.02% < 0.035% threshold
    assert normalised.direction == "SHORT"           # 0.04% / 8h is extreme
    assert "／4h" in normalised.description and "／8h" in normalised.description


def _ratio_history(values: list[float], top: list[float] | None = None) -> pd.DataFrame:
    hours = np.arange(len(values)) * _HOUR
    return pd.DataFrame(
        {
            "timestamp": hours,
            "account_long_short_ratio": values,
            "top_trader_long_short_ratio": top if top is not None else values,
        }
    )


def _frame_at(timestamps: np.ndarray, account: float, top: float) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "account_long_short_ratio": np.full(len(timestamps), account),
            "top_trader_long_short_ratio": np.full(len(timestamps), top),
        }
    )


def test_ratio_baseline_never_reads_hours_that_closed_after_the_bar() -> None:
    rng = np.random.default_rng(3)
    values = list(2.0 + rng.normal(0, 0.05, 400))
    history = _ratio_history(values)
    bars = np.arange(300 * 4, 400 * 4) * _BAR
    frame = _frame_at(bars, 2.0, 1.5)

    full = add_ratio_baseline_columns(frame, history)
    for cut in (320, 350, 399):
        truncated = add_ratio_baseline_columns(frame, history.iloc[:cut])
        # Bars opening no later than the cut hour's close only use hours <= cut-1.
        visible = frame["timestamp"] <= cut * _HOUR
        pd.testing.assert_series_equal(
            full.loc[visible, "account_ratio_p50"],
            truncated.loc[visible, "account_ratio_p50"],
        )
    assert set(full["ratio_baseline_source"]) == {"14d"}


def test_structurally_high_ratio_is_not_crowded_but_a_jump_is() -> None:
    history = _ratio_history([2.3 + 0.02 * math.sin(i) for i in range(400)])
    stamp = np.array([400 * _HOUR])

    steady = latest_ratio_read(add_ratio_baseline_columns(_frame_at(stamp, 2.3, 1.6), history))
    jump = latest_ratio_read(add_ratio_baseline_columns(_frame_at(stamp, 2.8, 1.6), history))
    drop = latest_ratio_read(add_ratio_baseline_columns(_frame_at(stamp, 1.9, 1.6), history))
    small = latest_ratio_read(add_ratio_baseline_columns(_frame_at(stamp, 2.42, 1.6), history))

    assert steady.crowded is None and steady.source == "14d"
    assert steady.account_median == pytest.approx(2.3, abs=0.03)
    assert jump.crowded == "LONG"
    assert drop.crowded == "SHORT"
    assert small.crowded is None            # above p90 but < 10% from the median


def test_ratio_baseline_falls_back_to_the_frame_when_history_is_missing() -> None:
    frame = _frame_at(np.arange(120) * _BAR, 2.3, 1.6)
    frame.loc[frame.index[-1], "account_long_short_ratio"] = 2.9

    read = latest_ratio_read(add_ratio_baseline_columns(frame, None))

    assert read.source == "frame"
    assert read.crowded == "LONG"


def test_participant_contrast_no_longer_shorts_a_structurally_long_market() -> None:
    history = _ratio_history([2.3] * 400, [1.6] * 400)
    stamps = np.arange(390 * 4, 400 * 4) * _BAR
    steady = add_ratio_baseline_columns(_frame_at(stamps, 2.3, 1.6), history)

    signal = analyze_participant_contrast(steady)

    # The old fixed rule (account >= 1.45 and top < account) read this as SHORT.
    assert signal.direction == "NEUTRAL"


def test_participant_contrast_reads_whales_and_retail_moving_apart() -> None:
    history = _ratio_history([2.3] * 400, [1.6] * 400)
    stamps = np.arange(390 * 4, 400 * 4) * _BAR
    bullish = add_ratio_baseline_columns(_frame_at(stamps, 2.0, 1.8), history)
    crowded = add_ratio_baseline_columns(_frame_at(stamps, 2.8, 1.6), history)

    assert analyze_participant_contrast(bullish).direction == "LONG"
    assert analyze_participant_contrast(crowded).direction == "SHORT"
    assert "常態" in analyze_participant_contrast(crowded).description


def test_market_data_service_attaches_8h_funding_and_ratio_baseline() -> None:
    n = 8
    stamps = [i * _BAR for i in range(n)]

    class MarketSource:
        def get_klines(self, **kwargs) -> pd.DataFrame:
            return pd.DataFrame(
                {
                    "timestamp": stamps,
                    "open": [1.0] * n,
                    "high": [1.0] * n,
                    "low": [1.0] * n,
                    "close": [1.0] * n,
                    "volume": [1.0] * n,
                    "buy_volume": [1.0] * n,
                    "sell_volume": [0.0] * n,
                }
            )

    class DerivativesSource:
        def __init__(self, history: pd.DataFrame | Exception) -> None:
            self.history = history
            self.calls: list[int] = []

        def get_derivatives_metrics(self, **kwargs) -> pd.DataFrame:
            return pd.DataFrame(
                {
                    "timestamp": stamps,
                    "top_trader_long_short_ratio": [1.6] * n,
                    "account_long_short_ratio": [2.3] * n,
                    "funding_rate_settled": [0.0001] * n,
                    "funding_rate": [0.0001] * n,
                    "funding_interval": [14_400.0] * n,
                    "funding_rate_quality": ["SETTLED"] * n,
                }
            )

        def get_ratio_history(self, symbol: str, hours: int) -> pd.DataFrame:
            self.calls.append(hours)
            if isinstance(self.history, Exception):
                raise self.history
            return self.history

    history = _ratio_history([2.3] * 200, [1.6] * 200)
    history["timestamp"] -= 200 * _HOUR  # all closed before the first bar
    service = object.__new__(MarketDataService)
    service.market_source = MarketSource()
    service.derivatives_source = DerivativesSource(history)

    out = service.get_enriched_market_frame("BTCUSDT", "15m", n)

    assert out["funding_rate"].tolist() == pytest.approx([0.0001] * n)
    assert out["funding_rate_8h"].tolist() == pytest.approx([0.0002] * n)
    assert set(out["ratio_baseline_source"]) == {"14d"}
    assert service.derivatives_source.calls == [336 + 2 + 2]

    skipped = service.get_enriched_market_frame("BTCUSDT", "5m", n, with_ratio_baseline=False)
    assert "account_ratio_p50" not in skipped.columns
    assert len(service.derivatives_source.calls) == 1

    service.derivatives_source = DerivativesSource(RuntimeError("gate down"))
    degraded = service.get_enriched_market_frame("BTCUSDT", "15m", n)
    assert "account_ratio_p50" in degraded.columns
    assert set(degraded["ratio_baseline_source"]) == {"none"}  # too few rows to trust
