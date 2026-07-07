"use client";

import { useMemo, useState } from "react";
import type { OiMover, OiMoverSide } from "@/lib/types";
import { formatCompactNumber, formatPercent, formatPrice, percentTone } from "@/lib/format";

interface OiQuadrantChartProps {
  movers: OiMover[];
  onSelect: (symbol: string) => void;
}

// Quadrant semantics: X = 1h OI change, Y = 1h price change. The backend's
// `side` uses the same sign convention, so dot position and colour always agree.
const SIDE_META: Record<OiMoverSide, { color: string; desc: string }> = {
  多頭建倉: { color: "#23dd8d", desc: "價漲 · OI增" },
  空頭平倉: { color: "#3fb6f6", desc: "價漲 · OI減" },
  多頭平倉: { color: "#f0b429", desc: "價跌 · OI減" },
  空頭建倉: { color: "#ff5166", desc: "價跌 · OI增" },
  持平: { color: "#64748b", desc: "" }
};

const SIDE_ORDER: OiMoverSide[] = ["多頭建倉", "空頭平倉", "多頭平倉", "空頭建倉"];

// SVG geometry in viewBox units; the svg scales to its container.
const VW = 760;
const VH = 520;
const M = { left: 56, right: 20, top: 18, bottom: 48 };
const PW = VW - M.left - M.right;
const PH = VH - M.top - M.bottom;

const LABELED_DOTS = 12; // biggest movers carry a permanent symbol label
const SIDEBAR_ROWS = 8;

function tickStep(maxAbs: number): number {
  // Aim for ~3-4 gridlines per side so the map reads like graph paper.
  const steps = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
  return steps.find((s) => maxAbs / s <= 4.2) ?? 1;
}

