"use client";

import { useEffect, useRef, useState } from "react";

interface RevealProps {
  children: React.ReactNode;
  /** md 以上的進場方向；手機一律上移淡入（見 globals.css .reveal）。 */
  direction?: "up" | "left" | "right";
  /** 進場延遲（ms），做同組元素的 stagger。 */
  delay?: number;
  className?: string;
}

/**
 * 滾動進場包裝：元素進到視窗下緣 ~85% 處時掛上 .is-in，只播一次。
 * 動畫本體在 globals.css（transform/opacity only、reduced-motion 直接顯示）。
 */
export function Reveal({ children, direction = "up", delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dirClass = direction === "left" ? "reveal-left" : direction === "right" ? "reveal-right" : "";

  return (
    <div
      ref={ref}
      className={`reveal ${dirClass} ${inView ? "is-in" : ""} ${className}`.trim()}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
