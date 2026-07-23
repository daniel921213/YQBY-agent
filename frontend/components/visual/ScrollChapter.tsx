"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ScrollChapterProps {
  children: ReactNode;
  className?: string;
  id?: string;
  index?: string;
  label?: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 長內容頁的章節框架。只把捲動進度寫進 CSS 變數，不觸發 React re-render；
 * 左側進度軌、章節光點與底部分隔線都由同一個進度驅動。
 */
export function ScrollChapter({
  children,
  className = "",
  id,
  index,
  label
}: ScrollChapterProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = clamp((viewport * 0.78 - rect.top) / Math.max(rect.height + viewport * 0.3, 1));
      section.style.setProperty("--chapter-progress", progress.toFixed(4));
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className={`scroll-chapter scroll-mt-28 ${className}`.trim()}
    >
      <div className="chapter-rail" aria-hidden>
        <span className="chapter-rail-track" />
        <span className="chapter-rail-fill" />
        <span className="chapter-rail-dot" />
        {index ? <span className="chapter-index font-data">{index}</span> : null}
      </div>
      {label ? <span className="sr-only">{label}</span> : null}
      {children}
      <span className="chapter-divider" aria-hidden />
    </section>
  );
}
