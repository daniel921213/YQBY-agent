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


@dataclass(frozen=True)
class TradeRecommendationDecision:
    eligible: bool
    stage_priority: int = 0
    weakest_core_strength: float = 0.0
    flow_strength: float = 0.0
    five_minute_strength: float = 0.0
    oi_change_strength: float = 0.0

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

    if metrics is None or metrics.flow_quality != "REAL":
        return TradeRecommendationDecision(False)
    if stage not in {"趨勢啟動", "趨勢延續"}:
        return TradeRecommendationDecision(False)
    if oi_side != _REQUIRED_OI_SIDE[direction] or oi_change_1h <= 0:
        return TradeRecommendationDecision(False)
    if five_minute is None or five_minute.data_quality != "REAL":
        return TradeRecommendationDecision(False)
    if five_minute.direction != direction or five_minute.conflicts_official:
        return TradeRecommendationDecision(False)
    if five_minute.state not in _ALLOWED_5M_STATES[direction]:
        return TradeRecommendationDecision(False)
    if _LIQUIDATION_FLAG in five_minute.flags:
        return TradeRecommendationDecision(False)

    transition_confirmed = any(
        flag.startswith(_TRANSITION_FLAG_PREFIX) for flag in five_minute.flags
    )
    if stage == "趨勢延續" and not transition_confirmed:
        return TradeRecommendationDecision(False)

    if direction == "LONG" and (
        metrics.funding_rate >= _LONG_FUNDING_CROWDED
        or metrics.account_ratio >= _LONG_ACCOUNT_CROWDED
    ):
        return TradeRecommendationDecision(False)
    if direction == "SHORT" and (
        metrics.funding_rate <= _SHORT_FUNDING_CROWDED
        or metrics.account_ratio <= _SHORT_ACCOUNT_CROWDED
    ):
        return TradeRecommendationDecision(False)

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
    if min(core) < _CORE_MIN_STRENGTH or flow_strength < _CORE_MIN_STRENGTH:
        return TradeRecommendationDecision(False)

    five_minute_strength = max(
        abs(five_minute.flow_zscore), abs(five_minute.oi_change_zscore)
    )
    return TradeRecommendationDecision(
        eligible=True,
        stage_priority=2 if stage == "趨勢啟動" else 1,
        weakest_core_strength=min(core),
        flow_strength=flow_strength,
        five_minute_strength=five_minute_strength,
        oi_change_strength=abs(oi_change_1h),
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
