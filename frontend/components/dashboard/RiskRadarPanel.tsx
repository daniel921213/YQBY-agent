"use client";

import { useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Clock, ListFilter } from "lucide-react";
import type { EvidenceDirection, RiskRadarItem, RiskRadarPayload, RiskSeverity } from "@/lib/types";
import { formatCompactNumber, formatPercent, percentTone } from "@/lib/format";
import { ModalShell } from "@/components/dashboard/ModalShell";

interface RiskRadarPanelProps {
  radar?: RiskRadarPayload | null;
  onSelect: (symbol: string) => void;
}

const SEVERITY: Record<RiskSeverity, { label: string; tone: string }> = {
  HIGH: { label: "高警戒", tone: "border-short/45 bg-short/15 text-short" },
  MEDIUM: { label: "需注意", tone: "border-yellow-300/40 bg-yellow-300/10 text-yellow-300" },
  LOW: { label: "一般觀察", tone: "border-ember/35 bg-ember/10 text-ember" }
};

const DIRECTION: Record<EvidenceDirection, { label: string; tone: string }> = {
  LONG: { label: "短線偏多", tone: "bg-long/10 text-long" },
  SHORT: { label: "短線偏空", tone: "bg-short/10 text-short" },
  NEUTRAL: { label: "短線中性", tone: "bg-white/5 text-slate-400" }
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
const DEFAULT_ROWS = 3;
const EXPANDED_ROWS = 6;

export function RiskRadarPanel({ radar, onSelect }: RiskRadarPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const items = radar?.items ?? [];
  const highCount = items.filter((item) => item.severity === "HIGH").length;
  const conflictCount = items.filter((item) => item.conflicts_official).length;
  const liquidationCount = items.filter((item) =>
    item.flags.some((flag) => flag.includes("爆倉"))
  ).length;
  const visibleItems = items.slice(0, expanded ? EXPANDED_ROWS : DEFAULT_ROWS);

  const selectFromModal = (symbol: string) => {
    setAllOpen(false);
    onSelect(symbol);
  };

  return (
    <>
      <section className="surface relative overflow-hidden rounded-lg px-4 py-3">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,81,102,0.10),transparent_32%),radial-gradient(circle_at_92%_8%,rgba(76,194,255,0.10),transparent_30%)]" />
        <div className="relative z-10 flex flex-col gap-2.5">
          <header className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ember/30 bg-ember/10 text-ember">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100">5m 短線狀態雷達</h2>
              <p className="text-[11px] text-slate-500">已收盤提醒，不改正式 15m 分數</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {highCount > 0 ? (
                <span className="rounded-sm border border-short/35 bg-short/10 px-2 py-1 text-short">高警戒 {highCount}</span>
              ) : (
                <span className="rounded-sm border border-long/25 bg-long/5 px-2 py-1 text-long">目前無高警戒</span>
              )}
              <span className="rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-slate-400">方向衝突 {conflictCount}</span>
              <span className="rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-slate-400">爆倉 {liquidationCount}</span>
              {radar?.scanned_count !== undefined ? (
                <span className="rounded-sm border border-white/10 bg-white/5 px-2 py-1 tabular-nums text-slate-500">
                  覆蓋 {radar.covered_count ?? 0}/{radar.scanned_count}
                </span>
              ) : null}
            </div>
            <div className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <time dateTime={dateTimeValue(radar?.generated_at)}>{formatEventTime(radar?.generated_at)}</time>
            </div>
          </header>

          {!radar ? (
            <CompactEmpty text="5m 雷達資料尚未送達，正式 15m 評分仍可正常使用。" />
          ) : items.length === 0 ? (
            <CompactEmpty text="目前沒有達到門檻的 5m 警戒事件。" />
          ) : (
            <>
              <ul className="surface-sunken divide-y divide-white/5 overflow-hidden rounded-lg">
                {visibleItems.map((item, index) => {
                  const key = riskKey(item, index);
                  return (
                    <CompactRiskRow
                      key={key}
                      item={item}
                      open={detailKey === key}
                      onToggle={() => setDetailKey(detailKey === key ? null : key)}
                      onSelect={onSelect}
                    />
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {items.length > DEFAULT_ROWS ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-ember/40 hover:text-ember"
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expanded ? "收合" : `展開前 ${Math.min(EXPANDED_ROWS, items.length)} 筆`}
                  </button>
                ) : null}
                {items.length > EXPANDED_ROWS ? (
                  <button
                    type="button"
                    onClick={() => setAllOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs text-ember transition hover:border-ember/60"
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                    查看全部 {items.length} 筆
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      {allOpen ? (
        <ModalShell
          title="5m 短線狀態雷達"
          subtitle={`完整 ${items.length} 筆 · 不改正式 15m 分數`}
          icon={<Activity className="h-4 w-4" />}
          onClose={() => setAllOpen(false)}
          widthClass="max-w-7xl"
        >
          <RiskTable items={items} onSelect={selectFromModal} />
        </ModalShell>
      ) : null}
    </>
  );
}

function CompactRiskRow({
  item,
  open,
  onToggle,
  onSelect
}: {
  item: RiskRadarItem;
  open: boolean;
  onToggle: () => void;
  onSelect: (symbol: string) => void;
}) {
  const severity = SEVERITY[item.severity];
  const direction = DIRECTION[item.direction];
  const flags = displayFlags(item);

  return (
    <li className="px-3 py-2.5 transition hover:bg-ember/[0.04]">
      <div className="grid items-center gap-2 sm:grid-cols-[110px_minmax(180px,1fr)_auto_auto]">
        <button
          type="button"
          onClick={() => onSelect(item.symbol)}
          className="text-left font-semibold text-slate-50 transition hover:text-ember"
          title={`查看 ${item.symbol} 正式 15m 分析`}
        >
          {shortSymbol(item.symbol)}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-300">{codeLabel(item.state, STATE_LABELS)}</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
            OI {formatPercent(item.oi_qty_change_pct)} · {flowLabel(item.flow_imbalance)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${direction.tone}`}>{direction.label}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severity.tone}`}>{severity.label}</span>
          <span className={`rounded-sm border px-2 py-0.5 text-[11px] ${item.conflicts_official ? "border-short/40 bg-short/10 text-short" : "border-long/25 bg-long/5 text-long"}`}>
            {item.conflicts_official ? "與 15m 衝突" : "未與 15m 衝突"}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center justify-end gap-1 text-xs text-slate-500 transition hover:text-ember"
        >
          詳情 {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open ? (
        <div className="mt-2 grid gap-2 border-t border-white/5 pt-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="近 15m 價格" value={formatPercent(item.price_change_pct)} tone={percentTone(item.price_change_pct)} />
          <Metric label="近 15m OI" value={formatPercent(item.oi_qty_change_pct)} tone={percentTone(item.oi_qty_change_pct)} />
          <Metric label="爆倉強度" value={formatPercent(item.liquidation_intensity)} />
          <Metric label="主動流" value={flowLabel(item.flow_imbalance)} tone={flowTone(item.flow_imbalance)} />
          <Metric label="事件時間" value={formatEventTime(item.event_time)} />
          <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2 lg:col-span-5">
            <span className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-500">資料 {item.data_quality}</span>
            {flags.map((flag) => (
              <span key={flag} className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">
                {codeLabel(flag, FLAG_LABELS)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-white/[0.025] px-2 py-1.5">
      <span>{label}</span>
      <span className={`font-medium tabular-nums ${tone ?? "text-slate-300"}`}>{value}</span>
    </div>
  );
}

function RiskTable({ items, onSelect }: { items: RiskRadarItem[]; onSelect: (symbol: string) => void }) {
  return (
    <div className="surface-sunken overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs tracking-wide text-slate-500">
            <th className={TH}>事件</th><th className={TH}>方向／警戒</th>
            <th className={`${TH} text-right`}>近 15m 價格</th><th className={`${TH} text-right`}>近 15m OI 數量</th>
            <th className={`${TH} text-right`}>爆倉強度</th><th className={`${TH} text-right`}>主動流</th>
            <th className={TH}>事件時間</th><th className={TH}>衝突／旗標</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <RiskRow key={riskKey(item, index)} item={item} onSelect={onSelect} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskRow({ item, onSelect }: { item: RiskRadarItem; onSelect: (symbol: string) => void }) {
  const severity = SEVERITY[item.severity];
  const direction = DIRECTION[item.direction];
  const flags = displayFlags(item);
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
        {flags.map((flag) => <span key={flag} className="rounded-sm border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">{codeLabel(flag, FLAG_LABELS)}</span>)}
      </div></td>
    </tr>
  );
}

function CompactEmpty({ text }: { text: string }) {
  return (
    <div className="surface-sunken flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-slate-500">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function displayFlags(item: RiskRadarItem): string[] {
  const seen = new Set<string>();
  return item.flags.filter((flag) => {
    const normalized = flag.replaceAll(" ", "").trim();
    if (normalized === "與15m正式方向衝突" || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function riskKey(item: RiskRadarItem, index: number): string {
  return `${item.symbol}-${item.event_time}-${item.state}-${index}`;
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
