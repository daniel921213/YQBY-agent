"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { getCurrentUser, logout } from "@/lib/auth";

export function AccountMenu() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUid(getCurrentUser());
    setReady(true);
  }, []);

  // Avoid SSR/client mismatch: render nothing until we've read localStorage.
  if (!ready) return null;

  if (!uid) {
    return (
      <Link
        href="/login"
        className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-graphite px-3 text-sm text-stone-300 transition hover:border-ember/60 hover:text-ember"
      >
        <LogIn className="h-4 w-4" />
        登入
      </Link>
    );
  }

  return (
    <div className="inline-flex h-10 items-center gap-2 rounded-md border border-ember/25 bg-graphite px-3 text-sm text-stone-100">
      <UserRound className="h-4 w-4 text-ember" />
      <span className="max-w-[120px] truncate">{uid}</span>
      <button
        type="button"
        onClick={() => {
          logout();
          setUid(null);
          router.replace("/login");
        }}
        title="登出"
        className="ml-1 text-stone-400 transition hover:text-short"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
