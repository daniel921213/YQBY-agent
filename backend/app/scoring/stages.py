"""Lifecycle stage classifier — the heart of the 早期異動雷達.

Score answers "how strong is the setup"; stage answers "WHERE in its life is
the move" so a user can tell 剛開始異動 from 已經過熱 at a glance:

- 早期異動   flow/volume/OI are moving but price hasn't — the radar's prize
- 趨勢啟動   price has just started moving and flow confirms it
- 趨勢延續   an established move that order flow still supports
- 過熱風險   the move is extended AND the crowd piled in (funding/retail) — late
- 反轉警訊   fresh divergence or aggressive flow flipping against the move
- 觀察       nothing actionable (screener fallback; anomalies rarely land here)

Classification looks at the COIN's actual move (price returns), not the
recommendation direction — e.g. a coin that pumped 10% with a fresh bearish
divergence is 反轉警訊 even though the score points SHORT.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.indicators.divergence import DivergenceSignal
from app.indicators.early_signals import (
    CvdThrustSignal,
    VolatilitySqueezeSignal,
    VolumeSurgeSignal,
)
from app.utils.numeric import pct_change
from app.utils.timeframes import timeframe_to_seconds

STAGE_EARLY = "早期異動"
STAGE_IGNITION = "趨勢啟動"
STAGE_CONTINUATION = "趨勢延續"
STAGE_OVERHEAT = "過熱風險"
STAGE_REVERSAL = "反轉警訊"
STAGE_WATCH = "觀察"

ALL_STAGES = (
    STAGE_EARLY,
    STAGE_IGNITION,
    STAGE_CONTINUATION,
    STAGE_OVERHEAT,
    STAGE_REVERSAL,
    STAGE_WATCH,
)

# Price-move thresholds (fractions). Tuned for 15m-frame intraday alts; the
# same values scale to other frames since returns are computed over wall-clock
# horizons (1h/4h/24h), not bar counts.
_QUIET_4H = 0.015        # "price hasn't moved yet" ceiling
_QUIET_24H = 0.03
_STARTING_1H = 0.006     # a young move
_STARTING_4H = 0.015
_YOUNG_24H_CAP = 0.05    # beyond this the move is no longer "just starting"
_ESTABLISHED_24H = 0.03  # an ongoing trend
_EXTENDED_24H = 0.06     # stretched — overheat territory
_EXTENDED_4H = 0.035
_REVERSAL_MIN_MOVE = 0.03

# Flow-anomaly thresholds.
_VOL_HOT_RATIO = 2.0
_VOL_BLOWOFF_RATIO = 3.5
_OI_ACTIVE_4H = 0.03
_THRUST_HOT_Z = 1.5
_THRUST_FLIP_Z = 1.8

# Crowding thresholds for 過熱.
_FUNDING_HOT = 0.0005
_RETAIL_LONG_CROWDED = 1.5
_RETAIL_SHORT_CROWDED = 0.65

_MAX_REASONS = 4


@dataclass(frozen=True)
class StageResult:
    stage: str
    reasons: list[str]


def _ret(closes: pd.Series, bars: int) -> float:
    if len(closes) <= bars:
        return 0.0
    return pct_change(float(closes.iloc[-1 - bars]), float(closes.iloc[-1]))


def classify_stage(
    frame: pd.DataFrame,
    primary_timeframe: str,
    divergence: DivergenceSignal,
    volume_surge: VolumeSurgeSignal,
    cvd_thrust: CvdThrustSignal,
    squeeze: VolatilitySqueezeSignal,
) -> StageResult:
    closes = frame["close"]
    spb = timeframe_to_seconds(primary_timeframe)
    ret_1h = _ret(closes, max(1, 3_600 // spb))
    ret_4h = _ret(closes, max(1, 14_400 // spb))
    ret_24h = _ret(closes, max(1, 86_400 // spb))

    oi_change_4h = 0.0
    if "open_interest" in frame.columns and len(frame) > max(1, 14_400 // spb):
        bars_4h = max(1, 14_400 // spb)
        oi_change_4h = pct_change(
            float(frame["open_interest"].iloc[-1 - bars_4h]),
            float(frame["open_interest"].iloc[-1]),
        )
    funding = float(frame["funding_rate"].iloc[-1]) if "funding_rate" in frame.columns else 0.0
    account_ratio = (
        float(frame["account_long_short_ratio"].iloc[-1])
        if "account_long_short_ratio" in frame.columns
        else 1.0
    )

    # The coin's own move direction (what the stage describes).
    move_sign = _sign(ret_24h) if abs(ret_24h) >= 0.01 else _sign(ret_4h)

    # ── 1. 反轉警訊 — fresh divergence against a real move, or flow flipping ──
    if divergence.kind == "bullish" and ret_24h <= -_REVERSAL_MIN_MOVE:
        reasons = [f"CVD 底背離（{divergence.age_bars} 根 K 線內確認）", f"24h {ret_24h:+.1%} 下跌後賣壓衰竭"]
        if cvd_thrust.zscore >= _THRUST_HOT_Z:
            reasons.append(f"主動買盤回流 z={cvd_thrust.zscore:+.1f}")
        return StageResult(STAGE_REVERSAL, reasons[:_MAX_REASONS])
    if divergence.kind == "bearish" and ret_24h >= _REVERSAL_MIN_MOVE:
        reasons = [f"CVD 頂背離（{divergence.age_bars} 根 K 線內確認）", f"24h {ret_24h:+.1%} 上漲後買盤不繼"]
        if cvd_thrust.zscore <= -_THRUST_HOT_Z:
            reasons.append(f"主動賣盤湧現 z={cvd_thrust.zscore:+.1f}")
        return StageResult(STAGE_REVERSAL, reasons[:_MAX_REASONS])
    if (
        move_sign != 0
        and abs(ret_24h) >= _EXTENDED_24H
        and _sign(cvd_thrust.zscore) == -move_sign
        and abs(cvd_thrust.zscore) >= _THRUST_FLIP_Z
    ):
        side = "賣" if move_sign > 0 else "買"
        return StageResult(
            STAGE_REVERSAL,
            [
                f"24h {ret_24h:+.1%} 延伸後主動{side}盤反撲 z={cvd_thrust.zscore:+.1f}",
                "順勢動能與訂單流方向脫鉤",
            ],
        )

    # ── 2. 過熱風險 — extended move + the crowd already aboard ─────────────
    extended = (move_sign > 0 and (ret_24h >= _EXTENDED_24H or ret_4h >= _EXTENDED_4H)) or (
        move_sign < 0 and (ret_24h <= -_EXTENDED_24H or ret_4h <= -_EXTENDED_4H)
    )
    if extended:
        crowd: list[str] = []
        if move_sign > 0 and funding >= _FUNDING_HOT:
            crowd.append(f"資金費率 {funding:.4%} 同向過熱")
        if move_sign < 0 and funding <= -_FUNDING_HOT:
            crowd.append(f"資金費率 {funding:.4%} 同向過熱")
        if move_sign > 0 and account_ratio >= _RETAIL_LONG_CROWDED:
            crowd.append(f"散戶多空比 {account_ratio:.2f}，多單擁擠")
        if move_sign < 0 and account_ratio <= _RETAIL_SHORT_CROWDED:
            crowd.append(f"散戶多空比 {account_ratio:.2f}，空單擁擠")
        if volume_surge.ratio >= _VOL_BLOWOFF_RATIO:
            crowd.append(f"量能 {volume_surge.ratio:.1f}× 急速放大，疑似末段趕價")
        if crowd:
            move_word = "漲" if move_sign > 0 else "跌"
            return StageResult(
                STAGE_OVERHEAT,
                [f"24h {ret_24h:+.1%}，{move_word}勢已充分發酵", *crowd][:_MAX_REASONS],
            )

    # ── 3. 早期異動 — flow moving, price not yet ───────────────────────────
    quiet = abs(ret_4h) <= _QUIET_4H and abs(ret_24h) <= _QUIET_24H
    flow_hits: list[str] = []
    if volume_surge.ratio >= _VOL_HOT_RATIO:
        flow_hits.append(f"量能 {volume_surge.ratio:.1f}× 異常放大")
    if abs(oi_change_4h) >= _OI_ACTIVE_4H:
        flow_hits.append(f"OI 4h {oi_change_4h:+.1%} 快速變化")
    if abs(cvd_thrust.zscore) >= _THRUST_HOT_Z:
        side = "買" if cvd_thrust.zscore > 0 else "賣"
        flow_hits.append(f"主動{side}盤轉強 z={cvd_thrust.zscore:+.1f}")
    if quiet and (len(flow_hits) >= 2 or (flow_hits and squeeze.compressed)):
        reasons = [*flow_hits, f"價格 4h 僅 {ret_4h:+.1%}，資金先行"]
        if squeeze.compressed:
            reasons.append(f"波動壓縮至 {squeeze.percentile:.0%} 分位，蓄勢待發")
        return StageResult(STAGE_EARLY, reasons[:_MAX_REASONS])

    # ── 4. 趨勢啟動 — price just started moving, flow confirms ─────────────
    starting = (
        move_sign != 0
        and abs(ret_24h) < _YOUNG_24H_CAP
        and (
            (move_sign > 0 and (ret_1h >= _STARTING_1H or ret_4h >= _STARTING_4H))
            or (move_sign < 0 and (ret_1h <= -_STARTING_1H or ret_4h <= -_STARTING_4H))
        )
    )
    flow_confirms = (
        _sign(cvd_thrust.zscore) == move_sign and abs(cvd_thrust.zscore) >= 1.0
    ) or volume_surge.ratio >= _VOL_HOT_RATIO or oi_change_4h >= _OI_ACTIVE_4H
    if starting and flow_hits and flow_confirms:
        move_word = "上行" if move_sign > 0 else "下行"
        return StageResult(
            STAGE_IGNITION,
            [f"1h {ret_1h:+.1%} / 4h {ret_4h:+.1%} 開始{move_word}", *flow_hits][:_MAX_REASONS],
        )

    # ── 5. 趨勢延續 — established move that flow still supports ────────────
    established = (move_sign > 0 and ret_24h >= _ESTABLISHED_24H) or (
        move_sign < 0 and ret_24h <= -_ESTABLISHED_24H
    )
    supported = (
        (_sign(cvd_thrust.zscore) == move_sign and abs(cvd_thrust.zscore) >= 0.8)
        or (move_sign > 0 and oi_change_4h >= 0.01)
        or (move_sign < 0 and oi_change_4h >= 0.01)  # OI building on a dump = shorts adding
        or volume_surge.ratio >= 1.3
    )
    if established and supported:
        move_word = "漲" if move_sign > 0 else "跌"
        reasons = [f"24h {ret_24h:+.1%}，{move_word}勢進行中"]
        if abs(cvd_thrust.zscore) >= 0.8 and _sign(cvd_thrust.zscore) == move_sign:
            side = "買" if move_sign > 0 else "賣"
            reasons.append(f"主動{side}盤持續 z={cvd_thrust.zscore:+.1f}")
        if oi_change_4h >= 0.01:
            reasons.append(f"OI 4h {oi_change_4h:+.1%} 增倉支撐")
        return StageResult(STAGE_CONTINUATION, reasons[:_MAX_REASONS])

    # ── Fallback ────────────────────────────────────────────────────────────
    return StageResult(STAGE_WATCH, flow_hits[:_MAX_REASONS])


def _sign(value: float) -> int:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0
