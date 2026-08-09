"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMe, type Entitlement } from "@/lib/api";

/**
 * 登入者的使用資格（方案 / 剩餘天數 / 是否有效）。
 * 未登入或請求失敗時維持 null——登入導向交給 AuthGuard，這裡不重複處理。
 */
export function useEntitlement() {
  const [me, setMe] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await fetchMe());
      setError(null);
    } catch (caught) {
      setMe(null);
      setError(caught instanceof Error ? caught.message : "帳號資格讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { me, loading, error, refresh };
}
