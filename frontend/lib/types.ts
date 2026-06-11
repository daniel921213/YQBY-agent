export type TradeDirection = "LONG" | "SHORT";
export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type EvidenceDirection = TradeDirection | "NEUTRAL";

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export interface MarketChartPayload {
  candles: CandlePoint[];
  cvd: LinePoint[];
  open_interest: LinePoint[];
  funding_rate: LinePoint[];
}

export interface EvidenceItem {
  key: string;
  label: string;
  pillar: string;
  direction: EvidenceDirection;
  timeframe: string;
  weight: number;
  score: number;
  strength: number;
  description: string;
}

export interface PillarScore {
  pillar: string;
  direction: EvidenceDirection;
  strength: number;
  score: number;
}

export interface Recommendation {
  symbol: string;
  direction: TradeDirection;
  score: number;
  confidence_level: ConfidenceLevel;
  long_score: number;
  short_score: number;
  summary: string;
  raw_score: number;
  confluence_pillars: number;
  confluence_multiplier: number;
}

export interface AnalysisMeta {
  primary_timeframe: string;
  trigger_timeframe: string;
  trend_timeframe: string;
  lookback: number;
  data_provider: string;
  refresh_interval_seconds: number;
}

export interface MarketSnapshot {
  funding_rate: number;
  top_trader_ratio: number;
  account_ratio: number;
  open_interest: number;
}

export interface AnalysisResponse {
  recommendation: Recommendation;
  evidence: EvidenceItem[];
  chart: MarketChartPayload;
  meta: AnalysisMeta;
  metrics: MarketSnapshot | null;
}

export type AnomalyCategory = "轉多" | "轉空" | "疑似反轉";
export type FrequencyTier = "low" | "mid" | "high";

export interface ScanItem {
  rank: number;
  symbol: string;
  direction: TradeDirection;
  score: number;
  confidence_level: ConfidenceLevel;
  confluence_pillars: number;
  long_score: number;
  short_score: number;
  score_gap: number;
  is_anomaly: boolean;
  is_recommend: boolean;
  category: AnomalyCategory;
  triggered_count: number;
  pillars: PillarScore[];
  top_evidence: EvidenceItem[];
  price: number;
  change_24h: number;
  first_seen_ts: number | null;
  minutes_since_first: number;
  first_seen_price: number;
  change_since_first: number;
  alert_trigger_count: number;
  frequency_tier: FrequencyTier;
  is_new: boolean;
}

export interface MarketBreadth {
  total: number;
  long_count: number;
  short_count: number;
  anomaly_count: number;
}

export interface AltseasonIndex {
  index: number;
  label: "BTC季" | "偏BTC" | "中性" | "偏山寨" | "山寨季";
  outperform_count: number;
  total: number;
  previous_index: number | null;
}

export type OiMoverSide = "多頭建倉" | "空頭建倉" | "多頭平倉" | "空頭平倉" | "持平";

export interface OiMover {
  symbol: string;
  price: number;
  oi_change_1h: number;
  oi_delta: number;
  total_oi: number;
  change_24h: number;
  price_change_1h: number;
  side: OiMoverSide;
}

export interface ScreenerRow {
  symbol: string;
  price: number;
  change_24h: number;
  score: number;
  direction: EvidenceDirection;
  confidence_level: ConfidenceLevel;
  confluence_pillars: number;
  pillars: PillarScore[];
  funding_rate: number;
  top_trader_ratio: number;
  account_ratio: number;
  oi_change_1h: number;
}

export interface ScanResponse {
  items: ScanItem[];
  scanned_symbols: string[];
  breadth: MarketBreadth;
  meta: AnalysisMeta;
  altseason: AltseasonIndex | null;
  oi_movers: OiMover[];
  universe: ScreenerRow[];
}

export interface AnomalyHistoryItem {
  symbol: string;
  direction: TradeDirection;
  category: AnomalyCategory;
  first_seen_ts: number;
  resolved_ts: number;
  duration_minutes: number;
  first_seen_price: number;
  last_price: number;
  change_over_life: number;
  peak_score: number;
  trigger_count: number;
}

export interface AnomalyHistoryResponse {
  items: AnomalyHistoryItem[];
}
