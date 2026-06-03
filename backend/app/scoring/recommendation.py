from app.schemas.scoring import ConfidenceLevel, Recommendation, TradeDirection
from app.scoring.weights import CONFLUENCE_MULTIPLIER
from app.utils.numeric import clamp


def _multiplier(pillars: int) -> float:
    capped = max(0, min(pillars, 5))
    return CONFLUENCE_MULTIPLIER[capped]


def confidence_from_confluence(score: float, pillars: int) -> ConfidenceLevel:
    """A trade is only high-confidence when several pillars agree, not just a
    high raw number from one screaming factor."""
    if pillars >= 4 and score >= 60:
        return "HIGH"
    if pillars >= 3 and score >= 45:
        return "MEDIUM"
    return "LOW"


def build_recommendation(
    symbol: str,
    raw_long: float,
    raw_short: float,
    long_pillars: int,
    short_pillars: int,
) -> Recommendation:
    mult_long = _multiplier(long_pillars)
    mult_short = _multiplier(short_pillars)
    long_score = clamp(raw_long * mult_long, 0.0, 100.0)
    short_score = clamp(raw_short * mult_short, 0.0, 100.0)

    if long_score >= short_score:
        direction: TradeDirection = "LONG"
        score = long_score
        raw = raw_long
        pillars = long_pillars
        multiplier = mult_long
    else:
        direction = "SHORT"
        score = short_score
        raw = raw_short
        pillars = short_pillars
        multiplier = mult_short

    confidence = confidence_from_confluence(score, pillars)
    direction_label = "做多" if direction == "LONG" else "做空"
    confidence_label = {"HIGH": "高", "MEDIUM": "中", "LOW": "低"}[confidence]

    summary = (
        f"{direction_label} {score:.1f} 分，{pillars}/5 支柱同向"
        f"（原始 {raw:.1f} × 共振 {multiplier:.2f}），信心 {confidence_label}"
    )

    return Recommendation(
        symbol=symbol,
        direction=direction,
        score=round(score, 2),
        confidence_level=confidence,
        long_score=round(long_score, 2),
        short_score=round(short_score, 2),
        summary=summary,
        raw_score=round(raw, 2),
        confluence_pillars=pillars,
        confluence_multiplier=round(multiplier, 2),
    )
