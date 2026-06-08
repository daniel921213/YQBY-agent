"use client";

import { useState } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  // Show /public/logo.png if present; otherwise fall back to the radar mark so
  // there's never a broken image before the asset is added.
  const [logoOk, setLogoOk] = useState(true);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 flex flex-col items-center gap-3 text-center transition hover:opacity-90"
        >
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/logo.png"
              alt="YQBY Crypto Killer"
              className="h-16 w-16 object-contain"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <Radar className="h-9 w-9 text-ember" />
          )}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs tracking-[0.32em] text-ember">YQBY</span>
            <span className="text-2xl font-semibold tracking-tight text-stone-50">
              Crypto Killer
            </span>
          </div>
        </Link>

        <div className="rounded-lg border border-ember/20 bg-graphite/85 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.5)]">
          <h1 className="text-lg font-semibold text-stone-50">{title}</h1>
          <p className="mt-1 text-sm text-stone-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <div className="mt-5 text-center text-sm text-stone-400">{footer}</div>
      </div>
    </main>
  );
}
