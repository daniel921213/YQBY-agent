"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMarketAnalysis } from "@/lib/api";
import type { AnalysisResponse } from "@/lib/types";

export function useMarketAnalysis(symbol: string | null) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!symbol) {
        setData(null);
        return;
      }
      const next = await fetchMarketAnalysis(symbol);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知的分析錯誤");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (!symbol) {
      setLoading(false);
      setData(null);
      return;
    }
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { data, loading, error, refresh };
}
