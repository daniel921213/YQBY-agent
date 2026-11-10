"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMarketScan } from "@/lib/api";
import type { MarketKind, ScanResponse } from "@/lib/types";

export function useMarketScan(market: MarketKind = "crypto") {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMarketScan(market);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知的掃描錯誤");
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { data, loading, error, refresh };
}
