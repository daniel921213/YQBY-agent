import type { AnalysisResponse, ScanResponse } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function fetchMarketAnalysis(symbol: string): Promise<AnalysisResponse> {
  const url = new URL("/api/v1/analysis", API_BASE_URL);
  url.searchParams.set("symbol", symbol);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`分析資料讀取失敗：${response.status}`);
  }

  return response.json();
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
  const url = new URL("/api/v1/analyst/chat", API_BASE_URL);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ messages }),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`分析師讀取失敗：${response.status}`);
  }
  return response.json();
}

export async function fetchMarketScan(): Promise<ScanResponse> {
  const url = new URL("/api/v1/scan", API_BASE_URL);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`市場掃描讀取失敗：${response.status}`);
  }

  return response.json();
}
