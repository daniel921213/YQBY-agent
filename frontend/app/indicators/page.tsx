import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Crosshair,
  Gauge,
  Hourglass,
  ShieldCheck,
  TrendingUp
} from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/nav/PageHeader";
import { NovaChartVisual } from "@/components/indicators/NovaChartVisual";
import { PointerGlow } from "@/components/visual/PointerGlow";
import { Reveal } from "@/components/visual/Reveal";
import { ScrollChapter } from "@/components/visual/ScrollChapter";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";

const NOVA_POINTS = [
  { icon: TrendingUp, title: "趨勢先行", text: "雙通道判定多空排列，趨勢不明確就不出手" },
  { icon: Crosshair, title: "回踩確認", text: "不追突破，等價格回踩後重新站回 EMA12" },
  { icon: Gauge, title: "動能過濾", text: "Squeeze Momentum 需同向增強，才放行訊號" },
  { icon: ShieldCheck, title: "風控內建", text: "訊號成立即標出進場、停損、TP1、TP2" }
] as const;

export default function IndicatorsPage() {
  return (
    <AuthGuard>
      <main className="relative min-h-screen overflow-x-clip px-4 py-5 sm:px-6 lg:px-8">
        <SpaceParticleField />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
          <PageHeader
            title="指標專區"
            anchors={[
              { href: "#nova", label: "CT_NOVA" },
              { href: "#next", label: "COMING NEXT" }
            ]}
            cta={{ href: "/indicators/ct-nova", label: "查看 NOVA" }}
          />

          {/* 開場：短 hero，往下是章節式內容 */}
          <section className="flex flex-col items-center gap-4 px-4 pb-10 pt-14 text-center sm:pt-20">
            <Reveal>
              <p className="font-kicker text-xs tracking-[0.32em] text-gold">INDICATORS</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="font-display max-w-2xl bg-gradient-to-b from-white to-slate-400 bg-clip-text text-3xl font-black leading-tight text-transparent sm:text-5xl">
                用結構與動能，取代直覺
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="max-w-xl text-sm leading-7 text-slate-400">
                CT_Trader 自研的技術指標系列——每一個都為特定的交易場景打造，
                把進場條件與風控價格直接畫在圖上。
              </p>
            </Reveal>
            <Reveal delay={260}>
              <ChevronDown className="mt-4 h-5 w-5 animate-bounce text-gold/60" aria-hidden />
            </Reveal>
          </section>

          {/* 章節 01：CT_NOVA（文左圖右，滾動時左右合攏） */}
          <ScrollChapter id="nova" index="01" label="CT_NOVA" className="grid items-center gap-8 py-12 md:grid-cols-5 md:gap-10 lg:py-20">
            <Reveal direction="left" className="md:col-span-2">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="font-kicker text-xs tracking-[0.28em] text-gold">INDICATOR 01</p>
                  <h3 className="font-display mt-2 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-4xl font-black tracking-tight text-transparent">
                    CT_NOVA
                  </h3>
                  <p className="mt-3 text-base font-medium text-slate-200">
                    Vegas 雙隧道 × Squeeze Momentum 趨勢回踩指標
                  </p>
                </div>

                <ul className="flex flex-col gap-3">
                  {NOVA_POINTS.map((point, i) => (
                    <Reveal key={point.title} direction="left" delay={120 + i * 80}>
                      <li className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                          <point.icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{point.title}</p>
                          <p className="text-[13px] leading-6 text-slate-400">{point.text}</p>
                        </div>
                      </li>
                    </Reveal>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-2">
                  {["15m 主圖", "4H 同向過濾", "ATR 風控", "TradingView"].map((chip) => (
                    <span
                      key={chip}
                      className="surface-sunken rounded-full px-3 py-1 text-xs tracking-wide text-slate-300"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                <div>
                  <Link
                    href="/indicators/ct-nova"
                    className="btn-gold inline-flex cursor-pointer items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold"
                  >
                    查看完整介紹
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal direction="right" delay={100} className="md:col-span-3">
              <PointerGlow className="story-card surface-raised rounded-xl">
                <div className="overflow-hidden rounded-xl">
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                    <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(240,200,118,0.8)]" aria-hidden />
                    <span className="font-kicker text-xs font-medium tracking-wide text-slate-200">CT_NOVA</span>
                    <span className="font-data text-xs text-slate-500">BTCUSDT.P · 15m</span>
                    <span className="ml-auto rounded border border-long/30 bg-long/10 px-2 py-0.5 text-xs text-long">
                      訊號成立
                    </span>
                  </div>
                  <div className="p-2 sm:p-3">
                    <NovaChartVisual />
                  </div>
                </div>
              </PointerGlow>
            </Reveal>
          </ScrollChapter>

          {/* 章節 02：籌備中 */}
          <ScrollChapter id="next" index="02" label="下一個指標" className="pb-16 pt-8">
            <Reveal>
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-12 text-center">
                <p className="text-xs tracking-[0.28em] text-slate-500">INDICATOR 02</p>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-500">
                  <Hourglass className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold text-slate-300">下一個指標正在打磨</h3>
                <p className="max-w-sm text-sm leading-6 text-slate-500">
                  完成後會在這裡與你見面，敬請期待。
                </p>
              </div>
            </Reveal>
          </ScrollChapter>
        </div>
      </main>
    </AuthGuard>
  );
}
