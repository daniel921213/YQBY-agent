// Real account auth against the backend (FastAPI + Postgres). UID + password,
// JWT stored in localStorage. Same function signatures as the old localStorage
// stub, so the login/register pages and AccountMenu need no changes.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_KEY = "yqby.token";
const UID_KEY = "yqby.session";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function normalizeUid(uid: string): string {
  return uid.trim();
}

async function authRequest(
  path: string,
  uid: string,
  password: string
): Promise<{ token: string; uid: string }> {
  const url = new URL(path, API_BASE_URL);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ uid: normalizeUid(uid), password })
    });
  } catch {
    throw new Error("無法連線到伺服器，請稍後再試");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // FastAPI puts the message in `detail`; pydantic 422 makes it an array.
    const detail = (data as { detail?: unknown }).detail;
    const message =
      typeof detail === "string" ? detail : Array.isArray(detail) ? "輸入格式不正確" : "操作失敗";
    throw new Error(message);
  }
  return data as { token: string; uid: string };
}

export async function registerUser(uid: string, password: string): Promise<void> {
  // Create the account; the user then logs in on the login page.
  await authRequest("/api/v1/auth/register", uid, password);
}

export async function loginUser(uid: string, password: string): Promise<void> {
  const data = await authRequest("/api/v1/auth/login", uid, password);
  if (isBrowser()) {
    window.localStorage.setItem(TOKEN_KEY, data.token);
    window.localStorage.setItem(UID_KEY, data.uid);
  }
}

export async function resetPassword(
  uid: string,
  code: string,
  newPassword: string
): Promise<string> {
  const url = new URL("/api/v1/auth/password-reset", API_BASE_URL);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        uid: normalizeUid(uid),
        code: code.trim(),
        new_password: newPassword
      })
    });
  } catch {
    throw new Error("目前無法連線，請稍後再試");
  }

  const data = (await response.json().catch(() => ({}))) as {
    detail?: unknown;
    message?: string;
  };
  if (!response.ok) {
    const message =
      typeof data.detail === "string" ? data.detail : "重設失敗，請確認資料後再試";
    throw new Error(message);
  }
  logout();
  return data.message ?? "密碼已重設，請使用新密碼登入";
}

export function getCurrentUser(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(UID_KEY);
}

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function logout(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(UID_KEY);
}
