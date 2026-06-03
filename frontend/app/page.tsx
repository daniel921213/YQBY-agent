"use client";

import { useMemo, useState } from "react";
import { DetailPanel } from "@/components/recommendation/DetailPanel";
import { RecommendationStrip } from "@/components/recommendation/RecommendationStrip";
import { MarketHeader } from "@/components/dashboard/MarketHeader";
import { AnalystChat } from "@/components/analyst/AnalystChat";
import { useMarketAnalysis } from "@/hooks/useMarketAnalysis";
import { useMarketScan } from "@/hooks/useMarketScan";

export default function Page() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
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

  const selectedScanItem = scan?.items.find((item) => item.symbol === selectedSymbol) ?? null;

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <MarketHeader
          onRefresh={refresh}
          updatedLabel={updatedLabel}
          loading={scanLoading}
          scan={scan}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <RecommendationStrip
            scan={scan}
            loading={scanLoading}
            error={scanError}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />

          <div className="h-[600px] xl:sticky xl:top-5 xl:h-[calc(100vh-7rem)]">
            <AnalystChat />
          </div>
        </div>

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
      </div>
    </main>
  );
}
