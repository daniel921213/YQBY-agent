"use client";

import { RefreshCw, Activity, Radar } from "lucide-react";
import type { ScanResponse } from "@/lib/types";
import { SentimentBand } from "@/components/dashboard/SentimentBand";
import { AccountMenu } from "@/components/auth/AccountMenu";

interface MarketHeaderProps {
  onRefresh: () => void;
  updatedLabel: string;
  loading: boolean;
  scan: ScanResponse | null;
}

export function MarketHeader({
  onRefresh,
  updatedLabel,
  loading,
  scan
}: MarketHeaderProps) {
  const anomalyCount = scan?.breadth?.anomaly_count ?? 0;
  const scannedCount = scan?.breadth?.total ?? 0;

  return (
    <header className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="inline-flex items-center gap-2 text-xs tracking-[0.18em] text-ember">
          <Radar className="h-4 w-4" />
          日內波段雷達
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-stone-50 sm:text-3xl">
          全市場異常訊號面板
        </h1>
        {scan?.breadth ? (
          <div className="mt-4">
            <SentimentBand breadth={scan.breadth} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-10 items-center gap-2 rounded-md border border-ember/25 bg-graphite px-3 text-sm text-stone-100">
          <Activity className="h-4 w-4 text-ember" />
          {anomalyCount} / {scannedCount} 異常
        </div>
        <div className="h-10 rounded-md border border-white/10 bg-graphite px-3 py-2 text-sm text-stone-300">
          {updatedLabel}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-graphite text-stone-300 transition hover:border-ember/60 hover:text-ember disabled:opacity-50"
          disabled={loading}
          title="重新掃描"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
