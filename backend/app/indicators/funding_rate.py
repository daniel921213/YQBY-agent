from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.utils.numeric import clamp


FundingBias = Literal["LONG", "SHORT", "NEUTRAL"]

# The z-score needs this many *distinct* funding observations to mean anything.
# Funding settles every 1/4/8h but is merged onto every candle, so the bar
# series is a step function: computing σ over 3 near-identical steps produces
# a microscopic denominator and spurious |z| > 1.8 readings.
_MIN_EFFECTIVE_SETTLEMENTS = 5


@dataclass(frozen=True)
class FundingRateSignal:
    direction: FundingBias
    strength: float
    label: str
    description: str


def analyze_funding_rate_extreme(
    frame: pd.DataFrame,
    lookback: int = 192,
    extreme_threshold: float = 0.00035,
) -> FundingRateSignal:
    recent = frame.tail(lookback)
    if len(recent) < 12:
        return FundingRateSignal("NEUTRAL", 0.0, "資金費率資料不足", "樣本不足")

    series = recent["funding_rate"]
    latest = float(series.iloc[-1])

    # Collapse the bar-expanded step function back to (approximate) settlement
    # observations, then only trust the z-score when there are enough of them.
    settlements = series[series.ne(series.shift())]
    z_score = 0.0
    if len(settlements) >= _MIN_EFFECTIVE_SETTLEMENTS:
        mean = float(settlements.mean())
        std = float(settlements.std(ddof=0) or 0.0)
        if std > 1e-9:
            z_score = (latest - mean) / std

    threshold_strength = abs(latest) / max(extreme_threshold, 1e-9)
    z_strength = abs(z_score) / 2.5
    strength = clamp(max(threshold_strength, z_strength) * 0.65, 0.0, 1.0)

    if latest <= -extreme_threshold or z_score <= -1.8:
        return FundingRateSignal(
            "LONG",
            max(strength, 0.45),
            "資金費率極端偏負",
            f"資金費率 {latest:.5%}，空頭付費壓力偏高，具備反向做多條件",
        )

    if latest >= extreme_threshold or z_score >= 1.8:
        return FundingRateSignal(
            "SHORT",
            max(strength, 0.45),
            "資金費率極端偏正",
            f"資金費率 {latest:.5%}，多頭付費壓力偏高，具備反向做空條件",
        )

    return FundingRateSignal(
        "NEUTRAL",
        strength * 0.2,
        "資金費率正常",
        f"資金費率 {latest:.5%}，未達極端閾值",
    )
