"use client";

import { type PointerEvent, type ReactNode } from "react";

interface PointerGlowProps {
  children: ReactNode;
  className?: string;
}

/** 讓卡片高光追蹤游標；無滑鼠或 reduced-motion 時自然退化成靜態邊光。 */
export function PointerGlow({ children, className = "" }: PointerGlowProps) {
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div onPointerMove={move} className={`pointer-glow ${className}`.trim()}>
      {children}
    </div>
  );
}
