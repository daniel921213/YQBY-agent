import { ExternalLink } from "lucide-react";

const LINE_URL = "https://lin.ee/RP6APHg";

/**
 * 團隊頁品牌收尾帶：巨大金字 CT_Trader + CONFLUENCE THEORY，
 * 背後以「流動絲綢」金色光弧環繞（SVG 平滑曲線 + 高斯羽化），色系全走品牌金。
 * 光效走很慢的呼吸；prefers-reduced-motion 時全靜止。
 */
export function BrandOutro() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
      {/* 金色光效層（裝飾、不可互動） */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* 主光源：柔和金色光暈（橢圓、羽化） */}
        <div className="mentor-outro-glow absolute left-1/2 top-1/2 h-[70vw] w-[92vw] max-h-[520px] max-w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(240,200,118,0.16),rgba(202,138,4,0.05)_44%,transparent_72%)] blur-2xl" />

        {/* 流動絲綢金光弧（平滑貝茲曲線 + 高斯模糊羽化） */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 520"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient id="silkA" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgb(240 200 118)" stopOpacity="0" />
              <stop offset="0.5" stopColor="rgb(240 200 118)" stopOpacity="0.8" />
              <stop offset="1" stopColor="rgb(202 138 4)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="silkB" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgb(202 138 4)" stopOpacity="0" />
              <stop offset="0.55" stopColor="rgb(240 200 118)" stopOpacity="0.6" />
              <stop offset="1" stopColor="rgb(202 138 4)" stopOpacity="0" />
            </linearGradient>
            <filter id="silkBlur" x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
            <filter id="silkBloom" x="-10%" y="-80%" width="120%" height="260%">
              <feGaussianBlur stdDeviation="11" />
            </filter>
          </defs>

          {/* 主曲線的寬羽化底光 */}
          <path
            className="mentor-outro-beam"
            d="M -140 440 C 430 250 1170 250 1740 100"
            stroke="url(#silkA)"
            strokeWidth="12"
            filter="url(#silkBloom)"
          />
          {/* 主絲線 */}
          <path
            className="mentor-outro-beam"
            d="M -140 440 C 430 250 1170 250 1740 100"
            stroke="url(#silkA)"
            strokeWidth="1.6"
            filter="url(#silkBlur)"
          />
          {/* 第二條反向流動曲線 */}
          <path
            className="mentor-outro-beam"
            style={{ animationDelay: "2s" }}
            d="M -80 140 C 520 330 1120 300 1720 410"
            stroke="url(#silkB)"
            strokeWidth="1.4"
            filter="url(#silkBlur)"
          />
          {/* 第三條淡曲線（更彎、增加層次） */}
          <path
            className="mentor-outro-beam"
            style={{ animationDelay: "3.4s" }}
            d="M -120 300 C 480 150 1150 470 1760 300"
            stroke="url(#silkB)"
            strokeWidth="1"
            strokeOpacity="0.6"
            filter="url(#silkBlur)"
          />
        </svg>
      </div>

      {/* 前景品牌文字 */}
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
