"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RadioTower, Zap } from "lucide-react";
import type { OiMover, OiMoverSide, ScreenerRow } from "@/lib/types";
import { formatPercent, percentTone } from "@/lib/format";
import { OiQuadrantChart } from "@/components/dashboard/OiQuadrantChart";

interface DataRankingsProps {
  universe: ScreenerRow[];
  movers: OiMover[];
  onSelect: (symbol: string) => void;
}

interface EnrichedMover extends OiMover {
  funding_rate: number;
  account_ratio: number;
}

interface TransitionSignal {
  symbol: string;
  side: OiMoverSide;
  previousSide: OiMoverSide | null;
  route: string;
  label: string;
  reason: string;
  priority: number;
  oiChange: number;
  priceChange: number;
  fundingRate: number;
  accountRatio: number;
}

type SqueezeKind = "軋空" | "殺多";

interface SqueezeSignal {
  symbol: string;
  kind: SqueezeKind;
  score: number;
  side: OiMoverSide;
  reason: string;
  oiChange: number;
  priceChange: number;
  fundingRate: number;
  accountRatio: number;
}

const PREVIOUS_SIDE_STORAGE_KEY = "ert_data.previous_oi_sides";
const TRANSITION_ROWS = 6;
const SQUEEZE_ROWS = 4;

const SIDE_META: Record<OiMoverSide, { color: string; text: string; bg: string }> = {
  多頭建倉: { color: "#23dd8d", text: "text-long", bg: "bg-long/10" },
  空頭平倉: { color: "#4cc2ff", text: "text-ember", bg: "bg-ember/10" },
  多頭平倉: { color: "#f0b429", text: "text-yellow-300", bg: "bg-yellow-300/10" },
  空頭建倉: { color: "#ff5166", text: "text-short", bg: "bg-short/10" },
  持平: { color: "#8fa9c9", text: "text-slate-300", bg: "bg-white/5" }
};

const PARTICLES = [
  { left: "8%", top: "18%", size: 2, delay: "0s", opacity: 0.35 },
  { left: "17%", top: "78%", size: 1.5, delay: "0.8s", opacity: 0.28 },
  { left: "31%", top: "28%", size: 1.5, delay: "1.3s", opacity: 0.34 },
  { left: "48%", top: "66%", size: 2, delay: "0.4s", opacity: 0.24 },
  { left: "63%", top: "16%", size: 1.5, delay: "1.7s", opacity: 0.3 },
  { left: "76%", top: "48%", size: 2, delay: "0.2s", opacity: 0.28 },
  { left: "88%", top: "24%", size: 1.5, delay: "1.1s", opacity: 0.38 },
  { left: "94%", top: "82%", size: 2, delay: "0.6s", opacity: 0.26 }
];

export function DataRankings({ universe, movers, onSelect }: DataRankingsProps) {
  const [previousSides, setPreviousSides] = useState<Record<string, OiMoverSide>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PREVIOUS_SIDE_STORAGE_KEY);
      if (saved) setPreviousSides(JSON.parse(saved));
    } catch {
      setPreviousSides({});
    }
  }, []);

  useEffect(() => {
    if (!movers.length) return;
    try {
      const nextSides = Object.fromEntries(movers.map((m) => [m.symbol, m.side]));
      window.localStorage.setItem(PREVIOUS_SIDE_STORAGE_KEY, JSON.stringify(nextSides));
    } catch {
      // localStorage is only a soft memory layer; the panel still works without it.
    }
  }, [movers]);

  const enriched = useMemo(() => {
    const rowsBySymbol = new Map(universe.map((row) => [row.symbol, row]));
    return movers.map<EnrichedMover>((mover) => {
      const row = rowsBySymbol.get(mover.symbol);
      return {
        ...mover,
        funding_rate: row?.funding_rate ?? 0,
        account_ratio: row?.account_ratio ?? 1
      };
    });
  }, [movers, universe]);

  const transitionSignals = useMemo(
    () => buildTransitionSignals(enriched, previousSides).slice(0, TRANSITION_ROWS),
    [enriched, previousSides]
  );

  const squeezeSignals = useMemo(
    () => buildSqueezeSignals(enriched).slice(0, SQUEEZE_ROWS),
    [enriched]
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/10 pb-2">
          <span className="text-sm font-semibold text-slate-100">OI 異動 · 四象限地圖</span>
          <span className="text-xs text-slate-500">
            1H 持倉變化 × 價格變化 · 氣泡大小 = 變化金額 · 點擊幣種看分析
          </span>
        </div>
        <OiQuadrantChart movers={movers} onSelect={onSelect} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <TransitionPanel signals={transitionSignals} onSelect={onSelect} />
        <SqueezePanel signals={squeezeSignals} onSelect={onSelect} />
      </div>
    </div>
  );
}

