"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { WeeklyBrief } from "@/components/weekly/WeeklyBrief";

// 每週消息面：任何已登入帳號都能看（不檢查方案）。
export default function WeeklyPage() {
  return (
    <AuthGuard>
      <WeeklyBrief />
    </AuthGuard>
  );
}
