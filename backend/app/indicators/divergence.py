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
    # Bars elapsed since the confirming (second) pivot — freshness for the
    # stage classifier. None when kind == "none".
    age_bars: int | None = None


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


def _candidate(
    recent: pd.DataFrame,
    kind: Literal["bullish", "bearish"],
    pivot_window: int,
    min_price_move_pct: float,
    max_pivot_age: int,
    noise_gate_sigma: float,
) -> DivergenceSignal | None:
    price = recent["close"]
    cvd = recent["cvd"]
    mode: Literal["high", "low"] = "low" if kind == "bullish" else "high"
    pair = _last_two_distinct(_pivot_indexes(price, mode, pivot_window))
    if not pair:
        return None
    first, second = pair

    # Freshness: a divergence whose confirming pivot is old has already played
    # out — it must not keep firing (and flagging 反轉) for the rest of the day.
    age = len(recent) - 1 - second
    if age > max_pivot_age:
        return None

    if kind == "bullish":
        price_ok = price.iloc[second] < price.iloc[first] * (1 - min_price_move_pct)
        cvd_gap = cvd.iloc[second] - cvd.iloc[first]  # must be meaningfully positive
    else:
        price_ok = price.iloc[second] > price.iloc[first] * (1 + min_price_move_pct)
        cvd_gap = cvd.iloc[first] - cvd.iloc[second]  # must be meaningfully positive
    if not price_ok or cvd_gap <= 0:
        return None

    # Noise gate: under a no-information random walk, CVD drift over the
    # `gap_bars` between pivots has σ ≈ delta_std * sqrt(gap_bars). Require the
    # divergence leg to clear a fraction of that, so a microscopic "higher low"
    # in CVD doesn't count as divergence.
    deltas = cvd.diff().dropna()
    delta_std = float(deltas.std(ddof=0)) if len(deltas) > 2 else 0.0
    gap_bars = max(second - first, 1)
    sigma_gap = delta_std * float(np.sqrt(gap_bars))
    if sigma_gap > 0 and cvd_gap < noise_gate_sigma * sigma_gap:
        return None

    price_move = abs(price.iloc[second] / price.iloc[first] - 1)
    price_norm = clamp(price_move / 0.02, 0.0, 1.0)  # 2% pivot-to-pivot = full
    cvd_norm = clamp(cvd_gap / (2.0 * sigma_gap), 0.0, 1.0) if sigma_gap > 0 else 0.5
    strength = clamp(0.45 * price_norm + 0.55 * cvd_norm, 0.3, 1.0)

    if kind == "bullish":
        description = (
            f"價格創低但 CVD 未創低（距今 {age} 根），賣壓衰竭與吸收買盤同時出現"
        )
    else:
        description = (
            f"價格創高但 CVD 未創高（距今 {age} 根），追價買盤不足且高位承接轉弱"
        )
    return DivergenceSignal(kind, strength, first, second, description, age_bars=age)


def detect_price_cvd_divergence(
    frame: pd.DataFrame,
    lookback: int = 96,
    pivot_window: int = 3,
    min_price_move_pct: float = 0.004,
    max_pivot_age: int = 12,
    noise_gate_sigma: float = 0.35,
) -> DivergenceSignal:
    if len(frame) < max(lookback // 2, pivot_window * 4):
        return DivergenceSignal("none", 0.0, None, None, "資料不足，無法確認 CVD 背離")

    recent = frame.tail(lookback).reset_index(drop=True)

    candidates = [
        c
        for kind in ("bullish", "bearish")
        if (
            c := _candidate(
                recent,
                kind,  # type: ignore[arg-type]
                pivot_window,
                min_price_move_pct,
                max_pivot_age,
                noise_gate_sigma,
            )
        )
        is not None
    ]
    if not candidates:
        return DivergenceSignal("none", 0.0, None, None, "CVD 與價格尚未形成有效背離")
    # Both directions can qualify in one window; the fresher structure wins
    # (tie => the stronger one) instead of bullish always short-circuiting.
    candidates.sort(key=lambda c: (c.age_bars, -c.strength))
    return candidates[0]
