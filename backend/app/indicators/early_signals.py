"""Early-move signals built from volume, aggressive flow, and volatility."""

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
    ratio: float


@dataclass(frozen=True)
class CvdThrustSignal:
    direction: Bias
    strength: float
    label: str
    description: str
    zscore: float


@dataclass(frozen=True)
class VolatilitySqueezeSignal:
    compressed: bool
    strength: float
    percentile: float
    description: str


def _valid_flow_window(frame: pd.DataFrame, need: int) -> pd.DataFrame | None:
    required = {"buy_volume", "sell_volume"}
    if len(frame) < need or not required.issubset(frame.columns):
        return None
    flow = frame[["buy_volume", "sell_volume"]].tail(need).apply(
        pd.to_numeric, errors="coerce"
    )
    values = flow.to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values < 0).any():
        return None
    if float(values.sum()) <= 0:
        return None
    return flow


def _price_response(
    frame: pd.DataFrame,
    window: int,
    baseline: int,
    floor_pct: float = 0.002,
) -> tuple[float, float] | None:
    """Price move and a volatility-adaptive minimum meaningful response."""
    if "close" not in frame.columns or len(frame) < window + 1:
        return None
    closes = pd.to_numeric(frame["close"], errors="coerce").tail(window + baseline + 1)
    values = closes.to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values <= 0).any():
        return None
    price_change = float(closes.iloc[-1] / closes.iloc[-1 - window] - 1.0)

    historical_returns = closes.pct_change().iloc[:-window].dropna()
    if historical_returns.empty:
        return price_change, floor_pct
    array = historical_returns.to_numpy(dtype=float)
    median = float(np.median(array))
    mad = float(np.median(np.abs(array - median)))
    per_bar_scale = 1.4826 * mad
    if per_bar_scale <= 1e-12:
        per_bar_scale = float(np.std(array, ddof=0))
    if not np.isfinite(per_bar_scale):
        per_bar_scale = 0.0
    deadband = max(floor_pct, 0.5 * per_bar_scale * float(np.sqrt(window)))
    return price_change, deadband


def _rolling_flow_z(
    frame: pd.DataFrame,
    window: int,
    baseline: int,
) -> tuple[float, float, float] | None:
    """Current N-bar delta versus prior N-bar rolling sums, without look-ahead."""
    need = window + baseline
    flow = _valid_flow_window(frame, need)
    if flow is None:
        return None
    delta = flow["buy_volume"] - flow["sell_volume"]
    history_delta = delta.iloc[:-window]
    historical_sums = history_delta.rolling(window, min_periods=window).sum().dropna()
    if len(historical_sums) < max(8, window):
        return None

    current = float(delta.iloc[-window:].sum())
    history = historical_sums.to_numpy(dtype=float)
    center = float(np.median(history))
    deviation = current - center
    mad = float(np.median(np.abs(history - center)))
    scale = 1.4826 * mad

    # MAD legitimately degenerates for discrete or very stable order flow. Use
    # distributional fallbacks, then a small liquidity-relative floor. The floor
    # avoids infinite z while still recognizing a genuine regime break from zero.
    if scale <= 1e-12:
        q25, q75 = np.percentile(history, [25.0, 75.0])
        scale = float((q75 - q25) / 1.349)
    if scale <= 1e-12:
        scale = float(np.std(history, ddof=0))
    if scale <= 1e-12:
        gross = flow["buy_volume"].iloc[:-window] + flow["sell_volume"].iloc[:-window]
        typical_gross = float(gross.median())
        scale = typical_gross * float(np.sqrt(window)) * 0.02
    if not np.isfinite(scale) or scale <= 1e-12:
        return (0.0, current, center) if abs(deviation) <= 1e-12 else None

    z = float(np.clip(deviation / scale, -12.0, 12.0))
    return z, current, center


