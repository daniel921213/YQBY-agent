from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.utils.numeric import clamp, pct_change


OiBias = Literal["LONG", "SHORT", "NEUTRAL"]
PriceState = Literal["up", "flat", "down"]
OiState = Literal["increase", "flat", "decrease"]


@dataclass(frozen=True)
class OpenInterestSignal:
    direction: OiBias
    strength: float
    label: str
    description: str


def _state(change: float, deadband: float, positive: str, negative: str) -> str:
    if change >= deadband:
        return positive
    if change <= -deadband:
        return negative
    return "flat"


def analyze_open_interest_price_relation(
    frame: pd.DataFrame,
    lookback: int = 48,
    min_price_move_pct: float = 0.004,
    min_oi_move_pct: float = 0.01,
) -> OpenInterestSignal:
    """Classify independent price/OI states as a complete 3×3 matrix.

    OI decline means contracts are leaving the market. Price direction can hint
    at which side is exiting, but it is not new directional positioning, so all
    decrease states deliberately remain NEUTRAL.
    """
    required = {"close", "open_interest"}
    recent = frame.tail(lookback)
    if len(recent) < 12 or not required.issubset(recent.columns):
        return OpenInterestSignal("NEUTRAL", 0.0, "未平倉量資料不足", "未平倉量樣本不足")

    data = recent[["close", "open_interest"]].apply(pd.to_numeric, errors="coerce")
    values = data.to_numpy(dtype=float)
    invalid_values = not np.isfinite(values).all()
    nonpositive_values = (data["close"] <= 0).any() or (data["open_interest"] <= 0).any()
    if invalid_values or nonpositive_values:
        return OpenInterestSignal(
            "NEUTRAL", 0.0, "未平倉量資料異常", "價格或未平倉量含缺失、非正值"
        )

    price_change = pct_change(float(data["close"].iloc[0]), float(data["close"].iloc[-1]))
    oi_change = pct_change(
        float(data["open_interest"].iloc[0]), float(data["open_interest"].iloc[-1])
    )
    price_state: PriceState = _state(
        price_change, min_price_move_pct, "up", "down"
    )  # type: ignore[assignment]
    oi_state: OiState = _state(
        oi_change, min_oi_move_pct, "increase", "decrease"
    )  # type: ignore[assignment]
    strength = clamp((abs(price_change) / 0.025 + abs(oi_change) / 0.08) / 2, 0.0, 1.0)

    if oi_state == "increase" and price_state == "up":
        return OpenInterestSignal(
            "LONG",
            max(strength, 0.25),
            "上漲增倉",
            "價格上漲且 OI 增加；新合約進場時價格壓力偏多，但不代表多單數量大於空單",
        )
    if oi_state == "increase" and price_state == "down":
        return OpenInterestSignal(
            "SHORT",
            max(strength, 0.4),
            "下跌增倉",
            "價格下跌且 OI 增加；新合約進場時價格壓力偏空",
        )
    if oi_state == "increase":
        return OpenInterestSignal(
            "NEUTRAL",
            max(strength, 0.25),
            "價格持平、OI 增加",
            "槓桿部位正在建立，但價格尚未表態，方向待確認",
        )

    if oi_state == "decrease" and price_state == "up":
        return OpenInterestSignal(
            "NEUTRAL",
            max(strength, 0.25),
            "上漲減倉（空頭退出）",
            "價格上漲且 OI 下降，偏向空頭回補或整體去槓桿，不視為新多頭建倉",
        )
    if oi_state == "decrease" and price_state == "down":
        return OpenInterestSignal(
            "NEUTRAL",
            max(strength, 0.25),
            "下跌減倉（多頭退出）",
            "價格下跌且 OI 下降，偏向多頭退出或整體去槓桿，不直接反向看多",
        )
    if oi_state == "decrease":
        return OpenInterestSignal(
            "NEUTRAL",
            max(strength, 0.2),
            "價格持平、OI 去槓桿",
            "合約部位正在退出，但價格方向未明",
        )

    if price_state == "up":
        label = "價格上漲、OI 持平"
        description = "價格上漲但 OI 未顯著增加，缺乏新部位確認"
    elif price_state == "down":
        label = "價格下跌、OI 持平"
        description = "價格下跌但 OI 未顯著增加，缺乏新空頭部位確認"
    else:
        label = "價格與 OI 持平"
        description = "價格及未平倉量均位於各自 deadband 內"
    return OpenInterestSignal("NEUTRAL", strength * 0.3, label, description)
