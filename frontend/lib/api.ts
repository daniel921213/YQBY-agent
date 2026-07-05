import type { AnalysisResponse, AnomalyHistoryResponse, ScanResponse } from "@/lib/types";
import { getToken } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** 後端 403 detail="expired" 時的統一訊息；hook 把它存進 error 字串，頁面比對後切打馬擋板。 */
export const TRIAL_EXPIRED_MESSAGE = "試用已到期";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly expired: boolean
  ) {
    super(message);
  }
}

async function request<T>(path: string, label: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  const token = getToken();
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail;
    } catch {
      // 非 JSON 錯誤內容就算了
    }
    const expired = response.status === 403 && detail === "expired";
    throw new ApiError(expired ? TRIAL_EXPIRED_MESSAGE : `${label}：${response.status}`, response.status, expired);
  }

  return response.json();
}

export async function fetchMarketAnalysis(symbol: string): Promise<AnalysisResponse> {
  const params = new URLSearchParams({ symbol });
  return request(`/api/v1/analysis?${params}`, "分析資料讀取失敗");
}

export interface AnalystMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnalystReply {
  reply: string;
  tools_used: string[];
}

export async function askAnalyst(messages: AnalystMessage[]): Promise<AnalystReply> {
  return request("/api/v1/analyst/chat", "分析師讀取失敗", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });
}

export async function fetchMarketScan(): Promise<ScanResponse> {
  return request("/api/v1/scan", "市場掃描讀取失敗");
}

export async function fetchAnomalyHistory(): Promise<AnomalyHistoryResponse> {
  return request("/api/v1/anomaly-history", "歷史紀錄讀取失敗");
}

export interface Entitlement {
  uid: string;
  plan: "trial" | "lifetime";
  expires_at: string | null;
  days_left: number | null; // null = 永久；0 = 已到期
  active: boolean;
}

export async function fetchMe(): Promise<Entitlement> {
  return request("/api/v1/auth/me", "帳號狀態讀取失敗");
}
