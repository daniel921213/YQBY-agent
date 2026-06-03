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
