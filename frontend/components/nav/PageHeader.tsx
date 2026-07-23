import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { SideNav } from "@/components/nav/SideNav";

interface PageAnchor {
  href: string;
  label: string;
}

interface PageHeaderProps {
  kicker?: string;
  title: string;
  backHref?: string;
  backLabel?: string;
  anchors?: PageAnchor[];
  cta?: {
    href: string;
    label: string;
    external?: boolean;
  };
}

/** 內頁浮動 header：品牌、桌面章節錨點與主要 CTA。 */
export function PageHeader({
  kicker = "CT_Trader",
  title,
  backHref,
  backLabel,
  anchors = [],
  cta
}: PageHeaderProps) {
  return (
    <header className="page-header-shell glass-panel flex items-center gap-3 rounded-xl px-3 py-3 sm:px-4">
      <SideNav />
      <div className="min-w-0">
        <p className="font-kicker text-[10px] tracking-[0.24em] text-gold">{kicker}</p>
        <h1 className="font-display mt-0.5 bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-lg font-black text-transparent sm:text-xl">
          {title}
        </h1>
      </div>
      {anchors.length > 0 ? (
        <nav className="page-anchor-nav absolute left-1/2 -translate-x-1/2" aria-label="本頁章節">
          {anchors.map((anchor) => (
            <a key={anchor.href} href={anchor.href} className="page-anchor-link font-kicker">
              {anchor.label}
            </a>
          ))}
        </nav>
      ) : null}
      {backHref ? (
        <Link
          href={backHref}
          className="page-back-link ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-ember/50 hover:text-ember"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{backLabel ?? "返回"}</span>
        </Link>
      ) : cta ? (
        <a
          href={cta.href}
          target={cta.external ? "_blank" : undefined}
          rel={cta.external ? "noopener noreferrer" : undefined}
          className="glow-sweep ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-950 shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5"
        >
          {cta.label}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </header>
  );
}
