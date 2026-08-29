"use client";

import { useMemo, useState } from "react";
import { ArrowRight, RadioTower, ShieldCheck, Zap } from "lucide-react";
import type { OiMover, OiMoverSide, RiskRadarPayload, ScreenerRow } from "@/lib/types";
import { formatCompactNumber, formatPercent, percentTone } from "@/lib/format";
import { OiQuadrantChart } from "@/components/dashboard/OiQuadrantChart";
import { RiskRadarPanel } from "@/components/dashboard/RiskRadarPanel";

interface DataRankingsProps {
  universe: ScreenerRow[];
  movers: OiMover[];
  riskRadar?: RiskRadarPayload | null;
  dataProvider?: string;
  primaryTimeframe?: string;
  officialCloseTime?: number | null;
  onSelect: (symbol: string) => void;
}

interface EnrichedMover extends OiMover {
  funding_rate: number;
  account_ratio: number;
  account_ratio_avg: number;
}

interface TransitionSignal {
  symbol: string;
  side: OiMoverSide;
  previousSide: OiMoverSide | null;
  label: string;
  reason: string;
  priority: number;
  oiChange: number;
  priceChange: number;
  fundingRate: number;
  liqUsd1h: number;
}

type SqueezeKind = "軋空" | "殺多";

interface SqueezeSignal {
  symbol: string;
  kind: SqueezeKind;
  score: number;
  reason: string;
  oiChange: number;
  priceChange: number;
  fundingRate: number;
  ratioDeviation: number;
  liqUsd1h: number; // 被擠壓那一方的實際爆倉金額
}

const TRANSITION_ROWS = 8;
const SQUEEZE_ROWS = 6;
// 指數低於這條線就不上榜——安靜的市場該顯示「沒有風險」，而不是硬湊名單。
const SQUEEZE_MIN_SCORE = 40;

