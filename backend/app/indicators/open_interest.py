from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.utils.numeric import clamp, pct_change


OiBias = Literal["LONG", "SHORT", "NEUTRAL"]


@dataclass(frozen=True)
class OpenInterestSignal:
    direction: OiBias
    strength: float
    label: str
    description: str


def analyze_open_interest_price_relation(
    frame: pd.DataFrame,
    lookback: int = 48,
    min_price_move_pct: float = 0.004,
    min_oi_move_pct: float = 0.01,
) -> OpenInterestSignal:
    recent = frame.tail(lookback)
    if len(recent) < 12:
        return OpenInterestSignal("NEUTRAL", 0.0, "未平倉量資料不足", "未平倉量樣本不足")

    price_change = pct_change(recent["close"].iloc[0], recent["close"].iloc[-1])
    oi_change = pct_change(recent["open_interest"].iloc[0], recent["open_interest"].iloc[-1])
    strength = clamp((abs(price_change) / 0.025 + abs(oi_change) / 0.08) / 2, 0.0, 1.0)

    if price_change <= -min_price_move_pct and oi_change <= -min_oi_move_pct:
        return OpenInterestSignal(
            "LONG",
            max(strength, 0.35),
            "下跌去槓桿",
            "價格下跌且未平倉量同步下降，偏向多頭止損釋放後的反彈條件",
        )

    if price_change >= min_price_move_pct and oi_change >= min_oi_move_pct:
        return OpenInterestSignal(
            "LONG",
            max(strength, 0.25),
            "上漲增倉",
            "價格上漲且未平倉量增加，趨勢延續動能偏多",
        )

    if price_change <= -min_price_move_pct and oi_change >= min_oi_move_pct:
        return OpenInterestSignal(
            "SHORT",
            max(strength, 0.4),
            "下跌增倉",
            "價格下跌但未平倉量增加，空頭槓桿正在追價",
        )

    if price_change >= min_price_move_pct and oi_change <= -min_oi_move_pct:
        return OpenInterestSignal(
            "SHORT",
            max(strength, 0.3),
            "上漲減倉",
            "價格上漲但未平倉量下降，偏向空頭回補而非新買盤推動",
        )

    return OpenInterestSignal(
        "NEUTRAL",
        strength * 0.3,
        "未平倉量未明顯共振",
        "價格與未平倉量變化未達有效閾值",
    )
