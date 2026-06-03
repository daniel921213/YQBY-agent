import type { FrequencyTier as Tier } from "@/lib/types";

// Three-segment ember meter mirroring the 1-2次 / 3-5次 / 6次+ frequency buckets.
const FILLED: Record<Tier, number> = { low: 1, mid: 2, high: 3 };
const TITLE: Record<Tier, string> = {
  low: "低頻（近1h 1-2 次）",
  mid: "中頻（近1h 3-5 次）",
  high: "高頻（近1h 6 次以上）"
};

export function FrequencyTier({ tier }: { tier: Tier }) {
  const filled = FILLED[tier];
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" title={TITLE[tier]}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-2.5 w-1 rounded-sm ${i < filled ? "bg-ember" : "bg-white/12"}`}
        />
      ))}
    </span>
  );
}
