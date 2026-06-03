"use client";

import { X } from "lucide-react";

interface ModalShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
}

// Shared popover frame so every dialog (詳情 / 歷史 / OI) reads the same:
// dim + blur backdrop, ember-edged card, click-outside or ✕ to dismiss.
export function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  widthClass = "max-w-2xl"
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`animate-signal-rise flex max-h-[82vh] w-full ${widthClass} flex-col rounded-md border border-ember/25 bg-[#0d0b09] shadow-[0_30px_120px_rgba(0,0,0,0.58)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="inline-flex min-w-0 items-baseline gap-2">
            <span className="inline-flex items-center gap-2 text-base font-semibold text-stone-50">
              {icon ? <span className="text-ember">{icon}</span> : null}
              {title}
            </span>
            {subtitle ? <span className="truncate text-xs text-stone-500">{subtitle}</span> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-stone-300 transition hover:border-ember/60 hover:text-ember"
            title="關閉"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
