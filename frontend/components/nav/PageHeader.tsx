import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SideNav } from "@/components/nav/SideNav";

interface PageHeaderProps {
  kicker?: string;
  title: string;
  backHref?: string;
  backLabel?: string;
}

/** 內頁精簡 header：CT 選單 + 金漸層標題，可選右側返回連結。 */
export function PageHeader({ kicker = "CT_Trader", title, backHref, backLabel }: PageHeaderProps) {
  return (
    <header className="glass-panel flex items-center gap-3 rounded-xl px-4 py-4">
      <SideNav />
      <div className="min-w-0">
        <p className="text-xs tracking-[0.18em] text-gold">{kicker}</p>
        <h1 className="mt-1 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-xl font-semibold text-transparent sm:text-2xl">
          {title}
        </h1>
      </div>
      {backHref ? (
        <Link
          href={backHref}
          className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-ember/50 hover:text-ember"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel ?? "返回"}
        </Link>
      ) : null}
    </header>
  );
}
