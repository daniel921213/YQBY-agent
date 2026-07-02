export function formatScore(value: number): string {
  return value.toFixed(1);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

export function directionTone(direction: "LONG" | "SHORT" | "NEUTRAL"): string {
  if (direction === "LONG") return "text-long";
  if (direction === "SHORT") return "text-short";
  return "text-slate-400";
}

export function directionLabel(direction: "LONG" | "SHORT" | "NEUTRAL"): string {
  if (direction === "LONG") return "做多";
  if (direction === "SHORT") return "做空";
  return "中性";
}

export function confidenceLabel(level: "LOW" | "MEDIUM" | "HIGH"): string {
  if (level === "HIGH") return "高";
  if (level === "MEDIUM") return "中";
  return "低";
}

// Price precision scales with magnitude so both $70,311 and $0.007377 read well.
export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 4 : 6;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

// Takes a fraction (0.0286 => +2.86%) and renders a signed percentage.
export function formatPercent(fraction: number, decimals = 2): string {
  if (!Number.isFinite(fraction)) return "0%";
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

export function percentTone(fraction: number): string {
  if (fraction > 0.0005) return "text-long";
  if (fraction < -0.0005) return "text-short";
  return "text-slate-400";
}

import type { Stage } from "@/lib/types";

// 早期異動雷達的階段顯示：越前面越「早」，排序時優先浮上來。
export const STAGE_ORDER: Stage[] = [
  "早期異動",
  "趨勢啟動",
  "反轉警訊",
  "過熱風險",
  "趨勢延續",
  "觀察"
];

export function stagePriority(stage: Stage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}

// 只用現有主題 token（ember/long/short/copper），不引入新色。
const STAGE_TONE: Record<Stage, string> = {
  早期異動: "border-ember/50 bg-ember/15 text-ember",
  趨勢啟動: "border-long/40 bg-long/10 text-long",
  趨勢延續: "border-copper/40 bg-copper/10 text-copper",
  過熱風險: "border-short/30 bg-short/5 text-short",
  反轉警訊: "border-short/55 bg-short/15 text-short",
  觀察: "border-white/10 bg-white/5 text-slate-400"
};

export function stageTone(stage: Stage): string {
  return STAGE_TONE[stage] ?? STAGE_TONE["觀察"];
}

const STAGE_HINT: Record<Stage, string> = {
  早期異動: "資金與量能先行，價格尚未反映",
  趨勢啟動: "價格剛開始移動，資金流確認中",
  趨勢延續: "趨勢進行中，訂單流仍在支撐",
  過熱風險: "行情已充分發酵，追價風險偏高",
  反轉警訊: "背離或訂單流反撲，慎防反轉",
  觀察: "暫無明確異動"
};

export function stageHint(stage: Stage): string {
  return STAGE_HINT[stage] ?? "";
}

export function formatRelativeTime(minutes: number): string {
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小時前`;
  return `${Math.floor(hours / 24)}天前`;
}
