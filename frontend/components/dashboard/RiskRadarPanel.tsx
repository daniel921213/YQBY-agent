"use client";

import { Activity, AlertTriangle, Clock } from "lucide-react";
import type { EvidenceDirection, RiskRadarItem, RiskRadarPayload, RiskSeverity } from "@/lib/types";
import { formatCompactNumber, formatPercent, percentTone } from "@/lib/format";

interface RiskRadarPanelProps {
  radar?: RiskRadarPayload | null;
  onSelect: (symbol: string) => void;
}

const SEVERITY: Record<RiskSeverity, { label: string; tone: string }> = {
  HIGH: { label: "高風險", tone: "border-short/45 bg-short/15 text-short" },
  MEDIUM: { label: "中風險", tone: "border-yellow-300/40 bg-yellow-300/10 text-yellow-300" },
  LOW: { label: "低風險", tone: "border-ember/35 bg-ember/10 text-ember" }
};

const DIRECTION: Record<EvidenceDirection, { label: string; tone: string }> = {
  LONG: { label: "偏多", tone: "bg-long/10 text-long" },
  SHORT: { label: "偏空", tone: "bg-short/10 text-short" },
  NEUTRAL: { label: "中性", tone: "bg-white/5 text-slate-400" }
};

const STATE_LABELS: Record<string, string> = {
  LONG_BUILDUP: "多頭增倉",
  SHORT_BUILDUP: "空頭增倉",
  SHORT_COVERING: "空頭回補",
  LONG_LIQUIDATION: "多頭去槓桿",
  LONG_LIQUIDATION_SPIKE: "多單爆倉升溫",
  SHORT_LIQUIDATION_SPIKE: "空單爆倉升溫",
  BUY_ABSORPTION: "買盤疑似被吸收",
  SELL_ABSORPTION: "賣盤疑似被吸收",
  BUY_EXHAUSTION: "買方疲乏",
  SELL_EXHAUSTION: "賣方疲乏",
  FLOW_DIVERGENCE: "價格與主動流背離",
  LIQUIDATION_SPIKE: "爆倉強度升高",
  NEUTRAL: "中性觀察"
};

const FLAG_LABELS: Record<string, string> = {
  OI_SPIKE: "OI 異動",
  BUY_FLOW_DOMINANT: "買方主動流",
  SELL_FLOW_DOMINANT: "賣方主動流",
  LONG_LIQUIDATION_SPIKE: "多單爆倉",
  SHORT_LIQUIDATION_SPIKE: "空單爆倉",
  ABSORPTION: "疑似吸收",
  EXHAUSTION: "疑似疲乏",
  OFFICIAL_CONFLICT: "與正式方向衝突"
};

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-3 align-top";

