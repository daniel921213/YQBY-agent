import { Clock3, Flame, Globe, Layers, Percent } from "lucide-react";
import type { ScanResponse } from "@/lib/types";
import { formatPercent, fundingRate8h } from "@/lib/format";
import { useMarketCopy } from "@/lib/market";

interface MarketOverviewBarProps {
  scan: ScanResponse | null;
}

// Funding at/above this (per 8h) reads as "leverage 過熱" on the long side.
const OVERHEATED_FUNDING = 0.0003;

export function MarketOverviewBar({ scan }: MarketOverviewBarProps) {
  const copy = useMarketCopy();
  if (!scan) return null;
  const universe = scan.universe ?? [];
  // 8h equivalents: raw rates of 1h/4h-settled contracts are not comparable.
  const avgFunding = universe.length
    ? universe.reduce((sum, r) => sum + fundingRate8h(r), 0) / universe.length
    : 0;
  const overheated = universe.filter((r) => fundingRate8h(r) >= OVERHEATED_FUNDING).length;
  const altseason = scan.altseason;
  const sessionRows = universe.filter((r) => r.market_session);
  const openCount = sessionRows.filter((r) => r.market_session === "OPEN").length;

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
          label={`強於 ${copy.benchmark}`}
          value={`${altseason.index}% · ${altseason.label}`}
        />
      ) : null}
      {copy.market === "tradfi" && sessionRows.length ? (
        <Stat
          icon={<Clock3 className="h-3.5 w-3.5 text-ember" />}
          label="標的市場開盤中"
          value={`${openCount} / ${sessionRows.length} 檔`}
        />
      ) : null}
      <Stat
        icon={<Percent className="h-3.5 w-3.5 text-ember" />}
        label="平均資金費率（8h）"
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
    <div className="surface lift data-glint inline-flex items-center gap-2 rounded-md px-3 py-1.5">
      {icon}
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${valueClass ?? "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}
