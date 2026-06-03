import type { OiMover, OiMoverSide } from "@/lib/types";
import {
  formatCompactNumber,
  formatPercent,
  formatPrice,
  percentTone
} from "@/lib/format";

interface OiRankingTableProps {
  movers: OiMover[];
}

const SIDE_TONE: Record<OiMoverSide, string> = {
  多頭建倉: "border-long/30 bg-long/5 text-long",
  空頭建倉: "border-short/30 bg-short/5 text-short",
  多頭減倉: "border-long/20 bg-long/5 text-long/70",
  空頭減倉: "border-short/20 bg-short/5 text-short/70",
  持平: "border-white/10 text-stone-500"
};

export function OiRankingTable({ movers }: OiRankingTableProps) {
  if (!movers.length) {
    return <div className="py-8 text-center text-sm text-stone-500">目前沒有明顯的 OI 異動。</div>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-white/10 bg-graphite/40">
      <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] tracking-wide text-stone-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">幣種</th>
              <th className="px-3 py-2 text-right font-medium">價格</th>
              <th className="px-3 py-2 text-right font-medium">OI 變化 (1H)</th>
              <th className="px-3 py-2 text-right font-medium">OI 增量</th>
              <th className="px-3 py-2 text-right font-medium">總 OI</th>
              <th className="px-3 py-2 text-right font-medium">價格 24H</th>
            </tr>
          </thead>
          <tbody>
            {movers.map((m, i) => (
              <tr
                key={m.symbol}
                className="border-b border-white/5 last:border-0 transition hover:bg-steel/40"
              >
                <td className="px-3 py-2 text-stone-500 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-50">{m.symbol}</span>
                    <span
                      className={`rounded-sm border px-1.5 py-px text-[10px] font-medium ${SIDE_TONE[m.side]}`}
                    >
                      {m.side}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-200">
                  {formatPrice(m.price)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${percentTone(m.oi_change_1h)}`}>
                  {formatPercent(m.oi_change_1h)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${m.oi_delta >= 0 ? "text-long" : "text-short"}`}
                >
                  {m.oi_delta >= 0 ? "+" : "-"}
                  {formatCompactNumber(Math.abs(m.oi_delta))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-300">
                  {formatCompactNumber(m.total_oi)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${percentTone(m.change_24h)}`}>
                  {formatPercent(m.change_24h)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
