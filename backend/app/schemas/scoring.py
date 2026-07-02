from typing import Literal

from pydantic import BaseModel

from app.schemas.indicators import EvidenceItem
from app.schemas.market import MarketChartPayload


TradeDirection = Literal["LONG", "SHORT"]
ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH"]

# Move-lifecycle stage (早期異動雷達). Answers "where in its life is this move"
# so users can tell 剛開始異動 from 已經過熱 instead of reading a bare score.
Stage = Literal["早期異動", "趨勢啟動", "趨勢延續", "過熱風險", "反轉警訊", "觀察"]


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
    # Retail ratio's own recent baseline (~9h mean). Crypto retail is chronically
    # long-biased, so crowding must be read as deviation from THIS, not from 1.0.
    account_ratio_avg: float = 1.0
    # Real liquidation notionals over the last hour (0 when the provider has none).
    long_liq_usd_1h: float = 0.0
    short_liq_usd_1h: float = 0.0


class AnalysisResponse(BaseModel):
    recommendation: Recommendation
    evidence: list[EvidenceItem]
    chart: MarketChartPayload
    meta: AnalysisMeta
    metrics: MarketSnapshot | None = None
    # Lifecycle stage + the concrete facts that put the coin there ("為什麼被選出").
    stage: Stage = "觀察"
    stage_reasons: list[str] = []


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
    stage: Stage
    stage_reasons: list[str] = []
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


OiSide = Literal["多頭建倉", "空頭建倉", "多頭平倉", "空頭平倉", "持平"]


class OiMover(BaseModel):
    """One point of the OI movement quadrant map (1h open-interest × price)."""

    symbol: str
    price: float
    oi_change_1h: float          # fractional change over the last hour
    oi_delta: float              # notional change in USD over 1h (cross-symbol comparable)
    total_oi: float              # USD notional
    change_24h: float
    # Price change over the same 1h window — the quadrant chart's Y axis and
    # what `side` is classified from (OI Δ sign × price Δ sign).
    price_change_1h: float = 0.0
    side: OiSide
    # Quadrant in the PREVIOUS authoritative scan when it differs from `side` —
    # tracked server-side so every client sees the same transitions. None =>
    # no change (or first sighting).
    previous_side: OiSide | None = None
    # Real liquidations over the last hour (squeeze radar's confirmation).
    long_liq_usd_1h: float = 0.0
    short_liq_usd_1h: float = 0.0


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
    account_ratio_avg: float = 1.0
    oi_change_1h: float
    stage: Stage = "觀察"


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
    stage: Stage
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
