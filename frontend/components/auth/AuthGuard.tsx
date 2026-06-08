"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

// Client-side route guard: anyone not logged in is sent to /login before the
// dashboard renders. (UI gate — the data API itself is still public.)
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (getCurrentUser()) {
      setAuthed(true);
    } else {
      router.replace("/login");
    }
  }, [router]);

  if (authed === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 text-stone-400">
        <span className="inline-flex items-center gap-2 text-xs tracking-[0.32em] text-ember">
          <Radar className="h-4 w-4" />
          YQBY
        </span>
        <span className="inline-flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          驗證登入中…
        </span>
      </main>
    );
  }

  return <>{children}</>;
}
