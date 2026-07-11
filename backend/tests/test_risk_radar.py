import numpy as np
import pandas as pd

from app.indicators.risk_radar import (
    analyze_five_minute_risk,
    classify_oi_state,
    robust_zscore,
)
from app.services.anomaly_tracker import AnomalyTracker


def _frame() -> pd.DataFrame:
    bars = 96
    close = np.full(bars, 100.0)
    oi_qty = np.full(bars, 1_000_000.0)
    return pd.DataFrame(
        {
            "timestamp": np.arange(bars, dtype=np.int64) * 300,
            "open": close,
            "high": close * 1.001,
            "low": close * 0.999,
            "close": close,
            "volume": np.full(bars, 1_000.0),
            "quote_volume": np.full(bars, 1_000_000.0),
            "buy_volume": np.full(bars, 500.0),
            "sell_volume": np.full(bars, 500.0),
            "flow_quality": np.full(bars, "REAL"),
            "open_interest_qty": oi_qty,
            "open_interest_usd": np.full(bars, 100_000_000.0),
            "long_liq_usd": np.zeros(bars),
            "short_liq_usd": np.zeros(bars),
            "liquidation_quality": np.full(bars, "REAL"),
        }
    )


def test_robust_zscore_is_centered_on_historical_baseline() -> None:
    baseline = pd.Series([120.0, 100.0, 110.0, 90.0, 100.0, 105.0, 95.0])
    assert abs(robust_zscore(100.0, baseline)) < 0.1
    assert robust_zscore(500.0, baseline) > 3.0


def test_oi_state_is_full_three_by_three_and_exits_are_not_reversals() -> None:
    kwargs = {"price_deadband": 0.001, "oi_deadband": 0.003}
    assert classify_oi_state(0.01, 0.02, **kwargs) == "多頭建倉"
    assert classify_oi_state(-0.01, 0.02, **kwargs) == "空頭建倉"
    assert classify_oi_state(0.01, -0.02, **kwargs) == "空頭回補"
    assert classify_oi_state(-0.01, -0.02, **kwargs) == "多頭去槓桿"
    assert classify_oi_state(0.0, 0.02, **kwargs) == "OI增倉／價格持平"
    assert classify_oi_state(-0.01, 0.0, **kwargs) == "價格下跌／OI持平"


def test_aggressive_buying_without_price_response_is_suspected_absorption() -> None:
    frame = _frame()
    frame.loc[frame.index[-3:], "buy_volume"] = 950.0
    frame.loc[frame.index[-3:], "sell_volume"] = 50.0

    reading = analyze_five_minute_risk("TESTUSDT", frame, official_direction="LONG")

    assert reading is not None
    assert reading.state == "買單疑似被吸收"
    assert reading.direction == "SHORT"
    assert reading.conflicts_official is True
    assert reading.severity == "HIGH"


def test_long_liquidation_is_bearish_deleveraging_not_an_automatic_long() -> None:
    frame = _frame()
    frame.loc[frame.index[-4:], "close"] = np.linspace(100.0, 97.0, 4)
    frame.loc[frame.index[-4:], "open_interest_qty"] = np.linspace(1_000_000, 950_000, 4)
    frame.loc[frame.index[-3:], "buy_volume"] = 100.0
    frame.loc[frame.index[-3:], "sell_volume"] = 900.0
    frame.loc[frame.index[-12:], "long_liq_usd"] = 100_000.0

    reading = analyze_five_minute_risk("TESTUSDT", frame, official_direction="LONG")

    assert reading is not None
    assert reading.state == "多頭去槓桿進行中"
    assert reading.direction == "SHORT"
    assert reading.liquidation_intensity > 0
    assert "多頭爆倉／去槓桿" in reading.flags


def test_missing_flow_is_not_treated_as_real_neutral_or_anomaly() -> None:
    frame = _frame()
    frame.loc[frame.index[-3:], "buy_volume"] = 950.0
    frame.loc[frame.index[-3:], "sell_volume"] = 50.0
    frame.loc[frame.index[-3:], "flow_quality"] = "MISSING"

    reading = analyze_five_minute_risk("TESTUSDT", frame)

    assert reading is not None
    assert reading.flow_zscore == 0.0
    assert reading.data_quality == "PARTIAL"
    assert not any("主動買盤" in flag for flag in reading.flags)
    assert "吸收" not in reading.state


def test_state_transition_requires_two_consecutive_authoritative_scans() -> None:
    tracker = AnomalyTracker()
    assert tracker.confirm_risk_state_transitions({"BTCUSDT": "多頭建倉"}) == {}
    assert tracker.confirm_risk_state_transitions({"BTCUSDT": "空頭建倉"}) == {}
    # Returning to baseline cancels the pending one-scan switch.
    assert tracker.confirm_risk_state_transitions({"BTCUSDT": "多頭建倉"}) == {}
    assert tracker.confirm_risk_state_transitions({"BTCUSDT": "空頭建倉"}) == {}
    assert tracker.confirm_risk_state_transitions({"BTCUSDT": "空頭建倉"}) == {
        "BTCUSDT": ("多頭建倉", "空頭建倉")
    }
