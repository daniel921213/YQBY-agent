import { ExternalLink } from "lucide-react";
import { OutroSilk } from "@/components/mentors/OutroSilk";

const LINE_URL = "https://lin.ee/RP6APHg";

/**
 * 團隊頁品牌收尾帶：金色 CT_Trader logo + CONFLUENCE THEORY，
 * 背後以 canvas 畫的「流動絲綢金光」環繞（會彎會流動，色系全走品牌金）。
 */
export function BrandOutro() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-2 text-center sm:pb-24 sm:pt-4">
      {/* 金色光效層（裝飾、不可互動） */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* 主光源：柔和金色光暈（橢圓、羽化） */}
        <div className="mentor-outro-glow absolute left-1/2 top-1/2 h-[70vw] w-[92vw] max-h-[520px] max-w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(240,200,118,0.16),rgba(202,138,4,0.05)_44%,transparent_72%)] blur-2xl" />
        {/* 流動絲綢金光（canvas） */}
        <OutroSilk />
      </div>

      {/* 前景品牌 logo + 文字 */}
      <div className="relative z-10 flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="CT_Trader"
          className="h-auto w-[clamp(240px,46vw,560px)] max-w-full [filter:drop-shadow(0_0_45px_rgba(202,138,4,0.35))]"
        />
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
