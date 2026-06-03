from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.utils.numeric import clamp, pct_change

RsBias = Literal["LONG", "SHORT", "NEUTRAL"]


@dataclass(frozen=True)
class RelativeStrengthSignal:
    direction: RsBias
    strength: float
    label: str
    description: str
    rs_short: float
    rs_long: float


def _return(closes: pd.Series, bars: int) -> float:
    if len(closes) <= bars + 1:
        return 0.0
    return pct_change(closes.iloc[-1 - bars], closes.iloc[-1])


def analyze_relative_strength(
    frame: pd.DataFrame,
    btc_frame: pd.DataFrame,
    bars_short: int = 16,   # 4h on a 15m frame
    bars_long: int = 96,    # 24h on a 15m frame
    full_scale: float = 0.03,
) -> RelativeStrengthSignal:
    """How much the coin is out/under-performing BTC — isolates alpha from beta.

    Positive => stronger than BTC (long candidate); negative => weaker (short).
    A coin merely riding a BTC rally scores ~0 here, so it can't reach a high
    total score on beta alone.
    """
    coin = frame["close"]
    btc = btc_frame["close"]
    if len(coin) <= bars_long + 1 or len(btc) <= bars_long + 1:
        return RelativeStrengthSignal("NEUTRAL", 0.0, "相對強弱資料不足", "樣本不足", 0.0, 0.0)

    rs_short = _return(coin, bars_short) - _return(btc, bars_short)
    rs_long = _return(coin, bars_long) - _return(btc, bars_long)
    blended = 0.5 * (rs_short / full_scale) + 0.5 * (rs_long / full_scale)
    strength = clamp(abs(blended), 0.0, 1.0)

    if blended > 0.2:
        return RelativeStrengthSignal(
            "LONG",
            max(strength, 0.3),
            "相對 BTC 強勢",
            f"近 24h 比 BTC 強 {rs_long:+.2%}（4h {rs_short:+.2%}）",
            rs_short,
            rs_long,
        )
    if blended < -0.2:
        return RelativeStrengthSignal(
            "SHORT",
            max(strength, 0.3),
            "相對 BTC 弱勢",
            f"近 24h 比 BTC 弱 {rs_long:+.2%}（4h {rs_short:+.2%}）",
            rs_short,
            rs_long,
        )
    return RelativeStrengthSignal(
        "NEUTRAL",
        strength * 0.3,
        "與 BTC 同步",
        f"近 24h 相對 BTC {rs_long:+.2%}，無明顯超額",
        rs_short,
        rs_long,
    )
