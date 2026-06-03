from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.utils.numeric import clamp


DivergenceKind = Literal["bullish", "bearish", "none"]


@dataclass(frozen=True)
class DivergenceSignal:
    kind: DivergenceKind
    strength: float
    first_index: int | None
    second_index: int | None
    description: str


def _pivot_indexes(values: pd.Series, mode: Literal["high", "low"], window: int) -> list[int]:
    array = values.to_numpy(dtype=float)
    pivots: list[int] = []
    for idx in range(window, len(array) - window):
        sample = array[idx - window : idx + window + 1]
        center = array[idx]
        if mode == "high" and center == np.max(sample):
            pivots.append(idx)
        if mode == "low" and center == np.min(sample):
            pivots.append(idx)
    return pivots


def _last_two_distinct(pivots: list[int], min_distance: int = 5) -> tuple[int, int] | None:
    if len(pivots) < 2:
        return None

    second = pivots[-1]
    for first in reversed(pivots[:-1]):
        if second - first >= min_distance:
            return first, second
    return None


def detect_price_cvd_divergence(
    frame: pd.DataFrame,
    lookback: int = 96,
    pivot_window: int = 3,
    min_price_move_pct: float = 0.002,
) -> DivergenceSignal:
    if len(frame) < max(lookback // 2, pivot_window * 4):
        return DivergenceSignal("none", 0.0, None, None, "資料不足，無法確認 CVD 背離")

    recent = frame.tail(lookback).reset_index(drop=True)
    price = recent["close"]
    cvd = recent["cvd"]

    low_pair = _last_two_distinct(_pivot_indexes(price, "low", pivot_window))
    if low_pair:
        first, second = low_pair
        price_lower_low = price.iloc[second] < price.iloc[first] * (1 - min_price_move_pct)
        cvd_higher_low = cvd.iloc[second] > cvd.iloc[first]
        if price_lower_low and cvd_higher_low:
            price_move = abs(price.iloc[second] / price.iloc[first] - 1)
            cvd_base = max(abs(cvd.iloc[first]), recent["volume"].median(), 1.0)
            cvd_move = abs(cvd.iloc[second] - cvd.iloc[first]) / cvd_base
            strength = clamp(price_move * 32 + cvd_move * 4, 0.35, 1.0)
            return DivergenceSignal(
                "bullish",
                strength,
                first,
                second,
                "價格創低但 CVD 未創低，賣壓衰竭與吸收買盤同時出現",
            )

    high_pair = _last_two_distinct(_pivot_indexes(price, "high", pivot_window))
    if high_pair:
        first, second = high_pair
        price_higher_high = price.iloc[second] > price.iloc[first] * (1 + min_price_move_pct)
        cvd_lower_high = cvd.iloc[second] < cvd.iloc[first]
        if price_higher_high and cvd_lower_high:
            price_move = abs(price.iloc[second] / price.iloc[first] - 1)
            cvd_base = max(abs(cvd.iloc[first]), recent["volume"].median(), 1.0)
            cvd_move = abs(cvd.iloc[second] - cvd.iloc[first]) / cvd_base
            strength = clamp(price_move * 32 + cvd_move * 4, 0.35, 1.0)
            return DivergenceSignal(
                "bearish",
                strength,
                first,
                second,
                "價格創高但 CVD 未創高，追價買盤不足且高位承接轉弱",
            )

    return DivergenceSignal("none", 0.0, None, None, "CVD 與價格尚未形成有效背離")

