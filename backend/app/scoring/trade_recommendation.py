"""Condition-based eligibility for the dashboard's trade recommendations.

The formal score still explains directional evidence.  Eligibility answers a
different question: is the current setup complete and timely enough to appear
in the actionable long/short lanes?  Every gate here is mandatory; no large
score can compensate for a late, crowded, conflicting, or low-quality setup.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.indicators.risk_radar import RiskRadarReading
from app.schemas.indicators import EvidenceItem
from app.schemas.scoring import MarketSnapshot, Stage, TradeDirection


_CORE_MIN_STRENGTH = 0.5
_LONG_FUNDING_CROWDED = 0.0005
_SHORT_FUNDING_CROWDED = -0.0005
_LONG_ACCOUNT_CROWDED = 1.5
_SHORT_ACCOUNT_CROWDED = 0.65

_STRUCTURE_KEYS = {"open_interest_relation"}
_MOMENTUM_KEYS = {"momentum", "volume_surge", "cvd_thrust"}
_RELATIVE_KEYS = {"relative_strength"}
_LIQUIDATION_FLAG = "爆倉強度異常"
_TRANSITION_FLAG_PREFIX = "5m狀態確認切換"

_ALLOWED_5M_STATES: dict[TradeDirection, set[str]] = {
    "LONG": {"多頭建倉", "賣單疑似被吸收"},
    "SHORT": {"空頭建倉", "買單疑似被吸收"},
}

_REQUIRED_OI_SIDE: dict[TradeDirection, str] = {
    "LONG": "多頭建倉",
    "SHORT": "空頭建倉",
}

_DASHBOARD_STAGES: frozenset[Stage] = frozenset({"趨勢啟動", "趨勢延續"})
_YOKAI_LONG_STAGES: frozenset[Stage] = frozenset(
    {"早期異動", "趨勢啟動", "趨勢延續"}
)
_DASHBOARD_TRANSITION_STAGES: frozenset[Stage] = frozenset({"趨勢延續"})
_YOKAI_TRANSITION_STAGES: frozenset[Stage] = frozenset(
    {"早期異動", "趨勢延續"}
)


@dataclass(frozen=True)
class TradeRecommendationDecision:
    eligible: bool
    stage_priority: int = 0
    weakest_core_strength: float = 0.0
    flow_strength: float = 0.0
    five_minute_strength: float = 0.0
    oi_change_strength: float = 0.0
    passed_reasons: tuple[str, ...] = ()
    failed_reasons: tuple[str, ...] = ()

    def rank_key(self, formal_score: float) -> tuple[float, ...]:
        """Sort already-eligible setups; the formal score is only a tie-breaker."""

        return (
            float(self.stage_priority),
            self.weakest_core_strength,
            self.flow_strength,
            self.five_minute_strength,
            self.oi_change_strength,
            formal_score,
        )


def evaluate_trade_recommendation(
    *,
    direction: TradeDirection,
    stage: Stage,
    evidence: list[EvidenceItem],
    metrics: MarketSnapshot | None,
    oi_side: str | None,
    oi_change_1h: float,
    five_minute: RiskRadarReading | None,
) -> TradeRecommendationDecision:
    """Return whether one symbol qualifies for a direct long/short recommendation."""
    return _evaluate_trade_recommendation(
        direction=direction,
        stage=stage,
        evidence=evidence,
        metrics=metrics,
        oi_side=oi_side,
        oi_change_1h=oi_change_1h,
        five_minute=five_minute,
        allowed_stages=_DASHBOARD_STAGES,
        transition_stages=_DASHBOARD_TRANSITION_STAGES,
        stage_priorities={"趨勢啟動": 2, "趨勢延續": 1},
        stage_failure="15m 尚未進入趨勢啟動／延續",
    )


def evaluate_yokai_long_confirmation(
    *,
    direction: TradeDirection,
    stage: Stage,
    evidence: list[EvidenceItem],
    metrics: MarketSnapshot | None,
    oi_side: str | None,
    oi_change_1h: float,
    five_minute: RiskRadarReading | None,
) -> TradeRecommendationDecision:
    """Return whether a Gate setup confirms a Yokai LONG candidate.

    Unlike the dashboard lanes, Yokai may confirm a 15m early anomaly, but
    only after a newly closed 5m state has switched into the same long setup.
    Yokai never turns a SHORT reading into an actionable recommendation.
    """

    if direction != "LONG":
        return TradeRecommendationDecision(
            eligible=False,
            failed_reasons=("妖怪篩選器只提供做多確認",),
        )

    return _evaluate_trade_recommendation(
        direction=direction,
        stage=stage,
        evidence=evidence,
        metrics=metrics,
        oi_side=oi_side,
        oi_change_1h=oi_change_1h,
        five_minute=five_minute,
        allowed_stages=_YOKAI_LONG_STAGES,
        transition_stages=_YOKAI_TRANSITION_STAGES,
        stage_priorities={"早期異動": 3, "趨勢啟動": 2, "趨勢延續": 1},
        stage_failure="15m 尚未進入早期異動／趨勢啟動／延續",
    )


def _evaluate_trade_recommendation(
    *,
    direction: TradeDirection,
    stage: Stage,
    evidence: list[EvidenceItem],
    metrics: MarketSnapshot | None,
    oi_side: str | None,
    oi_change_1h: float,
    five_minute: RiskRadarReading | None,
    allowed_stages: frozenset[Stage],
    transition_stages: frozenset[Stage],
    stage_priorities: dict[Stage, int],
    stage_failure: str,
) -> TradeRecommendationDecision:
    structure_strength = _evidence_strength(
        evidence,
        direction,
        lambda item: item.key in _STRUCTURE_KEYS or item.key.startswith("cvd_bullish_")
        or item.key.startswith("cvd_bearish_"),
    )
    momentum_strength = _evidence_strength(
        evidence, direction, lambda item: item.key in _MOMENTUM_KEYS
    )
    relative_strength = _evidence_strength(
        evidence, direction, lambda item: item.key in _RELATIVE_KEYS
    )
    flow_strength = _evidence_strength(
        evidence, direction, lambda item: item.key == "cvd_thrust"
    )
    core = (structure_strength, momentum_strength, relative_strength)
    five_minute_strength = (
        max(abs(five_minute.flow_zscore), abs(five_minute.oi_change_zscore))
        if five_minute is not None
        else 0.0
    )
    passed: list[str] = []
    failed: list[str] = []

    def check(condition: bool, success: str, failure: str) -> None:
        (passed if condition else failed).append(success if condition else failure)

    check(
        metrics is not None and metrics.flow_quality == "REAL",
        "主動流資料 REAL",
        "主動流資料不是 REAL",
    )
    check(
        stage in allowed_stages,
        f"15m {stage}",
        stage_failure,
    )
    required_oi = _REQUIRED_OI_SIDE[direction]
    check(
        oi_side == required_oi and oi_change_1h > 0,
        f"OI {required_oi}、近 1h 增倉",
        f"OI 尚未確認{required_oi}",
    )
    check(
        five_minute is not None and five_minute.data_quality == "REAL",
        "5m 資料 REAL",
        "5m REAL 資料不足",
    )
    check(
        five_minute is not None
        and five_minute.direction == direction
        and not five_minute.conflicts_official,
        "5m 與 15m 方向一致",
        "5m 尚未與 15m 正式方向一致",
    )
    check(
        five_minute is not None
        and five_minute.state in _ALLOWED_5M_STATES[direction],
        f"5m {five_minute.state}" if five_minute is not None else "5m 狀態確認",
        "5m 狀態尚未確認",
    )
    check(
        five_minute is not None and _LIQUIDATION_FLAG not in five_minute.flags,
        "未出現爆倉強度異常",
        "爆倉強度異常",
    )

    transition_confirmed = bool(
        five_minute
        and any(flag.startswith(_TRANSITION_FLAG_PREFIX) for flag in five_minute.flags)
    )
    if stage in transition_stages:
        check(
            transition_confirmed,
            "5m 狀態切換已確認",
            f"{stage}缺少 5m 狀態切換確認",
        )

    if direction == "LONG":
        check(
            metrics is not None and metrics.funding_rate < _LONG_FUNDING_CROWDED,
            "資金費率未過度擁擠",
            "資金費率偏高",
        )
        check(
            metrics is not None and metrics.account_ratio < _LONG_ACCOUNT_CROWDED,
            "全體帳戶多空比未過度擁擠",
            "全體帳戶多空比過度偏多",
        )
    else:
        check(
            metrics is not None and metrics.funding_rate > _SHORT_FUNDING_CROWDED,
            "資金費率未過度擁擠",
            "負資金費率過度擁擠",
        )
        check(
            metrics is not None and metrics.account_ratio > _SHORT_ACCOUNT_CROWDED,
            "全體帳戶多空比未過度擁擠",
            "全體帳戶多空比過度偏空",
        )

    check(
        structure_strength >= _CORE_MIN_STRENGTH,
        "市場結構確認",
        "市場結構強度不足",
    )
    check(
        momentum_strength >= _CORE_MIN_STRENGTH,
        "動能確認",
        "動能強度不足",
    )
    check(
        relative_strength >= _CORE_MIN_STRENGTH,
        "相對強弱確認",
        "相對強弱不足",
    )
    check(
        flow_strength >= _CORE_MIN_STRENGTH,
        "主動流方向確認",
        "主動流方向強度不足",
    )

    return TradeRecommendationDecision(
        eligible=not failed,
        stage_priority=stage_priorities.get(stage, 0),
        weakest_core_strength=min(core),
        flow_strength=flow_strength,
        five_minute_strength=five_minute_strength,
        oi_change_strength=abs(oi_change_1h),
        passed_reasons=tuple(passed),
        failed_reasons=tuple(failed),
    )


def _evidence_strength(
    evidence: list[EvidenceItem],
    direction: TradeDirection,
    predicate: Callable[[EvidenceItem], bool],
) -> float:
    return max(
        (
            item.strength
            for item in evidence
            if item.direction == direction and predicate(item)
        ),
        default=0.0,
    )
