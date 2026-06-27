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
    <header className="glass-panel sticky top-2 z-20 flex flex-col gap-5 rounded-xl px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="inline-flex items-center gap-2 text-xs tracking-[0.18em] text-ember [text-shadow:0_0_16px_rgba(76,194,255,0.55)]">
          <Radar className="h-4 w-4" />
          日內波段雷達
        </p>
        <h1 className="mt-2 bg-gradient-to-b from-white via-slate-200 to-slate-500 bg-clip-text text-2xl font-semibold text-transparent sm:text-3xl">
          ERT_DATA
        </h1>
        {scan?.breadth ? (
          <div className="mt-4">
            <SentimentBand breadth={scan.breadth} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="surface inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-slate-100">
          <Activity className="h-4 w-4 text-ember" />
          {anomalyCount} / {scannedCount} 異常
        </div>
        <div className="surface h-10 rounded-md px-3 py-2 text-sm text-slate-300">
          {updatedLabel}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="surface lift inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-300 hover:text-ember disabled:opacity-50"
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
