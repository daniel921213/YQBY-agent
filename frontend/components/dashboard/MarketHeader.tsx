"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Activity, Crown, Radar, Timer } from "lucide-react";
import type { ScanResponse } from "@/lib/types";
import type { Entitlement } from "@/lib/api";
import { SentimentBand } from "@/components/dashboard/SentimentBand";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { ThemeToggle } from "@/lib/theme";
import { SideNav } from "@/components/nav/SideNav";

interface MarketHeaderProps {
  onRefresh: () => void;
  updatedLabel: string;
  loading: boolean;
  scan: ScanResponse | null;
  entitlement?: Entitlement | null;
}

/** 資格 chip：永久 = 低調金徽；試用 = 倒數（≤3 天轉金、最後 1 天轉紅）。 */
function EntitlementChip({ me }: { me: Entitlement }) {
  if (me.plan === "lifetime") {
    return (
      <span className="inline-flex h-10 items-center gap-1.5 rounded-md border border-gold/35 bg-gold/10 px-3 text-sm text-gold">
        <Crown className="h-3.5 w-3.5" />
        永久
      </span>
    );
  }
  const days = me.days_left ?? 0;
  const tone =
    days <= 1
      ? "border-short/40 bg-short/10 text-short"
      : days <= 3
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-white/10 bg-white/5 text-slate-300";
  const label = me.plan === "member" ? "會員剩" : "試用剩";
  return (
    <span className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm tabular-nums ${tone}`}>
      <Timer className="h-3.5 w-3.5" />
      {label} {days} 天
    </span>
  );
}

// 即時時鐘：首次 render 留空避免 SSR/CSR 水合不一致，掛載後每秒更新。
function useClock(): string {
  const [now, setNow] = useState("");
  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("zh-TW", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const tick = () => setNow(formatter.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MarketHeader({
  onRefresh,
  updatedLabel,
  loading,
  scan,
  entitlement
}: MarketHeaderProps) {
  const anomalyCount = scan?.breadth?.anomaly_count ?? 0;
  const scannedCount = scan?.breadth?.total ?? 0;
  const clock = useClock();
  const altseason = scan?.altseason ?? null;

  return (
    <header className="glass-panel sticky top-2 z-20 flex flex-col gap-5 rounded-xl px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-start gap-3">
        <SideNav />
        <div>
          {/* 環境 + 時間：市場環境（山寨/BTC 指數）搭配即時時鐘，取代靜態標語。 */}
          <p className="inline-flex items-center gap-2 text-xs tracking-[0.18em]">
            <Radar className="h-4 w-4 text-gold [filter:drop-shadow(0_0_8px_rgba(240,200,118,0.45))]" />
            <span className="text-gold [text-shadow:0_0_14px_rgba(240,200,118,0.35)]">
              環境 {altseason ? `${altseason.label} ${altseason.index}` : "--"}
            </span>
            <span className="text-slate-600">·</span>
            <span className="tabular-nums text-slate-300">{clock || "--:--:--"}</span>
          </p>
          <h1 className="mt-2 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-2xl font-semibold text-transparent sm:text-3xl">
            CT_Killer
          </h1>
          {scan?.breadth ? (
            <div className="mt-4">
              <SentimentBand breadth={scan.breadth} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {entitlement ? <EntitlementChip me={entitlement} /> : null}
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
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
