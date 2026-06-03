"use client";

import { ArrowDownRight, ArrowUpRight, Repeat, ShieldCheck, AlertTriangle } from "lucide-react";
import type { AnomalyCategory, ScanItem, ScanResponse } from "@/lib/types";
import { RecommendationCard } from "@/components/recommendation/RecommendationCard";
import { ScanRow } from "@/components/dashboard/ScanRow";

interface RecommendationStripProps {
  scan: ScanResponse | null;
  loading: boolean;
  error: string | null;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

export function RecommendationStrip({
  scan,
  loading,
  error,
  selectedSymbol,
  onSelect
}: RecommendationStripProps) {
  if (error) {
    return (
      <section className="rounded-md border border-short/30 bg-short/10 px-4 py-4 text-sm text-red-100">
        {error}
      </section>
    );
  }
  if (!scan) {
    return (
      <section className="flex h-36 items-center justify-center rounded-md border border-white/10 bg-graphite/60 text-sm text-stone-400">
        {loading ? "掃描中" : "目前沒有掃描資料"}
      </section>
    );
  }

  const recs = scan.items.filter((i) => i.is_recommend);
  const anomalies = scan.items.filter((i) => !i.is_recommend);
  const byCategory = (c: AnomalyCategory) => anomalies.filter((i) => i.category === c);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={<ShieldCheck className="h-4 w-4 text-ember" />}
          title="高把握推薦"
          note="分數 ≥ 80（多支柱共振，少見）"
        />
        {recs.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Column
              title="做多推薦"
              tone="long"
              icon={<ArrowUpRight className="h-4 w-4" />}
              items={recs.filter((i) => i.direction === "LONG")}
              selectedSymbol={selectedSymbol}
              onSelect={onSelect}
            />
            <Column
              title="做空推薦"
              tone="short"
              icon={<ArrowDownRight className="h-4 w-4" />}
              items={recs.filter((i) => i.direction === "SHORT")}
              selectedSymbol={selectedSymbol}
              onSelect={onSelect}
            />
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-graphite/40 px-4 py-2.5 text-xs text-stone-500">
            目前沒有分數 ≥ 80 的高把握標的——這很正常，多支柱同時共振本來就少見。下方異常警報是現在值得留意的。
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={<AlertTriangle className="h-4 w-4 text-ember" />}
          title="數據異常警報"
          note="分數為異常強度，非上漲機率——供判讀，非買賣訊號"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Column
            title="轉多"
            tone="long"
            icon={<ArrowUpRight className="h-4 w-4" />}
            items={byCategory("轉多")}
            compact
            selectedSymbol={selectedSymbol}
            onSelect={onSelect}
          />
          <Column
            title="轉空"
            tone="short"
            icon={<ArrowDownRight className="h-4 w-4" />}
            items={byCategory("轉空")}
            compact
            selectedSymbol={selectedSymbol}
            onSelect={onSelect}
          />
          <Column
            title="疑似反轉"
            tone="ember"
            icon={<Repeat className="h-4 w-4" />}
            items={byCategory("疑似反轉")}
            compact
            selectedSymbol={selectedSymbol}
            onSelect={onSelect}
          />
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  note
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 pb-2">
      <span className="inline-flex items-center gap-2 text-base font-semibold text-stone-50">
        {icon}
        {title}
      </span>
      <span className="text-xs text-stone-500">{note}</span>
    </div>
  );
}

const TONES = {
  long: { text: "text-long", accent: "border-long/30 bg-long/5" },
  short: { text: "text-short", accent: "border-short/30 bg-short/5" },
  ember: { text: "text-ember", accent: "border-ember/30 bg-ember/5" }
} as const;

function Column({
  title,
  tone,
  icon,
  items,
  compact = false,
  selectedSymbol,
  onSelect
}: {
  title: string;
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  items: ScanItem[];
  compact?: boolean;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const t = TONES[tone];
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center justify-between rounded-md border px-3 py-1.5 ${t.accent}`}>
        <span className={`inline-flex items-center gap-2 text-sm font-medium ${t.text}`}>
          {icon}
          {title}
        </span>
        <span className="text-xs text-stone-400">{items.length} 檔</span>
      </div>
      {items.length ? (
        <div className={compact ? "flex flex-col gap-1.5" : "grid gap-3"}>
          {items.map((item) =>
            compact ? (
              <ScanRow
                item={item}
                key={item.symbol}
                selected={item.symbol === selectedSymbol}
                onClick={() => onSelect(item.symbol)}
              />
            ) : (
              <RecommendationCard
                item={item}
                key={item.symbol}
                selected={item.symbol === selectedSymbol}
                onClick={() => onSelect(item.symbol)}
              />
            )
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-center text-xs text-stone-600">
          目前無
        </div>
      )}
    </div>
  );
}
