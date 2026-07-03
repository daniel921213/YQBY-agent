import Link from "next/link";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { AuthGlow } from "@/components/auth/AuthGlow";
import { ThemeToggle } from "@/lib/theme";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="auth-scene relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <SpaceParticleField variant="auth" />
      {/* 氛圍層：金色軌道線 ×2 + 暖金能量核 + 斜向金光束 + 滑鼠 spotlight */}
      <div aria-hidden className="auth-orbit auth-orbit-a" />
      <div aria-hidden className="auth-orbit auth-orbit-b" />
      <div
        aria-hidden
        className="auth-core animate-core-breathe pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] rounded-full"
      />
      <div
        aria-hidden
        className="auth-beam pointer-events-none absolute left-[-30%] top-[32%] h-24 w-[160%] -rotate-[22deg]"
      />
      <AuthGlow />
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 flex flex-col items-center gap-3 text-center transition hover:opacity-90"
        >
          {/* 品牌 logo（金色 CT Trader 字標，透明底）；柔和落影讓它在深淺兩種底上都立得住。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="CT Trader"
            className="h-24 w-auto [filter:drop-shadow(0_4px_16px_rgba(15,30,60,0.35))]"
          />
          <span className="auth-title text-2xl font-semibold tracking-[0.08em]">
            CONFLUENCE THEORY
          </span>
        </Link>

        <div className="auth-card relative overflow-hidden rounded-xl p-6 backdrop-blur-md">
          {/* 卡片頂緣金色髮絲高光 */}
          <div aria-hidden className="auth-card-topline pointer-events-none absolute inset-x-0 top-0 h-px" />
          <h1 className="text-lg font-semibold text-slate-50">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>
      </div>
    </main>
  );
}
