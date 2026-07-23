"use client";

import type { PointerEvent } from "react";
import { useState } from "react";
import { ChevronDown, ExternalLink, Lock, Play } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/nav/PageHeader";
import { Reveal } from "@/components/visual/Reveal";
import { ScrollChapter } from "@/components/visual/ScrollChapter";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { VideoLightbox } from "@/components/nav/VideoLightbox";

type Lesson = { key: string; label: string; title: string; youtubeId?: string };

// 01 操作教學（三步驟，先不給連結 → youtubeId 留空 = 敬請期待）
const STEPS: Lesson[] = [
  { key: "gate", label: "第一步", title: "Gate 交易所教學", youtubeId: "dqTclbFTXBA" },
  { key: "anzo", label: "第二步", title: "ANZO 外匯教學及綁定 MT5", youtubeId: "36zReooNfhU" },
  { key: "tv", label: "第三步", title: "TradingView 教學", youtubeId: "x06fn6tL_Sw" }
];

// 02 初階 SMC 專區（小課程）
const SMC_LESSONS: Lesson[] = [
  { key: "smc1", label: "SMC 基礎介紹", title: "SMC 基礎介紹", youtubeId: "3H6Yw98yHDM" },
  { key: "smc2", label: "流動性與內外部的邏輯", title: "流動性與內外部的邏輯", youtubeId: "sGA1fJUV2fg" },
  { key: "smc3", label: "SMC 基礎價格元素原理", title: "SMC 基礎價格元素原理", youtubeId: "xHD3cg4BvaI" },
  { key: "smc4", label: "市場結構與價格傳遞演算法", title: "市場結構與價格傳遞演算法", youtubeId: "OvgoeL6oKJc" }
];

// 03 SNR 專區（同款小課程）
const SNR_LESSONS: Lesson[] = [
  { key: "snr1", label: "SNR1", title: "SNR 課程一（籌備中）" },
  { key: "snr2", label: "SNR2", title: "SNR 課程二（籌備中）" },
  { key: "snr3", label: "SNR3", title: "SNR 課程三（籌備中）" }
];

const LINE_URL = "https://lin.ee/RP6APHg";

function trackPointerGlow(event: PointerEvent<HTMLElement>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
}

