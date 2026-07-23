"use client";

import type { PointerEvent } from "react";
import { Lock } from "lucide-react";
import type { Mentor } from "@/components/mentors/mentors-data";

interface MentorCardProps {
  mentor: Mentor;
  onOpen: () => void;
}

/** 導師牆單張卡：active 可點開 Spotlight，coming 是不可互動的敬請期待佔位。 */
export function MentorCard({ mentor, onOpen }: MentorCardProps) {
  const trackGlow = (event: PointerEvent<HTMLButtonElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  };

  if (mentor.status === "coming") {
    return (
      <div className="surface-raised flex cursor-default flex-col items-center gap-3 rounded-xl px-4 py-6 text-center opacity-70">
        <span className="inline-flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-500 sm:h-24 sm:w-24">
          <Lock className="h-7 w-7" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-slate-400">開發中</p>
        </div>
        <span className="surface-sunken rounded-full px-3 py-1 text-xs text-slate-500">
          敬請期待
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerMove={trackGlow}
      aria-label={`${mentor.name} ${mentor.role}`}
      className="surface-raised cursor-glow story-card group flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl px-4 py-6 text-center transition duration-200 ease-out hover:-translate-y-1 hover:border-gold/40 hover:shadow-[0_18px_40px_-18px_rgba(202,138,4,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <span
        className="inline-flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(240,200,118,0.3),rgba(10,15,30,0.7))] text-3xl font-extrabold text-goldhi shadow-[0_0_0_2px_rgb(var(--c-obsidian)),0_0_0_3.5px_rgb(var(--c-gold)),0_0_22px_-3px_rgba(202,138,4,0.5)] sm:h-24 sm:w-24"
        aria-hidden
      >
        {mentor.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mentor.photo} alt="" className="h-full w-full rounded-full object-contain" />
        ) : (
          mentor.initial
        )}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-lg font-semibold text-slate-100">{mentor.name}</p>
        <p className="text-sm text-slate-400">{mentor.role}</p>
      </div>
      {mentor.highlights && mentor.highlights.length > 0 ? (
        <ul className="mx-auto inline-flex flex-col items-start gap-1 text-left">
          {mentor.highlights.map((item) => (
            <li key={item} className="flex items-center gap-1.5 text-xs text-slate-300">
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full bg-gold shadow-[0_0_6px_rgba(240,200,118,0.6)]"
              />
              {item}
            </li>
          ))}
        </ul>
      ) : mentor.tags.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {mentor.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs text-goldhi"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
