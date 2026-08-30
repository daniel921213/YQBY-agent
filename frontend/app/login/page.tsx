"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Field, FormMessage, SubmitButton } from "@/components/auth/AuthFields";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { loginUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      await loginUser(uid, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="登入"
      subtitle="輸入你的 UID 與密碼"
      footer={
        <>
          還沒有帳號？{" "}
          <Link href="/register" className="auth-link">
            前往註冊
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="UID"
          value={uid}
          onChange={setUid}
          placeholder="你的識別碼"
          autoComplete="username"
        />
        <Field
          label="密碼"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="你的密碼"
          autoComplete="current-password"
        />
        <div className="-mt-1 text-right">
          <button
            type="button"
            onClick={() => setForgotPasswordOpen(true)}
            className="auth-link text-sm"
          >
            忘記密碼？
          </button>
        </div>
        <FormMessage error={error} />
        <SubmitButton loading={loading}>登入</SubmitButton>
      </form>
      <ForgotPasswordDialog
        open={forgotPasswordOpen}
        initialUid={uid}
        onClose={() => setForgotPasswordOpen(false)}
      />
    </AuthShell>
  );
}