def analyze_volume_surge(
    frame: pd.DataFrame,
    recent_bars: int = 8,
    baseline_bars: int = 72,
    hot_ratio: float = 2.0,
) -> VolumeSurgeSignal:
    """Detect abnormal turnover, but do not chase flow that price absorbs."""
    need = recent_bars + baseline_bars
    required = {"volume", "buy_volume", "sell_volume"}
    if len(frame) < need or not required.issubset(frame.columns):
        return VolumeSurgeSignal("NEUTRAL", 0.0, "量能資料不足", "K 線樣本不足", 1.0)

    data = frame[list(required)].tail(need).apply(pd.to_numeric, errors="coerce")
    values = data.to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values < 0).any():
        return VolumeSurgeSignal("NEUTRAL", 0.0, "量能資料異常", "成交量含缺失或負值", 1.0)
    volume = data["volume"]
    recent = float(volume.iloc[-recent_bars:].mean())
    baseline = float(volume.iloc[:-recent_bars].mean())
    if baseline <= 0:
        return VolumeSurgeSignal("NEUTRAL", 0.0, "量能基準無效", "基準期成交量為零", 1.0)
    ratio = recent / baseline

    recent_flow = data.iloc[-recent_bars:]
    delta = float((recent_flow["buy_volume"] - recent_flow["sell_volume"]).sum())
    gross = float((recent_flow["buy_volume"] + recent_flow["sell_volume"]).sum())
    imbalance = delta / gross if gross > 0 else 0.0
    strength = clamp(np.log2(max(ratio, 1e-9)) / 2.0, 0.0, 1.0)

    if ratio < hot_ratio:
        return VolumeSurgeSignal(
            "NEUTRAL",
            strength * 0.3,
            "量能正常",
            f"近 {recent_bars} 根量能為基準 {ratio:.1f}×，未達異常放大",
            round(ratio, 2),
        )
    if abs(imbalance) <= 0.08:
        return VolumeSurgeSignal(
            "NEUTRAL",
            strength * 0.5,
            "量能異常放大（方向未明）",
            f"量能放大至基準 {ratio:.1f}× 但買賣力接近平衡",
            round(ratio, 2),
        )

    flow_sign = 1 if imbalance > 0 else -1
    response = _price_response(frame, recent_bars, baseline_bars)
    if response is None:
        return VolumeSurgeSignal(
            "NEUTRAL", 0.0, "量價資料不足", "無法確認價格是否回應訂單流", round(ratio, 2)
        )
    price_change, deadband = response
    if flow_sign * price_change <= deadband:
        side = "買單" if flow_sign > 0 else "賣單"
        return VolumeSurgeSignal(
            "NEUTRAL",
            max(strength, 0.35),
            f"量能異常放大（疑似{side}被吸收）",
            f"量能 {ratio:.1f}×、主動流 {imbalance:+.0%}，但價格僅 {price_change:+.2%}",
            round(ratio, 2),
        )

    direction: Bias = "LONG" if flow_sign > 0 else "SHORT"
    return VolumeSurgeSignal(
        direction,
        max(strength, 0.35),
        f"量能異常放大（{'買' if flow_sign > 0 else '賣'}方主導）",
        f"近 {recent_bars} 根量能為基準 {ratio:.1f}×，主動流 {imbalance:+.0%} 且價格有效回應",
        round(ratio, 2),
    )


def analyze_cvd_thrust(
    frame: pd.DataFrame,
    window: int = 8,
    baseline: int = 96,
    hot_z: float = 1.5,
) -> CvdThrustSignal:
    """Robust recent flow anomaly with an absorption-aware direction gate."""
    result = _rolling_flow_z(frame, window, baseline)
    if result is None:
        return CvdThrustSignal("NEUTRAL", 0.0, "主動買賣資料不足", "樣本或資料品質不足", 0.0)
    z, current, center = result
    strength = clamp(abs(z) / 3.0, 0.0, 1.0)
    if abs(z) < hot_z:
        return CvdThrustSignal(
            "NEUTRAL",
            strength * 0.3,
            "主動買賣平衡",
            f"近 {window} 根淨主動流 z={z:.1f}，相對歷史中位數未見異常",
            round(z, 2),
        )

    flow_sign = 1 if z > 0 else -1
    response = _price_response(frame, window, baseline)
    if response is None:
        return CvdThrustSignal(
            "NEUTRAL", 0.0, "價格資料不足", "無法確認訂單流是否推動價格", round(z, 2)
        )
    price_change, deadband = response
    if flow_sign * price_change <= deadband:
        side = "買單" if flow_sign > 0 else "賣單"
        return CvdThrustSignal(
            "NEUTRAL",
            max(strength, 0.35),
            f"疑似{side}被吸收",
            f"淨主動流由常態 {center:.2f} 升至 {current:.2f}（z={z:.1f}），價格僅 {price_change:+.2%}",
            round(z, 2),
        )

    direction: Bias = "LONG" if flow_sign > 0 else "SHORT"
    side = "買" if flow_sign > 0 else "賣"
    return CvdThrustSignal(
        direction,
        max(strength, 0.35),
        f"主動{side}盤轉強",
        f"近 {window} 根淨主動流 z={z:.1f}，且價格同向有效回應",
        round(z, 2),
    )


def analyze_volatility_squeeze(
    frame: pd.DataFrame,
    window: int = 24,
    lookback: int = 96,
    compressed_percentile: float = 0.25,
) -> VolatilitySqueezeSignal:
    """Realized-vol compression; directionless by design."""
    if "close" not in frame.columns:
        return VolatilitySqueezeSignal(False, 0.0, 0.5, "波動資料不足")
    closes = pd.to_numeric(frame["close"], errors="coerce")
    enough_data = len(closes) >= window + lookback // 2
    recent_is_finite = np.isfinite(closes.tail(window + lookback).to_numpy()).all()
    if not enough_data or not recent_is_finite:
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
