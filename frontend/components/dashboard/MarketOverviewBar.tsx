import { Flame, Globe, Layers, Percent } from "lucide-react";
import type { ScanResponse } from "@/lib/types";
import { formatPercent } from "@/lib/format";

interface MarketOverviewBarProps {
  scan: ScanResponse | null;
}

// Funding at/above this (per 8h) reads as "leverage 過熱" on the long side.
const OVERHEATED_FUNDING = 0.0003;

export function MarketOverviewBar({ scan }: MarketOverviewBarProps) {
  if (!scan) return null;
  const universe = scan.universe ?? [];
  const avgFunding = universe.length
    ? universe.reduce((sum, r) => sum + r.funding_rate, 0) / universe.length
    : 0;
  const overheated = universe.filter((r) => r.funding_rate >= OVERHEATED_FUNDING).length;
  const altseason = scan.altseason;

  return (
    <div className="flex flex-wrap gap-2.5">
      <Stat
        icon={<Layers className="h-3.5 w-3.5 text-ember" />}
        label="掃描範圍"
        value={`${scan.breadth.total} 檔`}
      />
      {altseason ? (
        <Stat
          icon={<Globe className="h-3.5 w-3.5 text-ember" />}
          label="強於 BTC"
          value={`${altseason.index}% · ${altseason.label}`}
        />
      ) : null}
      <Stat
        icon={<Percent className="h-3.5 w-3.5 text-ember" />}
        label="平均資金費率"
        value={formatPercent(avgFunding, 4)}
        valueClass={avgFunding > 0 ? "text-long" : avgFunding < 0 ? "text-short" : undefined}
      />
      <Stat
        icon={<Flame className="h-3.5 w-3.5 text-ember" />}
        label="槓桿過熱"
        value={`${overheated} 檔`}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  valueClass
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-graphite/70 px-3 py-1.5">
      {icon}
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${valueClass ?? "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}
