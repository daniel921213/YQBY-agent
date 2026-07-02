"""Stage classifier: does the radar tell 剛開始異動 from 已經過熱?"""

import numpy as np
import pandas as pd

from app.indicators.cvd import add_cvd_columns
from app.indicators.divergence import detect_price_cvd_divergence
from app.indicators.early_signals import (
    analyze_cvd_thrust,
    analyze_volatility_squeeze,
    analyze_volume_surge,
)
from app.scoring.stages import (
    STAGE_EARLY,
    STAGE_OVERHEAT,
    STAGE_REVERSAL,
    classify_stage,
)

_BARS = 200
_TF = "15m"


def _base_frame(close: np.ndarray) -> pd.DataFrame:
    n = len(close)
    volume = np.full(n, 100.0)
    frame = pd.DataFrame(
        {
            "timestamp": np.arange(n) * 900,
            "open": close,
            "high": close * 1.001,
            "low": close * 0.999,
            "close": close,
            "volume": volume,
            "buy_volume": volume * 0.5,
            "sell_volume": volume * 0.5,
            "open_interest": np.full(n, 1_000_000.0),
            "top_trader_long_short_ratio": np.full(n, 1.0),
            "account_long_short_ratio": np.full(n, 1.0),
            "funding_rate": np.full(n, 0.0001),
        }
    )
    return frame


def _classify(frame: pd.DataFrame):
    frame = add_cvd_columns(frame)
    return classify_stage(
        frame,
        _TF,
        detect_price_cvd_divergence(frame, lookback=96),
        analyze_volume_surge(frame),
        analyze_cvd_thrust(frame),
        analyze_volatility_squeeze(frame),
    )


def test_flow_before_price_is_early_stage() -> None:
    # Price flat; but in the last 2h: volume 3x, heavy net taker buying,
    # and OI up 6% — the radar's prize case.
    rng = np.random.default_rng(7)
    close = 100.0 + rng.normal(0, 0.02, _BARS).cumsum() * 0.01
    frame = _base_frame(close)
    frame.loc[frame.index[-8:], "volume"] = 320.0
    frame.loc[frame.index[-8:], "buy_volume"] = 260.0
    frame.loc[frame.index[-8:], "sell_volume"] = 60.0
    oi = frame["open_interest"].to_numpy().copy()
    oi[-16:] = np.linspace(1_000_000, 1_060_000, 16)
    frame["open_interest"] = oi

    result = _classify(frame)

    assert result.stage == STAGE_EARLY
    assert any("資金先行" in r for r in result.reasons)


def test_extended_move_with_crowding_is_overheat() -> None:
    # +10% over the last 24h, funding hot, retail crowded long => late entry.
    close = np.full(_BARS, 100.0)
    close[-96:] = np.linspace(100.0, 110.0, 96)
    frame = _base_frame(close)
    frame["funding_rate"] = 0.0008
    frame["account_long_short_ratio"] = 1.8
    # Buyers still dominant (no reversal flip), just late.
    frame.loc[frame.index[-8:], "buy_volume"] = 70.0
    frame.loc[frame.index[-8:], "sell_volume"] = 30.0

    result = _classify(frame)

    assert result.stage == STAGE_OVERHEAT
    assert any("過熱" in r or "擁擠" in r for r in result.reasons)


def test_fresh_bullish_divergence_after_dump_is_reversal() -> None:
    # −8% dump, then a fresh lower low where CVD holds a clearly higher low.
    close = np.full(_BARS, 100.0)
    close[-96:] = np.linspace(100.0, 93.0, 96)
    for offset, px in ((-41, 92.4), (-40, 92.0), (-39, 92.4)):
        close[offset] = px
    for offset, px in ((-7, 91.4), (-6, 91.0), (-5, 91.4)):
        close[offset] = px
    close[-4:] = 91.8
    frame = _base_frame(close)
    # Sellers dominated the dump, but well before the second low the flow
    # flipped to net buying — so CVD's second low sits far above the first.
    frame.loc[frame.index[-96:-30], "buy_volume"] = 30.0
    frame.loc[frame.index[-96:-30], "sell_volume"] = 70.0
    frame.loc[frame.index[-30:], "buy_volume"] = 75.0
    frame.loc[frame.index[-30:], "sell_volume"] = 25.0

    result = _classify(frame)

    assert result.stage == STAGE_REVERSAL
    assert any("底背離" in r for r in result.reasons)
