"use client";

import { useMemo } from "react";
import type { OiMover, ScreenerRow } from "@/lib/types";
import { formatPercent, formatPrice, percentTone } from "@/lib/format";
import { OiRankingTable } from "@/components/dashboard/OiRankingTable";

interface DataRankingsProps {
  universe: ScreenerRow[];
  movers: OiMover[];
  onSelect: (symbol: string) => void;
}

const TOP_N = 6;

interface Row {
  symbol: string;
  value: string;
  tone?: string;
}

export function DataRankings({ universe, movers, onSelect }: DataRankingsProps) {
  const rankings = useMemo(() => {
    const byFundingHigh = [...universe].sort((a, b) => b.funding_rate - a.funding_rate);
    const byFundingLow = [...universe].sort((a, b) => a.funding_rate - b.funding_rate);
    const byRetailLong = [...universe].sort((a, b) => b.account_ratio - a.account_ratio);
    const byRetailShort = [...universe].sort((a, b) => a.account_ratio - b.account_ratio);
    const byGain = [...universe].sort((a, b) => b.change_24h - a.change_24h);
    const byLoss = [...universe].sort((a, b) => a.change_24h - b.change_24h);

    const fundingRow = (r: ScreenerRow): Row => ({
      symbol: r.symbol,
      value: formatPercent(r.funding_rate, 4),
      tone: percentTone(r.funding_rate)
    });
    const ratioRow = (r: ScreenerRow): Row => ({
      symbol: r.symbol,
      value: `散 ${r.account_ratio.toFixed(2)} / 大 ${r.top_trader_ratio.toFixed(2)}`
    });
    const changeRow = (r: ScreenerRow): Row => ({
      symbol: r.symbol,
      value: formatPercent(r.change_24h),
      tone: percentTone(r.change_24h)
    });

    return {
      fundingHigh: byFundingHigh.slice(0, TOP_N).map(fundingRow),
      fundingLow: byFundingLow.slice(0, TOP_N).map(fundingRow),
      retailLong: byRetailLong.slice(0, TOP_N).map(ratioRow),
      retailShort: byRetailShort.slice(0, TOP_N).map(ratioRow),
      gainers: byGain.slice(0, TOP_N).map(changeRow),
      losers: byLoss.slice(0, TOP_N).map(changeRow)
    };
  }, [universe]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="資金費率極端">
          <SubList label="軋空風險（費率最高）" rows={rankings.fundingHigh} onSelect={onSelect} />
          <SubList label="空頭付費（費率最負）" rows={rankings.fundingLow} onSelect={onSelect} />
        </Card>
        <Card title="多空比擁擠">
          <SubList label="散戶最擁擠做多" rows={rankings.retailLong} onSelect={onSelect} />
          <SubList label="散戶最擁擠做空" rows={rankings.retailShort} onSelect={onSelect} />
        </Card>
        <Card title="24h 漲跌榜">
          <SubList label="漲幅 Top" rows={rankings.gainers} onSelect={onSelect} />
          <SubList label="跌幅 Top" rows={rankings.losers} onSelect={onSelect} />
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/10 pb-2">
          <span className="text-sm font-semibold text-stone-100">OI 異動排名</span>
          <span className="text-xs text-stone-500">1H 持倉量變化 · 依變化金額排序</span>
        </div>
        <OiRankingTable movers={movers} />
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-graphite/70 p-3">
      <div className="text-sm font-medium text-stone-100">{title}</div>
      {children}
    </div>
  );
}

function SubList({
  label,
  rows,
  onSelect
}: {
  label: string;
  rows: Row[];
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-stone-500">{label}</div>
      {rows.map((r) => (
        <button
          key={r.symbol}
          type="button"
          onClick={() => onSelect(r.symbol)}
          className="flex items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left transition hover:bg-steel/50"
        >
          <span className="truncate text-sm text-stone-200">{r.symbol}</span>
          <span className={`shrink-0 text-xs tabular-nums ${r.tone ?? "text-stone-400"}`}>
            {r.value}
          </span>
        </button>
      ))}
    </div>
  );
}
