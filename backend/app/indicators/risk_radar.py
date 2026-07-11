"""Closed-5m risk overlay for Gate futures.

The official rank remains a closed-15m score.  This module deliberately emits
event metadata only: it detects sudden positioning/order-flow/liquidation risk
without adding to, subtracting from, or replacing the formal score.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.utils.numeric import clamp, pct_change


RiskDirection = Literal["LONG", "SHORT", "NEUTRAL"]
RiskSeverity = Literal["LOW", "MEDIUM", "HIGH"]
RiskQuality = Literal["REAL", "PARTIAL", "MISSING"]

_RECENT_BARS = 3       # 15 minutes, built from fully closed 5m bars
_LIQUIDATION_BARS = 12  # 1 hour
_MIN_BARS = 24


@dataclass(frozen=True)
class RiskRadarReading:
    symbol: str
    event_time: int
    severity: RiskSeverity
    direction: RiskDirection
    state: str
    price_change_pct: float
    oi_qty_change_pct: float
    flow_imbalance: float
    long_liq_usd: float
    short_liq_usd: float
    liquidation_intensity: float
    liquidation_to_volume: float
    oi_change_zscore: float
    flow_zscore: float
    liquidation_zscore: float
    flags: list[str]
    conflicts_official: bool
    data_quality: RiskQuality


def robust_zscore(current: float, history: pd.Series | np.ndarray) -> float:
    """Median/MAD z-score with a standard-deviation fallback.

    Only values supplied in ``history`` form the baseline.  Callers exclude the
    current aggregation window, which keeps the calculation causal and stops a
    spike from diluting its own reference distribution.
    """

    values = np.asarray(history, dtype=float)
    values = values[np.isfinite(values)]
    if len(values) < 5 or not np.isfinite(current):
        return 0.0

    center = float(np.median(values))
    mad = float(np.median(np.abs(values - center)))
    scale = 1.4826 * mad
    if scale <= 1e-12:
        scale = float(np.std(values, ddof=1)) if len(values) > 1 else 0.0
    if scale <= 1e-12:
        if abs(current - center) <= 1e-12:
            return 0.0
        return 10.0 if current > center else -10.0
    return clamp((current - center) / scale, -10.0, 10.0)


def classify_oi_state(
    price_change: float,
    oi_qty_change: float,
    *,
    price_deadband: float,
    oi_deadband: float,
) -> str:
    """Independent 3x3 price/OI classification.

    OI-down states describe exits/deleveraging and are not reversal calls.
    """

    price_axis = 0 if abs(price_change) < price_deadband else (1 if price_change > 0 else -1)
    oi_axis = 0 if abs(oi_qty_change) < oi_deadband else (1 if oi_qty_change > 0 else -1)
    states = {
        (1, 1): "多頭建倉",
        (-1, 1): "空頭建倉",
        (1, -1): "空頭回補",
        (-1, -1): "多頭去槓桿",
        (0, 1): "OI增倉／價格持平",
        (0, -1): "OI減倉／價格持平",
        (1, 0): "價格上漲／OI持平",
        (-1, 0): "價格下跌／OI持平",
        (0, 0): "持平",
    }
    return states[(price_axis, oi_axis)]


def _numeric(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(np.nan, index=frame.index, dtype=float)
    return pd.to_numeric(frame[column], errors="coerce")


def _latest_flow_quality(frame: pd.DataFrame) -> RiskQuality:
    if "flow_quality" not in frame.columns:
        # Binance and the deterministic provider expose a native buy/sell split
        # but pre-date the explicit Gate quality label.
        has_split = {"buy_volume", "sell_volume"}.issubset(frame.columns)
        return "REAL" if has_split else "MISSING"
    recent = frame["flow_quality"].tail(_RECENT_BARS).astype(str).str.upper()
    real = int((recent == "REAL").sum())
    if real == len(recent) and len(recent) == _RECENT_BARS:
        return "REAL"
    return "PARTIAL" if real else "MISSING"


def _adaptive_deadband(changes: pd.Series, floor: float, ceiling: float) -> float:
    history = pd.to_numeric(changes, errors="coerce").dropna()
    if len(history) == 0:
        return floor
    noise = float(np.median(np.abs(history.to_numpy(dtype=float)))) * 0.75
    return clamp(max(floor, noise), floor, ceiling)


def analyze_five_minute_risk(
    symbol: str,
    frame: pd.DataFrame,
    official_direction: str = "NEUTRAL",
) -> RiskRadarReading | None:
    """Calculate one causal risk reading from closed 5m rows.

    Returns ``None`` when quantity OI or sufficient history is unavailable.
    Low-severity readings are valid; the scan service decides whether to ship
    them or retain only actionable events.
    """

    if len(frame) < _MIN_BARS or "timestamp" not in frame.columns or "close" not in frame.columns:
        return None

    qty_column = "open_interest_qty" if "open_interest_qty" in frame.columns else "open_interest"
    oi_qty = _numeric(frame, qty_column)
    close = _numeric(frame, "close")
    if oi_qty.notna().sum() < _MIN_BARS or close.notna().sum() < _MIN_BARS:
        return None
    if float(oi_qty.iloc[-1]) <= 0 or float(close.iloc[-1]) <= 0:
        return None

    oi_changes = oi_qty.pct_change(periods=_RECENT_BARS, fill_method=None)
    price_changes = close.pct_change(periods=_RECENT_BARS, fill_method=None)
    oi_change = float(oi_changes.iloc[-1])
    price_change = float(price_changes.iloc[-1])
    if not np.isfinite(oi_change) or not np.isfinite(price_change):
        return None

    baseline_oi = oi_changes.iloc[:-_RECENT_BARS].tail(96)
    baseline_price = price_changes.iloc[:-_RECENT_BARS].tail(96)
    oi_z = robust_zscore(oi_change, baseline_oi)
    oi_threshold = max(0.005, _adaptive_deadband(baseline_oi, 0.003, 0.03) * 1.5)
    oi_anomaly = abs(oi_change) >= oi_threshold and abs(oi_z) >= 2.5

    price_deadband = _adaptive_deadband(baseline_price, 0.0015, 0.012)
    oi_deadband = _adaptive_deadband(baseline_oi, 0.003, 0.025)
    state = classify_oi_state(
        price_change,
        oi_change,
        price_deadband=price_deadband,
        oi_deadband=oi_deadband,
    )

    quality = _latest_flow_quality(frame)
    buy = _numeric(frame, "buy_volume")
    sell = _numeric(frame, "sell_volume")
    delta = buy - sell
    total_flow = buy + sell
    rolling_delta = delta.rolling(_RECENT_BARS, min_periods=_RECENT_BARS).sum()
    current_delta = float(rolling_delta.iloc[-1]) if pd.notna(rolling_delta.iloc[-1]) else 0.0
    baseline_delta = rolling_delta.iloc[:-_RECENT_BARS].tail(96)
    flow_z = robust_zscore(current_delta, baseline_delta) if quality == "REAL" else 0.0
    recent_total = float(total_flow.tail(_RECENT_BARS).sum(min_count=1))
    flow_imbalance = current_delta / recent_total if recent_total > 0 and quality != "MISSING" else 0.0
    flow_imbalance = clamp(flow_imbalance, -1.0, 1.0)
    strong_flow = quality == "REAL" and (
        (abs(flow_z) >= 2.0 and abs(flow_imbalance) >= 0.15)
        or abs(flow_imbalance) >= 0.35
    )

    long_liq_series = _numeric(frame, "long_liq_usd").fillna(0.0)
    short_liq_series = _numeric(frame, "short_liq_usd").fillna(0.0)
    if "liquidation_quality" in frame.columns:
        liq_quality = frame["liquidation_quality"].astype(str).str.upper().eq("REAL")
        liq_coverage_real = bool(liq_quality.tail(_LIQUIDATION_BARS).all())
    else:
        liq_coverage_real = False
    total_liq_series = long_liq_series + short_liq_series
    long_liq = float(long_liq_series.tail(_LIQUIDATION_BARS).sum())
    short_liq = float(short_liq_series.tail(_LIQUIDATION_BARS).sum())
    total_liq = long_liq + short_liq
    rolling_liq = total_liq_series.rolling(
        _LIQUIDATION_BARS, min_periods=_LIQUIDATION_BARS
    ).sum()
    liq_z = (
        robust_zscore(
            total_liq,
            rolling_liq.iloc[:-_LIQUIDATION_BARS].tail(96),
        )
        if liq_coverage_real
        else 0.0
    )

    oi_usd_series = _numeric(frame, "open_interest_usd")
    oi_usd = float(oi_usd_series.iloc[-1]) if pd.notna(oi_usd_series.iloc[-1]) else 0.0
    if oi_usd <= 0 and qty_column == "open_interest":
        # Backward compatibility for providers whose historical OI field is
        # already USD notional. Gate always supplies the explicit USD column.
        oi_usd = float(oi_qty.iloc[-1])
    liquidation_intensity = total_liq / oi_usd if oi_usd > 0 else 0.0

    quote_volume = _numeric(frame, "quote_volume")
    volume_1h = float(quote_volume.tail(_LIQUIDATION_BARS).sum(min_count=1))
    liquidation_to_volume = total_liq / volume_1h if volume_1h > 0 else 0.0
    liq_spike = liq_coverage_real and total_liq > 0 and (
        (liq_z >= 2.5 and (liquidation_intensity >= 0.00025 or liquidation_to_volume >= 0.001))
        or liquidation_intensity >= 0.002
    )

    flags: list[str] = []
    if oi_anomaly:
        flags.append("OI數量異常增倉" if oi_change > 0 else "OI數量異常減倉")
    if strong_flow:
        flags.append("主動買盤異常" if flow_imbalance > 0 else "主動賣盤異常")
    if liq_spike:
        flags.append("爆倉強度異常")

    direction: RiskDirection = "NEUTRAL"
    event_state = state
    structural_event = False

    # An exit state remains a continuation-risk read, never an automatic fade.
    if (
        state == "多頭去槓桿"
        and long_liq >= short_liq
        and flow_imbalance <= -0.10
        and (liq_spike or long_liq > 0)
    ):
        event_state = "多頭去槓桿進行中"
        direction = "SHORT"
        flags.append("多頭爆倉／去槓桿")
        structural_event = True
    elif (
        state == "空頭回補"
        and short_liq >= long_liq
        and flow_imbalance >= 0.10
        and (liq_spike or short_liq > 0)
    ):
        event_state = "空頭回補擠壓進行中"
        direction = "LONG"
        flags.append("空頭爆倉／回補擠壓")
        structural_event = True
    elif strong_flow and flow_imbalance > 0 and price_change <= price_deadband:
        event_state = "買單疑似被吸收"
        direction = "SHORT"
        flags.append("價格未跟隨主動買盤")
        structural_event = True
    elif strong_flow and flow_imbalance < 0 and price_change >= -price_deadband:
        event_state = "賣單疑似被吸收"
        direction = "LONG"
        flags.append("價格未跟隨主動賣盤")
        structural_event = True
    elif state == "多頭建倉" and flow_imbalance > 0 and (oi_anomaly or strong_flow):
        direction = "LONG"
    elif state == "空頭建倉" and flow_imbalance < 0 and (oi_anomaly or strong_flow):
        direction = "SHORT"

    points = int(oi_anomaly) + int(strong_flow) + 2 * int(liq_spike) + 2 * int(structural_event)
    severity: RiskSeverity = "HIGH" if points >= 3 else ("MEDIUM" if points >= 1 else "LOW")
    conflict = (
        direction in {"LONG", "SHORT"}
        and official_direction in {"LONG", "SHORT"}
        and direction != official_direction
    )
    if conflict:
        flags.append("與15m正式方向衝突")

    data_quality: RiskQuality
    if quality == "REAL" and oi_usd > 0 and liq_coverage_real:
        data_quality = "REAL"
    elif quality != "MISSING" or oi_usd > 0:
        data_quality = "PARTIAL"
    else:
        data_quality = "MISSING"

    return RiskRadarReading(
        symbol=symbol,
        event_time=int(frame["timestamp"].iloc[-1]) + 300,
        severity=severity,
        direction=direction,
        state=event_state,
        price_change_pct=round(price_change, 6),
        oi_qty_change_pct=round(oi_change, 6),
        flow_imbalance=round(flow_imbalance, 6),
        long_liq_usd=round(long_liq, 2),
        short_liq_usd=round(short_liq, 2),
        liquidation_intensity=round(liquidation_intensity, 8),
        liquidation_to_volume=round(liquidation_to_volume, 8),
        oi_change_zscore=round(oi_z, 3),
        flow_zscore=round(flow_z, 3),
        liquidation_zscore=round(liq_z, 3),
        flags=flags,
        conflicts_official=conflict,
        data_quality=data_quality,
    )
