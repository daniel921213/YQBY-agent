from dataclasses import dataclass
from typing import Literal

import pandas as pd

from app.utils.numeric import clamp


RatioBias = Literal["LONG", "SHORT", "NEUTRAL"]


@dataclass(frozen=True)
class LongShortRatioSignal:
    direction: RatioBias
    strength: float
    label: str
    description: str


def analyze_participant_contrast(frame: pd.DataFrame, lookback: int = 36) -> LongShortRatioSignal:
    recent = frame.tail(lookback)
    if len(recent) < 6:
        return LongShortRatioSignal("NEUTRAL", 0.0, "多空比資料不足", "樣本不足")

    top_ratio = float(recent["top_trader_long_short_ratio"].iloc[-1])
    account_ratio = float(recent["account_long_short_ratio"].iloc[-1])
    spread = top_ratio - account_ratio
    strength = clamp(abs(spread) / 0.65, 0.0, 1.0)

    if top_ratio >= 1.08 and account_ratio <= 0.95:
        return LongShortRatioSignal(
            "LONG",
            max(strength, 0.45),
            "大戶偏多、散戶偏空",
            f"大戶多空比 {top_ratio:.2f} 高於散戶 {account_ratio:.2f}，籌碼對立偏多",
        )

    if top_ratio <= 0.94 and account_ratio >= 1.08:
        return LongShortRatioSignal(
            "SHORT",
            max(strength, 0.45),
            "大戶偏空、散戶偏多",
            f"大戶多空比 {top_ratio:.2f} 低於散戶 {account_ratio:.2f}，籌碼對立偏空",
        )

    if account_ratio >= 1.45 and top_ratio < account_ratio:
        return LongShortRatioSignal(
            "SHORT",
            max(strength, 0.35),
            "散戶多頭擁擠",
            f"散戶多空比 {account_ratio:.2f} 過高，存在多頭擠壓風險",
        )

    if account_ratio <= 0.68 and top_ratio > account_ratio:
        return LongShortRatioSignal(
            "LONG",
            max(strength, 0.35),
            "散戶空頭擁擠",
            f"散戶多空比 {account_ratio:.2f} 過低，存在空頭回補風險",
        )

    return LongShortRatioSignal(
        "NEUTRAL",
        strength * 0.25,
        "多空比未明顯對立",
        f"大戶 {top_ratio:.2f} / 散戶 {account_ratio:.2f} 尚未形成高品質對立",
    )

