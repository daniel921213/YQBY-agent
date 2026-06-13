import type { EvidenceItem } from "@/lib/types";
import { directionLabel, directionTone } from "@/lib/format";

interface IndicatorEvidenceListProps {
  evidence: EvidenceItem[];
}

export function IndicatorEvidenceList({ evidence }: IndicatorEvidenceListProps) {
  return (
    <div className="divide-y divide-white/10 border-y border-white/10">
      {evidence.map((item) => (
        <div key={item.key} className="grid gap-3 py-4 md:grid-cols-[1fr_96px_116px] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-50">{item.label}</span>
              <span className="rounded-sm border border-white/10 px-2 py-0.5 text-xs text-slate-400">
                {item.timeframe}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-300">{item.description}</p>
          </div>
          <div className={`text-sm font-semibold ${directionTone(item.direction)}`}>
            {directionLabel(item.direction)}
          </div>
          <div className="text-sm text-slate-100">
            +{item.score.toFixed(1)}
            <span className="text-slate-500"> / {item.weight.toFixed(0)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
