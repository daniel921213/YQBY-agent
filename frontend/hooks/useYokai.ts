"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchYokai } from "@/lib/api";
import type { YokaiResponse } from "@/lib/types";

export function useYokai() {
  const [data, setData] = useState<YokaiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchYokai();
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : "妖怪情報讀取失敗");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
