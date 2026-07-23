import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  BellRing,
  Check,
  Crosshair,
  ExternalLink,
  Gauge,
  ShieldCheck,
  TrendingUp,
  X
} from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/nav/PageHeader";
import { NovaChartVisual } from "@/components/indicators/NovaChartVisual";
import { NovaScrollStage } from "@/components/indicators/NovaScrollStage";
import { PointerGlow } from "@/components/visual/PointerGlow";
import { Reveal } from "@/components/visual/Reveal";
import { ScrollChapter } from "@/components/visual/ScrollChapter";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";

export const metadata: Metadata = {
  title: "CT_NOVA | Vegas 雙隧道與 Squeeze Momentum 加密合約交易指標",
  description:
    "CT_NOVA 是一款 TradingView 指標，結合 Vegas EMA 雙通道、EMA12 回踩收復、LazyBear Squeeze Momentum 與 ATR 風控，協助交易者辨識趨勢回踩進場機會。"
};

// 開通 NOVA 指標：導向 LINE 官方帳號
const ACTIVATE_URL = "https://lin.ee/RP6APHg";

const SELLING_POINTS = [
  {
    icon: TrendingUp,
    title: "趨勢先行",
    text: "144/169 × 576/676 雙通道判定多空排列，趨勢不明確就不出手。"
  },
  {
    icon: Crosshair,
    title: "回踩確認",
    text: "不追突破，等價格回踩後重新站回 EMA12 才考慮進場。"
  },
  {
    icon: Gauge,
    title: "動能過濾",
    text: "Squeeze Momentum 需同向增強，才放行訊號。"
  },
  {
    icon: ShieldCheck,
    title: "風控內建",
    text: "訊號成立即標出進場、停損、TP1、TP2。"
  }
] as const;

const STEPS = [
  { title: "判斷趨勢", text: "小通道在大通道上方只找多、下方只找空。" },
  { title: "等待突破", text: "價格收盤突破通道，指標進入「武裝狀態」。" },
  { title: "等待回踩", text: "價格回到 EMA12 與通道之間的指定深度，不追價。" },
  { title: "收復 EMA12", text: "回踩後首次重新站回 EMA12，並通過 ATR 距離檢查。" },
  { title: "動能確認", text: "Squeeze Momentum 同向增強，觸發進場訊號。" }
] as const;

const LEGEND = [
  { color: "#22d3ee", label: "小 Vegas 通道 144/169" },
  { color: "#fb923c", label: "大 Vegas 通道 576/676" },
  { color: "#a78bfa", label: "EMA12 觸發線" },
  { color: "rgba(148,163,184,0.6)", label: "Squeeze 壓縮區（灰底）" },
  { color: "#f0c876", label: "進場 / 停損 / TP 水平線" },
  { color: "#2dd4bf", label: "CT_Squeeze 動能柱" }
] as const;

const PARAMS = [
  ["小通道 EMA", "144 / 169"],
  ["大通道 EMA", "576 / 676"],
  ["觸發 EMA", "12"],
  ["Squeeze BB / KC", "20 / 20"],
  ["追高防護", "0.75 ATR"],
  ["初始停損", "2.5 ATR"],
  ["TP1", "+1R（預設平倉 60%）"],
  ["TP2", "+2.5R"],
  ["4H 過濾", "可選開關"]
] as const;

const FIT = ["偏好趨勢交易、順勢操作", "習慣等回踩再進場", "需要明確的停損與目標價位"];
const UNFIT = ["想每一段行情都參與", "追求高頻、大量訊號", "不使用停損的交易方式"];

const PRODUCT_STATS = [
  ["15m", "主要判讀週期"],
  ["05", "訊號確認步驟"],
  ["4H", "可選同向過濾"],
  ["2.5 ATR", "預設初始停損"]
] as const;

const FAQS = [
  {
    question: "CT_NOVA 適合什麼交易方式？",
    answer: "它以趨勢回踩為核心，適合願意等待條件完整、並且會執行停損的交易者；不以高頻出訊號為目標。"
  },
  {
    question: "為什麼主要使用 15m？",
    answer: "指標的趨勢、回踩深度與動能條件以加密合約 15m 設計；4H 可以作為更高週期的同向過濾。"
  },
  {
    question: "出現訊號就一定會獲利嗎？",
    answer: "不會。CT_NOVA 是條件與風控工具，不是獲利保證；每筆交易仍可能停損，使用者需要控制倉位與總風險。"
  },
  {
    question: "訊號成立時會顯示哪些價格？",
    answer: "畫面會標示進場、初始停損、TP1 與 TP2，讓交易計畫在進場前就有明確邊界。"
  }
] as const;

