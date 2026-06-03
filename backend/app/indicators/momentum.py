from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.utils.numeric import clamp, pct_change

MomentumBias = Literal["LONG", "SHORT", "NEUTRAL"]


@dataclass(frozen=True)
class MomentumSignal:
    direction: MomentumBias
    strength: float
    label: str
    description: str
    return_short: float
    return_long: float


def analyze_momentum(
    frame: pd.DataFrame,
    bars_short: int = 4,    # 1h on a 15m frame
    bars_long: int = 16,    # 4h on a 15m frame
    full_scale_short: float = 0.015,
    full_scale_long: float = 0.035,
) -> MomentumSignal:
    """Blend short (1h) and long (4h) price momentum into one directional read."""
    closes = frame["close"]
    if len(closes) <= bars_long + 1:
        return MomentumSignal("NEUTRAL", 0.0, "動能資料不足", "K 線樣本不足", 0.0, 0.0)

    r_short = pct_change(closes.iloc[-1 - bars_short], closes.iloc[-1])
    r_long = pct_change(closes.iloc[-1 - bars_long], closes.iloc[-1])

    # Normalise each horizon, then average. Agreement between 1h and 4h => stronger.
    norm = 0.5 * (r_short / full_scale_short) + 0.5 * (r_long / full_scale_long)
    strength = clamp(abs(norm), 0.0, 1.0)

    if norm > 0.2:
        direction: MomentumBias = "LONG"
        label = "動能偏多"
    elif norm < -0.2:
        direction = "SHORT"
        label = "動能偏空"
    else:
        return MomentumSignal(
            "NEUTRAL",
            strength * 0.3,
            "動能中性",
            f"1h {r_short:+.2%} / 4h {r_long:+.2%}，方向不明顯",
            r_short,
            r_long,
        )

    return MomentumSignal(
        direction,
        max(strength, 0.3),
        label,
        f"1h {r_short:+.2%}、4h {r_long:+.2%} 同向{'上行' if direction == 'LONG' else '下行'}",
        r_short,
        r_long,
    )
