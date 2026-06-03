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


class MarketSnapshot(BaseModel):
    """Latest raw derivative reads for a symbol (last row of the enriched frame).

    Surfaced so the screener / data rankings can show actual numbers
    (funding %, 大戶/散戶 多空比) rather than just the pillar's ▲/▼ verdict.
    """

    funding_rate: float = 0.0
    top_trader_ratio: float = 1.0
    account_ratio: float = 1.0
    open_interest: float = 0.0


class AnalysisResponse(BaseModel):
    recommendation: Recommendation
    evidence: list[EvidenceItem]
    chart: MarketChartPayload
    meta: AnalysisMeta
    metrics: MarketSnapshot | None = None


class PillarScore(BaseModel):
    pillar: str
    direction: Literal["LONG", "SHORT", "NEUTRAL"]
    strength: float
    score: float


# How often a recurring alert has fired since first seen, bucketed for display.
FrequencyTier = Literal["low", "mid", "high"]


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
    # Latest spot reads (last close of the primary frame + 24h change).
    price: float = 0.0
    change_24h: float = 0.0
    # Alert lifecycle — populated by AnomalyTracker once the alert has been seen
    # across scans. first_seen_ts is None until the tracker has logged it.
    first_seen_ts: int | None = None
    minutes_since_first: int = 0
    first_seen_price: float = 0.0
    change_since_first: float = 0.0
    alert_trigger_count: int = 1
    frequency_tier: FrequencyTier = "low"
    is_new: bool = False


class AltseasonIndex(BaseModel):
    """0–100 breadth gauge: how much of the universe is beating BTC right now.

    0 = everything trails BTC (BTC 季); 100 = everything outperforms (山寨季).
    """

    index: int
    label: Literal["BTC季", "偏BTC", "中性", "偏山寨", "山寨季"]
    outperform_count: int
    total: int
    # Earliest snapshot we still hold this session, for a "vs 稍早" delta. None
    # until the tracker has a second snapshot to compare against.
    previous_index: int | None = None


class OiMover(BaseModel):
    """One row of the OI movement ranking (1h open-interest change)."""

    symbol: str
    price: float
    oi_change_1h: float          # fractional change over the last hour
    oi_delta: float              # notional change (current OI units) over 1h
    total_oi: float
    change_24h: float
    side: Literal["多頭建倉", "空頭建倉", "多頭減倉", "空頭減倉", "持平"]


class ScreenerRow(BaseModel):
    """One row of the full-universe screener (every scanned symbol, not just
    the top anomalies). Carries enough to power the screener table + the
    funding / long-short / gainers rankings without extra requests."""

    symbol: str
    price: float
    change_24h: float
    score: float
    direction: Literal["LONG", "SHORT", "NEUTRAL"]
    confidence_level: ConfidenceLevel
    confluence_pillars: int
    pillars: list[PillarScore]
    funding_rate: float
    top_trader_ratio: float
    account_ratio: float
    oi_change_1h: float


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
    altseason: AltseasonIndex | None = None
    oi_movers: list[OiMover] = []
    # Every scanned symbol, for the 選幣 screener + data rankings.
    universe: list[ScreenerRow] = []


class AnomalyHistoryItem(BaseModel):
    """A resolved alert that has since left the live scan, kept for 歷史紀錄."""

    symbol: str
    direction: TradeDirection
    category: Literal["轉多", "轉空", "疑似反轉"]
    first_seen_ts: int
    resolved_ts: int
    duration_minutes: int
    first_seen_price: float
    last_price: float
    change_over_life: float
    peak_score: float
    trigger_count: int


class AnomalyHistoryResponse(BaseModel):
    items: list[AnomalyHistoryItem]
