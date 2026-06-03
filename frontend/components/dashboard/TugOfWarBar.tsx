interface TugOfWarBarProps {
  long: number;
  short: number;
  size?: "sm" | "lg";
}

export function TugOfWarBar({ long, short, size = "lg" }: TugOfWarBarProps) {
  const total = long + short;
  const longPct = total > 0 ? (long / total) * 100 : 50;
  const shortPct = 100 - longPct;
  const leansLong = long >= short;

  const height = size === "lg" ? "h-3" : "h-2";
  const labelText = size === "lg" ? "text-sm" : "text-xs";

  return (
    <div className="w-full">
      {size === "lg" ? (
        <div className={`mb-1.5 flex items-center justify-between ${labelText}`}>
          <span className="font-medium text-long">多 {long.toFixed(1)}</span>
          <span className="text-xs tracking-[0.16em] text-stone-500">力量對比</span>
          <span className="font-medium text-short">空 {short.toFixed(1)}</span>
        </div>
      ) : null}

      <div className={`relative flex w-full overflow-hidden rounded-full bg-white/5 ${height}`}>
        <div
          className="h-full bg-long/85 transition-[width] duration-500 ease-out"
          style={{ width: `${longPct}%` }}
        />
        <div
          className="h-full bg-short/85 transition-[width] duration-500 ease-out"
          style={{ width: `${shortPct}%` }}
        />
        <div
          className={`absolute top-1/2 h-[140%] w-px -translate-y-1/2 ${
            leansLong ? "bg-long" : "bg-short"
          }`}
          style={{ left: `${longPct}%` }}
        />
      </div>
    </div>
  );
}
