// ⚠️ TEMPORARY local-only auth stub.
// Accounts live in the browser's localStorage, so they exist only on this device
// and are NOT real authentication. Passwords are SHA-256 hashed (no salt) so
// plaintext is never stored, but this is a placeholder — swap in a real backend
// (FastAPI + hashed passwords in Postgres) before relying on this for anything.

const USERS_KEY = "yqby.users";
const SESSION_KEY = "yqby.session";

export interface StoredUser {
  uid: string;
  passwordHash: string;
  createdAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUsers(): StoredUser[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function normalizeUid(uid: string): string {
  return uid.trim();
}

export async function registerUser(uid: string, password: string): Promise<void> {
  const id = normalizeUid(uid);
  const users = readUsers();
  if (users.some((u) => u.uid.toLowerCase() === id.toLowerCase())) {
    throw new Error("這個 UID 已經被註冊了");
  }
  users.push({
    uid: id,
    passwordHash: await hashPassword(password),
    createdAt: Date.now()
  });
  writeUsers(users);
}

export async function loginUser(uid: string, password: string): Promise<void> {
  const id = normalizeUid(uid);
  const user = readUsers().find((u) => u.uid.toLowerCase() === id.toLowerCase());
  if (!user || user.passwordHash !== (await hashPassword(password))) {
    throw new Error("UID 或密碼不正確");
  }
  if (isBrowser()) {
    window.localStorage.setItem(SESSION_KEY, user.uid);
  }
}

export function getCurrentUser(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function logout(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SESSION_KEY);
}
