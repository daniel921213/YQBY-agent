from dataclasses import replace

import pytest

from app.indicators.risk_radar import RiskRadarReading
from app.schemas.indicators import EvidenceItem
from app.schemas.scoring import MarketSnapshot
from app.scoring.trade_recommendation import evaluate_trade_recommendation


def _evidence(direction: str) -> list[EvidenceItem]:
    return [
        _item("open_interest_relation", direction, 0.74),
        _item("momentum", direction, 0.72),
        _item("cvd_thrust", direction, 0.81),
        _item("relative_strength", direction, 0.69),
    ]


def _item(key: str, direction: str, strength: float) -> EvidenceItem:
    return EvidenceItem(
        key=key,
        label=key,
        pillar="test",
        direction=direction,  # type: ignore[arg-type]
        timeframe="15m",
        weight=10.0,
        score=10.0 * strength,
        strength=strength,
        description="test",
    )


def _risk(direction: str) -> RiskRadarReading:
    state = "多頭建倉" if direction == "LONG" else "空頭建倉"
    return RiskRadarReading(
        symbol="TESTUSDT",
        event_time=1_700_000_000,
        severity="MEDIUM",
        direction=direction,  # type: ignore[arg-type]
        state=state,
        price_change_pct=0.01 if direction == "LONG" else -0.01,
        oi_qty_change_pct=0.02,
        flow_imbalance=0.3 if direction == "LONG" else -0.3,
        long_liq_usd=0.0,
        short_liq_usd=0.0,
        liquidation_intensity=0.0,
        liquidation_to_volume=0.0,
        oi_change_zscore=3.0,
        flow_zscore=2.4 if direction == "LONG" else -2.4,
        liquidation_zscore=0.0,
        flags=["OI數量異常增倉"],
        conflicts_official=False,
        data_quality="REAL",
    )


def _decision(
    direction: str = "LONG",
    *,
    stage: str = "趨勢啟動",
    evidence: list[EvidenceItem] | None = None,
    metrics: MarketSnapshot | None = None,
    oi_side: str | None = None,
    risk: RiskRadarReading | None = None,
):
    return evaluate_trade_recommendation(
        direction=direction,  # type: ignore[arg-type]
        stage=stage,  # type: ignore[arg-type]
        evidence=evidence if evidence is not None else _evidence(direction),
        metrics=metrics
        or MarketSnapshot(
            funding_rate=0.0,
            account_ratio=1.0,
            flow_quality="REAL",
        ),
        oi_side=oi_side or ("多頭建倉" if direction == "LONG" else "空頭建倉"),
        oi_change_1h=0.025,
        five_minute=risk or _risk(direction),
    )


@pytest.mark.parametrize("direction", ["LONG", "SHORT"])
def test_complete_ignition_setup_is_eligible_without_a_score_gate(direction: str) -> None:
    decision = _decision(direction)

    assert decision.eligible is True
    assert decision.stage_priority == 2


@pytest.mark.parametrize("stage", ["早期異動", "過熱風險", "反轉警訊", "觀察"])
def test_non_executable_lifecycle_stages_never_recommend(stage: str) -> None:
    assert _decision(stage=stage).eligible is False


def test_oi_exit_or_wrong_buildup_side_never_recommends() -> None:
    assert _decision(oi_side="空頭回補").eligible is False
    assert _decision(oi_side="空頭建倉").eligible is False


@pytest.mark.parametrize(
    "metrics",
    [
        MarketSnapshot(funding_rate=0.0005, account_ratio=1.0, flow_quality="REAL"),
        MarketSnapshot(funding_rate=0.0, account_ratio=1.5, flow_quality="REAL"),
        MarketSnapshot(funding_rate=0.0, account_ratio=1.0, flow_quality="MISSING"),
    ],
)
def test_long_crowding_or_missing_flow_quality_blocks_recommendation(
    metrics: MarketSnapshot,
) -> None:
    assert _decision(metrics=metrics).eligible is False


def test_five_minute_direction_must_align_and_be_real() -> None:
    neutral = replace(_risk("LONG"), direction="NEUTRAL")
    conflicting = replace(_risk("SHORT"), conflicts_official=True)
    partial = replace(_risk("LONG"), data_quality="PARTIAL")

    assert _decision(risk=neutral).eligible is False
    assert _decision(risk=conflicting).eligible is False
    assert _decision(risk=partial).eligible is False


def test_liquidation_driven_move_is_not_a_fresh_trade_recommendation() -> None:
    risk = replace(_risk("LONG"), flags=["OI數量異常增倉", "爆倉強度異常"])

    assert _decision(risk=risk).eligible is False


def test_continuation_requires_a_confirmed_five_minute_reentry() -> None:
    assert _decision(stage="趨勢延續").eligible is False

    confirmed = replace(
        _risk("LONG"),
        flags=["5m狀態確認切換：持平 → 多頭建倉"],
    )
    decision = _decision(stage="趨勢延續", risk=confirmed)

    assert decision.eligible is True
    assert decision.stage_priority == 1


def test_all_three_core_families_and_real_cvd_thrust_are_mandatory() -> None:
    no_relative = [item for item in _evidence("LONG") if item.key != "relative_strength"]
    weak_flow = [
        item.model_copy(update={"strength": 0.49}) if item.key == "cvd_thrust" else item
        for item in _evidence("LONG")
    ]

    assert _decision(evidence=no_relative).eligible is False
    assert _decision(evidence=weak_flow).eligible is False
