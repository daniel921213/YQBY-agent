"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/nav/PageHeader";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { useEntitlement } from "@/hooks/useEntitlement";

const CONTACT_URL = "https://lin.ee/RP6APHg";

export function MemberFeatureGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { me, loading, error, refresh } = useEntitlement();

  if (loading || !me) return <main className="relative grid min-h-screen place-items-center px-4"><SpaceParticleField /><div className="glass-panel relative z-10 flex w-full max-w-sm flex-col items-center rounded-xl border border-white/10 p-8 text-center"><span className="text-gold">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ShieldAlert className="h-6 w-6" />}</span><p className="mt-4 text-sm text-slate-300">{loading ? "正在確認帳號權限…" : error ?? "帳號權限讀取失敗"}</p>{!loading && <button onClick={() => void refresh()} className="mt-5 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200">重新檢查</button>}</div></main>;

  if (me.plan === "lifetime" || (me.plan === "member" && me.active)) return <>{children}</>;

  const plan = me.plan === "trial" ? "7 天試用" : me.plan === "member" ? "30 天權限已到期" : "尚未啟用";
  return <main className="relative min-h-screen px-4 py-5 sm:px-6 lg:px-8"><SpaceParticleField /><div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-5"><PageHeader title={title} kicker="MEMBER ACCESS" /><section className="glass-panel mx-auto mt-8 flex w-full max-w-lg flex-col items-center rounded-2xl border border-white/10 px-6 py-10 text-center sm:px-10"><div className="grid h-16 w-16 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold"><LockKeyhole className="h-7 w-7" /></div><h1 className="mt-5 text-2xl font-bold text-white">解鎖{title}</h1><p className="mt-3 text-sm leading-7 text-slate-400">此功能僅開放有效的 30 天會員與永久會員。你的交易紀錄和日誌會保留，開通後可繼續使用。</p><p className="mt-3 text-xs text-slate-500">目前資格：{plan}</p><div className="mt-7 flex w-full flex-col gap-2 sm:flex-row"><Link href="/" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-300"><ArrowLeft className="h-4 w-4" />返回主控台</Link><a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3 text-sm font-bold text-slate-950">洽詢開通<ExternalLink className="h-4 w-4" /></a></div></section></div></main>;
}
