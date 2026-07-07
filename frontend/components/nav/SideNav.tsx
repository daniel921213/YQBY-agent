"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, LayoutDashboard, LineChart, Users, X } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "主控台", description: "早期異動雷達", icon: LayoutDashboard },
  { href: "/indicators", label: "指標專區", description: "CT_NOVA 指標介紹", icon: LineChart },
  { href: "/beginner", label: "新手專區", description: "開戶・看盤・SMC 入門", icon: GraduationCap },
  { href: "/mentors", label: "團隊專區", description: "認識 CT_Trader 團隊", icon: Users }
] as const;

/** 左上角 CT 字紋按鈕 + 左側滑出導覽抽屜。桌機/手機共用一套。 */
export function SideNav() {
  const [open, setOpen] = useState(false);
  // 抽屜/遮罩要 portal 到 body：按鈕的祖先（glass-panel header）帶 backdrop-filter，
  // 會成為 fixed 定位的包含塊，直接渲染會把抽屜「困」在 header 裡。
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 開啟時鎖背景捲動 + Esc 關閉。
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {/* CT 字紋選單鈕：香檳金漸層字 = 品牌記號，不是漢堡圖示 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="開啟導覽選單"
        aria-expanded={open}
        className="surface lift inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md"
      >
        <span className="bg-gradient-to-b from-goldhi to-gold bg-clip-text text-sm font-bold tracking-[0.03em] text-transparent [filter:drop-shadow(0_0_10px_rgba(240,200,118,0.35))]">
          CT
        </span>
      </button>

      {mounted
        ? createPortal(
            <SideNavOverlay open={open} pathname={pathname} onClose={() => setOpen(false)} />,
            document.body
          )
        : null}
    </>
  );
}

function SideNavOverlay({
  open,
  pathname,
  onClose
}: {
  open: boolean;
  pathname: string;
  onClose: () => void;
}) {
  return (
    <>
      {/* 遮罩 */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 抽屜 */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="頁面導覽"
        className={`glass-panel fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col gap-4 p-4 transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-white/10 pb-3">
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="CT Trader" className="h-10 w-auto self-start" />
            <span className="text-xs tracking-[0.28em] text-slate-500">
              CONFLUENCE THEORY
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉導覽選單"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-ember/60 hover:text-ember"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 transition ${
                  active
                    ? "bg-gold/10 text-gold"
                    : "text-slate-300 hover:bg-white/5 hover:text-ember"
                }`}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-px bg-gold shadow-[0_0_12px_rgba(202,138,4,0.8)]" />
                ) : null}
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={`text-xs ${active ? "text-gold/70" : "text-slate-500"}`}>
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-3 text-xs leading-5 text-slate-600">
          Where environment, time and price align.
        </div>
      </aside>
    </>
  );
}
