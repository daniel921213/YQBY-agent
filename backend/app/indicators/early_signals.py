"""Early-move signals: the "flow before price" family.

These are the ingredients of the 早期異動雷達 — they look for volume, aggressive
taker flow, and volatility conditions that historically precede a burst, rather
than describing a move that already happened:

- volume surge: turnover expanding well above its own recent baseline
- CVD thrust: net aggressive buying/selling far outside its noise band
- volatility squeeze: realized volatility compressed to the bottom of its range
  (directionless — a loaded spring, not a directional call)
"""

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.utils.numeric import clamp

Bias = Literal["LONG", "SHORT", "NEUTRAL"]


@dataclass(frozen=True)
class VolumeSurgeSignal:
    direction: Bias
    strength: float
    label: str
    description: str
    ratio: float  # recent volume / baseline volume


@dataclass(frozen=True)
class CvdThrustSignal:
    direction: Bias
    strength: float
    label: str
    description: str
    zscore: float  # net taker flow vs its own noise band


@dataclass(frozen=True)
class VolatilitySqueezeSignal:
    compressed: bool
    strength: float  # 1.0 = tightest compression seen in the lookback
    percentile: float  # current realized vol's rank within the lookback [0, 1]
    description: str


def analyze_volume_surge(
    frame: pd.DataFrame,
    recent_bars: int = 8,     # 2h on a 15m frame
    baseline_bars: int = 72,  # 18h baseline
    hot_ratio: float = 2.0,
) -> VolumeSurgeSignal:
    """Is turnover expanding abnormally vs the coin's own baseline?

    Direction comes from the net taker imbalance over the same recent window;
    a surge with no clear net side stays NEUTRAL (it flags activity, not bias).
    """
    need = recent_bars + baseline_bars
    if len(frame) < need:
        return VolumeSurgeSignal("NEUTRAL", 0.0, "量能資料不足", "K 線樣本不足", 1.0)

    volume = frame["volume"]
    recent = float(volume.iloc[-recent_bars:].mean())
    baseline = float(volume.iloc[-need:-recent_bars].mean())
    if baseline <= 0:
        return VolumeSurgeSignal("NEUTRAL", 0.0, "量能基準無效", "基準期成交量為零", 1.0)
    ratio = recent / baseline

    delta = frame["buy_volume"].iloc[-recent_bars:].sum() - float(
        frame["sell_volume"].iloc[-recent_bars:].sum()
    )
    gross = float(volume.iloc[-recent_bars:].sum())
    imbalance = delta / gross if gross > 0 else 0.0

    # log2 scale: 2x baseline => 0.5, 4x => 1.0.
    strength = clamp(np.log2(max(ratio, 1e-9)) / 2.0, 0.0, 1.0)

    if ratio < hot_ratio:
        return VolumeSurgeSignal(
            "NEUTRAL",
            strength * 0.3,
            "量能正常",
            f"近 {recent_bars} 根量能為基準 {ratio:.1f}×，未達異常放大",
            round(ratio, 2),
        )

    if imbalance > 0.08:
        direction: Bias = "LONG"
        label = "量能異常放大（買方主導）"
    elif imbalance < -0.08:
        direction = "SHORT"
        label = "量能異常放大（賣方主導）"
    else:
        return VolumeSurgeSignal(
            "NEUTRAL",
            strength * 0.5,
            "量能異常放大（方向未明）",
            f"量能放大至基準 {ratio:.1f}× 但買賣力接近平衡",
            round(ratio, 2),
        )

    return VolumeSurgeSignal(
        direction,
        max(strength, 0.35),
        label,
        f"近 {recent_bars} 根量能為基準 {ratio:.1f}×，主動{'買' if direction == 'LONG' else '賣'}佔比 {imbalance:+.0%}",
        round(ratio, 2),
    )


def analyze_cvd_thrust(
    frame: pd.DataFrame,
    window: int = 8,      # 2h on a 15m frame
    baseline: int = 96,   # 24h noise band
    hot_z: float = 1.5,
) -> CvdThrustSignal:
    """Net aggressive flow over the recent window vs its own noise band.

    z = Σdelta(window) / (σ_delta * √window): under no-information flow the net
    sum is ~0 with that σ, so |z| ≥ ~1.5 marks genuinely one-sided takers.
    """
    need = window + baseline
    if len(frame) < need:
        return CvdThrustSignal("NEUTRAL", 0.0, "主動買賣資料不足", "樣本不足", 0.0)

    delta = frame["buy_volume"] - frame["sell_volume"]
    noise = float(delta.iloc[-need:-window].std(ddof=0))
    thrust = float(delta.iloc[-window:].sum())
    if noise <= 1e-12:
        return CvdThrustSignal("NEUTRAL", 0.0, "主動買賣無波動", "基準期買賣力無變化", 0.0)
    z = thrust / (noise * float(np.sqrt(window)))
    strength = clamp(abs(z) / 3.0, 0.0, 1.0)

    if z >= hot_z:
        return CvdThrustSignal(
            "LONG",
            max(strength, 0.35),
            "主動買盤轉強",
            f"近 {window} 根淨主動買入 z={z:.1f}，買方力道遠高於常態",
            round(z, 2),
        )
    if z <= -hot_z:
        return CvdThrustSignal(
            "SHORT",
            max(strength, 0.35),
            "主動賣盤轉強",
            f"近 {window} 根淨主動賣出 z={z:.1f}，賣方力道遠高於常態",
            round(z, 2),
        )
    return CvdThrustSignal(
        "NEUTRAL",
        strength * 0.3,
        "主動買賣平衡",
        f"近 {window} 根淨主動流 z={z:.1f}，未見明顯偏向",
        round(z, 2),
    )


def analyze_volatility_squeeze(
    frame: pd.DataFrame,
    window: int = 24,     # 6h realized-vol window on 15m
    lookback: int = 96,   # rank against the last 24h of readings
    compressed_percentile: float = 0.25,
) -> VolatilitySqueezeSignal:
    """Realized-vol compression: how tight is the current 6h vol vs its range.

    Directionless by design — compression says energy is loaded, not which way
    it releases. Used by the stage classifier (早期異動 context), never as a
    directional score contribution.
    """
    closes = frame["close"]
    if len(closes) < window + lookback // 2:
        return VolatilitySqueezeSignal(False, 0.0, 0.5, "波動資料不足")

    returns = closes.pct_change()
    rolling = returns.rolling(window).std(ddof=0).dropna()
    if len(rolling) < 8:
        return VolatilitySqueezeSignal(False, 0.0, 0.5, "波動樣本不足")
    history = rolling.tail(lookback)
    current = float(history.iloc[-1])
    percentile = float((history <= current).mean())

    compressed = percentile <= compressed_percentile
    strength = clamp(1.0 - percentile / max(compressed_percentile, 1e-9), 0.0, 1.0)
    if compressed:
        description = f"6h 實現波動壓縮至近 24h 的 {percentile:.0%} 分位，能量待釋放"
    else:
        description = f"6h 實現波動位於近 24h 的 {percentile:.0%} 分位"
    return VolatilitySqueezeSignal(compressed, strength, round(percentile, 4), description)
