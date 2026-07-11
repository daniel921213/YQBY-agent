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
  open_interest_usd: LinePoint[];
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
  market_type?: "futures";
  score_uses_closed_candles?: boolean;
  official_close_time?: number | null;
}

export interface MarketSnapshot {
  funding_rate: number;
  top_trader_ratio: number;
  top_position_ratio: number;
  account_ratio: number;
  open_interest: number;
  open_interest_qty: number;
  open_interest_usd: number;
  account_ratio_avg: number;
  long_liq_usd_1h: number;
  short_liq_usd_1h: number;
  liquidation_intensity_1h: number;
  liquidation_to_volume_1h: number;
  flow_quality: "REAL" | "MISSING" | "PROXY" | "STALE";
}

export interface AnalysisResponse {
  recommendation: Recommendation;
  evidence: EvidenceItem[];
  chart: MarketChartPayload;
  meta: AnalysisMeta;
  metrics: MarketSnapshot | null;
  stage: Stage;
  stage_reasons: string[];
}

// 幣種所處的行情生命週期階段（早期異動雷達）。
export type Stage = "早期異動" | "趨勢啟動" | "趨勢延續" | "過熱風險" | "反轉警訊" | "觀察";
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
  stage: Stage;
  stage_reasons: string[];
  triggered_count: number;
  pillars: PillarScore[];
  // 本輪快照的完整因子拆解（已依分數排序）——詳情視窗直接讀這份，
  // 解釋的分數才會跟卡片/排名完全一致。
  evidence: EvidenceItem[];
  // 共振細節（分數 = 原始 × 乘數），與 Recommendation 同義。
  raw_score: number;
  confluence_multiplier: number;
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

export type OiMoverSide =
  | "多頭建倉"
  | "空頭建倉"
  | "空頭回補"
  | "多頭去槓桿"
  | "OI增倉／價格持平"
  | "OI減倉／價格持平"
  | "價格上漲／OI持平"
  | "價格下跌／OI持平"
  | "持平"
  // Rolling-deploy compatibility with an older cached scan.
  | "多頭平倉"
  | "空頭平倉";

export interface OiMover {
  symbol: string;
  price: number;
  oi_change_1h: number;
  oi_delta: number;
  total_oi: number;
  oi_qty_change_1h?: number;
  oi_delta_qty?: number;
  total_oi_qty?: number;
  change_24h: number;
  price_change_1h: number;
  side: OiMoverSide;
  // 上一輪後端掃描的象限（與現在不同時才有值）——象限切換的依據。
  previous_side: OiMoverSide | null;
  // 近 1 小時真實爆倉金額（USD）。
  long_liq_usd_1h: number;
  short_liq_usd_1h: number;
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
  account_ratio_avg: number;
  oi_change_1h: number;
  stage: Stage;
}

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface RiskRadarItem {
  symbol: string;
  event_time: string | number;
  severity: RiskSeverity;
  direction: EvidenceDirection;
  state: string;
  price_change_pct: number;
  oi_qty_change_pct: number;
  flow_imbalance: number;
  long_liq_usd: number;
  short_liq_usd: number;
  liquidation_intensity: number;
  liquidation_to_volume?: number;
  oi_change_zscore?: number;
  flow_zscore?: number;
  liquidation_zscore?: number;
  flags: string[];
  conflicts_official: boolean;
  data_quality?: "REAL" | "PARTIAL" | "MISSING";
}

export interface RiskRadarPayload {
  timeframe: "5m";
  generated_at: string | number;
  items: RiskRadarItem[];
  scanned_count?: number;
  covered_count?: number;
}

export interface ScanResponse {
  items: ScanItem[];
  scanned_symbols: string[];
  breadth: MarketBreadth;
  meta: AnalysisMeta;
  // 本輪掃描完成的 epoch 秒——快取最多供應 5 分鐘，資料年齡以這個為準。0 = 暖機中。
  generated_at: number;
  altseason: AltseasonIndex | null;
  oi_movers: OiMover[];
  universe: ScreenerRow[];
  // 獨立的 5m 已收盤風險提醒；舊版後端沒有此欄位時仍可正常顯示正式 15m 評分。
  risk_radar?: RiskRadarPayload | null;
}

export interface AnomalyHistoryItem {
  symbol: string;
  direction: TradeDirection;
  stage: Stage;
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
