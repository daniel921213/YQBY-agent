"use client";

import { ArrowDownRight, ArrowUpRight, ChevronRight, Clock, Zap } from "lucide-react";
import type { ScanItem } from "@/lib/types";
import {
  confidenceLabel,
  directionLabel,
  formatPercent,
  formatPrice,
  formatRelativeTime,
  formatScore,
  percentTone
} from "@/lib/format";
import { FrequencyTier } from "@/components/dashboard/FrequencyTier";
import { TugOfWarBar } from "@/components/dashboard/TugOfWarBar";

interface RecommendationCardProps {
  item: ScanItem;
  selected: boolean;
  onClick: () => void;
}

export function RecommendationCard({ item, selected, onClick }: RecommendationCardProps) {
  const isLong = item.direction === "LONG";
  const tone = isLong ? "text-long" : "text-short";
  const surfaceClass = selected ? "surface-raised signal-glow" : "surface-raised lift";
  const Icon = isLong ? ArrowUpRight : ArrowDownRight;
  const pulse = item.is_anomaly && !selected ? "animate-ember-pulse" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl px-4 py-4 text-left transition ${surfaceClass} ${pulse}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs tracking-[0.16em] text-slate-500">第 {item.rank} 名</span>
            {item.is_recommend ? (
              <span className="rounded-sm border border-ember/45 bg-ember/10 px-2 py-0.5 text-xs font-medium text-ember">
                推薦
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-50">{item.symbol}</span>
            <span className={`inline-flex items-center gap-1 ${tone}`}>
              <Icon className="h-4 w-4" />
              <span className="text-sm font-semibold">{directionLabel(item.direction)}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            <span className="font-medium tabular-nums text-slate-200">
              {formatPrice(item.price)}
            </span>
            <span className={`text-xs font-medium tabular-nums ${percentTone(item.change_24h)}`}>
              {formatPercent(item.change_24h)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-xs tracking-[0.16em] text-slate-500">分數</div>
            <div className="text-3xl font-semibold leading-none text-slate-50">
              {formatScore(item.score)}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ember" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-slate-300">
        <span className="inline-flex items-center gap-1 rounded-sm border border-ember/30 px-2 py-0.5 text-xs text-ember">
          共振 {item.confluence_pillars}/5
        </span>
        <span className="text-xs text-slate-500">信心 {confidenceLabel(item.confidence_level)}</span>
      </div>

      <div className="mt-4">
        <TugOfWarBar long={item.long_score} short={item.short_score} size="sm" />
      </div>

      {item.first_seen_ts !== null ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 pt-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(item.minutes_since_first)}
          </span>
          {item.is_new ? (
            <span className="rounded-sm border border-ember/45 bg-ember/15 px-1.5 py-px text-[10px] font-medium text-ember">
              新
            </span>
          ) : null}
          <span>
            首次 {formatPrice(item.first_seen_price)} →{" "}
            <span className={percentTone(item.change_since_first)}>
              {formatPercent(item.change_since_first)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3 text-ember/80" />
            近1h {item.alert_trigger_count} 次
            <FrequencyTier tier={item.frequency_tier} />
          </span>
        </div>
      ) : null}
    </button>
  );
}