export default function CtNovaPage() {
  return (
    <AuthGuard>
      <main className="relative min-h-screen overflow-x-clip px-4 py-5 sm:px-6 lg:px-8">
        <SpaceParticleField />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5">
          <PageHeader
            title="CT_NOVA"
            backHref="/indicators"
            backLabel="返回指標專區"
            anchors={[
              { href: "#principles", label: "特色" },
              { href: "#how", label: "流程" },
              { href: "#chart", label: "圖表" },
              { href: "#params", label: "參數" },
              { href: "#faq", label: "FAQ" }
            ]}
          />

          <NovaScrollStage activateUrl={ACTIVATE_URL} />

          {/* ② 核心賣點 */}
          <ScrollChapter id="principles" index="01" label="四個設計原則" className="py-14">
            <Reveal>
              <p className="font-kicker text-center text-xs tracking-[0.28em] text-gold">WHY CT_NOVA</p>
              <h3 className="font-display mt-2 text-center text-3xl font-black text-slate-100">
                四個設計原則
              </h3>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {SELLING_POINTS.map((point, i) => (
                <Reveal key={point.title} delay={i * 90}>
                  <PointerGlow className="story-card surface lift h-full rounded-xl">
                    <div className="flex h-full flex-col gap-3 p-5">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                        <point.icon className="h-5 w-5" />
                      </span>
                      <p className="text-base font-semibold text-slate-100">{point.title}</p>
                      <p className="text-[13px] leading-6 text-slate-400">{point.text}</p>
                    </div>
                  </PointerGlow>
                </Reveal>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PRODUCT_STATS.map(([value, label], index) => (
                <Reveal key={label} delay={120 + index * 70}>
                  <div className="surface-sunken chapter-light-fill rounded-xl px-4 py-5 text-center">
                    <strong className="font-data block text-2xl text-ember sm:text-3xl">{value}</strong>
                    <span className="mt-2 block text-xs text-slate-500">{label}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </ScrollChapter>

          {/* ③ 運作五步驟：中央金色 spine，左右交錯進場 */}
          <ScrollChapter id="how" index="02" label="訊號五步驟" className="py-16">
            <Reveal>
              <p className="font-kicker text-center text-xs tracking-[0.28em] text-gold">HOW IT WORKS</p>
              <h3 className="font-display mt-2 text-center text-3xl font-black text-slate-100">
                一個訊號的誕生，要過五關
              </h3>
            </Reveal>

            <div className="relative mx-auto mt-12 max-w-4xl">
              <span
                aria-hidden
                className="absolute bottom-2 left-5 top-2 w-px bg-gradient-to-b from-gold/0 via-gold/40 to-gold/0 md:left-1/2"
              />
              {STEPS.map((step, i) => {
                const rightSide = i % 2 === 1;
                return (
                  <Reveal
                    key={step.title}
                    direction={rightSide ? "right" : "left"}
                    className="relative mb-10 pl-14 last:mb-0 md:pl-0"
                  >
                    <span className="absolute left-5 top-0 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-gold/40 bg-obsidian text-xs font-semibold text-gold shadow-[0_0_18px_rgba(202,138,4,0.3)] md:left-1/2">
                      0{i + 1}
                    </span>
                    <div
                      className={`md:w-[calc(50%-3.25rem)] ${
                        rightSide ? "md:ml-auto md:text-left" : "md:text-right"
                      }`}
                    >
                      <h4 className="text-base font-semibold text-slate-100">{step.title}</h4>
                      <p className="mt-1.5 text-sm leading-7 text-slate-400">{step.text}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </ScrollChapter>

          {/* ④ 畫面介紹：文左圖右 */}
          <ScrollChapter id="chart" index="03" label="圖表畫面" className="grid items-center gap-8 py-16 md:grid-cols-5 md:gap-10">
            <Reveal direction="left" className="md:col-span-2">
              <p className="text-xs tracking-[0.28em] text-gold">CHART LAYOUT</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-100">面板一眼看懂</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                通道排列、觸發線、動能柱與風控價格全部畫在圖上；右上角面板即時顯示目前階段、
                方向、Squeeze 動能與 4H 同向狀態。
              </p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {LEGEND.map((item, i) => (
                  <Reveal key={item.label} direction="left" delay={100 + i * 60}>
                    <li className="flex items-center gap-2.5 text-[13px] text-slate-300">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }}
                      />
                      {item.label}
                    </li>
                  </Reveal>
                ))}
              </ul>
            </Reveal>

            <Reveal direction="right" delay={120} className="md:col-span-3">
              <div className="surface-raised overflow-hidden rounded-xl">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                  <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(240,200,118,0.8)]" aria-hidden />
                  <span className="text-xs font-medium tracking-wide text-slate-200">CT_NOVA</span>
                  <span className="text-xs text-slate-500">BTCUSDT.P · 15m</span>
                  <span className="ml-auto rounded border border-long/30 bg-long/10 px-2 py-0.5 text-xs text-long">
                    訊號成立
                  </span>
                </div>
                <div className="p-2 sm:p-3">
                  <NovaChartVisual />
                </div>
              </div>
            </Reveal>
          </ScrollChapter>

          {/* ⑤ 適合誰 / 不適合誰 */}
          <ScrollChapter id="fit" index="04" label="適用對象" className="py-16">
            <div className="grid gap-4 md:grid-cols-2">
              <Reveal direction="left">
                <div className="surface h-full rounded-xl border-l-2 border-l-long/50 p-6">
                  <p className="flex items-center gap-2 text-base font-semibold text-long">
                    <Check className="h-4 w-4" />
                    適合誰
                  </p>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {FIT.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-300">
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-long/70" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal direction="right" delay={100}>
                <div className="surface h-full rounded-xl border-l-2 border-l-short/50 p-6">
                  <p className="flex items-center gap-2 text-base font-semibold text-short">
                    <X className="h-4 w-4" />
                    不適合誰
                  </p>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {UNFIT.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-300">
                        <X className="mt-1 h-3.5 w-3.5 shrink-0 text-short/70" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-[13px] leading-6 text-slate-500">
                    CT_NOVA 不是高頻訊號工具，而是等待結構、動能與風險距離同時達標的篩選器。
                  </p>
                </div>
              </Reveal>
            </div>

            <Reveal delay={160}>
              <p className="mt-14 text-center text-2xl font-semibold tracking-[0.08em] sm:text-3xl">
                <span className="bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-transparent">
                  少交易・重條件・先風控
                </span>
              </p>
            </Reveal>
          </ScrollChapter>

          {/* ⑥ 參數一覽 + 警報 */}
          <ScrollChapter id="params" index="05" label="參數一覽" className="py-16">
            <Reveal>
              <p className="text-center text-xs tracking-[0.28em] text-gold">PARAMETERS</p>
              <h3 className="mt-2 text-center text-2xl font-semibold text-slate-100">參數一覽</h3>
            </Reveal>
            <Reveal delay={100}>
              <div className="surface-sunken mx-auto mt-8 max-w-2xl overflow-hidden rounded-xl">
                <dl className="divide-y divide-white/5">
                  {PARAMS.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                      <dt className="text-sm text-slate-400">{label}</dt>
                      <dd className="text-sm font-medium tabular-nums text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <p className="mx-auto mt-5 flex max-w-2xl items-start gap-2.5 px-2 text-[13px] leading-6 text-slate-400">
                <BellRing className="mt-1 h-4 w-4 shrink-0 text-gold/70" />
                支援 TradingView 警報（建立時選「Any alert() function
                call」）：訊號確認後自動帶出方向、商品、進場價、停損價、TP1、TP2 與 Squeeze 狀態。
              </p>
            </Reveal>
          </ScrollChapter>

          <ScrollChapter id="faq" index="06" label="常見問題" className="py-16">
            <Reveal>
              <p className="font-kicker text-center text-xs tracking-[0.28em] text-gold">
                QUESTIONS
              </p>
              <h3 className="font-display mt-2 text-center text-3xl font-black text-slate-100">
                常見問題
              </h3>
            </Reveal>
            <Reveal delay={100}>
              <div className="glass-panel mx-auto mt-8 max-w-3xl rounded-2xl px-5 sm:px-7">
                {FAQS.map((item) => (
                  <details key={item.question} className="story-faq">
                    <summary>
                      <span className="text-sm font-medium sm:text-base">{item.question}</span>
                      <span className="story-faq-plus" aria-hidden />
                    </summary>
                    <p className="max-w-2xl pb-5 pr-8 text-sm leading-7 text-slate-400">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </Reveal>
          </ScrollChapter>

          {/* ⑦ 頁尾：CTA 收束 + 風險聲明 */}
          <section className="flex flex-col items-center gap-6 pb-14 pt-6 text-center">
            <Reveal>
              <a
                href={ACTIVATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold inline-flex cursor-pointer items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold"
              >
                開通 NOVA 指標
                <ExternalLink className="h-4 w-4" />
              </a>
            </Reveal>
            <Reveal delay={80}>
              <Link
                href="/indicators"
                className="text-sm text-slate-400 transition hover:text-ember"
              >
                ← 返回指標專區
              </Link>
            </Reveal>
            <p className="max-w-3xl border-t border-white/5 pt-6 text-xs leading-6 text-slate-600">
              CT_NOVA 為技術分析輔助工具，不構成投資建議；任何回測或歷史表現都不代表未來績效。
              加密貨幣與槓桿商品交易具高風險，請自行控管倉位、停損與資金風險。
            </p>
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