export function RiskRadarPanel({ radar, onSelect }: RiskRadarPanelProps) {
  const items = radar?.items ?? [];
  const highCount = items.filter((item) => item.severity === "HIGH").length;

  return (
    <section className="surface relative overflow-hidden rounded-lg p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,81,102,0.10),transparent_32%),radial-gradient(circle_at_92%_8%,rgba(76,194,255,0.10),transparent_30%)]" />
      <div className="relative z-10 flex flex-col gap-3">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ember/30 bg-ember/10 text-ember">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-100">5m 已收盤風險雷達（不改正式 15m 分數）</h2>
                <span className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs tabular-nums text-slate-400">{items.length} 件事件</span>
                {radar?.scanned_count !== undefined ? (
                  <span className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs tabular-nums text-slate-500">
                    覆蓋 {radar.covered_count ?? 0}/{radar.scanned_count}
                  </span>
                ) : null}
                {highCount > 0 ? <span className="rounded-sm border border-short/35 bg-short/10 px-1.5 py-0.5 text-xs text-short">高風險 {highCount}</span> : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">僅用已收盤 5m 資料提早標示 OI、主動流與爆倉風險；它是觀察提醒，不會加減正式評分。</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span>雷達時間</span>
            <time dateTime={dateTimeValue(radar?.generated_at)}>{formatEventTime(radar?.generated_at)}</time>
          </div>
        </header>

        {!radar ? (
          <Empty title="5m 雷達資料尚未送達" description="目前仍可正常使用 Gate Futures 的正式 15m 已收盤評分。" />
        ) : items.length === 0 ? (
          <Empty title="目前沒有達到門檻的 5m 風險事件" description="最新已收盤資料未觸發提醒；正式 15m 評分不受影響。" />
        ) : (
          <div className="surface-sunken overflow-x-auto rounded-lg">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs tracking-wide text-slate-500">
                  <th className={TH}>事件</th><th className={TH}>方向／風險</th>
                  <th className={`${TH} text-right`}>近 15m 價格</th><th className={`${TH} text-right`}>近 15m OI 數量</th>
                  <th className={`${TH} text-right`}>爆倉強度</th><th className={`${TH} text-right`}>主動流</th>
                  <th className={TH}>事件時間</th><th className={TH}>衝突／旗標</th>
                </tr>
              </thead>
              <tbody>{items.map((item, index) => <RiskRow key={`${item.symbol}-${item.event_time}-${item.state}-${index}`} item={item} onSelect={onSelect} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function RiskRow({ item, onSelect }: { item: RiskRadarItem; onSelect: (symbol: string) => void }) {
  const severity = SEVERITY[item.severity];
  const direction = DIRECTION[item.direction];
  return (
    <tr className="border-b border-white/5 transition last:border-0 hover:bg-ember/[0.05]">
      <td className={TD}>
        <button type="button" onClick={() => onSelect(item.symbol)} className="text-left transition hover:text-ember" title={`查看 ${item.symbol} 正式 15m 分析`}>
          <span className="block font-semibold text-slate-50">{shortSymbol(item.symbol)}</span>
          <span className="mt-1 block max-w-[190px] text-xs leading-4 text-slate-400">{codeLabel(item.state, STATE_LABELS)}</span>
        </button>
      </td>
      <td className={TD}><div className="flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${direction.tone}`}>{direction.label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severity.tone}`}>{severity.label}</span>
      </div></td>
      <td className={`${TD} text-right font-medium tabular-nums ${percentTone(item.price_change_pct)}`}>{formatPercent(item.price_change_pct)}</td>
      <td className={`${TD} text-right font-medium tabular-nums ${percentTone(item.oi_qty_change_pct)}`}>{formatPercent(item.oi_qty_change_pct)}</td>
      <td className={`${TD} text-right`}>
        <span className="block font-medium tabular-nums text-slate-200">{formatPercent(item.liquidation_intensity)}</span>
        <span className="mt-1 block whitespace-nowrap text-[11px] tabular-nums text-slate-500">多 {formatUsd(item.long_liq_usd)} · 空 {formatUsd(item.short_liq_usd)}</span>
        {item.liquidation_to_volume && item.liquidation_to_volume > 0 ? (
          <span className="mt-0.5 block whitespace-nowrap text-[11px] tabular-nums text-slate-600">
            佔 1H 成交額 {formatPercent(item.liquidation_to_volume)}
          </span>
        ) : null}
      </td>
      <td className={`${TD} text-right`}><span className={`font-medium tabular-nums ${flowTone(item.flow_imbalance)}`}>{flowLabel(item.flow_imbalance)}</span></td>
      <td className={`${TD} whitespace-nowrap text-xs tabular-nums text-slate-400`}><time dateTime={dateTimeValue(item.event_time)}>{formatEventTime(item.event_time)}</time></td>
      <td className={TD}><div className="flex max-w-[280px] flex-wrap gap-1.5">
        <span className={`rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${item.conflicts_official ? "border-short/40 bg-short/10 text-short" : "border-long/25 bg-long/5 text-long"}`}>
          {item.conflicts_official ? "與 15m 正式方向衝突" : "未與 15m 正式方向衝突"}
        </span>
        {item.data_quality ? (
          <span className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-500">
            資料 {item.data_quality}
          </span>
        ) : null}
        {item.flags.map((flag) => <span key={flag} className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">{codeLabel(flag, FLAG_LABELS)}</span>)}
      </div></td>
    </tr>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="surface-sunken flex min-h-28 items-center justify-center rounded-lg px-4 py-6 text-center"><div>
    <AlertTriangle className="mx-auto h-5 w-5 text-slate-500" /><p className="mt-2 text-sm font-medium text-slate-300">{title}</p><p className="mt-1 text-xs text-slate-500">{description}</p>
  </div></div>;
}

function codeLabel(value: string, labels: Record<string, string>): string {
  return labels[value.trim().toUpperCase()] ?? value.replaceAll("_", " ");
}

function flowLabel(value: number): string {
  if (value > 0.005) return `買方 ${formatPercent(value)}`;
  if (value < -0.005) return `賣方 ${formatPercent(value)}`;
  return `平衡 ${formatPercent(value)}`;
}

function flowTone(value: number): string {
  return value > 0.005 ? "text-long" : value < -0.005 ? "text-short" : "text-slate-400";
}

function formatUsd(value: number): string { return `$${formatCompactNumber(Math.max(0, value))}`; }

function formatEventTime(value?: string | number): string {
  if (!value) return "--";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && /^\d+$/.test(String(value)) ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function dateTimeValue(value?: string | number): string | undefined {
  return value === undefined || value === "" ? undefined : String(value);
}

function shortSymbol(symbol: string): string { return symbol.replace(/USDT$/, ""); }
