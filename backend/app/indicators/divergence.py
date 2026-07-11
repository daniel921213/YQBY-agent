from dataclasses import dataclass
from typing import Iterable, Literal

import numpy as np
import pandas as pd

from app.utils.numeric import clamp


DivergenceKind = Literal["bullish", "bearish", "none"]
DivergencePattern = Literal["exhaustion", "absorption", "none"]
PivotMode = Literal["high", "low"]


@dataclass(frozen=True)
class DivergenceSignal:
    kind: DivergenceKind
    strength: float
    first_index: int | None
    second_index: int | None
    description: str
    # Bars elapsed since the confirming (second) pivot. None for no signal.
    age_bars: int | None = None
    # Exhaustion: price makes the new extreme while CVD does not.
    # Absorption: CVD makes the new extreme while price does not respond.
    pattern: DivergencePattern = "none"


def _robust_scale(values: pd.Series) -> float:
    array = values.to_numpy(dtype=float)
    array = array[np.isfinite(array)]
    if len(array) < 3:
        return 0.0
    median = float(np.median(array))
    mad = float(np.median(np.abs(array - median)))
    if mad > 1e-12:
        return 1.4826 * mad

    # Discrete flow often has MAD=0. A typical absolute increment is less
    # sensitive to the divergence leg itself than an ordinary standard deviation.
    typical = float(np.median(np.abs(array)))
    if typical > 1e-12:
        return 1.4826 * typical
    std = float(np.std(array, ddof=0))
    return std if np.isfinite(std) and std > 1e-12 else 0.0


def _pivot_indexes(
    values: pd.Series,
    mode: PivotMode,
    window: int,
    min_prominence: float = 0.0,
) -> list[int]:
    array = values.to_numpy(dtype=float)
    pivots: list[int] = []
    for idx in range(window, len(array) - window):
        sample = array[idx - window : idx + window + 1]
        if not np.isfinite(sample).all():
            continue
        center = array[idx]
        left = array[idx - window : idx]
        right = array[idx + 1 : idx + window + 1]
        if mode == "high" and center == np.max(sample):
            prominence = center - max(float(np.max(left)), float(np.max(right)))
            if prominence >= min_prominence:
                pivots.append(idx)
        elif mode == "low" and center == np.min(sample):
            prominence = min(float(np.min(left)), float(np.min(right))) - center
            if prominence >= min_prominence:
                pivots.append(idx)
    return pivots


def _pivot_pairs(pivots: list[int], min_distance: int = 5) -> Iterable[tuple[int, int]]:
    """Yield newest structures first while allowing a minor pivot to be skipped."""
    for second_pos in range(len(pivots) - 1, 0, -1):
        second = pivots[second_pos]
        yielded = 0
        for first in reversed(pivots[:second_pos]):
            if second - first < min_distance:
                continue
            yield first, second
            yielded += 1
            if yielded >= 3:
                break