const SIDE_META: Record<OiMoverSide, { color: string; text: string; bg: string }> = {
  多頭建倉: { color: "#23dd8d", text: "text-long", bg: "bg-long/10" },
  空頭建倉: { color: "#ff5166", text: "text-short", bg: "bg-short/10" },
  空頭回補: { color: "#4cc2ff", text: "text-ember", bg: "bg-ember/10" },
  多頭去槓桿: { color: "#f0b429", text: "text-yellow-300", bg: "bg-yellow-300/10" },
  "OI增倉／價格持平": { color: "#a78bfa", text: "text-violet-300", bg: "bg-violet-400/10" },
  "OI減倉／價格持平": { color: "#94a3b8", text: "text-slate-300", bg: "bg-white/5" },
  "價格上漲／OI持平": { color: "#67e8f9", text: "text-cyan-300", bg: "bg-cyan-400/10" },
  "價格下跌／OI持平": { color: "#fb7185", text: "text-rose-300", bg: "bg-rose-400/10" },
  // Cached labels from the previous four-quadrant API.
  空頭平倉: { color: "#4cc2ff", text: "text-ember", bg: "bg-ember/10" },
  多頭平倉: { color: "#f0b429", text: "text-yellow-300", bg: "bg-yellow-300/10" },
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

type RadarTab = "transition" | "squeeze";

const TAB_META: Record<RadarTab, { icon: React.ReactNode; title: string; description: string }> = {
  transition: {
    icon: <RadioTower className="h-3.5 w-3.5" />,
    title: "象限轉換監控",
    description: "基準＝上一輪掃描（約 5 分鐘）；切換象限的幣優先，其餘依 1H 動能排序"
  },
  squeeze: {
    icon: <Zap className="h-3.5 w-3.5" />,
    title: "擠壓風險雷達",
    description: "價格 × OI × 費率 × 全體帳戶偏離 × 實際爆倉；指數 ≥ 40 才上榜"
  }
};

export function DataRankings({
  universe,
  movers,
  riskRadar,
  dataProvider,
  primaryTimeframe,
  officialCloseTime,
  onSelect
}: DataRankingsProps) {
  const [tab, setTab] = useState<RadarTab>("transition");

  const enriched = useMemo(() => {
    const rowsBySymbol = new Map(universe.map((row) => [row.symbol, row]));
    return movers.map<EnrichedMover>((mover) => {
      const row = rowsBySymbol.get(mover.symbol);
      return {
        ...mover,
        funding_rate: row?.funding_rate ?? 0,
        account_ratio: row?.account_ratio ?? 1,
        account_ratio_avg: row?.account_ratio_avg ?? 1
      };
    });
  }, [movers, universe]);

  const transitionSignals = useMemo(
    () => buildTransitionSignals(enriched).slice(0, TRANSITION_ROWS),
    [enriched]
  );

  const squeezeSignals = useMemo(() => buildSqueezeSignals(enriched), [enriched]);

  const counts: Record<RadarTab, number> = {
    transition: transitionSignals.length,
    squeeze: squeezeSignals.length
  };

  return (
    <div className="flex flex-col gap-5">
      <ScoreBasisNotice
        dataProvider={dataProvider}
        primaryTimeframe={primaryTimeframe}
        officialCloseTime={officialCloseTime}
      />

      <RiskRadarPanel radar={riskRadar} onSelect={onSelect} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/10 pb-2">
          <span className="text-sm font-semibold text-slate-100">OI 異動 · 資金流向反應爐</span>
          <span className="text-xs text-slate-500">
            四個主要狀態 × 四條持平通道 × 低變動區 · 點擊節點鎖定訊號
          </span>
        </div>
        <OiQuadrantChart movers={movers} onSelect={onSelect} />
      </section>

      {/* 單一全寬面板 + 內部 TAB：兩份榜單同一種表格節奏，不再左右互相拖累。 */}
      <section className="surface relative overflow-hidden rounded-lg p-4">
        <PanelParticles />
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="inline-flex overflow-hidden rounded-md border border-white/10">
              {(Object.keys(TAB_META) as RadarTab[]).map((key) => {
                const meta = TAB_META[key];
                const active = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm transition ${
                      active
                        ? "bg-ember/15 text-ember"
                        : "bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    {meta.icon}
                    {meta.title}
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-xs tabular-nums ${
                        active ? "bg-ember/15 text-ember" : "bg-white/5 text-slate-500"
                      }`}
                    >
                      {counts[key]}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-500">{TAB_META[tab].description}</span>
          </div>

          {tab === "transition" ? (
            <TransitionTable signals={transitionSignals} onSelect={onSelect} />
          ) : (
            <SqueezeTable signals={squeezeSignals} onSelect={onSelect} />
          )}
        </div>
      </section>
    </div>
  );
}

function ScoreBasisNotice({
  dataProvider,
  primaryTimeframe,
  officialCloseTime
}: {
  dataProvider?: string;
  primaryTimeframe?: string;
  officialCloseTime?: number | null;
}) {
  const source = providerLabel(dataProvider);
  const timeframe = primaryTimeframe || "15m";

  return (
    <section className="surface-sunken flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-long/30 bg-long/10 text-long">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.14em] text-slate-500">正式評分基準</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-100">
          {source} · {timeframe} 已收盤正式評分
        </p>
        {officialCloseTime ? (
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
            正式資料截止 {formatCloseTime(officialCloseTime)}
          </p>
        ) : null}
      </div>
      <span className="ml-auto text-xs leading-5 text-slate-500">
        5m 雷達是獨立風險提醒，不參與正式分數或方向判定
      </span>
    </section>
  );
}

function providerLabel(provider?: string): string {
  if (!provider) return "Gate Futures";
  const normalized = provider.toLowerCase();
  if (normalized.includes("gate")) return "Gate Futures";
  if (normalized.includes("binance")) return "Binance Futures";
  return `${provider} Futures`;
}

function formatCloseTime(epochSeconds: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(epochSeconds * 1000));
}

function buildTransitionSignals(movers: EnrichedMover[]): TransitionSignal[] {
  return movers
    .filter((mover) => mover.side !== "持平" || mover.previous_side)
    .map((mover) => {
      const changed = Boolean(mover.previous_side);
      const liqUsd1h = mover.long_liq_usd_1h + mover.short_liq_usd_1h;
      const momentum =
        Math.min(38, Math.abs(mover.oi_change_1h) * 560) +
        Math.min(30, Math.abs(mover.price_change_1h ?? 0) * 520) +
        Math.min(16, Math.abs(mover.change_24h) * 42) +
        Math.min(12, (Math.abs(mover.oi_delta) / Math.max(1, mover.total_oi)) * 120);
      const pressureBonus =
        Math.min(10, Math.abs(mover.funding_rate) * 28000) +
        Math.min(8, (liqUsd1h / Math.max(1, mover.total_oi)) / 0.002 * 8);
      const priority = momentum + pressureBonus + (changed ? 45 : 0);

      return {
        symbol: mover.symbol,
        side: mover.side,
        previousSide: mover.previous_side,
        label: changed ? "切換" : transitionLabel(mover),
        reason: transitionReason(mover, changed),
        priority,
        oiChange: mover.oi_change_1h,
        priceChange: mover.price_change_1h ?? 0,
        fundingRate: mover.funding_rate,
        liqUsd1h
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

function buildSqueezeSignals(movers: EnrichedMover[]): SqueezeSignal[] {
  const signals = movers.flatMap<SqueezeSignal>((mover) => {
    const priceChange = mover.price_change_1h ?? 0;
    const oiStress = Math.min(18, (Math.abs(mover.oi_change_1h) / 0.08) * 18);
    // 全體帳戶擁擠以「這個幣自己的常態」為基準，不假設它是純散戶資料。
    const ratioDeviation = mover.account_ratio - mover.account_ratio_avg;
    // 實際爆倉：1 小時內爆掉 OI 的 0.2% 就拿滿分——從「推測會爆」升級成「已在爆」。
    const shortLiqPts = Math.min(20, (mover.short_liq_usd_1h / Math.max(1, mover.total_oi)) / 0.002 * 20);
    const longLiqPts = Math.min(20, (mover.long_liq_usd_1h / Math.max(1, mover.total_oi)) / 0.002 * 20);

    const shortSqueezeScore =
      Math.min(24, (Math.max(0, priceChange) / 0.08) * 24) +
      oiStress +
      Math.min(16, (Math.max(0, -ratioDeviation) / 0.3) * 16) +
      Math.min(12, (Math.max(0, 0.0002 - mover.funding_rate) / 0.00035) * 12) +
      shortLiqPts +
      (["空頭回補", "空頭平倉"].includes(mover.side) ? 14 : mover.side === "多頭建倉" ? 7 : 0);

    const longSqueezeScore =
      Math.min(24, (Math.max(0, -priceChange) / 0.08) * 24) +
      oiStress +
      Math.min(16, (Math.max(0, ratioDeviation) / 0.3) * 16) +
      Math.min(12, (Math.max(0, mover.funding_rate + 0.0001) / 0.00045) * 12) +
      longLiqPts +
      (["多頭去槓桿", "多頭平倉"].includes(mover.side) ? 14 : mover.side === "空頭建倉" ? 7 : 0);

    return [
      {
        symbol: mover.symbol,
        kind: "軋空" as const,
        score: clampScore(shortSqueezeScore),
        reason:
          mover.short_liq_usd_1h > 0 && shortLiqPts >= 8
            ? "空單已在實際爆倉，價格上推會加速回補"
            : ["空頭回補", "空頭平倉"].includes(mover.side)
              ? "價格上推且 OI 下降，空方停損回補正在放大"
              : "價格逆勢上推，若空方擁擠延續，容易形成追價回補",
        oiChange: mover.oi_change_1h,
        priceChange,
        fundingRate: mover.funding_rate,
        ratioDeviation,
        liqUsd1h: mover.short_liq_usd_1h
      },
      {
        symbol: mover.symbol,
        kind: "殺多" as const,
        score: clampScore(longSqueezeScore),
        reason:
          mover.long_liq_usd_1h > 0 && longLiqPts >= 8
            ? "多單已在實際爆倉，價格下壓會引發踩踏"
            : ["多頭去槓桿", "多頭平倉"].includes(mover.side)
              ? "價格下壓且 OI 下降，多方降槓桿壓力正在釋放"
              : "價格回落但 OI 增加，若多方仍擁擠，容易出現踩踏",
        oiChange: mover.oi_change_1h,
        priceChange,
        fundingRate: mover.funding_rate,
        ratioDeviation,
        liqUsd1h: mover.long_liq_usd_1h
      }
    ];
  });

  return signals
    .filter((signal) => signal.score >= SQUEEZE_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter(
      (signal, index, arr) => arr.findIndex((other) => other.symbol === signal.symbol) === index
    )
    .slice(0, SQUEEZE_ROWS);
}

function transitionLabel(mover: EnrichedMover): string {
  if (mover.side === "多頭建倉" && mover.funding_rate > 0.00025) return "多方偏熱";
  if (mover.side === "空頭建倉" && mover.funding_rate < -0.00015) return "空方偏熱";
  if (["空頭回補", "空頭平倉"].includes(mover.side)) return "回補加速";
  if (["多頭去槓桿", "多頭平倉"].includes(mover.side)) return "降槓桿";
  if (mover.side === "多頭建倉") return "主動增倉";
  if (mover.side === "空頭建倉") return "主動壓制";
  if (mover.side === "OI增倉／價格持平") return "增倉待表態";
  if (mover.side === "OI減倉／價格持平") return "去槓桿待表態";
  if (mover.side === "價格上漲／OI持平") return "價格先行";
  if (mover.side === "價格下跌／OI持平") return "價格先跌";
  return "觀察";
}

function transitionReason(mover: EnrichedMover, changed: boolean): string {
  if (changed) return "與上一輪掃描（約 5 分鐘前）相比已切換象限，優先檢查是否為新一輪資金流向。";
  if (mover.side === "多頭建倉") return "價格與 OI 同步上升，偏向多方主動推進。";
  if (["空頭回補", "空頭平倉"].includes(mover.side)) return "價格上升但 OI 減少，這是空方回補／去槓桿，不是新多單。";
  if (mover.side === "空頭建倉") return "價格下跌且 OI 上升，偏向空方主動加壓。";
  if (["多頭去槓桿", "多頭平倉"].includes(mover.side)) return "價格與 OI 同步下降，多方部位正在降槓桿；不是自動抄底訊號。";
  if (mover.side === "OI增倉／價格持平") return "OI 增加但價格仍在 deadband，方向尚未確認。";
  if (mover.side === "OI減倉／價格持平") return "OI 減少但價格持平，槓桿退出、方向未明。";
  if (mover.side === "價格上漲／OI持平") return "價格上漲但沒有明顯新合約進場。";
  if (mover.side === "價格下跌／OI持平") return "價格下跌但沒有明顯新空頭部位確認。";
  return "OI 與價格變化接近中性，等待下一次放量。";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

const TH_CLASS = "px-3 py-2 font-medium";
const TD_CLASS = "px-3 py-2.5";

function TransitionTable({
  signals,
  onSelect
}: {
  signals: TransitionSignal[];
  onSelect: (symbol: string) => void;
}) {
  if (!signals.length) {
    return <EmptyState text="目前沒有足夠的 OI 轉換資料" />;
  }
  return (
    <div className="surface-sunken overflow-x-auto rounded-lg">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs tracking-wide text-slate-500">
            <th className={TH_CLASS}>幣種</th>
            <th className={TH_CLASS}>路徑</th>
            <th className={`${TH_CLASS} text-right`}>OI 1H</th>
            <th className={`${TH_CLASS} text-right`}>價格 1H</th>
            <th className={`${TH_CLASS} text-right`}>費率</th>
            <th className={`${TH_CLASS} text-right`}>1H 爆倉</th>
            <th className={`${TH_CLASS} text-right`}>動能</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => {
            const changed = Boolean(signal.previousSide);
            return (
              <tr
                key={signal.symbol}
                onClick={() => onSelect(signal.symbol)}
                title={signal.reason}
                className={`cursor-pointer border-b border-white/5 transition last:border-0 hover:bg-ember/[0.06] ${
                  changed ? "bg-ember/[0.04]" : ""
                }`}
              >
                <td className={`${TD_CLASS} font-semibold text-slate-50`}>
                  {shortSymbol(signal.symbol)}
                </td>
                <td className={TD_CLASS}>
                  {signal.previousSide ? (
                    <span className="inline-flex items-center gap-1.5">
                      <SideChip side={signal.previousSide} muted />
                      <ArrowRight className="h-3.5 w-3.5 text-ember" />
                      <SideChip side={signal.side} />
                      <span className="animate-ember-pulse rounded-sm border border-ember/45 bg-ember/15 px-1.5 py-px text-xs font-medium text-ember">
                        切換
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <SideChip side={signal.side} />
                      <span className="text-xs text-slate-500">{signal.label}</span>
                    </span>
                  )}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums ${percentTone(signal.oiChange)}`}>
                  {formatPercent(signal.oiChange)}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums ${percentTone(signal.priceChange)}`}>
                  {formatPercent(signal.priceChange)}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums ${percentTone(signal.fundingRate)}`}>
                  {formatPercent(signal.fundingRate, 4)}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums text-slate-300`}>
                  {signal.liqUsd1h > 0 ? `$${formatCompactNumber(signal.liqUsd1h)}` : "--"}
                </td>
                <td className={`${TD_CLASS} text-right font-semibold tabular-nums text-ember`}>
                  {Math.max(10, Math.min(99, Math.round(signal.priority)))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SqueezeTable({
  signals,
  onSelect
}: {
  signals: SqueezeSignal[];
  onSelect: (symbol: string) => void;
}) {
  if (!signals.length) {
    return <EmptyState text="目前沒有明顯擠壓風險（所有幣種指數低於 40）" />;
  }
  return (
    <div className="surface-sunken overflow-x-auto rounded-lg">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs tracking-wide text-slate-500">
            <th className={TH_CLASS}>幣種</th>
            <th className={TH_CLASS}>類型</th>
            <th className={TH_CLASS}>指數</th>
            <th className={`${TH_CLASS} text-right`}>爆倉 1H</th>
            <th className={`${TH_CLASS} text-right`}>價格 1H</th>
            <th className={`${TH_CLASS} text-right`}>費率</th>
            <th className={`${TH_CLASS} text-right`} title="全體帳戶多空比相對其近 9 小時常態的偏離">
              全體帳戶偏離
            </th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => {
            const isShortSqueeze = signal.kind === "軋空";
            const tone = isShortSqueeze ? "text-long" : "text-short";
            const color = isShortSqueeze ? "#23dd8d" : "#ff5166";
            return (
              <tr
                key={`${signal.symbol}-${signal.kind}`}
                onClick={() => onSelect(signal.symbol)}
                title={signal.reason}
                className="cursor-pointer border-b border-white/5 transition last:border-0 hover:bg-ember/[0.06]"
              >
                <td className={`${TD_CLASS} font-semibold text-slate-50`}>
                  {shortSymbol(signal.symbol)}
                </td>
                <td className={TD_CLASS}>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      isShortSqueeze ? "bg-long/10 text-long" : "bg-short/10 text-short"
                    }`}
                  >
                    {signal.kind}
                  </span>
                </td>
                <td className={TD_CLASS}>
                  <span className="inline-flex items-center gap-2.5">
                    <span className={`w-6 text-right font-semibold tabular-nums ${tone}`}>
                      {signal.score}
                    </span>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${signal.score}%`,
                          background: `linear-gradient(90deg, ${color}55, ${color})`,
                          boxShadow: `0 0 10px ${color}66`
                        }}
                      />
                    </span>
                  </span>
                </td>
                <td
                  className={`${TD_CLASS} text-right tabular-nums ${
                    signal.liqUsd1h > 0 ? tone : "text-slate-500"
                  }`}
                >
                  {signal.liqUsd1h > 0 ? `$${formatCompactNumber(signal.liqUsd1h)}` : "--"}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums ${percentTone(signal.priceChange)}`}>
                  {formatPercent(signal.priceChange)}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums ${percentTone(signal.fundingRate)}`}>
                  {formatPercent(signal.fundingRate, 4)}
                </td>
                <td className={`${TD_CLASS} text-right tabular-nums text-slate-300`}>
                  {signal.ratioDeviation >= 0 ? "+" : ""}
                  {signal.ratioDeviation.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SideChip({ side, muted = false }: { side: OiMoverSide; muted?: boolean }) {
  const meta = SIDE_META[side];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        muted ? "bg-white/5 text-slate-500" : `${meta.bg} ${meta.text}`
      }`}
    >
      {side}
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
