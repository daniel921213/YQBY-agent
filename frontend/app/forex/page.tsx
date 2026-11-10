"use client";

import { DashboardScreen } from "@/components/dashboard/DashboardScreen";

/** 主控台-外匯版：Binance 傳統市場永續合約（黃金、原油、美股…，對齊 Bitget 名單）。 */
export default function ForexPage() {
  return <DashboardScreen market="tradfi" />;
}