def _atr(recent: pd.DataFrame) -> float:
    previous_close = recent["close"].shift(1)
    ranges = pd.concat(
        [
            recent["high"] - recent["low"],
            (recent["high"] - previous_close).abs(),
            (recent["low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    ranges = ranges.replace([np.inf, -np.inf], np.nan).dropna()
    if ranges.empty:
        return 0.0
    value = float(ranges.tail(48).median())
    return value if np.isfinite(value) and value >= 0 else 0.0


def _aligned_cvd_extreme(
    cvd: pd.Series,
    price_index: int,
    mode: PivotMode,
    tolerance: int,
) -> tuple[int, float] | None:
    start = max(0, price_index - tolerance)
    stop = min(len(cvd), price_index + tolerance + 1)
    array = cvd.iloc[start:stop].to_numpy(dtype=float)
    if len(array) == 0 or not np.isfinite(array).all():
        return None
    relative = int(np.argmin(array)) if mode == "low" else int(np.argmax(array))
    index = start + relative
    return index, float(cvd.iloc[index])


def _candidates(
    recent: pd.DataFrame,
    mode: PivotMode,
    pattern: Literal["exhaustion", "absorption"],
    pivot_window: int,
    min_price_move_pct: float,
    max_pivot_age: int,
    noise_gate_sigma: float,
    alignment_tolerance: int,
) -> list[DivergenceSignal]:
    price = recent[mode]
    cvd = recent["cvd"]
    flow_scale = _robust_scale(cvd.diff().dropna())
    if flow_scale <= 1e-12:
        return []

    atr = _atr(recent)
    reference_price = float(recent["close"].median())
    prominence = max(reference_price * min_price_move_pct * 0.35, atr * 0.25)
    pivots = _pivot_indexes(price, mode, pivot_window, prominence)
    signals: list[DivergenceSignal] = []

    for first, second in _pivot_pairs(pivots):
        age = len(recent) - 1 - second
        if age > max_pivot_age:
            continue
        first_cvd = _aligned_cvd_extreme(cvd, first, mode, alignment_tolerance)
        second_cvd = _aligned_cvd_extreme(cvd, second, mode, alignment_tolerance)
        if first_cvd is None or second_cvd is None:
            continue

        first_price = float(price.iloc[first])
        second_price = float(price.iloc[second])
        price_delta = second_price - first_price
        cvd_delta = second_cvd[1] - first_cvd[1]
        gap_bars = max(second - first, 1)
        price_gate = max(abs(first_price) * min_price_move_pct, atr * 0.5, 1e-12)
        flow_gate = flow_scale * float(np.sqrt(gap_bars)) * max(noise_gate_sigma, 0.0)
        if flow_gate <= 1e-12:
            continue

        if mode == "low":
            kind: DivergenceKind = "bullish"
            if pattern == "exhaustion":
                qualifies = price_delta <= -price_gate and cvd_delta >= flow_gate
                price_evidence = abs(price_delta) / (2.0 * price_gate)
                description = (
                    f"衰竭：價格創更低低點但 CVD 未創低（距今 {age} 根），主動賣壓未跟隨"
                )
            else:
                qualifies = cvd_delta <= -flow_gate and price_delta >= -price_gate
                price_evidence = (price_delta + price_gate) / (2.0 * price_gate)
                description = (
                    f"吸收：CVD 創更低低點但價格未有效創低（距今 {age} 根），主動賣單疑似被承接"
                )
        else:
            kind = "bearish"
            if pattern == "exhaustion":
                qualifies = price_delta >= price_gate and cvd_delta <= -flow_gate
                price_evidence = abs(price_delta) / (2.0 * price_gate)
                description = (
                    f"衰竭：價格創更高高點但 CVD 未創高（距今 {age} 根），主動買盤未跟隨"
                )
            else:
                qualifies = cvd_delta >= flow_gate and price_delta <= price_gate
                price_evidence = (price_gate - price_delta) / (2.0 * price_gate)
                description = (
                    f"吸收：CVD 創更高高點但價格未有效創高（距今 {age} 根），主動買單疑似被壓制"
                )

        if not qualifies:
            continue
        flow_evidence = abs(cvd_delta) / (2.0 * flow_gate)
        strength = clamp(
            0.45 * clamp(price_evidence, 0.0, 1.0)
            + 0.55 * clamp(flow_evidence, 0.0, 1.0),
            0.3,
            1.0,
        )
        signals.append(
            DivergenceSignal(
                kind,
                strength,
                first,
                second,
                description,
                age_bars=age,
                pattern=pattern,
            )
        )
    return signals


def _prepare_recent(
    frame: pd.DataFrame,
    lookback: int,
    pivot_window: int,
) -> tuple[pd.DataFrame | None, str | None]:
    if not {"close", "cvd"}.issubset(frame.columns):
        return None, "缺少價格或 CVD 欄位"
    if len(frame) < max(lookback // 2, pivot_window * 4):
        return None, "資料不足，無法確認 CVD 背離"

    recent = frame.tail(lookback).copy().reset_index(drop=True)
    if "high" not in recent:
        recent["high"] = recent["close"]
    if "low" not in recent:
        recent["low"] = recent["close"]
    for column in ("close", "high", "low", "cvd"):
        recent[column] = pd.to_numeric(recent[column], errors="coerce")
    values = recent[["close", "high", "low", "cvd"]].to_numpy(dtype=float)
    if not np.isfinite(values).all():
        return None, "價格或 CVD 含缺失值，略過背離判定"
    if (
        (recent["close"] <= 0).any()
        or (recent["high"] < recent["low"]).any()
        or (recent["high"] < recent["close"]).any()
        or (recent["low"] > recent["close"]).any()
    ):
        return None, "價格或 CVD 品質異常，略過背離判定"
    return recent, None


def _detect_patterns(
    frame: pd.DataFrame,
    patterns: tuple[Literal["exhaustion", "absorption"], ...],
    lookback: int,
    pivot_window: int,
    min_price_move_pct: float,
    max_pivot_age: int,
    noise_gate_sigma: float,
    alignment_tolerance: int,
) -> DivergenceSignal:
    recent, error = _prepare_recent(frame, lookback, pivot_window)
    if recent is None:
        return DivergenceSignal("none", 0.0, None, None, error or "資料品質不足")

    modes: tuple[PivotMode, ...] = ("low", "high")
    candidates = [
        signal
        for pattern in patterns
        for mode in modes
        for signal in _candidates(
            recent,
            mode,
            pattern,
            pivot_window,
            min_price_move_pct,
            max_pivot_age,
            noise_gate_sigma,
            alignment_tolerance,
        )
    ]
    if not candidates:
        return DivergenceSignal("none", 0.0, None, None, "CVD 與價格尚未形成有效背離")
    candidates.sort(
        key=lambda candidate: (
            candidate.age_bars if candidate.age_bars is not None else 10**9,
            -candidate.strength,
        )
    )
    return candidates[0]


def detect_price_cvd_divergence(
    frame: pd.DataFrame,
    lookback: int = 96,
    pivot_window: int = 3,
    min_price_move_pct: float = 0.004,
    max_pivot_age: int = 12,
    noise_gate_sigma: float = 0.75,
    alignment_tolerance: int = 2,
) -> DivergenceSignal:
    """Return the freshest confirmed exhaustion or absorption structure.

    This legacy entry point remains compatible. Callers that need the concepts
    separately can use ``detect_cvd_exhaustion`` or ``detect_cvd_absorption``.
    """
    return _detect_patterns(
        frame,
        ("exhaustion", "absorption"),
        lookback,
        pivot_window,
        min_price_move_pct,
        max_pivot_age,
        noise_gate_sigma,
        alignment_tolerance,
    )


def detect_cvd_exhaustion(
    frame: pd.DataFrame,
    lookback: int = 96,
    pivot_window: int = 3,
    min_price_move_pct: float = 0.004,
    max_pivot_age: int = 12,
    noise_gate_sigma: float = 0.75,
    alignment_tolerance: int = 2,
) -> DivergenceSignal:
    return _detect_patterns(
        frame,
        ("exhaustion",),
        lookback,
        pivot_window,
        min_price_move_pct,
        max_pivot_age,
        noise_gate_sigma,
        alignment_tolerance,
    )


def detect_cvd_absorption(
    frame: pd.DataFrame,
    lookback: int = 96,
    pivot_window: int = 3,
    min_price_move_pct: float = 0.004,
    max_pivot_age: int = 12,
    noise_gate_sigma: float = 0.75,
    alignment_tolerance: int = 2,
) -> DivergenceSignal:
    return _detect_patterns(
        frame,
        ("absorption",),
        lookback,
        pivot_window,
        min_price_move_pct,
        max_pivot_age,
        noise_gate_sigma,
        alignment_tolerance,
    )
