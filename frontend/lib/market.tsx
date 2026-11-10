"use client";

import { createContext, useContext } from "react";
import type { LiquidationSource, MarketKind, MarketSession } from "@/lib/types";

/** 兩個主控台共用同一套元件；用語差異集中在這裡。 */
export interface MarketCopy {
  market: MarketKind;
  /** 側欄／頁首標題 */
  title: string;
  /** 手機版頁首的短名稱 */
  shortTitle: string;
  /** 「幣種」或「商品」 */
  noun: string;
  /** 計數單位：「幣」或「檔」 */
  unit: string;
  /** 「選幣」或「選商品」 */
  pick: string;
  /** 相對強弱基準 */
  benchmark: string;
  /** 寬度指標的短名稱（手機版小卡） */
  breadthShort: string;
  searchPlaceholder: string;
  analystSuggestions: string[];
  analystIntro: string;
}

export const MARKET_COPY: Record<MarketKind, MarketCopy> = {
  crypto: {
    market: "crypto",
    title: "主控台-加密",
    shortTitle: "加密",
    noun: "幣種",
    unit: "幣",
    pick: "選幣",
    benchmark: "BTC",
    breadthShort: "山寨指數",
    searchPlaceholder: "搜尋幣種，例如 BTC、ETH…",
    analystSuggestions: ["幫我看 BTCUSDT 的結構", "有哪些疑似反轉的幣?", "查一下 PEPE 的代幣資訊和價格"],
    analystIntro: "問我市場、某個幣、或哪些異常。"
  },
  tradfi: {
    market: "tradfi",
    title: "主控台-外匯版",
    shortTitle: "外匯版",
    noun: "商品",
    unit: "檔",
    pick: "選商品",
    benchmark: "SPY",
    breadthShort: "強於 SPY",
    searchPlaceholder: "搜尋商品，例如 XAU、NVDA、QQQ…",
    analystSuggestions: ["幫我看 XAUUSDT 的結構", "原油現在偏多還是偏空?", "有哪些美股出現異常?"],
    analystIntro: "問我黃金、原油、美股等合約的結構或異常。"
  }
};

const MarketContext = createContext<MarketCopy>(MARKET_COPY.crypto);

export function MarketProvider({ market, children }: { market: MarketKind; children: React.ReactNode }) {
  return <MarketContext.Provider value={MARKET_COPY[market]}>{children}</MarketContext.Provider>;
}

export function useMarketCopy(): MarketCopy {
  return useContext(MarketContext);
}

/** 外匯版資產類別（Binance underlyingType）→ 顯示名稱。 */
export const ASSET_CLASS_LABEL: Record<string, string> = {
  COMMODITY: "商品",
  EQUITY: "美股",
  HK_EQUITY: "港股",
  KR_EQUITY: "韓股",
  CN_EQUITY: "陸股",
  FX: "外匯"
};

export function assetClassLabel(assetClass?: string | null): string | null {
  if (!assetClass) return null;
  return ASSET_CLASS_LABEL[assetClass] ?? null;
}

export function isSessionClosed(session?: MarketSession | null): boolean {
  return session === "CLOSED";
}

/** 爆倉欄位旁的來源標註；null 表示不需標註（例如舊的單一交易所管線）。 */
export function liquidationSourceLabel(
  source?: LiquidationSource | null,
  available?: boolean
): string | null {
  if (source === "GATE") return "爆倉：Gate";
  if (source === "BITGET") return "爆倉：Bitget";
  if (available === false) return "爆倉：無數據";
  return null;
}

/** 掃描 meta.data_provider → 顯示用的數據來源名稱。 */
export function providerLabel(provider?: string | null): string {
  const normalized = (provider ?? "").toLowerCase();
  if (normalized.includes("binance")) return "Binance Futures";
  if (normalized.includes("gate")) return "Gate Futures";
  if (normalized.includes("mock")) return "模擬數據";
  return "Futures";
}
