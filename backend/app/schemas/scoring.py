from typing import Literal

from pydantic import BaseModel

from app.schemas.indicators import EvidenceItem
from app.schemas.market import MarketChartPayload


TradeDirection = Literal["LONG", "SHORT"]
ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH"]


class Recommendation(BaseModel):
    symbol: str
    direction: TradeDirection
    score: float
    confidence_level: ConfidenceLevel
    long_score: float
    short_score: float
    summary: str
    # Confluence detail for the chosen direction (how the score was built).
    raw_score: float = 0.0
    confluence_pillars: int = 0
    confluence_multiplier: float = 1.0


class AnalysisMeta(BaseModel):
    primary_timeframe: str
    trigger_timeframe: str
    trend_timeframe: str
    lookback: int
    data_provider: str
    refresh_interval_seconds: int = 30


class AnalysisResponse(BaseModel):
    recommendation: Recommendation
    evidence: list[EvidenceItem]
    chart: MarketChartPayload
    meta: AnalysisMeta


class PillarScore(BaseModel):
    pillar: str
    direction: Literal["LONG", "SHORT", "NEUTRAL"]
    strength: float
    score: float


class ScanItem(BaseModel):
    rank: int
    symbol: str
    direction: TradeDirection
    score: float
    confidence_level: ConfidenceLevel
    confluence_pillars: int
    long_score: float
    short_score: float
    score_gap: float
    is_anomaly: bool
    is_recommend: bool
    category: Literal["轉多", "轉空", "疑似反轉"]
    triggered_count: int
    pillars: list[PillarScore]
    top_evidence: list[EvidenceItem]


class MarketBreadth(BaseModel):
    """Direction tally across the entire scanned universe (not just top N)."""

    total: int
    long_count: int
    short_count: int
    anomaly_count: int


class ScanResponse(BaseModel):
    items: list[ScanItem]
    scanned_symbols: list[str]
    breadth: MarketBreadth
    meta: AnalysisMeta
