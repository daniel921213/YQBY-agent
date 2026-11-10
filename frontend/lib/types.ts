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

/** crypto = 主控台-加密；tradfi = 主控台-外匯版（Binance 傳統市場永續合約）。 */
export type MarketKind = "crypto" | "tradfi";
/** 外匯版：標的市場（美股、港股…）目前是否開盤。 */
export type MarketSession = "OPEN" | "CLOSED";
/** Binance 管線的爆倉數據來源；null = 無數據（或單一交易所的舊管線）。 */
export type LiquidationSource = "GATE" | "BITGET";

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
  market?: MarketKind;
}

export interface MarketSnapshot {
  /** Raw per-settlement rate as the exchange reports it. */
  funding_rate: number;
  /** 8h-equivalent rate; compare thresholds against this (see fundingRate8h). */
  funding_rate_8h?: number | null;
  funding_interval_hours?: number;
  account_ratio_baseline?: number | null;
  account_ratio_deviation?: number;
  account_crowded?: "LONG" | "SHORT" | null;
  quote_volume_24h?: number | null;
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
  liquidation_source?: LiquidationSource | null;
  liquidation_available?: boolean;
  liquidation_ref_oi_usd?: number | null;
  asset_class?: string | null;
  market_session?: MarketSession | null;
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
  asset_class?: string | null;
  market_session?: MarketSession | null;
}

export interface MarketBreadth {
  total: number;
  long_count: number;
  short_count: number;
  anomaly_count: number;
}

export interface AltseasonIndex {
  index: number;
  label: "BTC季" | "偏BTC" | "中性" | "偏山寨" | "山寨季" | "SPY主導" | "偏SPY" | "偏個股" | "個股強勢";
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
  liquidation_source?: LiquidationSource | null;
  liquidation_available?: boolean;
  /** 爆倉來源交易所自己的 OI（USD）；爆倉強度用它當分母。 */
  liquidation_ref_oi_usd?: number | null;
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
  /** Raw per-settlement rate as the exchange reports it. */
  funding_rate: number;
  /** 8h-equivalent rate; compare thresholds against this (see fundingRate8h). */
  funding_rate_8h?: number | null;
  funding_interval_hours?: number;
  top_trader_ratio: number;
  account_ratio: number;
  account_ratio_avg: number;
  account_ratio_baseline?: number | null;
  account_crowded?: "LONG" | "SHORT" | null;
  quote_volume_24h?: number | null;
  oi_change_1h: number;
  stage: Stage;
  asset_class?: string | null;
  market_session?: MarketSession | null;
  liquidation_source?: LiquidationSource | null;
  liquidation_available?: boolean;
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
  liquidation_source?: LiquidationSource | null;
  liquidation_available?: boolean;
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
  /** 沒有資料可顯示時的原因（例如數據來源被擋）。 */
  notice?: string | null;
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

export type YokaiLifecycle = "潛伏" | "顯形" | "發酵" | "狂熱" | "退散";
export type YokaiSourceHealth = "HEALTHY" | "STALE" | "OFFLINE";
export type YokaiTokenStatus = "QUALIFIED" | "WATCH" | "RISK";

export interface YokaiSourceStatus {
  key: string;
  name: string;
  health: YokaiSourceHealth;
  item_count: number;
  last_success_at: number | null;
  note: string;
}

export interface YokaiArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: number;
  narrative_ids: string[];
  symbols: string[];
}

export interface YokaiHistoryPoint {
  time: number;
  value: number;
  count: number;
}

export interface YokaiNarrative {
  id: string;
  name: string;
  english_name: string;
  summary: string;
  group: "INFRA" | "FINANCE" | "APPLICATION" | "CULTURE" | "ECOSYSTEM";
  parent_id: string | null;
  lifecycle: YokaiLifecycle;
  heat_score: number;
  heat_change: number;
  mentions_1h: number;
  mentions_6h: number;
  mentions_24h: number;
  mentions_7d: number;
  source_count: number;
  related_token_count: number;
  qualified_long_count: number;
  keywords: string[];
  history: YokaiHistoryPoint[];
  articles: YokaiArticle[];
}

export interface YokaiToken {
  symbol: string;
  narrative_ids: string[];
  narrative_names: string[];
  narrative_heat: number;
  narrative_lifecycle: YokaiLifecycle;
  status: YokaiTokenStatus;
  qualified_long: boolean;
  price: number;
  change_24h: number;
  formal_direction: TradeDirection | "NEUTRAL";
  formal_stage: Stage;
  formal_score: number;
  oi_change_1h: number;
  oi_side: string | null;
  funding_rate: number;
  account_ratio: number;
  flow_quality: "REAL" | "MISSING" | "PROXY" | "STALE";
  five_minute_state: string | null;
  five_minute_direction: EvidenceDirection | null;
  active_flow_direction: EvidenceDirection;
  active_flow_strength: number;
  cvd_signal: string | null;
  reasons: string[];
  blocked_reasons: string[];
}

export interface YokaiResponse {
  generated_at: number;
  external_generated_at: number;
  gate_generated_at: number;
  refresh_interval_seconds: number;
  external_ready: boolean;
  gate_ready: boolean;
  sources: YokaiSourceStatus[];
  narratives: YokaiNarrative[];
  tokens: YokaiToken[];
  qualified_longs: YokaiToken[];
  coverage_symbols: number;
  notice: string;
}

// ---- 每週消息面 -------------------------------------------------------------

export type WeeklyMode = "preview" | "live" | "recap" | "warming";
export type WeeklyVerdict = "ABOVE" | "BELOW" | "INLINE";

export interface WeeklyEvent {
  id: string;
  title: string;
  title_zh: string;
  country: string;
  country_zh: string;
  impact: string;
  timestamp: number | null;
  date: string;
  weekday: string;
  time_label: string;
  forecast: string;
  previous: string;
  actual: string | null;
  actual_source: string | null;
  verdict: WeeklyVerdict | null;
  released: boolean;
  url: string | null;
}

export interface WeeklyFactor {
  id: string;
  rank: number;
  title: string;
  country: string;
  country_zh: string;
  impact: string;
  timestamp: number | null;
  date: string;
  weekday: string;
  time_label: string;
  released: boolean;
  holiday_note: string | null;
  note: string | null;
  events: WeeklyEvent[];
}

export interface WeeklyQuote {
  key: string;
  name: string;
  group: "close" | "kpi";
  kind: "price" | "yield";
  decimals: number;
  last: number;
  as_of: string;
  day_change: number | null;
  week_change: number | null;
  change_unit: "pct" | "bp";
  stale: boolean;
}

export interface WeeklyNarrative {
  headline: string[];
  one_line: string[];
  markets: { market: string; points: string[] }[];
  generated_at: number;
  mode: string;
  stale: boolean;
}

export interface WeeklySourceStatus {
  key: string;
  name: string;
  health: "HEALTHY" | "STALE" | "OFFLINE";
  last_success_at: number | null;
}

export interface WeeklyBriefResponse {
  generated_at: number;
  data_as_of: number | null;
  mode: WeeklyMode;
  title: string;
  kicker: string;
  week_start: string | null;
  week_end: string | null;
  week_label: string;
  results: WeeklyEvent[];
  results_label: string;
  kpis: WeeklyQuote[];
  closes: WeeklyQuote[];
  closes_label: string;
  factors: WeeklyFactor[];
  factors_label: string;
  calendar: WeeklyEvent[];
  narrative: WeeklyNarrative | null;
  sources: WeeklySourceStatus[];
  notice: string | null;
  ai_enabled: boolean;
}