export default function BeginnerPage() {
  const [activeVideo, setActiveVideo] = useState<Lesson | null>(null);

  const handleOpen = (lesson: Lesson) => {
    if (!lesson.youtubeId) return;
    setActiveVideo(lesson);
  };

  return (
    <AuthGuard>
      <main className="relative min-h-screen overflow-x-clip px-4 py-5 sm:px-6 lg:px-8">
        <SpaceParticleField />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
          <PageHeader
            title="新手專區"
            anchors={[
              { href: "#start", label: "快速上手" },
              { href: "#smc", label: "SMC" },
              { href: "#snr", label: "SNR" },
              { href: "#join", label: "加入核心" }
            ]}
            cta={{ href: LINE_URL, label: "加入社群", external: true }}
          />

          {/* 開場：短 hero */}
          <section className="flex flex-col items-center gap-4 px-4 pb-10 pt-14 text-center sm:pt-20">
            <Reveal>
              <p className="font-kicker text-xs tracking-[0.32em] text-gold">BEGINNER · 新手專區</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="font-display max-w-2xl bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-3xl font-black leading-tight text-transparent sm:text-5xl">
                從零開始，一步步上手
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="max-w-xl text-sm leading-7 text-slate-400">
                開戶、看盤工具、交易結構——照著順序走，新手也能穩穩上手。
              </p>
            </Reveal>
            <Reveal delay={260}>
              <ChevronDown className="mt-4 h-5 w-5 animate-bounce text-gold/60" aria-hidden />
            </Reveal>
          </section>

          {/* 章節 01：快速上手（操作教學） */}
          <ScrollChapter id="start" index="01" label="快速上手" className="pb-12 pt-8">
            <Reveal>
              <div className="mb-6 flex flex-col gap-2 text-center sm:text-left">
                <p className="font-kicker text-xs tracking-[0.28em] text-gold">STEP BY STEP · 操作教學</p>
                <h3 className="font-display text-3xl font-black text-white">快速上手</h3>
                <p className="text-sm leading-6 text-slate-400">
                  三個步驟，帶你完成開戶、綁定與看盤工具設定。
                </p>
              </div>
            </Reveal>

            <div className="grid gap-5 md:grid-cols-3">
              {STEPS.map((lesson, i) => (
                <Reveal key={lesson.key} delay={i * 90}>
                  <VideoCard lesson={lesson} onOpen={handleOpen} />
                </Reveal>
              ))}
            </div>
          </ScrollChapter>

          {/* 章節 02：初階 SMC 專區 */}
          <ScrollChapter id="smc" index="02" label="初階 SMC" className="grid items-center gap-8 py-14 md:grid-cols-5 md:gap-10 lg:py-20">
            <Reveal direction="left" className="md:col-span-2">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="font-kicker text-xs tracking-[0.28em] text-gold">COURSE · 初階 SMC</p>
                  <h3 className="font-display mt-2 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-3xl font-black tracking-tight text-transparent">
                    初階 SMC 專區
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    從市場結構、訂單塊到流動性——四堂課建立 SMC 基礎視角。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["市場結構", "訂單塊", "流動性"].map((chip) => (
                    <span
                      key={chip}
                      className="surface-sunken rounded-full px-3 py-1 text-xs tracking-wide text-slate-300"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal direction="right" delay={100} className="md:col-span-3">
              <CourseList lessons={SMC_LESSONS} onOpen={handleOpen} />
            </Reveal>
          </ScrollChapter>

          {/* 章節 03：SNR 專區（左右鏡像） */}
          <ScrollChapter id="snr" index="03" label="SNR" className="grid items-center gap-8 py-14 md:grid-cols-5 md:gap-10 lg:py-20">
            <Reveal direction="right" className="md:col-span-2 md:order-2">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="font-kicker text-xs tracking-[0.28em] text-gold">COURSE · SNR</p>
                  <h3 className="font-display mt-2 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-3xl font-black tracking-tight text-transparent">
                    SNR 專區
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    供需區間的實戰判讀——SNR 三堂課，補齊你的進出場依據。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["供給區", "需求區", "進出場依據"].map((chip) => (
                    <span
                      key={chip}
                      className="surface-sunken rounded-full px-3 py-1 text-xs tracking-wide text-slate-300"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal direction="left" delay={100} className="md:col-span-3 md:order-1">
              <CourseList lessons={SNR_LESSONS} onOpen={handleOpen} />
            </Reveal>
          </ScrollChapter>

          {/* 章節 04：CTA 加入核心 */}
          <ScrollChapter id="join" index="04" label="加入核心" className="pb-16 pt-10">
            <Reveal>
              <div className="surface-raised story-card chapter-light-fill rounded-xl border border-gold/30 px-6 py-12 text-center shadow-[0_0_40px_-12px_rgba(202,138,4,0.4)]">
                <p className="font-kicker text-xs tracking-[0.28em] text-gold">JOIN THE CORE</p>
                <h3 className="font-display mt-2 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-3xl font-black text-transparent">
                  加入核心，學習更多知識
                </h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
                  想更深入？加入 CT_Trader 核心社群，取得完整課程、即時解析與交易陪跑。
                </p>
                <div className="mt-6">
                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-gold inline-flex cursor-pointer items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold"
                  >
                    加入 LINE 核心社群
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </Reveal>
          </ScrollChapter>
        </div>

        <VideoLightbox
          youtubeId={activeVideo?.youtubeId ?? null}
          title={activeVideo?.title}
          onClose={() => setActiveVideo(null)}
        />
      </main>
    </AuthGuard>
  );
}

function VideoCard({ lesson, onOpen }: { lesson: Lesson; onOpen: (lesson: Lesson) => void }) {
  const playable = Boolean(lesson.youtubeId);

  const thumb = (
    <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900">
      {lesson.youtubeId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://i.ytimg.com/vi/${lesson.youtubeId}/hqdefault.jpg`}
          alt={lesson.title}
          className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-full border transition ${
            playable
              ? "border-gold/40 bg-gold/10 text-gold group-hover:scale-110"
              : "border-white/10 bg-black/40 text-slate-500"
          }`}
        >
          <Play className="h-5 w-5" />
        </span>
      </div>
      <span className="absolute left-3 top-3 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">
        {lesson.label}
      </span>
      {!playable ? (
        <span className="surface-sunken absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-xs text-slate-400">
          敬請期待
        </span>
      ) : null}
    </div>
  );

  if (playable) {
    return (
      <button
        type="button"
        onClick={() => onOpen(lesson)}
        onPointerMove={trackPointerGlow}
        className="surface-raised cursor-glow story-card group block w-full cursor-pointer overflow-hidden rounded-xl text-left transition hover:border-gold/40"
      >
        {thumb}
        <div className="p-4">
          <p className="text-sm font-semibold text-slate-100">{lesson.title}</p>
        </div>
      </button>
    );
  }

  return (
    <div className="surface-raised story-card block w-full cursor-default overflow-hidden rounded-xl text-left opacity-90">
      {thumb}
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-100">{lesson.title}</p>
      </div>
    </div>
  );
}

function CourseList({ lessons, onOpen }: { lessons: Lesson[]; onOpen: (lesson: Lesson) => void }) {
  return (
    <div className="relative pl-2">
      <span className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-gold/60 to-gold/10" aria-hidden />
      <div className="flex flex-col gap-3">
        {lessons.map((lesson, i) => {
          const playable = Boolean(lesson.youtubeId);
          return (
            <Reveal key={lesson.key} delay={i * 70}>
              <div className="flex items-center gap-3">
                <span className="relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm font-semibold text-gold">
                  {i + 1}
                </span>
                {playable ? (
                  <button
                    type="button"
                    onClick={() => onOpen(lesson)}
                    onPointerMove={trackPointerGlow}
                    className="surface-raised cursor-glow flex flex-1 cursor-pointer items-center justify-between rounded-lg px-4 py-3 text-left transition hover:border-gold/40"
                  >
                    <span className="text-sm font-medium text-slate-100">{lesson.label}</span>
                    <Play className="h-4 w-4 text-gold" />
                  </button>
                ) : (
                  <div className="surface-raised flex flex-1 cursor-default items-center justify-between rounded-lg px-4 py-3">
                    <span className="text-sm font-medium text-slate-300">{lesson.label}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Lock className="h-3.5 w-3.5" />
                      敬請期待
                    </span>
                  </div>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
