import { X } from "lucide-react";
import { IndicatorEvidenceList } from "@/components/dashboard/IndicatorEvidenceList";
import { SignalRadar } from "@/components/dashboard/SignalRadar";
import { TugOfWarBar } from "@/components/dashboard/TugOfWarBar";
import { PillarList } from "@/components/dashboard/PillarList";
import type {
  AnalysisResponse,
  ConfidenceLevel,
  EvidenceItem,
  PillarScore,
  ScanItem,
  Stage,
  TradeDirection
} from "@/lib/types";
import {
  confidenceLabel,
  directionLabel,
  formatPercent,
  formatPrice,
  formatRelativeTime,
  stageHint,
  stageTone
} from "@/lib/format";

const PILLAR_ORDER = ["市場結構", "動能", "相對強弱", "資金費率", "多空比"];

function derivePillars(evidence: EvidenceItem[]): PillarScore[] {
  return PILLAR_ORDER.map((pillar) => {
    const members = evidence.filter((e) => e.pillar === pillar);
    if (!members.length) {
      return { pillar, direction: "NEUTRAL", strength: 0, score: 0 };
    }
    // 方向性因子優先，避免「強但中性」的量能讀數蓋掉方向。
    const directional = members.filter((e) => e.direction !== "NEUTRAL");
    const pool = directional.length ? directional : members;
    const top = pool.reduce((a, b) => (b.strength > a.strength ? b : a));
    return {
      pillar,
      direction: top.direction,
      strength: top.strength,
      score: members.reduce((sum, e) => sum + e.score, 0)
    };
  });
}

// 兩種資料來源收斂成同一個顯示模型：警報清單上的幣整份用掃描快照（跟卡片、
// 排名同一輪、同一個分數）；不在清單上的幣才用點開當下的即時分析。
interface DetailView {
  symbol: string;
  stage: Stage;
  stageReasons: string[];
  direction: TradeDirection;
  score: number;
  rawScore: number;
  multiplier: number;
  confluencePillars: number;
  confidence: ConfidenceLevel;
  longScore: number;
  shortScore: number;
  pillars: PillarScore[];
  evidence: EvidenceItem[];
}

function viewFromScanItem(item: ScanItem): DetailView {
  return {
    symbol: item.symbol,
    stage: item.stage,
    stageReasons: item.stage_reasons,
    direction: item.direction,
    score: item.score,
    rawScore: item.raw_score,
    multiplier: item.confluence_multiplier,
    confluencePillars: item.confluence_pillars,
    confidence: item.confidence_level,
    longScore: item.long_score,
    shortScore: item.short_score,
    pillars: item.pillars,
    evidence: item.evidence
  };
}

function viewFromAnalysis(analysis: AnalysisResponse): DetailView {
  const rec = analysis.recommendation;
  return {
    symbol: rec.symbol,
    stage: analysis.stage,
    stageReasons: analysis.stage_reasons,
    direction: rec.direction,
    score: rec.score,
    rawScore: rec.raw_score,
    multiplier: rec.confluence_multiplier,
    confluencePillars: rec.confluence_pillars,
    confidence: rec.confidence_level,
    longScore: rec.long_score,
    shortScore: rec.short_score,
    pillars: derivePillars(analysis.evidence),
    evidence: analysis.evidence
  };
}

interface DetailPanelProps {
  analysis: AnalysisResponse | null;
  selectedScanItem: ScanItem | null;
  // 本輪掃描完成的 epoch 秒（快照模式的資料時間點標示用）。
  scanGeneratedAt: number | null;
  loading: boolean;
  error: string | null;
  symbol: string;
  onClose: () => void;
}

