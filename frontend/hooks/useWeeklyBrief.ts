"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWeeklyBrief } from "@/lib/api";
import type { WeeklyBriefResponse } from "@/lib/types";

/** 每週消息面：後端每小時更新，前端每 5 分鐘輪詢一次即可。 */
export function useWeeklyBrief() {
  const [data, setData] = useState<WeeklyBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchWeeklyBrief();
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : "每週消息面讀取失敗");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
