"use client";

import { useEffect, useRef } from "react";

/**
 * 團隊頁收尾帶的「流動絲綢金光」：canvas 畫多條會起伏流動的波浪金線 +
 * 加成光暈，看得出彎曲、會慢慢流動。prefers-reduced-motion 時只畫一張靜態幀。
 * 顏色全走品牌金（240,200,118 / 202,138,4）。
 */
export function OutroSilk() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // 每條線各有自己的振幅/頻率/相位/速度/垂直偏移，疊起來像流動的絲綢
    const LINES = 5;
    const lines = Array.from({ length: LINES }, (_, i) => ({
      amp: 0.1 + Math.random() * 0.13, // 相對高度的振幅（收斂一點）
      freq: 0.7 + Math.random() * 0.9, // 波數少一點、更緩
      phase: Math.random() * Math.PI * 2,
      speed: 0.1 + Math.random() * 0.2,
      yOffset: (i / (LINES - 1) - 0.5) * 0.2, // 更集中成一束
      width: 0.8 + Math.random() * 1.5,
      alpha: 0.15 + Math.random() * 0.3, // 更淡
      bloom: i === 1 // 只留一條當底光
    }));

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter"; // 加成：交疊處更亮，像光
      ctx.lineCap = "round";
      for (const L of lines) {
        ctx.beginPath();
        const steps = 72;
        for (let s = 0; s <= steps; s++) {
          const px = s / steps;
          const x = px * w;
          const env = Math.sin(px * Math.PI); // 兩端漸淡的包絡
          const y =
            h * (0.5 + L.yOffset) +
            Math.sin(px * L.freq * Math.PI * 2 + L.phase + t * L.speed) * (L.amp * h) * env;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "rgba(240,200,118,0)");
        grad.addColorStop(0.5, `rgba(240,200,118,${L.alpha})`);
        grad.addColorStop(1, "rgba(202,138,4,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = L.bloom ? L.width * 5 : L.width;
        ctx.shadowColor = "rgba(240,200,118,0.55)";
        ctx.shadowBlur = L.bloom ? 26 : 12;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    if (reduce) {
      draw(0.6);
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        draw((now - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
  );
}