export function DetailPanel({
  analysis,
  selectedScanItem,
  scanGeneratedAt,
  loading,
  error,
  symbol,
  onClose
}: DetailPanelProps) {
  const view = selectedScanItem
    ? viewFromScanItem(selectedScanItem)
    : analysis
      ? viewFromAnalysis(analysis)
      : null;

  if (!view) {
    return (
      <ModalFrame title={symbol} onClose={onClose}>
        <div className="flex h-64 items-center justify-center text-sm text-slate-300">
          {error ?? (loading ? "載入分析中" : "尚無分析資料")}
        </div>
      </ModalFrame>
    );
  }

  const directionTone = view.direction === "LONG" ? "text-long" : "text-short";
  // 資料時間點只標一次：快照模式顯示本輪掃描多久前，即時模式標「即時分析」。
  const scanMinutes =
    selectedScanItem && scanGeneratedAt
      ? Math.max(0, Math.floor((Date.now() / 1000 - scanGeneratedAt) / 60))
      : null;

  return (
    <ModalFrame title={view.symbol} onClose={onClose}>
      <section className="grid max-h-[78vh] gap-5 overflow-y-auto pr-1">
        <div className="grid gap-4 surface rounded-lg p-4 md:grid-cols-[1fr_240px] md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-xs tracking-[0.16em] text-gold">交易方向</div>
              <span
                title={stageHint(view.stage)}
                className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${stageTone(view.stage)}`}
              >
                {view.stage}
              </span>
              <span className="text-xs text-slate-500">
                {scanMinutes !== null
                  ? `本輪掃描 · ${formatRelativeTime(scanMinutes)}`
                  : "即時分析"}
              </span>
            </div>
            <h2 className={`mt-2 text-3xl font-semibold ${directionTone}`}>
              {directionLabel(view.direction)} {view.score.toFixed(1)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {view.confluencePillars}/5 支柱同向（原始 {view.rawScore.toFixed(1)} × 共振{" "}
              {view.multiplier.toFixed(2)} = {view.score.toFixed(1)}），信心{" "}
              {confidenceLabel(view.confidence)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{stageHint(view.stage)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-2">
            <Metric label="排名" value={selectedScanItem ? `第 ${selectedScanItem.rank} 名` : "--"} />
            <Metric
              label="現價"
              value={selectedScanItem ? formatPrice(selectedScanItem.price) : "--"}
            />
            <Metric
              label="24H 漲跌"
              value={selectedScanItem ? formatPercent(selectedScanItem.change_24h) : "--"}
            />
            <Metric
              label="同向指標"
              value={selectedScanItem ? `${selectedScanItem.triggered_count} 個` : "--"}
            />
            {selectedScanItem?.first_seen_ts ? (
              <>
                <Metric
                  label="首次警報"
                  value={`${formatRelativeTime(selectedScanItem.minutes_since_first)} · ${formatPrice(
                    selectedScanItem.first_seen_price
                  )}`}
                />
                <Metric
                  label="首次警報後"
                  value={`${formatPercent(selectedScanItem.change_since_first)} · 近1h ${
                    selectedScanItem.alert_trigger_count
                  } 次`}
                />
              </>
            ) : null}
          </div>
        </div>

        {view.stageReasons.length ? (
          <div className="surface rounded-lg p-4">
            <div className="mb-2 text-sm font-medium text-slate-100">為什麼被選出</div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {view.stageReasons.map((reason) => (
                <li
                  key={reason}
                  className="surface-sunken rounded-md px-3 py-2 text-sm text-slate-300"
                >
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center justify-center surface rounded-lg p-4">
            <div className="mb-1 self-start text-sm font-medium text-slate-100">五支柱雷達</div>
            <SignalRadar pillars={view.pillars} direction={view.direction} />
          </div>

          <div className="flex flex-col justify-center gap-5 surface rounded-lg p-4">
            <div>
              <div className="mb-2 text-sm font-medium text-slate-100">支柱強弱</div>
              <PillarList pillars={view.pillars} />
            </div>
            <div>
              <div className="mb-3 text-sm font-medium text-slate-100">多空力量對比</div>
              <TugOfWarBar long={view.longScore} short={view.shortScore} size="lg" />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 text-sm font-medium text-slate-100">分數拆解與理由</div>
          <IndicatorEvidenceList evidence={view.evidence} />
        </div>
      </section>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-sm">
      <div className="glass-panel animate-signal-rise w-full max-w-4xl rounded-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs tracking-[0.18em] text-gold">訊號詳情</div>
            <div className="mt-1 text-xl font-semibold text-slate-50">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-ember/60 hover:text-ember"
            title="關閉"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-sunken rounded-md px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-100">{value}</div>
    </div>
  );
}
