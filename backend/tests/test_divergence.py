import numpy as np
import pandas as pd

from app.indicators.divergence import (
    detect_cvd_absorption,
    detect_price_cvd_divergence,
)


def _frame(close: list[float], cvd: list[float]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "close": close,
            "high": [value + 0.1 for value in close],
            "low": [value - 0.1 for value in close],
            "cvd": cvd,
            "volume": [1000.0] * len(close),
        }
    )


def _bullish_setup(second_dip_at: int, length: int = 60) -> tuple[list[float], list[float]]:
    """Price makes a lower low at `second_dip_at` vs a first dip at 20;
    CVD makes a clearly higher low (gap far above delta noise)."""
    # Monotonic base => the carved dips are the ONLY pivot lows.
    close = [100.0 + 0.01 * i for i in range(length)]
    # First dip to 95 at idx 20, recovery, second (lower) dip at second_dip_at.
    for offset, px in ((-2, 97.5), (-1, 96.0), (0, 95.0), (1, 96.0), (2, 97.5)):
        close[20 + offset] = px
    for offset, px in ((-2, 96.5), (-1, 95.0), (0, 93.5), (1, 95.0), (2, 96.5)):
        idx = second_dip_at + offset
        if 0 <= idx < length:
            close[idx] = px

    # CVD: gentle noise (small deltas), −60 around the first dip, −5 at the
    # second — a +55 gap, far above 0.35 * σ√n for these deltas.
    cvd = [-(i % 5) * 2.0 for i in range(length)]
    cvd[20] = -60.0
    if second_dip_at < length:
        cvd[second_dip_at] = -5.0
    return close, cvd


def test_detects_fresh_bullish_cvd_divergence() -> None:
    close, cvd = _bullish_setup(second_dip_at=52)
    signal = detect_price_cvd_divergence(_frame(close, cvd), lookback=60)

    assert signal.kind == "bullish"
    assert signal.pattern == "exhaustion"
    assert signal.strength > 0
    assert signal.age_bars is not None and signal.age_bars <= 12


def test_stale_divergence_no_longer_fires() -> None:
    # Same structure but the confirming low happened 39 bars ago — the move has
    # played out, so it must not keep flagging 反轉 all day.
    close, cvd = _bullish_setup(second_dip_at=20)
    # Move the first dip earlier so the pair is (8, 20).
    for offset, px in ((-2, 97.5), (-1, 96.0), (0, 95.0), (1, 96.0), (2, 97.5)):
        close[8 + offset] = px
    cvd[8] = -60.0

    signal = detect_price_cvd_divergence(_frame(close, cvd), lookback=60)

    assert signal.kind == "none"


def test_noise_level_cvd_gap_is_rejected() -> None:
    close, _ = _bullish_setup(second_dip_at=52)
    # CVD alternates ±50 per bar (huge delta noise); the "higher low" gap at the
    # pivots is only +5 — indistinguishable from noise, must not count.
    cvd = [50.0 if i % 2 else 0.0 for i in range(60)]
    cvd[20] = -5.0
    cvd[52] = 0.0

    signal = detect_price_cvd_divergence(_frame(close, cvd), lookback=60)

    assert signal.kind == "none"


def test_detects_fresh_bearish_cvd_divergence() -> None:
    close, cvd_bull = _bullish_setup(second_dip_at=52)
    # Mirror: price higher high, CVD lower high.
    close = [200.0 - c for c in close]
    cvd = [-c for c in cvd_bull]

    signal = detect_price_cvd_divergence(_frame(close, cvd), lookback=60)

    assert signal.kind == "bearish"
    assert signal.pattern == "exhaustion"
    assert signal.strength > 0


def test_detects_bullish_sell_absorption_with_one_bar_cvd_lag() -> None:
    length = 60
    close = [100.0 + 0.01 * i for i in range(length)]
    for offset, px in ((-2, 97.5), (-1, 96.0), (0, 95.0), (1, 96.0), (2, 97.5)):
        close[20 + offset] = px
    # Price holds a higher low while aggressive selling makes a much lower CVD
    # low one bar later. The ±2 alignment must still recognize sell absorption.
    for offset, px in ((-2, 97.6), (-1, 96.2), (0, 95.2), (1, 96.2), (2, 97.6)):
        close[52 + offset] = px
    cvd = [-(i % 5) * 2.0 for i in range(length)]
    cvd[20] = -20.0
    cvd[53] = -80.0

    signal = detect_cvd_absorption(_frame(close, cvd), lookback=60)

    assert signal.kind == "bullish"
    assert signal.pattern == "absorption"
    assert "吸收" in signal.description
    assert signal.age_bars is not None and signal.age_bars <= 12


def test_invalid_cvd_window_never_emits_a_signal() -> None:
    close, cvd = _bullish_setup(second_dip_at=52)
    cvd[40] = np.nan

    signal = detect_price_cvd_divergence(_frame(close, cvd), lookback=60)

    assert signal.kind == "none"
    assert signal.strength == 0.0
