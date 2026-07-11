import numpy as np
import pandas as pd

from app.indicators.cvd import add_cvd_columns
from app.indicators.early_signals import analyze_cvd_thrust, analyze_volume_surge


def _flow_frame(
    *,
    baseline_buy: float = 50.0,
    baseline_sell: float = 50.0,
    recent_buy: float = 80.0,
    recent_sell: float = 20.0,
    price_move: float = 0.0,
    recent_volume: float = 100.0,
) -> pd.DataFrame:
    bars = 112
    close = np.full(bars, 100.0)
    close[-9:] = np.linspace(100.0, 100.0 * (1.0 + price_move), 9)
    buy = np.full(bars, baseline_buy)
    sell = np.full(bars, baseline_sell)
    buy[-8:] = recent_buy
    sell[-8:] = recent_sell
    volume = np.full(bars, baseline_buy + baseline_sell)
    volume[-8:] = recent_volume
    return pd.DataFrame(
        {
            "close": close,
            "volume": volume,
            "buy_volume": buy,
            "sell_volume": sell,
        }
    )


def test_robust_thrust_is_centered_on_persistent_flow() -> None:
    # Persistent +10 delta is the baseline, not a fresh anomaly.
    frame = _flow_frame(
        baseline_buy=55.0,
        baseline_sell=45.0,
        recent_buy=55.0,
        recent_sell=45.0,
        price_move=0.01,
    )

    signal = analyze_cvd_thrust(frame)

    assert signal.direction == "NEUTRAL"
    assert abs(signal.zscore) < 0.1


def test_mad_fallback_detects_real_break_when_price_confirms() -> None:
    # Historical rolling sums are exactly zero (MAD/IQR/std all degenerate), so
    # the liquidity-relative fallback must remain finite and detect the break.
    signal = analyze_cvd_thrust(_flow_frame(price_move=0.02))

    assert signal.direction == "LONG"
    assert signal.zscore >= 1.5


def test_strong_buy_flow_without_price_response_is_absorption_not_long() -> None:
    signal = analyze_cvd_thrust(_flow_frame(price_move=0.0))

    assert signal.direction == "NEUTRAL"
    assert signal.zscore >= 1.5
    assert "吸收" in signal.label


def test_volume_surge_without_price_response_is_not_directional() -> None:
    frame = _flow_frame(
        recent_buy=270.0,
        recent_sell=30.0,
        recent_volume=300.0,
        price_move=0.0,
    )

    signal = analyze_volume_surge(frame)

    assert signal.ratio >= 2.0
    assert signal.direction == "NEUTRAL"
    assert "吸收" in signal.label


def test_missing_flow_data_cannot_create_a_thrust() -> None:
    frame = _flow_frame(price_move=0.02)
    frame.loc[frame.index[-20], "buy_volume"] = np.nan

    signal = analyze_cvd_thrust(frame)

    assert signal.direction == "NEUTRAL"
    assert signal.strength == 0.0
    assert signal.zscore == 0.0


def test_invalid_volume_stays_missing_in_cvd() -> None:
    frame = _flow_frame().iloc[:4].copy()
    frame.loc[frame.index[2], "sell_volume"] = -1.0

    enriched = add_cvd_columns(frame)

    assert np.isnan(enriched.loc[frame.index[2], "volume_delta"])
    assert np.isnan(enriched.loc[frame.index[2], "cvd"])
