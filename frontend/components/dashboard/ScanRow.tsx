import { ArrowDownRight, ArrowUpRight, Clock, Zap } from "lucide-react";
import type { ScanItem } from "@/lib/types";
import {
  formatPercent,
  formatPrice,
  formatRelativeTime,
  formatScore,
  percentTone,
  stageHint,
  stageTone
} from "@/lib/format";
import { FrequencyTier } from "@/components/dashboard/FrequencyTier";

interface ScanRowProps {
  item: ScanItem;
  selected: boolean;
  onClick: () => void;
  showStage?: boolean;
}

export function ScanRow({ item, selected, onClick, showStage = false }: ScanRowProps) {
  const isLong = item.direction === "LONG";
  const tone = isLong ? "text-long" : "text-short";
  const Icon = isLong ? ArrowUpRight : ArrowDownRight;
  const surfaceClass = selected ? "surface-raised signal-glow" : "surface lift";

  const tracked = item.first_seen_ts !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-2 rounded-lg px-3 py-2.5 text-left transition ${surfaceClass}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
        <span className="truncate text-sm font-medium text-slate-50">{item.symbol}</span>
        {showStage ? (
          <span
            title={stageHint(item.stage)}
            className={`rounded-sm border px-1.5 py-px text-[10px] font-medium ${stageTone(item.stage)}`}
          >
            {item.stage}
          </span>
        ) : null}
        {item.is_new ? (
          <span className="rounded-sm border border-ember/45 bg-ember/15 px-1.5 py-px text-[10px] font-medium text-ember">
            新
          </span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500">
          {tracked ? (
            <>
              <Clock className="h-3 w-3" />
              {formatRelativeTime(item.minutes_since_first)}
            </>
          ) : null}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-slate-100">
          {formatPrice(item.price)}
        </span>
        <span className={`text-xs font-medium tabular-nums ${percentTone(item.change_24h)}`}>
          {formatPercent(item.change_24h)}
        </span>
      </div>

      {item.stage_reasons.length ? (
        <div className="text-[11px] leading-4 text-slate-400" title={item.stage_reasons.join("；")}>
          {item.stage_reasons.slice(0, 2).join(" · ")}
        </div>
      ) : null}

      {tracked ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate">
            首次 {formatPrice(item.first_seen_price)} →{" "}
            <span className={percentTone(item.change_since_first)}>
              {formatPercent(item.change_since_first)}
            </span>
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-1.5">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
          title="近 1 小時內觸發次數（同一輪掃描只計一次）"
        >
          <Zap className="h-3 w-3 text-ember/80" />
          近1h {item.alert_trigger_count} 次
          <FrequencyTier tier={item.frequency_tier} />
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{item.confluence_pillars}/5</span>
          <span className="w-9 text-right text-sm font-semibold tabular-nums text-slate-100">
            {formatScore(item.score)}
          </span>
        </span>
      </div>
    </button>
  );
}
