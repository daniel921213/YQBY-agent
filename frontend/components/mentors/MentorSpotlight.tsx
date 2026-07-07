"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Mentor } from "@/components/mentors/mentors-data";

const LINE_URL = "https://lin.ee/RP6APHg";

interface MentorSpotlightProps {
  /** 只含 active（非 coming）的導師陣列，index 在此陣列內循環。 */
  mentors: Mentor[];
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/**
 * 團隊專區核心大面板：portal 到 body，比照 SideNav 的 modal 模式。
 * 左邊老師立體卡片每次切換都重播一次 360° 轉入，轉完後才接手滑鼠傾斜；
 * 右邊詳細介紹在卡片轉完後才浮現。
 */
export function MentorSpotlight({ mentors, index, onIndex, onClose }: MentorSpotlightProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);
  // open 必須跟「有效導師」一致，避免 index 越界時 render 為 null 卻仍鎖住背景捲動。
  const mentor =
    index !== null && index >= 0 && index < mentors.length ? mentors[index] : null;
  const open = mentor !== null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // 開啟時記住觸發焦點的元素、鎖背景捲動、把焦點移到面板；關閉時歸還焦點。
  useEffect(() => {
    if (!open) return;
    triggerElRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
      triggerElRef.current?.focus?.();
    };
  }, [open]);

  // Esc 關閉、← → 切換、Tab 在面板內循環（focus trap）。
  useEffect(() => {
    if (!open || index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (mentors.length > 0 && event.key === "ArrowLeft") {
        onIndex((index - 1 + mentors.length) % mentors.length);
        return;
      }
      if (mentors.length > 0 && event.key === "ArrowRight") {
        onIndex((index + 1) % mentors.length);
        return;
      }
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        // 面板本身(tabIndex=-1)或焦點跑到面板外時，也要把焦點拉回，避免 Shift+Tab 逃到背景。
        const inPanel = active ? panel.contains(active) : false;
        if (event.shiftKey) {
          if (!inPanel || active === first || active === panel) {
            event.preventDefault();
            last.focus();
          }
        } else if (!inPanel || active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, mentors.length, onIndex, onClose]);

  if (!mounted || !open || !mentor || index === null) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mentor.name} 介紹`}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="glass-panel relative grid max-h-[92vh] w-full max-w-5xl grid-cols-1 gap-8 overflow-y-auto rounded-3xl border border-gold/30 px-6 py-10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)] sm:px-10 md:grid-cols-[0.95fr_1.05fr] md:items-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-ember/60 hover:text-ember"
        >
          <X className="h-4 w-4" />
        </button>

        {mentors.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => onIndex((index - 1 + mentors.length) % mentors.length)}
              aria-label="上一位成員"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-graphite/80 text-slate-300 transition hover:border-gold/50 hover:text-gold sm:left-3"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onIndex((index + 1) % mentors.length)}
              aria-label="下一位成員"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-graphite/80 text-slate-300 transition hover:border-gold/50 hover:text-gold sm:right-3"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}

        <MentorPortraitStage key={mentor.key} mentor={mentor} />
        <MentorDetail key={`${mentor.key}-detail`} mentor={mentor} />
      </div>
    </div>,
    document.body
  );
}

/** 左：老師立體卡片。每次掛載（key 隨 mentor 變）都重播一次 360° 轉入，結束後交給滑鼠傾斜。 */
function MentorPortraitStage({ mentor }: { mentor: Mentor }) {
  const [spinning, setSpinning] = useState(true);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (spinning) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setTilt({ x: py * -18, y: px * 18 });
    },
    [spinning]
  );

  const handlePointerLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ perspective: "1300px" }}
      className="flex items-center justify-center"
    >
      <div className="mentor-float">
        <div
          onAnimationEnd={(event) => {
            // 只認卡片自己的轉入動畫結束，忽略任何子元素冒泡上來的 animationend。
            if (event.target === event.currentTarget) setSpinning(false);
          }}
          className={`relative w-[230px] rounded-[22px] border border-gold/40 bg-gradient-to-br from-gold/15 to-white/5 px-6 pb-7 pt-8 text-center shadow-[0_30px_60px_-24px_rgba(0,0,0,0.65),inset_0_0_0_1px_rgba(240,200,118,0.12)] ${
            spinning ? "mentor-portrait-spin" : ""
          }`}
          style={{
            transformStyle: "preserve-3d",
            transform: spinning ? undefined : `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition: spinning ? undefined : "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)"
          }}
        >
          <span
            aria-hidden
            className="mx-auto mb-3.5 flex h-[120px] w-[120px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(240,200,118,0.3),rgba(10,15,30,0.7))] text-5xl font-extrabold text-goldhi shadow-[0_0_0_2px_rgb(var(--c-obsidian)),0_0_0_3.5px_rgb(var(--c-gold)),0_0_22px_-3px_rgba(202,138,4,0.5)]"
          >
            {mentor.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mentor.photo} alt="" className="h-full w-full rounded-full object-contain" />
            ) : (
              mentor.initial
            )}
          </span>
          <p className="text-lg font-bold text-slate-100">{mentor.name}</p>
          <p className="mt-1 text-xs text-slate-400">{mentor.role}</p>
          {mentor.highlights && mentor.highlights.length > 0 ? (
            <ul className="mx-auto mt-3 inline-flex flex-col items-start gap-1.5 border-t border-white/10 pt-3 text-left">
              {mentor.highlights.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-slate-300">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold shadow-[0_0_8px_rgba(240,200,118,0.6)]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 右：詳細介紹，在左邊卡片轉入接近完成時才升起浮現（見 .mentor-detail-rise）。 */
function MentorDetail({ mentor }: { mentor: Mentor }) {
  return (
    <div className="mentor-detail-rise">
      <p className="text-xs tracking-[0.24em] text-gold">TEAM</p>
      <h3 className="mt-2 text-2xl font-bold text-slate-100 sm:text-3xl">{mentor.name}</h3>
      <p className="mt-1 text-sm text-slate-400">{mentor.role}</p>

      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-300">
        {mentor.bio ?? <span className="text-slate-500">介紹籌備中</span>}
      </p>

      {mentor.tags.length > 0 ? (
        <>
          <p className="mt-5 text-[11px] tracking-[0.2em] text-slate-500">專長領域</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {mentor.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-goldhi"
              >
                {tag}
              </span>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-6">
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-gold inline-flex cursor-pointer items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold"
        >
          加入 LINE 向 {mentor.name} 學習
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
