"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Bot, ListFilter, X } from "lucide-react";
import { DetailPanel } from "@/components/recommendation/DetailPanel";
import { MarketHeader } from "@/components/dashboard/MarketHeader";
import { MarketOverviewBar } from "@/components/dashboard/MarketOverviewBar";
import { AnomalyPanel } from "@/components/dashboard/AnomalyPanel";
import { ScreenerTable } from "@/components/dashboard/ScreenerTable";
import { DataRankings } from "@/components/dashboard/DataRankings";
import { AnomalyHistoryModal } from "@/components/dashboard/AnomalyHistoryModal";
import { AnalystChat } from "@/components/analyst/AnalystChat";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { useMarketAnalysis } from "@/hooks/useMarketAnalysis";
import { useMarketScan } from "@/hooks/useMarketScan";

type Tab = "anomaly" | "screener" | "data";

export default function Page() {
  // Gate the whole dashboard behind login — not logged in => redirect to /login.
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}

function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("anomaly");
  const { data: scan, loading: scanLoading, error: scanError, refresh } = useMarketScan();
  const { data: analysis, loading: analysisLoading, error: analysisError } =
    useMarketAnalysis(selectedSymbol);

  const updatedLabel = useMemo(() => {
    if (!scan) return "--";
    return new Intl.DateTimeFormat("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());
  }, [scan]);

  const items = scan?.items ?? [];
  const universe = scan?.universe ?? [];
  const selectedScanItem = items.find((item) => item.symbol === selectedSymbol) ?? null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "anomaly", label: "異常警報", icon: <AlertTriangle className="h-4 w-4" />, count: items.length },
    { key: "screener", label: "選幣 · 全市場", icon: <ListFilter className="h-4 w-4" />, count: universe.length },
    { key: "data", label: "數據榜單", icon: <BarChart3 className="h-4 w-4" /> }
  ];

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <SpaceParticleField />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
        <MarketHeader
          onRefresh={refresh}
          updatedLabel={updatedLabel}
          loading={scanLoading}
          scan={scan}
        />

        <MarketOverviewBar scan={scan} />

        {scanError ? (
          <section className="rounded-md border border-short/30 bg-short/10 px-4 py-4 text-sm text-red-100">
            {scanError}
          </section>
        ) : !scan ? (
          <section className="surface-sunken flex h-36 items-center justify-center rounded-lg text-sm text-slate-400">
            {scanLoading ? "掃描中…" : "目前沒有掃描資料"}
          </section>
        ) : (
          <>
            <nav className="flex flex-wrap gap-1 border-b border-white/10">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${
                    tab === t.key
                      ? "border-ember text-slate-50"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {typeof t.count === "number" ? (
                    <span className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-400">
                      {t.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>

            {tab === "anomaly" ? (
              <AnomalyPanel
                items={items}
                selectedSymbol={selectedSymbol}
                onSelect={setSelectedSymbol}
                onShowHistory={() => setHistoryOpen(true)}
              />
            ) : null}
            {tab === "screener" ? (
              <ScreenerTable
                rows={universe}
                onSelect={setSelectedSymbol}
                selectedSymbol={selectedSymbol}
              />
            ) : null}
            {tab === "data" ? (
              <DataRankings
                universe={universe}
                movers={scan.oi_movers}
                onSelect={setSelectedSymbol}
              />
            ) : null}
          </>
        )}

        {selectedSymbol ? (
          <DetailPanel
            analysis={analysis}
            selectedScanItem={selectedScanItem}
            loading={analysisLoading}
            error={analysisError}
            symbol={selectedSymbol}
            onClose={() => setSelectedSymbol(null)}
          />
        ) : null}

        {historyOpen ? <AnomalyHistoryModal onClose={() => setHistoryOpen(false)} /> : null}
      </div>

      {/* Collapsible analyst — frees the full width for the tables when closed. */}
      {!analystOpen ? (
        <button
          type="button"
          onClick={() => setAnalystOpen(true)}
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border border-ember/40 bg-ember/15 px-4 py-2.5 text-sm font-medium text-ember shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_24px_rgba(76,194,255,0.25)] backdrop-blur transition hover:bg-ember/25 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_36px_rgba(76,194,255,0.4)]"
        >
          <Bot className="h-4 w-4" />
          分析師
        </button>
      ) : (
        <div className="glass-panel fixed right-0 top-0 z-40 flex h-screen w-full max-w-[400px] flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs tracking-[0.18em] text-ember">YQBY 分析師</span>
            <button
              type="button"
              onClick={() => setAnalystOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-ember/60 hover:text-ember"
              title="收合"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AnalystChat />
          </div>
        </div>
      )}
    </main>
  );
}
