"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { EvidenceDirection, PillarScore, ScreenerRow } from "@/lib/types";
import {
  directionLabel,
  directionTone,
  formatPercent,
  formatPrice,
  formatScore,
  percentTone,
  stageHint,
  stageTone
} from "@/lib/format";

interface ScreenerTableProps {
  rows: ScreenerRow[];
  onSelect: (symbol: string) => void;
  selectedSymbol: string | null;
}

type DirFilter = "ALL" | "LONG" | "SHORT";
type SortKey = "score" | "change_24h" | "funding_rate" | "oi_change_1h";
type SortMode = "score" | "gainers" | "losers" | "funding" | "oi";

const SORT_TABS: { mode: SortMode; label: string; key: SortKey; desc: boolean }[] = [
  { mode: "score", label: "依分數", key: "score", desc: true },
  { mode: "gainers", label: "漲幅榜", key: "change_24h", desc: true },
  { mode: "losers", label: "跌幅榜", key: "change_24h", desc: false },
  { mode: "funding", label: "資金費率", key: "funding_rate", desc: true },
  { mode: "oi", label: "OI 變化", key: "oi_change_1h", desc: true }
];

const PILLAR_LABELS = ["結構", "動能", "強弱", "費率", "籌碼"];

function PillarDot({ pillar }: { pillar?: PillarScore }) {
  if (!pillar || pillar.direction === "NEUTRAL" || pillar.strength < 0.05) {
    return <span className="text-slate-700">·</span>;
  }

  const strong = pillar.strength >= 0.5;
  const tone =
    pillar.direction === "LONG"
      ? "text-long"
      : pillar.direction === "SHORT"
        ? "text-short"
        : "text-slate-500";

  return (
    <span className={`${tone} ${strong ? "" : "opacity-50"}`}>
      {pillar.direction === "LONG" ? "▲" : "▼"}
    </span>
  );
}

export function ScreenerTable({ rows, onSelect, selectedSymbol }: ScreenerTableProps) {
  const [query, setQuery] = useState("");
  const [dir, setDir] = useState<DirFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("score");

  const view = useMemo(() => {
    const activeSort = SORT_TABS.find((item) => item.mode === sortMode) ?? SORT_TABS[0];
    const q = query.trim().toUpperCase();
    let list = rows.filter((row) => (q ? row.symbol.includes(q) : true));

    if (dir !== "ALL") {
      list = list.filter((row) => row.direction === dir);
    }

    return [...list].sort((a, b) => {
      const diff = b[activeSort.key] - a[activeSort.key];
      return activeSort.desc ? diff : -diff;
    });
  }, [rows, query, dir, sortMode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="surface flex flex-col gap-3 rounded-lg p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">合約市場</div>
          <div className="text-xs text-slate-500">
            共 {rows.length} 個合約，顯示前 {view.length}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SORT_TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              onClick={() => setSortMode(tab.mode)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                sortMode === tab.mode
                  ? "border-ember/70 bg-ember/85 text-obsidian shadow-[0_0_22px_rgba(76,194,255,0.22)]"
                  : "border-white/10 bg-black/15 text-slate-400 hover:border-ember/35 hover:bg-ember/10 hover:text-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋合約"
            className="h-8 w-44 rounded-md border border-white/10 bg-obsidian/60 pl-8 pr-3 text-sm text-slate-50 outline-none transition placeholder:text-slate-600 focus:border-ember/60"
          />
        </div>

        <div className="inline-flex overflow-hidden rounded-md border border-white/10">
          {(["ALL", "LONG", "SHORT"] as DirFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setDir(filter)}
              className={`px-3 py-1.5 text-xs transition ${
                dir === filter
                  ? "bg-ember/15 text-ember"
                  : "bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {filter === "ALL" ? "全部" : filter === "LONG" ? "做多" : "做空"}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-sunken overflow-x-auto rounded-lg">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-[11px] tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">合約</th>
              <th className="px-3 py-2 text-right font-medium">價格</th>
              <th className="px-3 py-2 text-right font-medium">24h</th>
              <th className="px-3 py-2 text-right font-medium">分數</th>
              <th className="px-3 py-2 text-center font-medium">方向</th>
              <th className="px-3 py-2 text-center font-medium">階段</th>
              {PILLAR_LABELS.map((label) => (
                <th key={label} className="px-2 py-2 text-center font-medium" title={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, index) => (
              <tr
                key={row.symbol}
                onClick={() => onSelect(row.symbol)}
                className={`cursor-pointer border-b border-white/5 last:border-0 transition ${
                  row.symbol === selectedSymbol
                    ? "bg-ember/10 shadow-[inset_2px_0_0_0_rgb(var(--c-ember))]"
                    : "hover:bg-ember/[0.06]"
                }`}
              >
                <td className="px-3 py-2 tabular-nums text-slate-500">{index + 1}</td>
                <td className="px-3 py-2 font-medium text-slate-50">{row.symbol}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                  {formatPrice(row.price)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${percentTone(row.change_24h)}`}>
                  {formatPercent(row.change_24h)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-100">
                  {formatScore(row.score)}
                </td>
                <td className={`px-3 py-2 text-center text-xs ${directionTone(row.direction as EvidenceDirection)}`}>
                  {directionLabel(row.direction as EvidenceDirection)}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.stage === "觀察" ? (
                    <span className="text-xs text-slate-600">—</span>
                  ) : (
                    <span
                      title={stageHint(row.stage)}
                      className={`inline-block rounded-sm border px-1.5 py-px text-[10px] font-medium ${stageTone(row.stage)}`}
                    >
                      {row.stage}
                    </span>
                  )}
                </td>
                {PILLAR_LABELS.map((label, pillarIndex) => (
                  <td key={label} className="px-2 py-2 text-center">
                    <PillarDot pillar={row.pillars[pillarIndex]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">沒有符合條件的合約</div>
        ) : null}
      </div>
    </div>
  );
}
