"use client";

import { useMemo, useState } from "react";
import { Crosshair, RotateCcw, ScanLine, Sparkles } from "lucide-react";
import type { OiMover, OiMoverSide } from "@/lib/types";
import { formatCompactNumber, formatPercent, formatPrice, percentTone } from "@/lib/format";

interface OiQuadrantChartProps {
  movers: OiMover[];
  onSelect: (symbol: string) => void;
}

type ReactorSide =
  | "多頭建倉"
  | "空頭建倉"
  | "空頭回補"
  | "多頭去槓桿"
  | "OI增倉／價格持平"
  | "OI減倉／價格持平"
  | "價格上漲／OI持平"
  | "價格下跌／OI持平"
  | "持平";

interface ZoneMeta {
  color: string;
  desc: string;
  angle: number;
  start?: number;
  end?: number;
  kind: "chamber" | "corridor" | "core";
}

interface ReactorNode {
  mover: OiMover;
  side: ReactorSide;
  color: string;
  x: number;
  y: number;
  previousX: number | null;
  previousY: number | null;
  radius: number;
  intensity: number;
  rank: number;
}

const ZONES: Record<ReactorSide, ZoneMeta> = {
  多頭建倉: { color: "#23dd8d", desc: "價格↑ · OI↑", angle: 315, start: 276, end: 354, kind: "chamber" },
  空頭建倉: { color: "#ff5166", desc: "價格↓ · OI↑", angle: 45, start: 6, end: 84, kind: "chamber" },
  空頭回補: { color: "#4cc2ff", desc: "價格↑ · OI↓", angle: 225, start: 186, end: 264, kind: "chamber" },
  多頭去槓桿: { color: "#f0b429", desc: "價格↓ · OI↓", angle: 135, start: 96, end: 174, kind: "chamber" },
  "OI增倉／價格持平": { color: "#a78bfa", desc: "OI↑ · 價格持平", angle: 0, start: 354, end: 366, kind: "corridor" },
  "OI減倉／價格持平": { color: "#94a3b8", desc: "OI↓ · 價格持平", angle: 180, start: 174, end: 186, kind: "corridor" },
  "價格上漲／OI持平": { color: "#67e8f9", desc: "價格↑ · OI持平", angle: 270, start: 264, end: 276, kind: "corridor" },
  "價格下跌／OI持平": { color: "#fb7185", desc: "價格↓ · OI持平", angle: 90, start: 84, end: 96, kind: "corridor" },
  持平: { color: "#8fa9c9", desc: "價格與 OI 皆持平", angle: 0, kind: "core" }
};

const MAIN_SIDES: ReactorSide[] = ["空頭回補", "多頭建倉", "多頭去槓桿", "空頭建倉"];
const CORRIDOR_SIDES: ReactorSide[] = [
  "價格上漲／OI持平",
  "OI增倉／價格持平",
  "價格下跌／OI持平",
  "OI減倉／價格持平"
];

const VW = 760;
const VH = 700;
const CX = 380;
const CY = 350;
const CORE_R = 88;
const INNER_R = 112;
const OUTER_R = 314;
const SIGNAL_R_MIN = 140;
const SIGNAL_R_MAX = 286;
const LABELED_NODES = 10;

function canonicalSide(side: OiMoverSide | null): ReactorSide | null {
  if (!side) return null;
  if (side === "空頭平倉") return "空頭回補";
  if (side === "多頭平倉") return "多頭去槓桿";
  return side;
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

function polar(radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: CX + Math.cos(radians) * radius, y: CY + Math.sin(radians) * radius };
}

function annularSectorPath(inner: number, outer: number, start: number, end: number): string {
  const outerStart = polar(outer, start);
  const outerEnd = polar(outer, end);
  const innerEnd = polar(inner, end);
  const innerStart = polar(inner, start);
  const largeArc = end - start > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
}

function symbolNoise(symbol: string, salt: number): number {
  let hash = salt * 131;
  for (let index = 0; index < symbol.length; index += 1) {
    hash = (hash * 33 + symbol.charCodeAt(index)) % 104729;
  }
  return (hash / 104729) * 2 - 1;
}

