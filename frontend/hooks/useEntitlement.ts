"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMe, type Entitlement } from "@/lib/api";

/**
 * 登入者的使用資格（方案 / 剩餘天數 / 是否有效）。
 * 未登入或請求失敗時維持 null——登入導向交給 AuthGuard，這裡不重複處理。
 */
export function useEntitlement() {
  const [me, setMe] = useState<Entitlement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await fetchMe());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { me, refresh };
}
