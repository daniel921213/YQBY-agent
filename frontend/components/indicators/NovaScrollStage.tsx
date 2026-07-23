"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import { NovaChartVisual } from "@/components/indicators/NovaChartVisual";

interface NovaScrollStageProps {
  activateUrl: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (from: number, to: number, value: number) => {
  const x = clamp((value - from) / (to - from));
  return x * x * (3 - 2 * x);
};

export function NovaScrollStage({ activateUrl }: NovaScrollStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const objectRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = stage.getBoundingClientRect();
      const maxTravel = Math.max(rect.height - window.innerHeight, 1);
      const progress = clamp(-rect.top / maxTravel);
      const secondScene = smoothstep(0.34, 0.7, progress);
      const settle = smoothstep(0.08, 0.76, progress);

      stage.style.setProperty("--story-progress", progress.toFixed(4));
      stage.style.setProperty("--scene-a-opacity", (1 - secondScene).toFixed(4));
      stage.style.setProperty("--scene-b-opacity", secondScene.toFixed(4));
      stage.style.setProperty("--object-scale", (0.82 + settle * 0.18).toFixed(4));
      stage.style.setProperty("--object-x", `${(-5 + settle * 10).toFixed(3)}vw`);
      stage.style.setProperty("--object-y", `${(8 - settle * 13).toFixed(3)}vh`);
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

  const moveObject = (event: PointerEvent<HTMLDivElement>) => {
    const object = objectRef.current;
    if (!object || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = object.getBoundingClientRect();
    const px = clamp((event.clientX - rect.left) / rect.width);
    const py = clamp((event.clientY - rect.top) / rect.height);
    object.style.setProperty("--tilt-x", `${((0.5 - py) * 7).toFixed(2)}deg`);
    object.style.setProperty("--tilt-y", `${((px - 0.5) * 9).toFixed(2)}deg`);
    object.style.setProperty("--hero-pointer-x", `${(px * 100).toFixed(2)}%`);
    object.style.setProperty("--hero-pointer-y", `${(py * 100).toFixed(2)}%`);
  };

  const resetObject = () => {
    const object = objectRef.current;
    if (!object) return;
    object.style.setProperty("--tilt-x", "0deg");
    object.style.setProperty("--tilt-y", "0deg");
    object.style.setProperty("--hero-pointer-x", "50%");
    object.style.setProperty("--hero-pointer-y", "38%");
  };

  return (
    <section ref={stageRef} className="nova-story" aria-label="CT_NOVA 產品介紹">
      <div className="nova-story-sticky">
        <div className="nova-scene nova-scene-a" aria-hidden>
          <NovaAtmosphereCanvas />
          <div className="nova-scene-vignette" />
        </div>
        <div className="nova-scene nova-scene-b" aria-hidden>
          <span className="nova-watermark font-kicker">CONFLUENCE</span>
          <div className="nova-dust" />
        </div>

        <div className="nova-copy nova-copy-a">
          <p className="font-kicker text-xs tracking-[0.36em] text-gold">
            INDICATOR 01 · TRADINGVIEW
          </p>
          <h1 className="font-display mt-3 max-w-2xl text-4xl font-black leading-[1.06] text-white sm:text-6xl lg:text-7xl">
            用結構與動能
            <br />
            取代直覺
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">
            趨勢、回踩、動能與風控在同一個畫面完成確認，讓每一次等待都有清楚理由。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={activateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold glow-sweep inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
            >
              開通 NOVA
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href="#principles"
              className="story-secondary-cta inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm"
            >
              往下探索
              <ArrowDown className="h-4 w-4" />
            </a>
          </div>
        </div>

        <p className="nova-side-note nova-copy-a">
          專為加密合約 15m 設計
          <span>4H 同向過濾 · ATR 風控</span>
        </p>

        <div className="nova-copy nova-copy-b nova-copy-b-top">
          <span className="font-data text-xs text-ember">01 / TREND</span>
          <h2 className="font-display mt-2 text-3xl font-black text-white sm:text-5xl">
            先看趨勢
          </h2>
        </div>
        <div className="nova-copy nova-copy-b nova-copy-b-bottom">
          <span className="font-data text-xs text-goldhi">02 / CONFIRM</span>
          <h2 className="font-display mt-2 text-3xl font-black text-white sm:text-5xl">
            再等回踩
          </h2>
        </div>
        <div className="nova-story-note nova-copy-b">
          <p className="text-sm leading-7 text-slate-300">
            不追突破。等價格重新站回 EMA12，並由 Squeeze Momentum 確認方向。
          </p>
          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-medium text-goldhi transition hover:border-gold/60 hover:bg-gold/15"
          >
            {flipped ? <RotateCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {flipped ? "回到圖表面" : "翻到邏輯面"}
          </button>
        </div>

        <div
          ref={objectRef}
          onPointerMove={moveObject}
          onPointerLeave={resetObject}
          className="nova-object"
        >
          <span className="nova-ground-pool" aria-hidden />
          <span className="nova-object-aura" aria-hidden />
          <div className={`nova-object-tilt ${flipped ? "is-flipped" : ""}`}>
            <div className="nova-card-face nova-card-front">
              <div className="nova-card-chrome">
                <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_12px_rgba(240,200,118,0.9)]" />
                <span className="font-kicker text-[10px] font-medium tracking-[0.18em] text-slate-200">
                  CT_NOVA
                </span>
                <span className="font-data text-[9px] text-slate-500">BTCUSDT.P · 15m</span>
                <span className="ml-auto rounded-full border border-long/30 bg-long/10 px-2 py-0.5 text-[9px] text-long">
                  訊號成立
                </span>
              </div>
              <div className="p-2 sm:p-3">
                <NovaChartVisual />
              </div>
              <span className="nova-specular" aria-hidden />
            </div>

            <div className="nova-card-face nova-card-back">
              <span className="font-kicker text-xs tracking-[0.34em] text-[#fff3c4]/70">
                SIGNAL ARCHITECTURE
              </span>
              <h3 className="font-display mt-3 text-2xl font-black text-[#fff8df] sm:text-4xl">
                一個訊號，五道確認
              </h3>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {["趨勢", "突破", "回踩", "收復", "動能"].map((label, index) => (
                  <div key={label} className="nova-logic-cell">
                    <span className="font-data text-[10px] text-[#2b1b04]/55">0{index + 1}</span>
                    <strong className="mt-2 block text-sm text-[#2b1b04]">{label}</strong>
                  </div>
                ))}
              </div>
              <p className="mt-5 max-w-xl text-xs leading-6 text-[#2b1b04]/65">
                條件沒有同時成立，就保持等待。翻面只改變產品故事的觀看方式，不會改動全站交易語意色。
              </p>
              <span className="nova-specular" aria-hidden />
            </div>
          </div>
        </div>

        <div className="nova-story-progress" aria-hidden>
          <span />
        </div>
        <p className="nova-scroll-hint font-kicker">SCROLL TO EXPLORE</p>
      </div>
    </section>
  );
}

function NovaAtmosphereCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastDraw = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = Array.from({ length: 130 }, (_, index) => ({
      x: ((index * 73) % 997) / 997,
      y: ((index * 151) % 991) / 991,
      radius: 0.45 + ((index * 19) % 13) / 10,
      phase: (index * 0.71) % (Math.PI * 2)
    }));

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    };

    const draw = (time: number) => {
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#05070d");
      sky.addColorStop(0.58, "#071422");
      sky.addColorStop(1, "#0a1621");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const moonX = width * 0.78;
      const moonY = height * 0.22;
      const moonRadius = Math.max(42, Math.min(width, height) * 0.075);
      const halo = context.createRadialGradient(moonX, moonY, moonRadius * 0.2, moonX, moonY, moonRadius * 3.4);
      halo.addColorStop(0, "rgba(222,240,255,0.45)");
      halo.addColorStop(0.24, "rgba(108,185,255,0.12)");
      halo.addColorStop(1, "rgba(48,135,220,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);
      const moon = context.createRadialGradient(
        moonX - moonRadius * 0.28,
        moonY - moonRadius * 0.32,
        moonRadius * 0.08,
        moonX,
        moonY,
        moonRadius
      );
      moon.addColorStop(0, "#f6fbff");
      moon.addColorStop(0.7, "#d8e8f6");
      moon.addColorStop(1, "#91abc1");
      context.beginPath();
      context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
      context.fillStyle = moon;
      context.fill();

      stars.forEach((star) => {
        const twinkle = reduceMotion ? 0.72 : 0.42 + Math.sin(time * 0.0012 + star.phase) * 0.28;
        context.beginPath();
        context.arc(star.x * width, star.y * height * 0.72, star.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(198,229,255,${Math.max(0.12, twinkle)})`;
        context.fill();
      });

      const drift = reduceMotion ? 0 : Math.sin(time * 0.00015) * width * 0.025;
      for (let layer = 0; layer < 3; layer += 1) {
        const y = height * (0.58 + layer * 0.1);
        context.beginPath();
        context.moveTo(-width * 0.2, height);
        for (let x = -width * 0.2; x <= width * 1.2; x += width * 0.08) {
          const wave = Math.sin(x * 0.008 + layer * 1.7 + time * 0.00008) * (16 + layer * 8);
          context.lineTo(x + drift * (layer + 1), y + wave);
        }
        context.lineTo(width * 1.2, height);
        context.closePath();
        context.fillStyle = `rgba(${16 + layer * 8},${35 + layer * 10},${52 + layer * 12},${0.22 + layer * 0.08})`;
        context.fill();
      }

      const fog = context.createLinearGradient(0, height * 0.68, 0, height);
      fog.addColorStop(0, "rgba(154,211,255,0)");
      fog.addColorStop(0.72, "rgba(125,190,235,0.08)");
      fog.addColorStop(1, "rgba(185,222,246,0.16)");
      context.fillStyle = fog;
      context.fillRect(0, height * 0.62, width, height * 0.38);
    };

    const animate = (time: number) => {
      if (time - lastDraw > 32) {
        draw(time);
        lastDraw = time;
      }
      frame = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) frame = window.requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("resize", resize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
