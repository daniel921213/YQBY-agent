"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, LockKeyhole, Orbit, Radar, ShieldCheck, Sparkles } from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { SideNav } from "@/components/nav/SideNav";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import type { Entitlement } from "@/lib/api";
import { ThemeToggle } from "@/lib/theme";

const CONTACT_URL = "https://lin.ee/RP6APHg";

const PREVIEW_NODES = [
  { label: "AI", x: "16%", y: "32%", heat: "84.2", tone: "#4cc2ff" },
  { label: "BTCFi", x: "39%", y: "19%", heat: "71.8", tone: "#f0c876" },
  { label: "RWA", x: "64%", y: "28%", heat: "67.4", tone: "#7ce5c3" },
  { label: "DePIN", x: "81%", y: "53%", heat: "58.1", tone: "#d78bff" },
  { label: "PayFi", x: "55%", y: "72%", heat: "49.6", tone: "#ff8f9f" },
  { label: "Layer 2", x: "24%", y: "68%", heat: "44.3", tone: "#61c8ff" }
] as const;

const PREVIEW_TOKENS = [
  ["TAOUSDT", "顯形", "+6.4%", "觀察中"],
  ["ONDOUSDT", "發酵", "+4.8%", "做多確認"],
  ["STXUSDT", "潛伏", "+2.1%", "觀察中"]
] as const;

function planLabel(plan: Entitlement["plan"]): string {
  if (plan === "trial") return "7 天試用帳號";
  if (plan === "member") return "30 天正式帳號";
  if (plan === "unactivated") return "尚未啟用帳號";
  return "永久帳號";
}

export function YokaiAccessWall({ entitlement }: { entitlement: Entitlement }) {
  return (
    <main className="yokai-shell relative min-h-screen overflow-hidden px-3 pb-24 pt-3 sm:px-5 lg:px-8 lg:pb-16 lg:pt-5">
      <SpaceParticleField />
      <div className="yokai-aurora" aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-[1500px]">
        <header className="glass-panel flex items-center gap-3 rounded-xl px-3 py-3 sm:px-4">
          <SideNav />
          <div className="min-w-0">
            <p className="font-kicker truncate text-[9px] tracking-[0.26em] text-gold sm:text-[10px]">
              YOKAI NARRATIVE INTELLIGENCE
            </p>
            <h1 className="font-display mt-0.5 truncate bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-lg font-black text-transparent sm:text-xl">
              妖怪篩選器
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-gold/20 bg-gold/[.06] px-3 py-1.5 text-[10px] text-gold sm:inline-flex">
              INTERNAL PREVIEW
            </span>
            <ThemeToggle />
            <div className="hidden sm:block"><AccountMenu /></div>
          </div>
        </header>

        <section className="relative mt-5 min-h-[76svh] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#030711]/92">
          <div aria-hidden className="pointer-events-none select-none p-3 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
              <div className="relative h-[350px] overflow-hidden rounded-2xl border border-ember/15 bg-[radial-gradient(circle_at_center,rgba(32,123,194,.16),transparent_48%),linear-gradient(160deg,#081225,#02050c)] sm:h-[430px]">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(76,194,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(76,194,255,.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
                <div className="absolute left-5 top-5 flex items-center gap-2 text-xs text-slate-400">
                  <Radar className="h-4 w-4 text-ember" />
                  妖氣偵測核心
                </div>
                <div className="absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-gold/30 bg-gold/[.06] text-gold shadow-[0_0_60px_rgba(202,138,4,.18)]">
                  <Orbit className="h-8 w-8" />
                </div>
                {PREVIEW_NODES.map((node) => (
                  <div key={node.label} className="absolute flex items-center gap-2" style={{ left: node.x, top: node.y, color: node.tone }}>
                    <span className="h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_18px_currentColor]" />
                    <span>
                      <strong className="block text-xs text-slate-200">{node.label}</strong>
                      <small className="font-data text-[9px] text-current">{node.heat}</small>
                    </span>
                  </div>
                ))}
              </div>

              <div className="surface-sunken overflow-hidden rounded-2xl p-4 sm:p-5">
                <p className="font-kicker text-[9px] tracking-[0.22em] text-ember">GATE CONFIRMATION MATRIX</p>
                <h2 className="mt-1 text-lg font-bold text-slate-100">Gate 幣種確認</h2>
                <div className="mt-5 space-y-2">
                  {PREVIEW_TOKENS.map(([symbol, lifecycle, change, state]) => (
                    <div key={symbol} className="rounded-xl border border-white/[.07] bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="font-data text-sm text-slate-200">{symbol}</strong>
                        <span className="text-[10px] text-ember">{lifecycle}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>24h <b className="font-normal text-long">{change}</b></span>
                        <span>{state}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {["市場結構", "資金流", "5m 時機"].map((label) => (
                    <div key={label} className="rounded-lg border border-white/[.06] bg-white/[.025] px-2 py-3 text-center text-[10px] text-slate-500">{label}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div aria-hidden className="absolute inset-0 backdrop-blur-[4px]" />
          <div aria-hidden className="absolute inset-0 backdrop-blur-[15px] [mask-image:linear-gradient(180deg,transparent_0%,#000_42%)]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#030711]/20 via-[#030711]/60 to-[#030711]/90" />

          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="glass-panel relative flex w-full max-w-lg flex-col items-center overflow-hidden rounded-2xl px-6 py-8 text-center sm:px-10 sm:py-10">
              <div aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent shadow-[0_0_18px_rgba(240,200,118,.7)]" />
              <span className="font-kicker mb-5 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/[.07] px-3 py-1.5 text-[9px] tracking-[0.2em] text-gold">
                <ShieldCheck className="h-3.5 w-3.5" />
                PERMANENT ACCESS ONLY
              </span>
              <span className="relative grid h-16 w-16 place-items-center rounded-full border border-gold/35 bg-gold/10 text-gold shadow-[0_0_38px_rgba(202,138,4,.28)]">
                <LockKeyhole className="h-7 w-7" />
                <span className="absolute inset-0 animate-ping rounded-full border border-gold/15" />
              </span>
              <h2 className="font-display mt-5 text-2xl font-black text-slate-50 sm:text-3xl">妖怪篩選器・內部測試中</h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
                此功能目前只開放永久帳號。題材情報與 Gate 市場資料仍在調整，完成測試後會再評估正式開放範圍。
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-ember" />
                目前資格：{planLabel(entitlement.plan)}
              </div>
              <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
                <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-slate-300 transition hover:border-ember/35 hover:text-ember">
                  <ArrowLeft className="h-4 w-4" />返回主控台
                </Link>
                <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="btn-gold inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold">
                  聯絡管理員<ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
