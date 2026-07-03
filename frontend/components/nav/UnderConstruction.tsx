import Link from "next/link";
import { GraduationCap, LineChart } from "lucide-react";
import { SideNav } from "@/components/nav/SideNav";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";

const ICONS = {
  chart: LineChart,
  learn: GraduationCap
} as const;

interface UnderConstructionProps {
  title: string;
  iconKey: keyof typeof ICONS;
}

/** 佔位頁外殼：帶 CT 選單的精簡 header + 置中的「功能製作中」玻璃卡。 */
export function UnderConstruction({ title, iconKey }: UnderConstructionProps) {
  const Icon = ICONS[iconKey];
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <SpaceParticleField />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="glass-panel flex items-center gap-3 rounded-xl px-4 py-4">
          <SideNav />
          <div>
            <p className="text-xs tracking-[0.18em] text-gold">CT_Trader</p>
            <h1 className="mt-1 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-xl font-semibold text-transparent sm:text-2xl">
              {title}
            </h1>
          </div>
        </header>

        <section className="surface flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-xl px-6 py-16 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold shadow-[0_0_32px_rgba(202,138,4,0.2)]">
            <Icon className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold text-slate-50">功能製作中，請稍後</h2>
          <p className="max-w-sm text-sm leading-6 text-slate-400">
            {title}正在打造中，完成後會在這裡與你見面。
          </p>
          <Link
            href="/"
            className="surface lift mt-2 inline-flex cursor-pointer items-center rounded-md px-4 py-2 text-sm text-slate-200 hover:text-ember"
          >
            返回主控台
          </Link>
        </section>
      </div>
    </main>
  );
}
