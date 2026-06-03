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
  return "text-stone-400";
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
  return "text-stone-400";
}

export function formatRelativeTime(minutes: number): string {
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小時前`;
  return `${Math.floor(hours / 24)}天前`;
}
