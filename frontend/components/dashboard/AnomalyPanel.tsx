"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, History, ShieldCheck } from "lucide-react";
import type { AnomalyCategory, ScanItem } from "@/lib/types";
import { RecommendationCard } from "@/components/recommendation/RecommendationCard";
import { ScanRow } from "@/components/dashboard/ScanRow";

interface AnomalyPanelProps {
  items: ScanItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  onShowHistory: () => void;
}

const CATEGORIES: { key: AnomalyCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "轉多", label: "轉多" },
  { key: "轉空", label: "轉空" },
  { key: "疑似反轉", label: "疑似反轉" }
];

export function AnomalyPanel({ items, selectedSymbol, onSelect, onShowHistory }: AnomalyPanelProps) {
  const [cat, setCat] = useState<AnomalyCategory | "ALL">("ALL");

  const recs = useMemo(() => items.filter((i) => i.is_recommend), [items]);
  const anomalies = useMemo(() => items.filter((i) => !i.is_recommend), [items]);
  const newCount = useMemo(() => anomalies.filter((i) => i.is_new).length, [anomalies]);
  const view = useMemo(
    () => (cat === "ALL" ? anomalies : anomalies.filter((i) => i.category === cat)),
    [anomalies, cat]
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 pb-2">
          <span className="inline-flex items-center gap-2 text-base font-semibold text-slate-50">
            <ShieldCheck className="h-4 w-4 text-ember" />
            高把握推薦
          </span>
          <span className="text-xs text-slate-500">分數 ≥ 80（多支柱共振，少見）</span>
        </div>
        {recs.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recs.map((item) => (
              <RecommendationCard
                key={item.symbol}
                item={item}
                selected={item.symbol === selectedSymbol}
                onClick={() => onSelect(item.symbol)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-graphite/40 px-4 py-2.5 text-xs text-slate-500">
            目前沒有分數 ≥ 80 的高把握標的——這很正常，多支柱同時共振本來就少見。下方異常警報是現在值得留意的。
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 pb-2">
          <span className="inline-flex items-center gap-2 text-base font-semibold text-slate-50">
            <AlertTriangle className="h-4 w-4 text-ember" />
            數據異常警報
          </span>
          <div className="inline-flex overflow-hidden rounded-md border border-white/10">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCat(c.key)}
                className={`px-2.5 py-1 text-xs transition ${
                  cat === c.key
                    ? "bg-ember/15 text-ember"
                    : "bg-graphite/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {newCount > 0 ? (
              <span className="animate-ember-pulse rounded-sm border border-ember/45 bg-ember/15 px-2 py-0.5 text-xs font-medium text-ember">
                新 {newCount}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onShowHistory}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-graphite/60 px-2.5 py-1 text-xs text-slate-300 transition hover:border-ember/50 hover:text-ember"
            >
              <History className="h-3.5 w-3.5" />
              歷史紀錄
            </button>
          </div>
        </div>

        <p className="-mt-1 text-xs text-slate-500">
          分數為異常強度，非上漲機率——供判讀，非買賣訊號。依分數排序。
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
            {anomalies.length ? "此分類目前無異常。" : "目前沒有偵測到數據異常。"}
          </div>
        )}
      </section>
    </div>
  );
}
