"use client";

import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, X } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/auth/AuthFields";
import { resetPassword } from "@/lib/auth";

const HELPER_URL = "https://lin.ee/RP6APHg";

interface ForgotPasswordDialogProps {
  open: boolean;
  initialUid: string;
  onClose: () => void;
}

type View = "intro" | "form" | "success";

export function ForgotPasswordDialog({
  open,
  initialUid,
  onClose
}: ForgotPasswordDialogProps) {
  const [view, setView] = useState<View>("intro");
  const [uid, setUid] = useState(initialUid);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setView("intro");
    setUid(initialUid);
    setCode("");
    setPassword("");
    setConfirmation("");
    setError(undefined);
    setSuccess(undefined);
    setLoading(false);
  }, [initialUid, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (password !== confirmation) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    try {
      const message = await resetPassword(uid, code, password);
      setSuccess(message);
      setView("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重設失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#03050a]/80 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reset-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="auth-card relative w-full max-w-md overflow-hidden rounded-xl border border-[#d4af37]/25 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.65),0_0_40px_rgba(212,175,55,0.08)] backdrop-blur-xl">
        <div aria-hidden className="auth-card-topline pointer-events-none absolute inset-x-0 top-0 h-px" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md border border-white/10 p-2 text-slate-400 transition hover:border-white/20 hover:text-white"
          aria-label="關閉"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 text-[#e5c96d]">
          <KeyRound className="h-5 w-5" />
        </div>
        <h2 id="password-reset-title" className="pr-10 text-xl font-semibold text-slate-50">
          重設登入密碼
        </h2>

        {view === "intro" ? (
          <div className="mt-3">
            <p className="text-sm leading-7 text-slate-300">
              為保護帳號，請先聯絡小幫手核對身分。取得一次性重設碼後，即可設定新密碼。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a
                href={HELPER_URL}
                target="_blank"
                rel="noreferrer"
                className="auth-submit glow-sweep inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold"
              >
                聯絡小幫手
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setView("form")}
                className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-[#d4af37]/35 hover:text-white"
              >
                我已有重設碼
              </button>
            </div>
          </div>
        ) : null}

        {view === "form" ? (
          <form onSubmit={handleReset} className="mt-5 space-y-4">
            <Field
              label="UID"
              value={uid}
              onChange={setUid}
              placeholder="輸入你的 UID"
              autoComplete="username"
            />
            <Field
              label="一次性重設碼"
              value={code}
              onChange={setCode}
              placeholder="RESET-XXXX-XXXX-XXXX"
              autoComplete="one-time-code"
            />
            <Field
              label="新密碼"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="至少 6 個字元"
              autoComplete="new-password"
            />
            <Field
              label="再次輸入新密碼"
              type="password"
              value={confirmation}
              onChange={setConfirmation}
              placeholder="再次輸入新密碼"
              autoComplete="new-password"
            />
            <FormMessage error={error} />
            <SubmitButton loading={loading}>確認重設密碼</SubmitButton>
            <button
              type="button"
              onClick={() => {
                setError(undefined);
                setView("intro");
              }}
              className="w-full py-1 text-sm text-slate-400 transition hover:text-slate-200"
            >
              返回
            </button>
          </form>
        ) : null}

        {view === "success" ? (
          <div className="mt-5 space-y-5">
            <FormMessage success={success} />
            <button
              type="button"
              onClick={onClose}
              className="auth-submit glow-sweep inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold"
            >
              返回登入
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
