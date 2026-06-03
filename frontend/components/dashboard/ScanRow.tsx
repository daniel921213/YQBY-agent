import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ScanItem } from "@/lib/types";
import { formatScore } from "@/lib/format";

interface ScanRowProps {
  item: ScanItem;
  selected: boolean;
  onClick: () => void;
}

export function ScanRow({ item, selected, onClick }: ScanRowProps) {
  const isLong = item.direction === "LONG";
  const tone = isLong ? "text-long" : "text-short";
  const Icon = isLong ? ArrowUpRight : ArrowDownRight;
  const border = selected
    ? isLong
      ? "border-long/50 bg-steel"
      : "border-short/50 bg-steel"
    : "border-white/10 bg-graphite/70 hover:border-ember/40 hover:bg-steel/60";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition ${border}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
      <span className="flex-1 truncate text-sm font-medium text-stone-50">{item.symbol}</span>
      <span className="shrink-0 text-[11px] text-stone-500">{item.confluence_pillars}/5</span>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-stone-100">
        {formatScore(item.score)}
      </span>
    </button>
  );
}
