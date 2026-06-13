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
  percentTone
} from "@/lib/format";

interface ScreenerTableProps {
  rows: ScreenerRow[];
  onSelect: (symbol: string) => void;
  selectedSymbol: string | null;
}

type DirFilter = "ALL" | "LONG" | "SHORT";
type SortKey = "score" | "change_24h" | "funding_rate" | "oi_change_1h";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "分數" },
  { key: "change_24h", label: "24h 漲跌" },
  { key: "funding_rate", label: "資金費率" },
  { key: "oi_change_1h", label: "OI 變化" }
];

// 市場結構 / 動能 / 資金費率 / 多空比 / 相對強弱, shown as compact columns.
const PILLAR_COLS = [
  { name: "市場結構", short: "結" },
  { name: "動能", short: "動" },
  { name: "資金費率", short: "費" },
  { name: "多空比", short: "比" },
  { name: "相對強弱", short: "強" }
];

function PillarDot({ pillars, name }: { pillars: PillarScore[]; name: string }) {
  const p = pillars.find((x) => x.pillar === name);
  if (!p || p.direction === "NEUTRAL" || p.strength < 0.05) {
    return <span className="text-slate-700">·</span>;
  }
  const strong = p.strength >= 0.5;
  const tone =
    p.direction === "LONG" ? "text-long" : p.direction === "SHORT" ? "text-short" : "text-slate-500";
  return (
    <span className={`${tone} ${strong ? "" : "opacity-50"}`}>
      {p.direction === "LONG" ? "▲" : "▼"}
    </span>
  );
}

export function ScreenerTable({ rows, onSelect, selectedSymbol }: ScreenerTableProps) {
  const [query, setQuery] = useState("");
  const [dir, setDir] = useState<DirFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [desc, setDesc] = useState(true);

  const view = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = rows.filter((r) => (q ? r.symbol.includes(q) : true));
    if (dir !== "ALL") list = list.filter((r) => r.direction === dir);
    const signed = sortKey === "change_24h" || sortKey === "funding_rate" || sortKey === "oi_change_1h";
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // For signed metrics, "desc" means most positive first (and asc most negative).
      const cmp = signed ? bv - av : bv - av;
      return desc ? cmp : -cmp;
    });
    return list;
  }, [rows, query, dir, sortKey, desc]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋幣種…"
            className="h-8 w-44 rounded-md border border-white/10 bg-obsidian/60 pl-8 pr-3 text-sm text-slate-50 outline-none transition placeholder:text-slate-600 focus:border-ember/60"
          />
        </div>

        <div className="inline-flex overflow-hidden rounded-md border border-white/10">
          {(["ALL", "LONG", "SHORT"] as DirFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDir(d)}
              className={`px-3 py-1.5 text-xs transition ${
                dir === d ? "bg-ember/15 text-ember" : "bg-graphite/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              {d === "ALL" ? "全部" : d === "LONG" ? "做多" : "做空"}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1 text-xs text-slate-500">
          <span>排序</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 rounded-md border border-white/10 bg-graphite/60 px-2 text-slate-200 outline-none focus:border-ember/60"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDesc((v) => !v)}
            className="h-8 rounded-md border border-white/10 bg-graphite/60 px-2 text-slate-300 transition hover:border-ember/50 hover:text-ember"
            title={desc ? "由高到低" : "由低到高"}
          >
            {desc ? "▼" : "▲"}
          </button>
        </div>

        <span className="ml-auto text-xs text-slate-500">{view.length} / {rows.length} 檔</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-white/10 bg-graphite/40">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">幣種</th>
              <th className="px-3 py-2 text-right font-medium">價格</th>
              <th className="px-3 py-2 text-right font-medium">24h</th>
              <th className="px-3 py-2 text-right font-medium">分數</th>
              <th className="px-3 py-2 text-center font-medium">方向</th>
              {PILLAR_COLS.map((c) => (
                <th key={c.name} className="px-2 py-2 text-center font-medium" title={c.name}>
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr
                key={r.symbol}
                onClick={() => onSelect(r.symbol)}
                className={`cursor-pointer border-b border-white/5 last:border-0 transition ${
                  r.symbol === selectedSymbol ? "bg-steel" : "hover:bg-steel/40"
                }`}
              >
                <td className="px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-slate-50">{r.symbol}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                  {formatPrice(r.price)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${percentTone(r.change_24h)}`}>
                  {formatPercent(r.change_24h)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-100">
                  {formatScore(r.score)}
                </td>
                <td className={`px-3 py-2 text-center text-xs ${directionTone(r.direction as EvidenceDirection)}`}>
                  {directionLabel(r.direction as EvidenceDirection)}
                </td>
                {PILLAR_COLS.map((c) => (
                  <td key={c.name} className="px-2 py-2 text-center">
                    <PillarDot pillars={r.pillars} name={c.name} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">沒有符合條件的幣種。</div>
        ) : null}
      </div>
    </div>
  );
}
