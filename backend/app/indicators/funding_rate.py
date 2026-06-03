from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.utils.numeric import clamp


FundingBias = Literal["LONG", "SHORT", "NEUTRAL"]


@dataclass(frozen=True)
class FundingRateSignal:
    direction: FundingBias
    strength: float
    label: str
    description: str


def analyze_funding_rate_extreme(
    frame: pd.DataFrame,
    lookback: int = 96,
    extreme_threshold: float = 0.00035,
) -> FundingRateSignal:
    recent = frame.tail(lookback)
    if len(recent) < 12:
        return FundingRateSignal("NEUTRAL", 0.0, "資金費率資料不足", "樣本不足")

    latest = float(recent["funding_rate"].iloc[-1])
    mean = float(recent["funding_rate"].mean())
    std = float(recent["funding_rate"].std(ddof=0) or 1e-9)
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
