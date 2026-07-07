"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/nav/PageHeader";
import { Reveal } from "@/components/visual/Reveal";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { MentorCard } from "@/components/mentors/MentorCard";
import { MentorSpotlight } from "@/components/mentors/MentorSpotlight";
import { MENTORS } from "@/components/mentors/mentors-data";

const LINE_URL = "https://lin.ee/RP6APHg";

const activeMentors = MENTORS.filter((mentor) => mentor.status !== "coming");

export default function MentorsPage() {
  const [sel, setSel] = useState<number | null>(null);

  return (
    <AuthGuard>
      <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
        <SpaceParticleField />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
          <PageHeader title="導師專區" />

          {/* 開場：短 hero */}
          <section className="flex flex-col items-center gap-4 px-4 pb-10 pt-14 text-center sm:pt-20">
            <Reveal>
              <p className="text-xs tracking-[0.32em] text-gold">MENTORS · 導師專區</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="max-w-2xl bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-3xl font-semibold leading-tight text-transparent sm:text-4xl">
                認識帶你上手的每一位導師
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="max-w-xl text-sm leading-7 text-slate-400">
                CT_Trader 團隊陣容——點任一位導師，看看他們專精的領域與交易風格。
              </p>
            </Reveal>
          </section>

          {/* 導師牆 */}
          <section className="pb-10">
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
              {MENTORS.map((mentor, i) => (
                <Reveal key={mentor.key} delay={Math.min(i, 8) * 60}>
                  <MentorCard
                    mentor={mentor}
                    onOpen={() => setSel(activeMentors.findIndex((m) => m.key === mentor.key))}
                  />
                </Reveal>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="pb-16 pt-4">
            <Reveal>
              <div className="surface-raised rounded-xl border border-gold/30 px-6 py-12 text-center shadow-[0_0_40px_-12px_rgba(202,138,4,0.4)]">
                <p className="text-xs tracking-[0.28em] text-gold">JOIN THE CORE</p>
                <h3 className="mt-2 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-2xl font-semibold text-transparent">
                  想更深入認識導師？
                </h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
                  加入 CT_Trader 核心社群，跟著導師一起看盤、解析與陪跑。
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
          </section>
        </div>

        <MentorSpotlight
          mentors={activeMentors}
          index={sel}
          onIndex={setSel}
          onClose={() => setSel(null)}
        />
      </main>
    </AuthGuard>
  );
}
