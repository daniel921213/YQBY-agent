import Link from "next/link";
import { Radar } from "lucide-react";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { ThemeToggle } from "@/lib/theme";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <SpaceParticleField variant="auth" />
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      {/* 氛圍層（純色彩光效，無圖形）：一道斜射光束 + 卡片後方呼吸的能量核 */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-30%] top-[30%] h-28 w-[160%] -rotate-[22deg] bg-gradient-to-r from-transparent via-ember/[0.07] to-transparent blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-30%] top-[34%] h-px w-[160%] -rotate-[22deg] bg-gradient-to-r from-transparent via-ember/50 to-transparent"
      />
      <div
        aria-hidden
        className="animate-core-breathe pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(76,194,255,0.16),rgba(76,194,255,0.05)_45%,transparent_72%)]"
      />

      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 flex flex-col items-center gap-2 text-center transition hover:opacity-90"
        >
          <span className="inline-flex items-center gap-2 text-xs tracking-[0.32em] text-ember [text-shadow:0_0_18px_rgba(76,194,255,0.65)]">
            <Radar className="h-4 w-4" />
            YQBY
          </span>
          <span className="bg-gradient-to-b from-white via-slate-200 to-slate-500 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Crypto Killer
          </span>
        </Link>

        <div className="auth-card relative overflow-hidden rounded-xl border border-ember/20 bg-graphite/70 p-6 shadow-[0_30px_120px_rgba(2,8,22,0.85),0_0_48px_rgba(76,194,255,0.10)] backdrop-blur-md">
          {/* 卡片頂緣的金屬高光線 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ember/60 to-transparent"
          />
          <h1 className="text-lg font-semibold text-slate-50">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>
      </div>
    </main>
  );
}
