"use client";

import { CalendarClock } from "lucide-react";
import type { Entitlement } from "@/lib/api";

const taipeiDate = (value: string | number) => new Date(value).toLocaleString("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
});

export function ScheduledMembership({ me }: { me: Entitlement }) {
  return <section className="glass-panel relative z-10 mx-auto my-8 w-full max-w-lg rounded-2xl border border-gold/20 p-8 text-center">
    <CalendarClock className="mx-auto h-10 w-10 text-gold" />
    <h1 className="mt-5 text-2xl font-bold text-white">會員方案已排定</h1>
    <p className="mt-3 text-sm leading-7 text-slate-300">已為你設定 30 天會員，到指定時間會自動開通，無需輸入啟動碼。</p>
    <dl className="mt-5 space-y-3 text-sm text-slate-300">
      <div><dt className="text-xs text-slate-500">開始時間（台灣）</dt><dd className="mt-1">{me.starts_at ? taipeiDate(me.starts_at) : "—"}</dd></div>
      <div><dt className="text-xs text-slate-500">使用至（台灣）</dt><dd className="mt-1">{me.expires_at ? taipeiDate(new Date(me.expires_at).getTime() - 1) : "—"}</dd></div>
    </dl>
    <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200">重新確認資格</button>
  </section>;
}
