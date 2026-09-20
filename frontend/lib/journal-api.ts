import { getToken, logout } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(new URL(`/api/v1${path}`, BASE), {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/json", ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (response.status === 401) {
    logout();
    window.location.replace("/login");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `請求失敗 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type Trade = {
  id: number; symbol: string; market: "crypto" | "futures" | "other"; currency: string;
  side: "long" | "short"; entry_at: string; exit_at: string;
  entry_price: string; exit_price: string; quantity: string; point_value: string;
  fees: string; net_pnl: string; strategy: string | null; note: string | null;
};
export type TradeInput = Omit<Trade, "id" | "net_pnl">;
export const listTrades = () => call<Trade[]>("/trades");
export const saveTrade = (data: TradeInput, id?: number) => call<Trade>(id ? `/trades/${id}` : "/trades", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
export const deleteTrade = (id: number) => call<void>(`/trades/${id}`, { method: "DELETE" });

export type Block = { type: "paragraph" | "heading" | "bullet" | "image"; text: string; image_id?: number | null };
export type Journal = { id: number; author_id: number; author_name: string; title: string; journal_date: string; tags: string[]; blocks: Block[]; is_published: boolean; created_at: string; updated_at: string | null };
export type Teacher = { id: number; name: string; count: number };
export type JournalEvent = { id: number; journal_id: number; teacher_name: string; title: string };
export const myJournals = () => call<Journal[]>("/journals/mine");
export const newJournal = () => {
  const today = new Date();
  const journal_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return call<Journal>("/journals/mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "未命名日誌", journal_date, blocks: [] }) });
};
export const saveJournal = (id: number, title: string, journal_date: string, tags: string[], blocks: Block[]) => call<Journal>(`/journals/mine/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, journal_date, tags, blocks }) });
export const deleteJournal = (id: number) => call<void>(`/journals/mine/${id}`, { method: "DELETE" });
export const publishJournal = (id: number) => call<Journal>(`/journals/mine/${id}/publish`, { method: "POST" });
export const unpublishJournal = (id: number) => call<Journal>(`/journals/mine/${id}/unpublish`, { method: "POST" });
export const teachers = () => call<Teacher[]>("/journals/teachers");
export const publicJournals = (teacherId?: number) => call<Journal[]>(`/journals/published${teacherId ? `?teacher_id=${teacherId}` : ""}`);
export const publicJournal = (id: number) => call<Journal>(`/journals/published/${id}`);
export const journalEvents = () => call<{ events: JournalEvent[]; cursor: number; needs_ack: boolean }>("/journals/events");
export const markJournalEventsRead = (cursor: number) => call<{ cursor: number }>("/journals/events/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursor }) });

export async function uploadJournalImage(journalId: number, file: File): Promise<number> {
  const result = await call<{ id: number }>(`/journals/mine/${journalId}/images`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  return result.id;
}

export async function journalImageUrl(imageId: number): Promise<string> {
  const token = getToken();
  const response = await fetch(new URL(`/api/v1/journals/images/${imageId}`, BASE), { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!response.ok) throw new Error("圖片無法載入");
  return URL.createObjectURL(await response.blob());
}
