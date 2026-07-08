import { ExternalLink } from "lucide-react";

const LINE_URL = "https://lin.ee/RP6APHg";

/**
 * 團隊頁品牌收尾帶：巨大金字 CT_Trader + CONFLUENCE THEORY，
 * 周圍以金色光束 / 光暈 / 軌道弧環繞（純 CSS，色系全走品牌金）。
 * 光效走很慢的呼吸；prefers-reduced-motion 時全靜止。
 */
export function BrandOutro() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
      {/* 金色光效層（裝飾、不可互動） */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* 主光暈（日環光邊） */}
        <div className="mentor-outro-glow absolute left-1/2 top-1/2 h-[72vw] w-[72vw] max-h-[560px] max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(240,200,118,0.14),rgba(202,138,4,0.05)_45%,transparent_66%)] blur-2xl" />
        {/* 軌道弧 */}
        <div className="absolute left-1/2 top-1/2 h-[44vw] w-[92vw] max-h-[320px] max-w-[960px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-gold/15" />
        <div className="absolute left-1/2 top-1/2 h-[28vw] w-[72vw] max-h-[210px] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-gold/10" />
        {/* 金色光束（斜掃、穿過大字） */}
        <div className="mentor-outro-beam absolute left-1/2 top-1/2 h-px w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-[16deg] bg-gradient-to-r from-transparent via-goldhi/55 to-transparent shadow-[0_0_10px_rgba(240,200,118,0.5)]" />
        <div
          className="mentor-outro-beam absolute left-1/2 top-1/2 h-px w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-[10deg] bg-gradient-to-r from-transparent via-gold/45 to-transparent shadow-[0_0_8px_rgba(202,138,4,0.45)]"
          style={{ animationDelay: "1.4s" }}
        />
        <div
          className="mentor-outro-beam absolute left-1/2 top-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-[33deg] bg-gradient-to-r from-transparent via-goldhi/35 to-transparent blur-[1px]"
          style={{ animationDelay: "2.6s" }}
        />
      </div>

      {/* 前景品牌文字 */}
      <div className="relative z-10 flex flex-col items-center">
        <h2 className="bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-[clamp(2.75rem,13vw,9rem)] font-bold leading-none tracking-tight text-transparent [filter:drop-shadow(0_0_45px_rgba(202,138,4,0.35))]">
          CT_Trader
        </h2>
        <p className="mt-4 text-xs tracking-[0.42em] text-goldhi/70 sm:text-sm sm:tracking-[0.5em]">
          CONFLUENCE THEORY
        </p>
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 inline-flex cursor-pointer items-center gap-2 rounded-full border border-gold/40 px-6 py-2.5 text-sm font-medium text-goldhi transition hover:border-gold/70 hover:bg-gold/10"
        >
          加入 LINE 核心社群
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
