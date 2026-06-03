import type { MarketBreadth } from "@/lib/types";

interface SentimentBandProps {
  breadth: MarketBreadth;
}

export function SentimentBand({ breadth }: SentimentBandProps) {
  const { long_count: longCount, short_count: shortCount } = breadth;
  const total = longCount + shortCount;
  const longPct = total > 0 ? (longCount / total) * 100 : 50;

  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs tracking-[0.16em] text-stone-500">市場情緒</span>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-long">{longCount}</span>
        <div className="relative h-1.5 w-40 overflow-hidden rounded-full bg-short/60 sm:w-56">
          <div
            className="h-full bg-long transition-[width] duration-500 ease-out"
            style={{ width: `${longPct}%` }}
          />
        </div>
        <span className="font-medium text-short">{shortCount}</span>
      </div>
      <span className="text-xs text-stone-500">
        {longPct >= 55 ? "偏多" : longPct <= 45 ? "偏空" : "分歧"}
      </span>
    </div>
  );
}
