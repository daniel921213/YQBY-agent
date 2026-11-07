from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.indicators.crowding import latest_ratio_read
from app.utils.numeric import clamp


RatioBias = Literal["LONG", "SHORT", "NEUTRAL"]

# Top accounts and all accounts must move apart by at least this much versus
# their own medians before the split counts as 籌碼對立.
_CONTRAST_MIN_DEVIATION = 0.05
# A 30-point gap between the two populations' deviations is full strength.
_CONTRAST_FULL_SPREAD = 0.30


@dataclass(frozen=True)
class LongShortRatioSignal:
    direction: RatioBias
    strength: float
    label: str
    description: str


def analyze_participant_contrast(frame: pd.DataFrame, lookback: int = 36) -> LongShortRatioSignal:
    """Top-account vs all-account positioning, relative to each one's own norm.

    Gate's all-account ratio sits structurally above 1 for most coins, so a
    fixed level (e.g. 1.45 = crowded) reads nearly every major as crowded long
    and tilts the whole board short. Both ratios are instead compared with the
    symbol's own causal baseline (14 days of 1h snapshots when available).
    """

    if len(frame.tail(lookback)) < 6:
        return LongShortRatioSignal("NEUTRAL", 0.0, "多空比資料不足", "樣本不足")

    read = latest_ratio_read(frame)
    if read.source == "none" or read.account_median is None:
        return LongShortRatioSignal(
            "NEUTRAL", 0.0, "多空比基準不足", "缺少足夠的自身歷史，暫不判斷籌碼擁擠"
        )

    top_dev = read.top_deviation
    account_dev = read.account_deviation
    spread = top_dev - account_dev
    strength = clamp(abs(spread) / _CONTRAST_FULL_SPREAD, 0.0, 1.0)
    base = read.baseline_label
    top_text = (
        f"大戶帳戶比 {read.top_ratio:.2f}（自身{base}常態 {read.top_median:.2f}，{top_dev:+.0%}）"
        if read.top_median is not None
        else f"大戶帳戶比 {read.top_ratio:.2f}"
    )
    account_text = (
        f"全體帳戶比 {read.account_ratio:.2f}（自身{base}常態 {read.account_median:.2f}，"
        f"{account_dev:+.0%}）"
    )

    if top_dev >= _CONTRAST_MIN_DEVIATION and account_dev <= -_CONTRAST_MIN_DEVIATION:
        return LongShortRatioSignal(
            "LONG",
            max(strength, 0.45),
            "大戶轉多、全體帳戶轉空",
            f"{top_text}；{account_text}，籌碼對立偏多",
        )

    if top_dev <= -_CONTRAST_MIN_DEVIATION and account_dev >= _CONTRAST_MIN_DEVIATION:
        return LongShortRatioSignal(
            "SHORT",
            max(strength, 0.45),
            "大戶轉空、全體帳戶轉多",
            f"{top_text}；{account_text}，籌碼對立偏空",
        )

    if read.crowded == "LONG" and top_dev < account_dev:
        return LongShortRatioSignal(
            "SHORT",
            max(strength, 0.35),
            "全體帳戶多單異常擁擠",
            f"{account_text}，處於自身{base}高位，存在多頭擠壓風險",
        )

    if read.crowded == "SHORT" and top_dev > account_dev:
        return LongShortRatioSignal(
            "LONG",
            max(strength, 0.35),
            "全體帳戶空單異常擁擠",
            f"{account_text}，處於自身{base}低位，存在空頭回補風險",
        )

    return LongShortRatioSignal(
        "NEUTRAL",
        strength * 0.25,
        "多空比未明顯對立",
        f"{top_text}；{account_text}，尚未偏離自身常態形成對立",
    )
