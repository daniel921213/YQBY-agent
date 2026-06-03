import pandas as pd

from app.indicators.divergence import detect_price_cvd_divergence
from app.indicators.funding_rate import analyze_funding_rate_extreme
from app.indicators.long_short_ratio import analyze_participant_contrast
from app.indicators.momentum import analyze_momentum
from app.indicators.open_interest import analyze_open_interest_price_relation
from app.indicators.relative_strength import analyze_relative_strength
from app.schemas.indicators import Direction, EvidenceItem
from app.schemas.scoring import Recommendation
from app.scoring.recommendation import build_recommendation
from app.scoring.weights import (
    CONFLUENCE_STRENGTH_THRESHOLD,
    DEFAULT_WEIGHTS,
    ScoringWeights,
)
from app.utils.numeric import clamp

# Pillar labels (five-pillar factor model).
P_STRUCTURE = "市場結構"
P_MOMENTUM = "動能"
P_FUNDING = "資金費率"
P_RATIO = "多空比"
P_RELATIVE = "相對強弱"


class ScoringEngine:
    def __init__(self, weights: ScoringWeights = DEFAULT_WEIGHTS) -> None:
        self.weights = weights

    def score(
        self,
        symbol: str,
        primary: pd.DataFrame,
        btc: pd.DataFrame,
        primary_timeframe: str,
    ) -> tuple[Recommendation, list[EvidenceItem]]:
        long_score = 0.0
        short_score = 0.0
        evidence: list[EvidenceItem] = []
        # Per-direction, per-pillar peak strength → used for confluence counting.
        long_pillars: dict[str, float] = {}
        short_pillars: dict[str, float] = {}

        def add(
            *,
            key: str,
            label: str,
            pillar: str,
            direction: Direction,
            weight: float,
            strength: float,
            description: str,
        ) -> None:
            nonlocal long_score, short_score
            strength = clamp(strength, 0.0, 1.0)
            score = round(weight * strength, 2)
            if direction == "LONG":
                long_score += score
                long_pillars[pillar] = max(long_pillars.get(pillar, 0.0), strength)
            elif direction == "SHORT":
                short_score += score
                short_pillars[pillar] = max(short_pillars.get(pillar, 0.0), strength)
            evidence.append(
                EvidenceItem(
                    key=key,
                    label=label,
                    pillar=pillar,
                    direction=direction,
                    timeframe=primary_timeframe,
                    weight=weight,
                    score=score,
                    strength=round(strength, 4),
                    description=description,
                )
            )

        # ── 市場結構: CVD divergence + OI/price relation ──────────────
        div = detect_price_cvd_divergence(primary, lookback=96)
        if div.kind == "bullish":
            add(key="cvd_bullish_divergence", label="CVD 底背離 成立", pillar=P_STRUCTURE,
                direction="LONG", weight=self.weights.cvd_divergence,
                strength=div.strength, description=div.description)
        elif div.kind == "bearish":
            add(key="cvd_bearish_divergence", label="CVD 頂背離 成立", pillar=P_STRUCTURE,
                direction="SHORT", weight=self.weights.cvd_divergence,
                strength=div.strength, description=div.description)

        oi = analyze_open_interest_price_relation(primary, lookback=48)
        add(key="open_interest_relation", label=oi.label, pillar=P_STRUCTURE,
            direction=oi.direction, weight=self.weights.open_interest_relation,
            strength=oi.strength, description=oi.description)

        # ── 動能: 1h + 4h momentum ───────────────────────────────────
        mom = analyze_momentum(primary, bars_short=4, bars_long=16)
        add(key="momentum", label=mom.label, pillar=P_MOMENTUM,
            direction=mom.direction, weight=self.weights.momentum,
            strength=mom.strength, description=mom.description)

        # ── 資金費率 ─────────────────────────────────────────────────
        funding = analyze_funding_rate_extreme(primary, lookback=96)
        add(key="funding_rate_extreme", label=funding.label, pillar=P_FUNDING,
            direction=funding.direction, weight=self.weights.funding_extreme,
            strength=funding.strength, description=funding.description)

        # ── 多空比 ───────────────────────────────────────────────────
        ratio = analyze_participant_contrast(primary, lookback=36)
        add(key="participant_contrast", label=ratio.label, pillar=P_RATIO,
            direction=ratio.direction, weight=self.weights.participant_contrast,
            strength=ratio.strength, description=ratio.description)

        # ── 相對 BTC 強弱 ────────────────────────────────────────────
        rs = analyze_relative_strength(primary, btc, bars_short=16, bars_long=96)
        add(key="relative_strength", label=rs.label, pillar=P_RELATIVE,
            direction=rs.direction, weight=self.weights.relative_strength,
            strength=rs.strength, description=rs.description)

        recommendation = build_recommendation(
            symbol=symbol,
            raw_long=long_score,
            raw_short=short_score,
            long_pillars=_count_pillars(long_pillars),
            short_pillars=_count_pillars(short_pillars),
        )
        sorted_evidence = sorted(evidence, key=lambda item: item.score, reverse=True)
        return recommendation, sorted_evidence


def _count_pillars(pillars: dict[str, float]) -> int:
    return sum(1 for strength in pillars.values() if strength >= CONFLUENCE_STRENGTH_THRESHOLD)
