"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/nav/PageHeader";
import { Reveal } from "@/components/visual/Reveal";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { BrandOutro } from "@/components/mentors/BrandOutro";
import { MentorCard } from "@/components/mentors/MentorCard";
import { MentorSpotlight } from "@/components/mentors/MentorSpotlight";
import { MENTORS } from "@/components/mentors/mentors-data";

const activeMentors = MENTORS.filter((mentor) => mentor.status !== "coming");

export default function MentorsPage() {
  const [sel, setSel] = useState<number | null>(null);

  return (
    <AuthGuard>
      <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
        <SpaceParticleField />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
          <PageHeader title="團隊專區" />

          {/* 開場：短 hero */}
          <section className="flex flex-col items-center gap-4 px-4 pb-10 pt-14 text-center sm:pt-20">
            <Reveal>
              <p className="text-xs tracking-[0.32em] text-gold">TEAM · 團隊專區</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="max-w-2xl bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-3xl font-semibold leading-tight text-transparent sm:text-4xl">
                認識 CT_Trader 團隊
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="max-w-xl text-sm leading-7 text-slate-400">
                CT_Trader 團隊陣容——點任一位成員，認識他們的角色與專長。
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

          {/* 品牌收尾 */}
          <Reveal>
            <BrandOutro />
          </Reveal>
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
