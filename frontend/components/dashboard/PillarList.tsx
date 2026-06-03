import type { PillarScore } from "@/lib/types";

function level(strength: number): string {
  if (strength >= 0.5) return "強";
  if (strength >= 0.25) return "中";
  return "弱";
}

function dirWord(direction: string): string {
  if (direction === "LONG") return "多";
  if (direction === "SHORT") return "空";
  return "中性";
}

function chipTone(direction: string): string {
  if (direction === "LONG") return "border-long/30 bg-long/5 text-long";
  if (direction === "SHORT") return "border-short/30 bg-short/5 text-short";
  return "border-white/10 text-stone-500";
}

export function PillarList({ pillars }: { pillars: PillarScore[] }) {
  return (
    <div className="divide-y divide-white/5">
      {pillars.map((p) => (
        <div key={p.pillar} className="flex items-center justify-between py-2.5">
          <span className="text-sm text-stone-300">{p.pillar}</span>
          {p.direction === "NEUTRAL" || p.strength < 0.05 ? (
            <span className="text-xs text-stone-600">—</span>
          ) : (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${chipTone(p.direction)}`}
            >
              {dirWord(p.direction)} · {level(p.strength)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