function zoneAnchor(side: ReactorSide, radius: number, angleOffset = 0): { x: number; y: number } {
  if (side === "持平") {
    return polar(Math.min(38, radius * 0.18), angleOffset * 36);
  }
  return polar(radius, ZONES[side].angle + angleOffset);
}

function zoneCountMap(movers: OiMover[]): Record<ReactorSide, number> {
  const counts = Object.fromEntries(Object.keys(ZONES).map((side) => [side, 0])) as Record<ReactorSide, number>;
  for (const mover of movers) {
    const side = canonicalSide(mover.side);
    if (side) counts[side] += 1;
  }
  return counts;
}

export function OiQuadrantChart({ movers, onSelect }: OiQuadrantChartProps) {
  const [oiThreshold, setOiThreshold] = useState(0);
  const [priceThreshold, setPriceThreshold] = useState(0);
  const [focusedSide, setFocusedSide] = useState<ReactorSide | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  const pool = useMemo(
    () => movers.filter((mover) =>
      Math.abs(mover.oi_change_1h) * 100 >= oiThreshold
      && Math.abs(mover.price_change_1h ?? 0) * 100 >= priceThreshold
    ),
    [movers, oiThreshold, priceThreshold]
  );

  const counts = useMemo(() => zoneCountMap(pool), [pool]);
  const ranked = useMemo(
    () => [...pool].sort((a, b) => Math.abs(b.oi_delta) - Math.abs(a.oi_delta)),
    [pool]
  );

  const nodes = useMemo<ReactorNode[]>(() => {
    const maxOi = Math.max(1e-9, ...pool.map((mover) => Math.abs(mover.oi_change_1h)));
    const maxPrice = Math.max(1e-9, ...pool.map((mover) => Math.abs(mover.price_change_1h ?? 0)));
    const maxDelta = Math.max(1e-9, ...pool.map((mover) => Math.abs(mover.oi_delta)));
    const rankBySymbol = new Map(ranked.map((mover, index) => [mover.symbol, index + 1]));

    return ranked.map((mover) => {
      const side = canonicalSide(mover.side) ?? "持平";
      const oiStrength = Math.min(1, Math.abs(mover.oi_change_1h) / maxOi);
      const priceStrength = Math.min(1, Math.abs(mover.price_change_1h ?? 0) / maxPrice);
      const deltaStrength = Math.sqrt(Math.min(1, Math.abs(mover.oi_delta) / maxDelta));
      const combined = 0.44 * oiStrength + 0.34 * priceStrength + 0.22 * deltaStrength;
      const intensity = Math.round(combined * 100);
      const radialNoise = symbolNoise(mover.symbol, 7) * 7;
      const radial = side === "持平"
        ? 22 + Math.max(0, combined) * 32
        : SIGNAL_R_MIN + combined * (SIGNAL_R_MAX - SIGNAL_R_MIN) + radialNoise;
      const balance = (oiStrength - priceStrength) / Math.max(oiStrength + priceStrength, 0.01);
      const angleNoise = symbolNoise(mover.symbol, 19) * 4.5;
      const angleOffset = ZONES[side].kind === "chamber" ? balance * 19 + angleNoise : angleNoise * 0.4;
      const position = zoneAnchor(side, radial, angleOffset);
      const previousSide = canonicalSide(mover.previous_side);
      const previousPosition = previousSide && previousSide !== side
        ? zoneAnchor(previousSide, Math.max(INNER_R + 20, radial - 54), angleNoise * 0.28)
        : null;

      return {
        mover,
        side,
        color: ZONES[side].color,
        x: position.x,
        y: position.y,
        previousX: previousPosition?.x ?? null,
        previousY: previousPosition?.y ?? null,
        radius: 6 + deltaStrength * 10,
        intensity,
        rank: rankBySymbol.get(mover.symbol) ?? ranked.length
      };
    });
  }, [pool, ranked]);

  const activeSymbol = hoveredSymbol ?? selectedSymbol ?? ranked[0]?.symbol ?? null;
  const activeNode = activeSymbol ? nodes.find((node) => node.mover.symbol === activeSymbol) ?? null : null;
  const activeMover = activeNode?.mover ?? null;
  const activeMeta = activeNode ? ZONES[activeNode.side] : null;

  const toggleFocus = (side: ReactorSide) => {
    setFocusedSide((current) => current === side ? null : side);
    setHoveredSymbol(null);
  };

  return (
    <div className="oi-reactor-shell relative overflow-hidden rounded-2xl border border-white/[.09] bg-[#030711]/90 p-3 sm:p-4">
      <div className="oi-reactor-ambient" aria-hidden />

      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-kicker text-[9px] tracking-[0.24em] text-ember">
              <ScanLine className="h-3.5 w-3.5" />
              OI FLUX REACTOR
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              距離＝異動強度 · 節點大小＝OI 變化金額 · 拖尾＝狀態切換
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ThresholdControl
              label="OI 門檻"
              value={oiThreshold}
              color="#4cc2ff"
              onChange={(value) => {
                setOiThreshold(value);
                setHoveredSymbol(null);
              }}
            />
            <ThresholdControl
              label="漲跌門檻"
              value={priceThreshold}
              color="#23dd8d"
              onChange={(value) => {
                setPriceThreshold(value);
                setHoveredSymbol(null);
              }}
            />
            <span className="text-xs text-slate-500">
              捕捉 <b className="font-data font-normal text-slate-200">{pool.length}</b> 個
            </span>
            {focusedSide ? (
              <button
                type="button"
                onClick={() => setFocusedSide(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400 transition hover:border-ember/35 hover:text-ember"
              >
                <RotateCcw className="h-3 w-3" />顯示全部
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_270px] xl:grid-cols-[minmax(0,1fr)_290px]">
          <div className="relative min-w-0 overflow-hidden rounded-xl border border-white/[.06] bg-black/15">
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className="oi-reactor-map block h-auto w-full select-none"
              role="img"
              aria-label="OI 資金流向反應爐，包含四個主要市場狀態、四個持平通道與穩態核心"
              onMouseLeave={() => setHoveredSymbol(null)}
            >
              <defs>
                <radialGradient id="oi-reactor-backdrop" cx="50%" cy="48%" r="54%">
                  <stop offset="0" stopColor="#17294a" stopOpacity=".34" />
                  <stop offset=".64" stopColor="#07101f" stopOpacity=".16" />
                  <stop offset="1" stopColor="#02050b" stopOpacity=".82" />
                </radialGradient>
                {MAIN_SIDES.map((side) => (
                  <radialGradient key={`fill:${side}`} id={`reactor-fill-${side}`} cx="50%" cy="50%" r="72%">
                    <stop offset="0" stopColor={ZONES[side].color} stopOpacity=".03" />
                    <stop offset=".72" stopColor={ZONES[side].color} stopOpacity=".11" />
                    <stop offset="1" stopColor={ZONES[side].color} stopOpacity=".22" />
                  </radialGradient>
                ))}
                <filter id="reactor-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="reactor-node-glow" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur stdDeviation="3.4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <pattern id="reactor-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(76,194,255,.035)" strokeWidth="1" />
                </pattern>
              </defs>

              <rect width={VW} height={VH} fill="url(#oi-reactor-backdrop)" />
              <rect width={VW} height={VH} fill="url(#reactor-grid)" opacity=".48" />

              {[20, 40, 60, 80, 100].map((value, index) => {
                const radius = SIGNAL_R_MIN + (index / 4) * (SIGNAL_R_MAX - SIGNAL_R_MIN);
                const label = polar(radius, 278);
                return (
                  <g key={value} opacity=".52">
                    <circle cx={CX} cy={CY} r={radius} fill="none" stroke="rgba(143,169,201,.17)" strokeWidth=".8" strokeDasharray="3 8" />
                    <text x={label.x + 3} y={label.y} fill="#64748b" fontSize="8" dominantBaseline="middle">{value}</text>
                  </g>
                );
              })}

              <circle className="oi-reactor-outer-ring" cx={CX} cy={CY} r={OUTER_R + 10} fill="none" stroke="rgba(76,194,255,.16)" strokeWidth="1" strokeDasharray="12 8 2 8" />
              <circle cx={CX} cy={CY} r={OUTER_R + 3} fill="none" stroke="rgba(240,200,118,.1)" strokeWidth="7" />

              {MAIN_SIDES.map((side) => {
                const zone = ZONES[side];
                const focused = !focusedSide || focusedSide === side;
                return (
                  <path
                    key={side}
                    d={annularSectorPath(INNER_R, OUTER_R, zone.start!, zone.end!)}
                    fill={`url(#reactor-fill-${side})`}
                    stroke={zone.color}
                    strokeOpacity={focused ? .5 : .08}
                    strokeWidth={focused ? 1.4 : .8}
                    className="oi-reactor-zone cursor-pointer transition-opacity"
                    opacity={focused ? 1 : .18}
                    role="button"
                    tabIndex={0}
                    aria-label={`${side}，${counts[side]} 個，點擊聚焦`}
                    onClick={() => toggleFocus(side)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") toggleFocus(side);
                    }}
                  />
                );
              })}

              {CORRIDOR_SIDES.map((side) => {
                const zone = ZONES[side];
                const focused = !focusedSide || focusedSide === side;
                return (
                  <path
                    key={side}
                    d={annularSectorPath(INNER_R - 2, OUTER_R - 4, zone.start!, zone.end!)}
                    fill={zone.color}
                    fillOpacity={focused ? .09 : .015}
                    stroke={zone.color}
                    strokeOpacity={focused ? .34 : .06}
                    strokeWidth="1"
                    className="oi-reactor-zone cursor-pointer"
                    opacity={focused ? 1 : .18}
                    role="button"
                    tabIndex={0}
                    aria-label={`${side}，${counts[side]} 個，點擊聚焦`}
                    onClick={() => toggleFocus(side)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") toggleFocus(side);
                    }}
                  />
                );
              })}

              {MAIN_SIDES.map((side) => {
                const zone = ZONES[side];
                const label = polar(221, zone.angle);
                const focused = !focusedSide || focusedSide === side;
                return (
                  <g
                    key={`label:${side}`}
                    className="pointer-events-none"
                    opacity={focused ? 1 : .18}
                    textAnchor="middle"
                  >
                    <text x={label.x} y={label.y - 6} fill={zone.color} fontSize="15" fontWeight="700">{side}</text>
                    <text x={label.x} y={label.y + 12} fill={zone.color} fillOpacity=".64" fontSize="9.5">{zone.desc} · {counts[side]}</text>
                  </g>
                );
              })}

              {CORRIDOR_SIDES.map((side) => {
                const zone = ZONES[side];
                const label = polar(173, zone.angle);
                const vertical = zone.angle === 90 || zone.angle === 270;
                const focused = !focusedSide || focusedSide === side;
                return (
                  <g key={`corridor-label:${side}`} className="pointer-events-none" opacity={focused ? .74 : .12}>
                    <text
                      x={label.x}
                      y={label.y}
                      fill={zone.color}
                      fontSize="8.4"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={vertical ? `rotate(${zone.angle === 90 ? 90 : -90} ${label.x} ${label.y})` : undefined}
                    >
                      {zone.desc} · {counts[side]}
                    </text>
                  </g>
                );
              })}

              <g
                className="oi-reactor-core cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`穩態核心，${counts.持平} 個，點擊聚焦`}
                onClick={() => toggleFocus("持平")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") toggleFocus("持平");
                }}
                opacity={!focusedSide || focusedSide === "持平" ? 1 : .26}
              >
                <polygon
                  points={Array.from({ length: 8 }, (_, index) => {
                    const point = polar(CORE_R, index * 45 + 22.5);
                    return `${point.x},${point.y}`;
                  }).join(" ")}
                  fill="rgba(11,19,38,.94)"
                  stroke={ZONES.持平.color}
                  strokeOpacity=".55"
                  strokeWidth="1.6"
                  filter="url(#reactor-soft-glow)"
                />
                <circle cx={CX} cy={CY} r={CORE_R - 14} fill="none" stroke="rgba(167,139,250,.18)" strokeDasharray="3 6" />
                <text x={CX} y={CY - 4} fill="#dbeafe" fontSize="16" fontWeight="700" textAnchor="middle">穩態核心</text>
                <text x={CX} y={CY + 15} fill="#64748b" fontSize="9" textAnchor="middle">價格平 · OI平 · {counts.持平}</text>
              </g>

              {nodes.map((node) => {
                if (node.previousX === null || node.previousY === null) return null;
                const dimmed = focusedSide && focusedSide !== node.side;
                const controlX = (node.previousX + node.x) / 2 + (CY - node.y) * .08;
                const controlY = (node.previousY + node.y) / 2 + (node.x - CX) * .08;
                return (
                  <path
                    key={`trail:${node.mover.symbol}`}
                    d={`M ${node.previousX} ${node.previousY} Q ${controlX} ${controlY} ${node.x} ${node.y}`}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1.6"
                    strokeOpacity={dimmed ? .04 : .45}
                    strokeDasharray="4 6"
                    className="oi-reactor-trail"
                    filter="url(#reactor-soft-glow)"
                  />
                );
              })}

              {nodes.map((node) => {
                const dimmed = Boolean(focusedSide && focusedSide !== node.side);
                const active = activeSymbol === node.mover.symbol;
                const showLabel = node.rank <= LABELED_NODES || active;
                return (
                  <g
                    key={node.mover.symbol}
                    className="oi-reactor-signal cursor-pointer"
                    opacity={dimmed ? .1 : 1}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.mover.symbol}，${node.side}，異動強度 ${node.intensity}`}
                    onMouseEnter={() => setHoveredSymbol(node.mover.symbol)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedSymbol(node.mover.symbol);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedSymbol(node.mover.symbol);
                    }}
                  >
                    <circle cx={node.x} cy={node.y} r={node.radius + 9} fill="transparent" />
                    {active ? (
                      <circle className="oi-reactor-node-pulse" cx={node.x} cy={node.y} r={node.radius + 8} fill="none" stroke={node.color} strokeOpacity=".52" />
                    ) : null}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={active ? node.radius + 2 : node.radius}
                      fill={node.color}
                      fillOpacity={active ? .48 : .25}
                      stroke={node.color}
                      strokeWidth={active ? 2 : 1.35}
                      filter="url(#reactor-node-glow)"
                    />
                    {node.rank <= 8 ? (
                      <g transform={`translate(${node.x - node.radius - 7} ${node.y - node.radius - 7})`}>
                        <circle r="7" fill="#050811" stroke={node.color} strokeOpacity=".65" />
                        <text y=".5" fill={node.color} fontSize="7" textAnchor="middle" dominantBaseline="middle">{String(node.rank).padStart(2, "0")}</text>
                      </g>
                    ) : null}
                    {showLabel ? (
                      <text
                        x={node.x}
                        y={node.y - node.radius - 8}
                        fill="var(--chart-label-ink)"
                        stroke="var(--chart-label-halo)"
                        strokeWidth="3"
                        fontSize="10"
                        fontWeight={active ? 700 : 500}
                        textAnchor="middle"
                        style={{ paintOrder: "stroke" }}
                      >
                        {shortSymbol(node.mover.symbol)}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {!pool.length ? (
                <g className="pointer-events-none" textAnchor="middle">
                  <text x={CX} y={CY - 6} fill="#94a3b8" fontSize="14">沒有符合門檻的異動</text>
                  <text x={CX} y={CY + 16} fill="#475569" fontSize="10">請調低門檻，或等待下一輪市場掃描</text>
                </g>
              ) : null}
            </svg>
          </div>

          <SignalLens
            node={activeNode}
            mover={activeMover}
            meta={activeMeta}
            onInspect={onSelect}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[.06] pt-2 text-[9px] text-slate-600">
          <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-gold" />點擊艙室聚焦狀態，點擊節點鎖定訊號</span>
          <span className="font-data">1H PRICE × 1H OPEN INTEREST</span>
        </div>
      </div>
    </div>
  );
}

function ThresholdControl({
  label,
  value,
  color,
  onChange
}: {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-slate-500">
      {label}
      <input
        type="range"
        min={0}
        max={10}
        step={0.25}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-20 sm:w-24"
        style={{ accentColor: color }}
      />
      <span className="font-data w-10" style={{ color }}>≥{value}%</span>
    </label>
  );
}

function SignalLens({
  node,
  mover,
  meta,
  onInspect
}: {
  node: ReactorNode | null;
  mover: OiMover | null;
  meta: ZoneMeta | null;
  onInspect: (symbol: string) => void;
}) {
  if (!node || !mover || !meta) {
    return (
      <aside className="oi-signal-lens flex min-h-52 flex-col items-center justify-center rounded-xl border border-white/[.07] bg-black/20 px-5 text-center text-xs leading-5 text-slate-600">
        <Crosshair className="mb-3 h-5 w-5 text-slate-700" />
        等待 OI 訊號
      </aside>
    );
  }

  const previous = canonicalSide(mover.previous_side);
  return (
    <aside
      className="oi-signal-lens relative overflow-hidden rounded-xl border bg-[#050a15]/92 p-4 shadow-2xl backdrop-blur-xl sm:p-5"
      style={{ borderColor: `${meta.color}58`, boxShadow: `0 22px 56px -30px ${meta.color}88` }}
    >
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent" style={{ color: meta.color }} />
      <div className="flex items-center justify-between gap-3">
        <span className="font-kicker text-[8px] tracking-[0.22em] text-slate-600">SIGNAL LENS</span>
        <span className="font-data rounded-full border px-2 py-0.5 text-[9px]" style={{ borderColor: `${meta.color}55`, color: meta.color }}>
          強度 {node.intensity}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border bg-black/25 font-data text-sm font-semibold" style={{ borderColor: `${meta.color}88`, color: meta.color, boxShadow: `0 0 24px -10px ${meta.color}` }}>
          {shortSymbol(mover.symbol).slice(0, 2)}
        </span>
        <span className="min-w-0">
          <strong className="font-data block truncate text-lg text-slate-50">{shortSymbol(mover.symbol)}</strong>
          <span className="mt-0.5 block text-xs" style={{ color: meta.color }}>{node.side}</span>
        </span>
      </div>

      <dl className="mt-5 space-y-2.5 border-y border-white/[.06] py-4 text-xs">
        <LensRow label="現價" value={formatPrice(mover.price)} />
        <LensRow label="OI 1H" value={formatPercent(mover.oi_change_1h)} tone={percentTone(mover.oi_change_1h)} />
        <LensRow label="價格 1H" value={formatPercent(mover.price_change_1h ?? 0)} tone={percentTone(mover.price_change_1h ?? 0)} />
        <LensRow
          label="變化金額"
          value={`${mover.oi_delta >= 0 ? "+" : "-"}$${formatCompactNumber(Math.abs(mover.oi_delta))}`}
          tone={mover.oi_delta >= 0 ? "text-long" : "text-short"}
        />
        <LensRow label="價格 24H" value={formatPercent(mover.change_24h)} tone={percentTone(mover.change_24h)} />
      </dl>

      <div className="mt-3 min-h-8 text-[10px] leading-4 text-slate-500">
        {previous && previous !== node.side ? (
          <span>上一輪 <b className="font-normal text-slate-300">{previous}</b> → 現在 <b className="font-normal" style={{ color: meta.color }}>{node.side}</b></span>
        ) : "本輪未偵測到狀態切換"}
      </div>

      <button
        type="button"
        onClick={() => onInspect(mover.symbol)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-xs font-medium transition hover:bg-white/[.05]"
        style={{ borderColor: `${meta.color}55`, color: meta.color }}
      >
        <Crosshair className="h-3.5 w-3.5" />查看五支柱分析
      </button>
    </aside>
  );
}

function LensRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-data tabular-nums ${tone ?? "text-slate-200"}`}>{value}</dd>
    </div>
  );
}
