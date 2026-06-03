"use client";

import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import type { ScanItem } from "@/lib/types";
import { confidenceLabel, directionLabel, formatScore } from "@/lib/format";
import { TugOfWarBar } from "@/components/dashboard/TugOfWarBar";

interface RecommendationCardProps {
  item: ScanItem;
  selected: boolean;
  onClick: () => void;
}

export function RecommendationCard({ item, selected, onClick }: RecommendationCardProps) {
  const isLong = item.direction === "LONG";
  const tone = isLong ? "text-long" : "text-short";
  const border = selected
    ? isLong
      ? "border-long/60 bg-steel"
      : "border-short/60 bg-steel"
    : "border-white/10 bg-graphite/85 hover:border-ember/45 hover:bg-steel/70";
  const Icon = isLong ? ArrowUpRight : ArrowDownRight;
  const pulse = item.is_anomaly && !selected ? "animate-ember-pulse" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-4 py-4 text-left shadow-[0_18px_48px_rgba(0,0,0,0.2)] transition ${border} ${pulse}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs tracking-[0.16em] text-stone-500">第 {item.rank} 名</span>
            {item.is_recommend ? (
              <span className="rounded-sm border border-ember/45 bg-ember/10 px-2 py-0.5 text-xs font-medium text-ember">
                推薦
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-semibold text-stone-50">{item.symbol}</span>
            <span className={`inline-flex items-center gap-1 ${tone}`}>
              <Icon className="h-4 w-4" />
              <span className="text-sm font-semibold">{directionLabel(item.direction)}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-xs tracking-[0.16em] text-stone-500">分數</div>
            <div className="text-3xl font-semibold leading-none text-stone-50">
              {formatScore(item.score)}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ember" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-stone-300">
        <span className="inline-flex items-center gap-1 rounded-sm border border-ember/30 px-2 py-0.5 text-xs text-ember">
          共振 {item.confluence_pillars}/5
        </span>
        <span className="text-xs text-stone-500">信心 {confidenceLabel(item.confidence_level)}</span>
      </div>

      <div className="mt-4">
        <TugOfWarBar long={item.long_score} short={item.short_score} size="sm" />
      </div>
    </button>
  );
}