function pctLabel(v: number): string {
  const pct = Math.round(v * 1000) / 10;
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

export function OiQuadrantChart({ movers, onSelect }: OiQuadrantChartProps) {
  // Thresholds are in percent units (3.5 => 3.5%), matching the slider labels.
  const [oiThreshold, setOiThreshold] = useState(0);
  const [priceThreshold, setPriceThreshold] = useState(0);
  const [hiddenSides, setHiddenSides] = useState<ReadonlySet<OiMoverSide>>(new Set());
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  const passesThresholds = (m: OiMover) =>
    Math.abs(m.oi_change_1h) * 100 >= oiThreshold &&
    Math.abs(m.price_change_1h ?? 0) * 100 >= priceThreshold;

  // Domain/counts come from threshold-filtered data (ignoring hidden sides) so
  // toggling a quadrant chip doesn't rescale the whole map.
  const pool = useMemo(
    () => movers.filter(passesThresholds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movers, oiThreshold, priceThreshold]
  );
  const filtered = useMemo(
    () => pool.filter((m) => !hiddenSides.has(m.side)),
    [pool, hiddenSides]
  );

  const counts = useMemo(() => {
    const tally: Record<OiMoverSide, number> = {
      多頭建倉: 0,
      空頭平倉: 0,
      多頭平倉: 0,
      空頭建倉: 0,
      持平: 0
    };
    for (const m of pool) tally[m.side] += 1;
    return tally;
  }, [pool]);

  const { xMax, yMax } = useMemo(() => {
    const xs = pool.map((m) => Math.abs(m.oi_change_1h));
    const ys = pool.map((m) => Math.abs(m.price_change_1h ?? 0));
    return {
      xMax: Math.max(0.015, ...xs) * 1.18,
      yMax: Math.max(0.008, ...ys) * 1.18
    };
  }, [pool]);

  const x = (v: number) => M.left + ((v + xMax) / (2 * xMax)) * PW;
  const y = (v: number) => M.top + PH - (((v ?? 0) + yMax) / (2 * yMax)) * PH;
  const cx0 = x(0);
  const cy0 = y(0);

  // Big movers drawn first (rendered behind), small dots paint on top.
  const ranked = useMemo(
    () => [...filtered].sort((a, b) => Math.abs(b.oi_delta) - Math.abs(a.oi_delta)),
    [filtered]
  );
  const maxDelta = Math.max(1e-9, ...ranked.map((m) => Math.abs(m.oi_delta)));
  const radius = (m: OiMover) => 5 + 11 * Math.sqrt(Math.abs(m.oi_delta) / maxDelta);
  const labeled = useMemo(
    () => new Set(ranked.slice(0, LABELED_DOTS).map((m) => m.symbol)),
    [ranked]
  );

  const hovered = hoveredSymbol
    ? ranked.find((m) => m.symbol === hoveredSymbol) ?? null
    : null;

  const xTicks = useMemo(() => {
    const step = tickStep(xMax);
    const ticks: number[] = [];
    for (let v = step; v < xMax * 0.98; v += step) ticks.push(v, -v);
    return ticks;
  }, [xMax]);
  const yTicks = useMemo(() => {
    const step = tickStep(yMax);
    const ticks: number[] = [];
    for (let v = step; v < yMax * 0.98; v += step) ticks.push(v, -v);
    return ticks;
  }, [yMax]);

  const toggleSide = (side: OiMoverSide) => {
    setHiddenSides((prev) => {
      const next = new Set(prev);
      if (next.has(side)) next.delete(side);
      else next.add(side);
      return next;
    });
    setHoveredSymbol(null);
  };

  if (!movers.length) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">目前沒有明顯的 OI 異動。</div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Quadrant chips (toggle) + threshold sliders */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {SIDE_ORDER.map((side) => {
            const meta = SIDE_META[side];
            const active = !hiddenSides.has(side);
            return (
              <button
                key={side}
                type="button"
                onClick={() => toggleSide(side)}
                title={`${meta.desc}（點擊${active ? "隱藏" : "顯示"}）`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  active ? "" : "opacity-35 grayscale"
                }`}
                style={{
                  borderColor: `${meta.color}55`,
                  color: meta.color,
                  background: active ? `${meta.color}14` : "transparent"
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                {side}
                <span className="tabular-nums opacity-80">{counts[side]}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            OI 門檻
            <input
              type="range"
              min={0}
              max={10}
              step={0.25}
              value={oiThreshold}
              onChange={(e) => {
                setOiThreshold(Number(e.target.value));
                setHoveredSymbol(null);
              }}
              className="h-1 w-24 accent-ember sm:w-28"
            />
            <span className="w-12 tabular-nums text-ember">≥{oiThreshold}%</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            漲跌門檻
            <input
              type="range"
              min={0}
              max={10}
              step={0.25}
              value={priceThreshold}
              onChange={(e) => {
                setPriceThreshold(Number(e.target.value));
                setHoveredSymbol(null);
              }}
              className="h-1 w-24 accent-long sm:w-28"
            />
            <span className="w-12 tabular-nums text-long">≥{priceThreshold}%</span>
          </label>
          <span className="text-xs text-slate-500">
            符合 <span className="tabular-nums text-slate-200">{filtered.length}</span> 個
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* Quadrant map */}
        <div className="surface-sunken relative overflow-hidden rounded-lg">
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            className="block h-auto w-full select-none"
            role="img"
            aria-label="OI 四象限異動圖"
            onMouseLeave={() => setHoveredSymbol(null)}
          >
            <defs>
              {/* Each quadrant tints toward its outer corner. */}
              <linearGradient id="oiq-q1" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor={SIDE_META.多頭建倉.color} stopOpacity="0" />
                <stop offset="1" stopColor={SIDE_META.多頭建倉.color} stopOpacity="0.13" />
              </linearGradient>
              <linearGradient id="oiq-q2" x1="1" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor={SIDE_META.空頭平倉.color} stopOpacity="0" />
                <stop offset="1" stopColor={SIDE_META.空頭平倉.color} stopOpacity="0.13" />
              </linearGradient>
              <linearGradient id="oiq-q3" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={SIDE_META.多頭平倉.color} stopOpacity="0" />
                <stop offset="1" stopColor={SIDE_META.多頭平倉.color} stopOpacity="0.13" />
              </linearGradient>
              <linearGradient id="oiq-q4" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={SIDE_META.空頭建倉.color} stopOpacity="0" />
                <stop offset="1" stopColor={SIDE_META.空頭建倉.color} stopOpacity="0.13" />
              </linearGradient>
            </defs>

            {/* Quadrant tints */}
            <rect x={cx0} y={M.top} width={M.left + PW - cx0} height={cy0 - M.top} fill="url(#oiq-q1)" />
            <rect x={M.left} y={M.top} width={cx0 - M.left} height={cy0 - M.top} fill="url(#oiq-q2)" />
            <rect x={M.left} y={cy0} width={cx0 - M.left} height={M.top + PH - cy0} fill="url(#oiq-q3)" />
            <rect x={cx0} y={cy0} width={M.left + PW - cx0} height={M.top + PH - cy0} fill="url(#oiq-q4)" />

            {/* Grid ticks */}
            {xTicks.map((v) => (
              <g key={`x${v}`}>
                <line
                  x1={x(v)}
                  y1={M.top}
                  x2={x(v)}
                  y2={M.top + PH}
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 5"
                />
                <text
                  x={x(v)}
                  y={M.top + PH + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#64748b"
                  className="tabular-nums"
                >
                  {pctLabel(v)}
                </text>
              </g>
            ))}
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line
                  x1={M.left}
                  y1={y(v)}
                  x2={M.left + PW}
                  y2={y(v)}
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 5"
                />
                <text
                  x={M.left - 8}
                  y={y(v) + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="#64748b"
                  className="tabular-nums"
                >
                  {pctLabel(v)}
                </text>
              </g>
            ))}

            {/* Zero cross axes */}
            <line x1={cx0} y1={M.top} x2={cx0} y2={M.top + PH} stroke="var(--chart-axis)" />
            <line x1={M.left} y1={cy0} x2={M.left + PW} y2={cy0} stroke="var(--chart-axis)" />
            <rect x={M.left} y={M.top} width={PW} height={PH} fill="none" stroke="var(--chart-frame)" />

            {/* Quadrant corner labels */}
            <g fontWeight={600} fontSize={12}>
              <text x={M.left + PW - 10} y={M.top + 18} textAnchor="end" fill={SIDE_META.多頭建倉.color}>
                多頭建倉
              </text>
              <text x={M.left + 10} y={M.top + 18} fill={SIDE_META.空頭平倉.color}>
                空頭平倉
              </text>
              <text x={M.left + 10} y={M.top + PH - 22} fill={SIDE_META.多頭平倉.color}>
                多頭平倉
              </text>
              <text x={M.left + PW - 10} y={M.top + PH - 22} textAnchor="end" fill={SIDE_META.空頭建倉.color}>
                空頭建倉
              </text>
            </g>
            <g fontSize={9.5}>
              <text x={M.left + PW - 10} y={M.top + 31} textAnchor="end" fill={SIDE_META.多頭建倉.color} opacity={0.55}>
                {SIDE_META.多頭建倉.desc}
              </text>
              <text x={M.left + 10} y={M.top + 31} fill={SIDE_META.空頭平倉.color} opacity={0.55}>
                {SIDE_META.空頭平倉.desc}
              </text>
              <text x={M.left + 10} y={M.top + PH - 10} fill={SIDE_META.多頭平倉.color} opacity={0.55}>
                {SIDE_META.多頭平倉.desc}
              </text>
              <text x={M.left + PW - 10} y={M.top + PH - 10} textAnchor="end" fill={SIDE_META.空頭建倉.color} opacity={0.55}>
                {SIDE_META.空頭建倉.desc}
              </text>
            </g>

            {/* Axis titles */}
            <text x={M.left + PW / 2} y={VH - 10} textAnchor="middle" fontSize={11} fill="#64748b">
              持倉變化 (1H)
            </text>
            <text
              x={14}
              y={M.top + PH / 2}
              textAnchor="middle"
              fontSize={11}
              fill="#64748b"
              transform={`rotate(-90 14 ${M.top + PH / 2})`}
            >
              價格變化 (1H)
            </text>

            {/* Dots */}
            {ranked.map((m) => {
              const meta = SIDE_META[m.side] ?? SIDE_META.持平;
              const r = radius(m);
              const dx = x(m.oi_change_1h);
              const dy = y(m.price_change_1h ?? 0);
              const isHovered = hoveredSymbol === m.symbol;
              return (
                <g
                  key={m.symbol}
                  className="cursor-pointer"
                  onClick={() => onSelect(m.symbol)}
                  onMouseEnter={() => setHoveredSymbol(m.symbol)}
                >
                  {/* generous invisible hit area */}
                  <circle cx={dx} cy={dy} r={r + 7} fill="transparent" />
                  <circle
                    cx={dx}
                    cy={dy}
                    r={isHovered ? r + 2 : r}
                    fill={meta.color}
                    fillOpacity={isHovered ? 0.5 : 0.28}
                    stroke={meta.color}
                    strokeWidth={1.6}
                    style={{
                      filter: `drop-shadow(0 0 ${isHovered ? 10 : 5}px ${meta.color}55)`,
                      transition: "r 0.2s ease, fill-opacity 0.2s ease"
                    }}
                  />
                  {labeled.has(m.symbol) || isHovered ? (
                    <text
                      x={dx}
                      y={dy - r - 6}
                      textAnchor="middle"
                      fontSize={10.5}
                      fill="var(--chart-label-ink)"
                      stroke="var(--chart-label-halo)"
                      strokeWidth={3}
                      style={{ paintOrder: "stroke" }}
                    >
                      {shortSymbol(m.symbol)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hovered ? (
            <div
              className="pointer-events-none absolute z-10 w-[200px]"
              style={{
                left: `${(x(hovered.oi_change_1h) / VW) * 100}%`,
                top: `${(y(hovered.price_change_1h ?? 0) / VH) * 100}%`,
                transform:
                  y(hovered.price_change_1h ?? 0) < 150
                    ? "translate(-50%, 16px)"
                    : "translate(-50%, calc(-100% - 14px))"
              }}
            >
              <div
                className="rounded-md border bg-[#060b16]/95 p-2.5 text-xs shadow-2xl backdrop-blur"
                style={{ borderColor: `${(SIDE_META[hovered.side] ?? SIDE_META.持平).color}66` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-50">{hovered.symbol}</span>
                  <span style={{ color: (SIDE_META[hovered.side] ?? SIDE_META.持平).color }}>
                    {hovered.side}
                  </span>
                </div>
                <dl className="mt-1.5 space-y-1">
                  <TooltipRow label="價格" value={formatPrice(hovered.price)} />
                  <TooltipRow
                    label="OI 1H"
                    value={formatPercent(hovered.oi_change_1h)}
                    tone={percentTone(hovered.oi_change_1h)}
                  />
                  <TooltipRow
                    label="OI 增量"
                    value={`${hovered.oi_delta >= 0 ? "+" : "-"}${formatCompactNumber(Math.abs(hovered.oi_delta))}`}
                    tone={hovered.oi_delta >= 0 ? "text-long" : "text-short"}
                  />
                  <TooltipRow
                    label="價格 1H"
                    value={formatPercent(hovered.price_change_1h ?? 0)}
                    tone={percentTone(hovered.price_change_1h ?? 0)}
                  />
                  <TooltipRow
                    label="價格 24H"
                    value={formatPercent(hovered.change_24h)}
                    tone={percentTone(hovered.change_24h)}
                  />
                </dl>
                <div className="mt-1.5 text-xs text-slate-500">點擊查看五支柱分析</div>
              </div>
            </div>
          ) : null}

          {/* All filtered out */}
          {!filtered.length ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              沒有符合門檻的異動 — 調低門檻或重新顯示象限
            </div>
          ) : null}
        </div>

        {/* Intensity sidebar */}
        <aside className="surface flex flex-col gap-1 rounded-lg p-3">
          <div className="mb-1 text-xs text-slate-500">
            異動強度 Top {Math.min(SIDEBAR_ROWS, ranked.length)} · 依 OI 變化金額
          </div>
          {ranked.slice(0, SIDEBAR_ROWS).map((m, i) => {
            const meta = SIDE_META[m.side] ?? SIDE_META.持平;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => onSelect(m.symbol)}
                onMouseEnter={() => setHoveredSymbol(m.symbol)}
                onMouseLeave={() => setHoveredSymbol(null)}
                className="flex items-center gap-2 rounded-sm px-1.5 py-1.5 text-left transition hover:bg-steel/50"
              >
                <span className="w-4 shrink-0 text-xs tabular-nums text-slate-600">{i + 1}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">
                    {shortSymbol(m.symbol)}
                  </span>
                  <span className="block text-xs" style={{ color: meta.color }}>
                    {m.side}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`text-xs tabular-nums ${percentTone(m.oi_change_1h)}`}>
                    OI {formatPercent(m.oi_change_1h)}
                  </span>
                  <span className={`text-xs tabular-nums ${percentTone(m.price_change_1h ?? 0)}`}>
                    價 {formatPercent(m.price_change_1h ?? 0)}
                  </span>
                </span>
              </button>
            );
          })}
          {!ranked.length ? (
            <div className="py-6 text-center text-xs text-slate-600">無資料</div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TooltipRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`tabular-nums ${tone ?? "text-slate-200"}`}>{value}</dd>
    </div>
  );
}