function buildTransitionSignals(
  movers: EnrichedMover[],
  previousSides: Record<string, OiMoverSide>
): TransitionSignal[] {
  return movers
    .map((mover) => {
      const previousSide = previousSides[mover.symbol] ?? null;
      const changed = Boolean(previousSide && previousSide !== mover.side);
      const momentum =
        Math.min(38, Math.abs(mover.oi_change_1h) * 560) +
        Math.min(30, Math.abs(mover.price_change_1h ?? 0) * 520) +
        Math.min(16, Math.abs(mover.change_24h) * 42) +
        Math.min(12, Math.abs(mover.oi_delta) / Math.max(1, mover.total_oi) * 120);

      const pressureBonus =
        Math.min(10, Math.abs(mover.funding_rate) * 28000) +
        Math.min(8, Math.abs(mover.account_ratio - 1) * 10);
      const priority = momentum + pressureBonus + (changed ? 45 : 0);
      const route = changed
        ? `${previousSide} → ${mover.side}`
        : transitionRoute(mover);

      return {
        symbol: mover.symbol,
        side: mover.side,
        previousSide: changed ? previousSide : null,
        route,
        label: changed ? "象限切換" : transitionLabel(mover),
        reason: transitionReason(mover, changed),
        priority,
        oiChange: mover.oi_change_1h,
        priceChange: mover.price_change_1h ?? 0,
        fundingRate: mover.funding_rate,
        accountRatio: mover.account_ratio
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

function buildSqueezeSignals(movers: EnrichedMover[]): SqueezeSignal[] {
  const signals = movers.flatMap((mover) => {
    const priceChange = mover.price_change_1h ?? 0;
    const oiStress = Math.min(23, Math.abs(mover.oi_change_1h) / 0.08 * 23);
    const shortSqueezeScore =
      Math.min(28, Math.max(0, priceChange) / 0.08 * 28) +
      oiStress +
      Math.min(18, Math.max(0, 1 - mover.account_ratio) / 0.35 * 18) +
      Math.min(14, Math.max(0, 0.0002 - mover.funding_rate) / 0.00035 * 14) +
      (mover.side === "空頭平倉" ? 17 : mover.side === "多頭建倉" ? 9 : 0);

    const longSqueezeScore =
      Math.min(28, Math.max(0, -priceChange) / 0.08 * 28) +
      oiStress +
      Math.min(18, Math.max(0, mover.account_ratio - 1) / 0.35 * 18) +
      Math.min(14, Math.max(0, mover.funding_rate + 0.0001) / 0.00045 * 14) +
      (mover.side === "多頭平倉" ? 17 : mover.side === "空頭建倉" ? 9 : 0);

    return [
      {
        symbol: mover.symbol,
        kind: "軋空" as const,
        score: clampScore(shortSqueezeScore),
        side: mover.side,
        reason:
          mover.side === "空頭平倉"
            ? "價格上推且 OI 下降，空方停損回補正在放大"
            : "價格逆勢上推，若散戶偏空延續，容易形成追價回補",
        oiChange: mover.oi_change_1h,
        priceChange,
        fundingRate: mover.funding_rate,
        accountRatio: mover.account_ratio
      },
      {
        symbol: mover.symbol,
        kind: "殺多" as const,
        score: clampScore(longSqueezeScore),
        side: mover.side,
        reason:
          mover.side === "多頭平倉"
            ? "價格下壓且 OI 下降，多方降槓桿壓力正在釋放"
            : "價格回落但 OI 增加，若多方仍擁擠，容易出現踩踏",
        oiChange: mover.oi_change_1h,
        priceChange,
        fundingRate: mover.funding_rate,
        accountRatio: mover.account_ratio
      }
    ];
  });

  return signals
    .sort((a, b) => b.score - a.score)
    .filter((signal, index, arr) => arr.findIndex((other) => other.symbol === signal.symbol) === index)
    .slice(0, SQUEEZE_ROWS);
}

function transitionRoute(mover: EnrichedMover): string {
  if (mover.side === "多頭建倉") return "資金進場 → 多方推進";
  if (mover.side === "空頭平倉") return "空方回補 → 接力觀察";
  if (mover.side === "空頭建倉") return "空方增壓 → 下壓測試";
  if (mover.side === "多頭平倉") return "多方降槓桿 → 風險釋放";
  return "持平區 → 等待突破";
}

function transitionLabel(mover: EnrichedMover): string {
  if (mover.side === "多頭建倉" && mover.funding_rate > 0.00025) return "多方偏熱";
  if (mover.side === "空頭建倉" && mover.funding_rate < -0.00015) return "空方偏熱";
  if (mover.side === "空頭平倉") return "回補加速";
  if (mover.side === "多頭平倉") return "降槓桿";
  if (mover.side === "多頭建倉") return "主動增倉";
  if (mover.side === "空頭建倉") return "主動壓制";
  return "結構觀察";
}

function transitionReason(mover: EnrichedMover, changed: boolean): string {
  if (changed) return "和上次掃描相比已切換象限，優先檢查是否為新一輪合約資金流向。";
  if (mover.side === "多頭建倉") return "價格與 OI 同步上升，偏向多方主動推進。";
  if (mover.side === "空頭平倉") return "價格上升但 OI 減少，偏向空方回補或趨勢後段。";
  if (mover.side === "空頭建倉") return "價格下跌且 OI 上升，偏向空方主動加壓。";
  if (mover.side === "多頭平倉") return "價格與 OI 同步下降，多方部位正在降槓桿。";
  return "OI 與價格變化接近中性，等待下一次放量。";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

function TransitionPanel({
  signals,
  onSelect
}: {
  signals: TransitionSignal[];
  onSelect: (symbol: string) => void;
}) {
  return (
    <section className="surface relative overflow-hidden rounded-lg p-4">
      <PanelParticles />
      <div className="relative z-10 flex flex-col gap-3">
        <PanelHeader
          icon={<RadioTower className="h-4 w-4" />}
          title="象限轉換監控"
          description="記錄上次掃描象限，優先顯示結構切換與 OI 動能放大的幣種"
          count={`${signals.length} 檔`}
        />

        {signals.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {signals.map((signal) => (
              <TransitionRow key={signal.symbol} signal={signal} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <EmptyState text="目前沒有足夠的 OI 轉換資料" />
        )}
      </div>
    </section>
  );
}

function SqueezePanel({
  signals,
  onSelect
}: {
  signals: SqueezeSignal[];
  onSelect: (symbol: string) => void;
}) {
  return (
    <section className="surface relative overflow-hidden rounded-lg p-4">
      <PanelParticles />
      <div className="relative z-10 flex flex-col gap-3">
        <PanelHeader
          icon={<Zap className="h-4 w-4" />}
          title="擠壓風險雷達"
          description="綜合價格 1H、OI、資金費率與散戶多空比"
          count={`${signals.length} 檔`}
        />

        {signals.length ? (
          <div className="flex flex-col gap-2">
            {signals.map((signal) => (
              <SqueezeRow key={`${signal.symbol}-${signal.kind}`} signal={signal} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <EmptyState text="目前沒有明顯擠壓風險" />
        )}
      </div>
    </section>
  );
}

function PanelHeader({
  icon,
  title,
  description,
  count
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  count: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-ember/25 bg-ember/10 text-ember shadow-[0_0_24px_rgba(76,194,255,0.14)]">
          {icon}
        </span>
        <span>
          <span className="block text-sm font-semibold text-slate-100">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
        </span>
      </div>
      <span className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs tabular-nums text-slate-300">
        {count}
      </span>
    </div>
  );
}

function TransitionRow({
  signal,
  onSelect
}: {
  signal: TransitionSignal;
  onSelect: (symbol: string) => void;
}) {
  const meta = SIDE_META[signal.side];
  const strength = Math.max(10, Math.min(99, Math.round(signal.priority)));

  return (
    <button
      type="button"
      onClick={() => onSelect(signal.symbol)}
      className="group relative overflow-hidden rounded-md border border-white/8 bg-white/[0.025] p-3 text-left transition hover:border-ember/35 hover:bg-ember/[0.055]"
    >
      <span
        className="pointer-events-none absolute inset-y-3 left-0 w-px opacity-80"
        style={{ background: meta.color, boxShadow: `0 0 18px ${meta.color}` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-slate-100">
              {shortSymbol(signal.symbol)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${meta.bg} ${meta.text}`}>
              {signal.label}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            {signal.previousSide ? (
              <>
                <span>{signal.previousSide}</span>
                <ArrowRight className="h-3 w-3 text-slate-600" />
                <span className={meta.text}>{signal.side}</span>
              </>
            ) : (
              <span>{signal.route}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-slate-500">動能</div>
          <div className="tabular-nums text-ember">{strength}</div>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{signal.reason}</p>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:grid-cols-4">
        <Metric label="OI 1H" value={formatPercent(signal.oiChange)} tone={percentTone(signal.oiChange)} />
        <Metric label="價格 1H" value={formatPercent(signal.priceChange)} tone={percentTone(signal.priceChange)} />
        <Metric label="資金費率" value={formatPercent(signal.fundingRate, 4)} tone={percentTone(signal.fundingRate)} />
        <Metric label="散戶比" value={signal.accountRatio.toFixed(2)} />
      </div>
    </button>
  );
}

function SqueezeRow({
  signal,
  onSelect
}: {
  signal: SqueezeSignal;
  onSelect: (symbol: string) => void;
}) {
  const isShortSqueeze = signal.kind === "軋空";
  const tone = isShortSqueeze ? "text-long" : "text-short";
  const color = isShortSqueeze ? "#23dd8d" : "#ff5166";

  return (
    <button
      type="button"
      onClick={() => onSelect(signal.symbol)}
      className="group rounded-md border border-white/8 bg-white/[0.025] p-3 text-left transition hover:border-ember/35 hover:bg-ember/[0.055]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-2 w-2 shrink-0 rounded-full"
              style={{ background: color, boxShadow: `0 0 14px ${color}` }}
            />
            <span className="truncate text-base font-semibold text-slate-100">
              {shortSymbol(signal.symbol)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${isShortSqueeze ? "bg-long/10 text-long" : "bg-short/10 text-short"}`}>
              {signal.kind}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{signal.reason}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-slate-500">指數</div>
          <div className={`tabular-nums ${tone}`}>{signal.score}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <span
            key={index}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background:
                index < Math.ceil(signal.score / 12.5)
                  ? color
                  : "rgba(255,255,255,0.07)",
              boxShadow: index < Math.ceil(signal.score / 12.5) ? `0 0 10px ${color}55` : "none"
            }}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <Metric label="價格 1H" value={formatPercent(signal.priceChange)} tone={percentTone(signal.priceChange)} />
        <Metric label="OI 1H" value={formatPercent(signal.oiChange)} tone={percentTone(signal.oiChange)} />
        <Metric label="費率" value={formatPercent(signal.fundingRate, 4)} tone={percentTone(signal.fundingRate)} />
        <Metric label="散戶比" value={signal.accountRatio.toFixed(2)} />
      </div>
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-slate-600">{label}</span>
      <span className={`shrink-0 tabular-nums ${tone ?? "text-slate-300"}`}>{value}</span>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="surface-sunken flex min-h-28 items-center justify-center rounded-md px-4 py-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

function PanelParticles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(76,194,255,0.11),transparent_28%),linear-gradient(115deg,transparent_0_46%,rgba(76,194,255,0.06)_50%,transparent_56%)]" />
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="absolute animate-pulse rounded-full bg-ember"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
            animationDelay: particle.delay,
            boxShadow: "0 0 10px rgba(76,194,255,0.75)"
          }}
        />
      ))}
    </div>
  );
}
