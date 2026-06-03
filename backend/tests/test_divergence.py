import pandas as pd

from app.indicators.divergence import detect_price_cvd_divergence


def test_detects_bullish_cvd_divergence() -> None:
    close = [100, 96, 101, 97, 103, 94, 99, 92, 98, 91, 97]
    cvd = [0, -120, -80, -90, -30, -70, -40, -45, -20, -15, 5]
    frame = pd.DataFrame(
        {
            "close": close,
            "cvd": cvd,
            "volume": [1000] * len(close),
        }
    )

    signal = detect_price_cvd_divergence(frame, lookback=len(frame), pivot_window=1)

    assert signal.kind == "bullish"
    assert signal.strength > 0


def test_detects_bearish_cvd_divergence() -> None:
    close = [100, 104, 99, 105, 98, 108, 102, 110, 103, 112, 104]
    cvd = [0, 140, 90, 120, 80, 100, 70, 80, 55, 65, 40]
    frame = pd.DataFrame(
        {
            "close": close,
            "cvd": cvd,
            "volume": [1000] * len(close),
        }
    )

    signal = detect_price_cvd_divergence(frame, lookback=len(frame), pivot_window=1)

    assert signal.kind == "bearish"
    assert signal.strength > 0

