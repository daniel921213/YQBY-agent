"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  History,
  ShieldCheck
} from "lucide-react";
import type { ScanItem, TradeDirection } from "@/lib/types";
import { ScanRow } from "@/components/dashboard/ScanRow";
import {
  formatPercent,
  formatPrice,
  formatScore,
  percentTone
} from "@/lib/format";

interface AnomalyPanelProps {
  items: ScanItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  onShowHistory: () => void;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "頧?", label: "順勢多" },
  { key: "頧征", label: "順勢空" },
  { key: "?撮??", label: "反轉背離" }
];

export function AnomalyPanel({ items, selectedSymbol, onSelect, onShowHistory }: AnomalyPanelProps) {
  const [cat, setCat] = useState("ALL");

  const recs = useMemo(() => items.filter((item) => item.is_recommend), [items]);
  const longRecs = useMemo(
    () => recs.filter((item) => item.direction === "LONG").slice(0, 3),
    [recs]
  );
  const shortRecs = useMemo(
    () => recs.filter((item) => item.direction === "SHORT").slice(0, 3),
    [recs]
  );
  const anomalies = useMemo(() => items.filter((item) => !item.is_recommend), [items]);
  const newCount = useMemo(() => anomalies.filter((item) => item.is_new).length, [anomalies]);
  const view = useMemo(
    () => (cat === "ALL" ? anomalies : anomalies.filter((item) => item.category === cat)),
    [anomalies, cat]
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 pb-2">
          <span className="inline-flex items-center gap-2 text-base font-semibold text-slate-50">
            <ShieldCheck className="h-4 w-4 text-ember" />
            高分推薦
          </span>
          <span className="text-xs text-slate-500">
            分數 80 以上才會進入推薦榜，每個方向只顯示前三名
          </span>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <RecommendationLane
            title="做多推薦"
            direction="LONG"
            items={longRecs}
            selectedSymbol={selectedSymbol}
            onSelect={onSelect}
          />
          <RecommendationLane
            title="做空推薦"
            direction="SHORT"
            items={shortRecs}
            selectedSymbol={selectedSymbol}
            onSelect={onSelect}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 pb-2">
          <span className="inline-flex items-center gap-2 text-base font-semibold text-slate-50">
            <AlertTriangle className="h-4 w-4 text-ember" />
            異常訊號
          </span>
          <div className="inline-flex overflow-hidden rounded-md border border-white/10">
            {CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setCat(category.key)}
                className={`px-2.5 py-1 text-xs transition ${
                  cat === category.key
                    ? "bg-ember/15 text-ember"
                    : "bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {newCount > 0 ? (
              <span className="animate-ember-pulse rounded-sm border border-ember/45 bg-ember/15 px-2 py-0.5 text-xs font-medium text-ember">
                新增 {newCount}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onShowHistory}
              className="surface lift inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-slate-300 hover:text-ember"
            >
              <History className="h-3.5 w-3.5" />
              歷史紀錄
            </button>
          </div>
        </div>

        <p className="-mt-1 text-xs text-slate-500">
          低於推薦門檻但仍有多因子共振的訊號會留在這裡，方便觀察後續是否升級。
        </p>

        {view.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {view.map((item) => (
              <ScanRow
                key={item.symbol}
                item={item}
                showCategory
                selected={item.symbol === selectedSymbol}
                onClick={() => onSelect(item.symbol)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
            {anomalies.length ? "目前篩選條件下沒有訊號" : "目前沒有低於推薦門檻的異常訊號"}
          </div>
        )}
      </section>
    </div>
  );
}

function RecommendationLane({
  title,
  direction,
  items,
  selectedSymbol,
  onSelect
}: {
  title: string;
  direction: TradeDirection;
  items: ScanItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const isLong = direction === "LONG";
  const Icon = isLong ? ArrowUpRight : ArrowDownRight;
  const tone = isLong ? "text-long" : "text-short";
  const ring = isLong ? "border-long/20" : "border-short/20";
  const glow = isLong ? "from-long/10" : "from-short/10";

  return (
    <div className={`surface relative overflow-hidden rounded-xl border ${ring} p-3.5`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${glow} to-transparent`}
      />
      <div className="relative flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div className={`inline-flex items-center gap-2 text-sm font-semibold ${tone}`}>
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <div className="text-xs text-slate-500">{items.length} / 3</div>
      </div>

      <div className="relative mt-2 grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <RecommendationRow
              key={item.symbol}
              item={item}
              rank={index + 1}
              selected={item.symbol === selectedSymbol}
              onClick={() => onSelect(item.symbol)}
            />
          ))
        ) : (
          <div className="flex h-[154px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/10 text-sm text-slate-600">
            目前沒有 80 分以上的{isLong ? "做多" : "做空"}推薦
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationRow({
  item,
  rank,
  selected,
  onClick
}: {
  item: ScanItem;
  rank: number;
  selected: boolean;
  onClick: () => void;
}) {
  const isLong = item.direction === "LONG";
  const tone = isLong ? "text-long" : "text-short";
  const barTone = isLong ? "bg-long" : "bg-short";
  const scoreBlocks = Math.max(1, Math.min(8, Math.round((item.score / 100) * 8)));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid min-h-[48px] grid-cols-[36px_minmax(84px,1fr)_92px_150px_74px] items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? "border-ember/55 bg-ember/10 shadow-[0_0_22px_rgba(76,194,255,0.18)]"
          : "border-white/10 bg-black/15 hover:border-ember/35 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="text-sm font-semibold tabular-nums text-slate-300">{rank}</span>
        <span className="text-[11px] text-ember">●</span>
      </div>

      <div className="truncate text-sm font-semibold text-slate-50">{item.symbol}</div>

      <div className="text-sm font-medium tabular-nums text-slate-200">{formatPrice(item.price)}</div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-sm bg-white/5 px-1.5 py-0.5 text-xs text-slate-200">
          強度
        </span>
        <div className="flex gap-0.5">
          {Array.from({ length: 8 }).map((_, blockIndex) => (
            <span
              key={blockIndex}
              className={`h-3 w-1.5 rounded-sm ${
                blockIndex < scoreBlocks ? barTone : "bg-white/10"
              }`}
            />
          ))}
        </div>
        <span className="ml-auto text-xs font-semibold tabular-nums text-slate-300">
          {formatScore(item.score)}
        </span>
      </div>

      <div className={`text-right text-sm font-medium tabular-nums ${percentTone(item.change_24h)}`}>
        {formatPercent(item.change_24h)}
      </div>
    </button>
  );
}
