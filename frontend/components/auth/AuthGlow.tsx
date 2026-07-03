"use client";

import { useEffect, useRef } from "react";

/** 滑鼠跟隨的低透明度金色 spotlight。rAF 節流、只動 transform/opacity、
 *  遵守 prefers-reduced-motion、零依賴。 */
export function AuthGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onMove = (event: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.transform = `translate3d(${event.clientX - 320}px, ${event.clientY - 320}px, 0)`;
        el.style.opacity = "1";
      });
    };
    const onLeave = () => {
      el.style.opacity = "0";
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="auth-spotlight pointer-events-none fixed left-0 top-0 z-[5] h-[640px] w-[640px] rounded-full opacity-0"
    />
  );
}
