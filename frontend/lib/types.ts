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

export interface AnalysisResponse {
  recommendation: Recommendation;
  evidence: EvidenceItem[];
  chart: MarketChartPayload;
  meta: AnalysisMeta;
}

export type AnomalyCategory = "轉多" | "轉空" | "疑似反轉";

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
}

export interface MarketBreadth {
  total: number;
  long_count: number;
  short_count: number;
  anomaly_count: number;
}

export interface ScanResponse {
  items: ScanItem[];
  scanned_symbols: string[];
  breadth: MarketBreadth;
  meta: AnalysisMeta;
}
