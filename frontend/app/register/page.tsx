"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Field, FormMessage, SubmitButton } from "@/components/auth/AuthFields";
import { registerUser } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSuccess(undefined);

    if (uid.trim().length < 3) {
      setError("UID 至少需要 3 個字元");
      return;
    }
    if (password.length < 6) {
      setError("密碼至少需要 6 個字元");
      return;
    }
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }

    setLoading(true);
    try {
      await registerUser(uid, password);
      setSuccess("註冊成功，將前往登入頁…");
      setTimeout(() => router.push("/login"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="建立帳號"
      subtitle="設定你的 UID 與密碼即可註冊"
      footer={
        <>
          已經有帳號了？{" "}
          <Link href="/login" className="text-ember hover:underline">
            前往登入
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="UID"
          value={uid}
          onChange={setUid}
          placeholder="自訂你的識別碼"
          autoComplete="username"
        />
        <Field
          label="密碼"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="至少 6 個字元"
          autoComplete="new-password"
        />
        <Field
          label="確認密碼"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="再次輸入密碼"
          autoComplete="new-password"
        />
        <FormMessage error={error} success={success} />
        <SubmitButton loading={loading}>註冊</SubmitButton>
      </form>
    </AuthShell>
  );
}
