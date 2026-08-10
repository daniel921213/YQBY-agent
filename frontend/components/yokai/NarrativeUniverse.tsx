"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Crosshair, Orbit, Radar, Search, Sparkles } from "lucide-react";
import type { YokaiLifecycle, YokaiNarrative } from "@/lib/types";

type NarrativeGroup = YokaiNarrative["group"];
type GroupFilter = "ALL" | NarrativeGroup;

interface NarrativeUniverseProps {
  narratives: YokaiNarrative[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onInspect: () => void;
}

interface PositionedNarrative {
  narrative: YokaiNarrative;
  x: number;
  y: number;
  child: boolean;
}

const GROUPS: Record<NarrativeGroup, {
  label: string;
  code: string;
  color: string;
  center: [number, number];
  radius: [number, number];
}> = {
  INFRA: {
    label: "鏈與基礎設施",
    code: "INFRA GRID",
    color: "#61c8ff",
    center: [19, 29],
    radius: [14, 20]
  },
  FINANCE: {
    label: "金融與資金",
    code: "CAPITAL GRID",
    color: "#f0c876",
    center: [50, 27],
    radius: [14, 19]
  },
  APPLICATION: {
    label: "應用與消費",
    code: "APPLICATION GRID",
    color: "#7ce5c3",
    center: [81, 29],
    radius: [14, 20]
  },
  CULTURE: {
    label: "文化與注意力",
    code: "CULTURE GRID",
    color: "#d78bff",
    center: [76, 74],
    radius: [14, 12]
  },
  ECOSYSTEM: {
    label: "生態輪動",
    code: "ECOSYSTEM GRID",
    color: "#ff8f9f",
    center: [30, 74],
    radius: [20, 13]
  }
};

const GROUP_ORDER: NarrativeGroup[] = ["INFRA", "FINANCE", "APPLICATION", "ECOSYSTEM", "CULTURE"];

const OFFSETS: Array<[number, number]> = [
  [0, -1], [0.78, -0.56], [0.95, 0.18], [0.58, 0.82],
  [-0.18, 1], [-0.82, 0.58], [-0.96, -0.16], [-0.58, -0.78],
  [0.15, -0.48], [0.48, 0.1], [0.08, 0.48], [-0.44, 0.06]
];

const MAP_CENTER: [number, number] = [50, 50];
const NODE_SAFE_X: [number, number] = [4, 96];
const NODE_SAFE_Y: [number, number] = [6, 94];

function clamp(value: number, [minimum, maximum]: [number, number]): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const LIFECYCLE_COLOR: Record<YokaiLifecycle, string> = {
  潛伏: "#6685a6",
  顯形: "#4cc2ff",
  發酵: "#f0c876",
  狂熱: "#ff5166",
  退散: "#64748b"
};

const LIFECYCLE_LABEL: Record<YokaiLifecycle, string> = {
  潛伏: "低頻潛伏",
  顯形: "訊號顯形",
  發酵: "共振發酵",
  狂熱: "過熱警戒",
  退散: "能量退散"
};

function matchesNarrative(narrative: YokaiNarrative, normalizedQuery: string): boolean {
  return !normalizedQuery
    || narrative.name.toLowerCase().includes(normalizedQuery)
    || narrative.english_name.toLowerCase().includes(normalizedQuery)
    || narrative.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery));
}

function rootPositions(narratives: YokaiNarrative[]): PositionedNarrative[] {
  return GROUP_ORDER.flatMap((group) => {
    const meta = GROUPS[group];
    const rows = narratives.filter((item) => item.group === group && !item.parent_id);
    return rows.map((narrative, index) => {
      const [offsetX, offsetY] = OFFSETS[index % OFFSETS.length];
      const ring = index >= OFFSETS.length ? 0.54 : 1;
      return {
        narrative,
        x: clamp(meta.center[0] + offsetX * meta.radius[0] * ring, NODE_SAFE_X),
        y: clamp(meta.center[1] + offsetY * meta.radius[1] * ring, NODE_SAFE_Y),
        child: false
      };
    });
  });
}

function childPositions(
  parentPosition: PositionedNarrative,
  narratives: YokaiNarrative[]
): PositionedNarrative[] {
  if (!narratives.length) return [];

  // Satellites fan toward the centre of the map.  A top/right/bottom edge
  // parent therefore expands inward instead of sending its first child out of
  // the clipped canvas.
  const centreAngle = Math.atan2(
    MAP_CENTER[1] - parentPosition.y,
    MAP_CENTER[0] - parentPosition.x
  );
  const spread = narratives.length <= 1
    ? 0
    : Math.min(Math.PI * 0.72, (narratives.length - 1) * 0.52);

  return narratives.map((narrative, index) => {
    const progress = narratives.length <= 1 ? 0.5 : index / (narratives.length - 1);
    const angle = centreAngle - spread / 2 + spread * progress;
    return {
      narrative,
      x: clamp(parentPosition.x + Math.cos(angle) * 7.3, NODE_SAFE_X),
      y: clamp(parentPosition.y + Math.sin(angle) * 9.2, NODE_SAFE_Y),
      child: true
    };
  });
}

export function NarrativeUniverse({ narratives, selectedId, onSelect, onInspect }: NarrativeUniverseProps) {
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("ALL");
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(narratives.map((item) => [item.id, item])), [narratives]);
  const selected = (selectedId && byId.get(selectedId)) || narratives[0] || null;
  const focusRoot = selected?.parent_id ? byId.get(selected.parent_id) ?? selected : selected;

  const roots = useMemo(() => rootPositions(narratives), [narratives]);
  const rootById = useMemo(() => new Map(roots.map((item) => [item.narrative.id, item])), [roots]);
  const normalizedQuery = query.trim().toLowerCase();
  const children = useMemo(() => {
    if (!focusRoot) return [];
    const parentPosition = rootById.get(focusRoot.id);
    if (!parentPosition) return [];
    const rows = narratives.filter((item) => item.parent_id === focusRoot.id);
    return childPositions(parentPosition, rows);
  }, [focusRoot, narratives, rootById]);
  const matchedChildren = useMemo(() => {
    if (!normalizedQuery) return children;
    return narratives
      .filter((item) => item.parent_id && matchesNarrative(item, normalizedQuery))
      .flatMap((narrative) => {
        const parentPosition = rootById.get(narrative.parent_id ?? "");
        if (!parentPosition) return [];
        const siblings = narratives.filter((item) => item.parent_id === narrative.parent_id);
        return childPositions(parentPosition, siblings).filter((item) => item.narrative.id === narrative.id);
      });
  }, [children, narratives, normalizedQuery, rootById]);

  const visibleChildren = normalizedQuery ? matchedChildren : children;
  const nodes = [...roots, ...visibleChildren];

  return (
    <div className="narrative-universe-frame relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#030711]/92">
      <div className="relative z-20 border-b border-white/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="narrative-radar-icon grid h-10 w-10 place-items-center rounded-xl border border-ember/30 bg-ember/[.08] text-ember">
              <Radar className="h-5 w-5" />
            </span>
            <div>
              <p className="font-kicker text-[9px] tracking-[0.24em] text-ember">SEMANTIC STAR MAP</p>
              <h3 className="mt-1 text-base font-bold text-slate-100 sm:text-lg">全市場敘事星圖</h3>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:w-60">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋賽道或關鍵詞"
                className="h-9 w-full rounded-full border border-white/10 bg-black/25 pl-9 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-ember/45"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(["ALL", ...GROUP_ORDER] as GroupFilter[]).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setGroupFilter(group)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] transition ${
                    groupFilter === group
                      ? "border-gold/45 bg-gold/10 text-goldhi"
                      : "border-white/10 bg-white/[.03] text-slate-500 hover:border-ember/25 hover:text-slate-300"
                  }`}
                >
                  {group === "ALL" ? "全部頻段" : GROUPS[group].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="narrative-universe-scroll relative z-10 overflow-x-auto">
        <div className="narrative-universe-map relative h-[650px] min-w-[940px] overflow-hidden sm:h-[690px] lg:min-w-0">
          <div className="narrative-universe-grid absolute inset-0" aria-hidden />
          <div className="narrative-universe-sweep absolute inset-y-0 w-36" aria-hidden />

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="universeLine" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="rgba(76,194,255,.24)" />
                <stop offset="1" stopColor="rgba(240,200,118,.08)" />
              </linearGradient>
              <filter id="universeGlow"><feGaussianBlur stdDeviation="0.35" /></filter>
            </defs>
            {GROUP_ORDER.map((group) => {
              const meta = GROUPS[group];
              const active = groupFilter === "ALL" || groupFilter === group;
              return (
                <g key={group} opacity={active ? 1 : 0.16}>
                  <ellipse cx={meta.center[0]} cy={meta.center[1]} rx={meta.radius[0] + 4} ry={meta.radius[1] + 4} fill="none" stroke={meta.color} strokeOpacity=".12" strokeWidth=".14" strokeDasharray="1.1 1.8" />
                  <ellipse cx={meta.center[0]} cy={meta.center[1]} rx={meta.radius[0] * 0.53} ry={meta.radius[1] * 0.53} fill="none" stroke={meta.color} strokeOpacity=".08" strokeWidth=".1" />
                </g>
              );
            })}
            {roots.map((node) => {
              const meta = GROUPS[node.narrative.group];
              return <line key={`link:${node.narrative.id}`} x1={meta.center[0]} y1={meta.center[1]} x2={node.x} y2={node.y} stroke="url(#universeLine)" strokeWidth=".09" opacity={groupFilter === "ALL" || groupFilter === node.narrative.group ? .65 : .08} />;
            })}
            {visibleChildren.map((node) => {
              const parent = rootById.get(node.narrative.parent_id ?? "");
              return parent ? <line key={`child:${node.narrative.id}`} x1={parent.x} y1={parent.y} x2={node.x} y2={node.y} stroke={GROUPS[node.narrative.group].color} strokeWidth=".18" strokeDasharray=".7 .7" opacity=".68" /> : null;
            })}
          </svg>

          {GROUP_ORDER.map((group) => {
            const meta = GROUPS[group];
            const count = narratives.filter((item) => item.group === group && !item.parent_id).length;
            return (
              <button
                key={`core:${group}`}
                type="button"
                onClick={() => setGroupFilter(groupFilter === group ? "ALL" : group)}
                className={`narrative-cluster-core absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center transition ${groupFilter !== "ALL" && groupFilter !== group ? "opacity-20" : "opacity-100"}`}
                style={{ left: `${meta.center[0]}%`, top: `${meta.center[1]}%`, color: meta.color }}
              >
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-current/30 bg-black/65 shadow-[0_0_24px_-6px_currentColor]"><Orbit className="h-4 w-4" /></span>
                <span className="font-kicker mt-2 block whitespace-nowrap text-[8px] tracking-[0.18em] text-slate-500">{meta.code}</span>
                <span className="mt-0.5 block whitespace-nowrap text-[10px] text-slate-400">{count} 主賽道</span>
              </button>
            );
          })}

          {nodes.map(({ narrative, x, y, child }) => {
            const selectedNode = narrative.id === selected?.id;
            const muted = (groupFilter !== "ALL" && narrative.group !== groupFilter) || !matchesNarrative(narrative, normalizedQuery);
            const color = LIFECYCLE_COLOR[narrative.lifecycle];
            const size = child ? 8 + narrative.heat_score * 0.085 : 10 + narrative.heat_score * 0.11;
            const childCount = narratives.filter((item) => item.parent_id === narrative.id).length;
            const emerging = narrative.heat_change >= 10 && ["顯形", "發酵"].includes(narrative.lifecycle);
            const labelLeft = x >= 72;
            return (
              <button
                key={narrative.id}
                type="button"
                onClick={() => {
                  onSelect(narrative.id);
                  setGroupFilter(narrative.group);
                }}
                aria-label={`${narrative.name}，妖氣 ${narrative.heat_score.toFixed(1)}，${narrative.lifecycle}`}
                className={`narrative-star-node absolute z-20 text-left transition duration-300 ${selectedNode ? "is-selected z-30" : ""} ${child ? "is-child" : ""} ${labelLeft ? "is-label-left" : ""} ${emerging ? "is-emerging" : ""} ${muted ? "pointer-events-none opacity-[.12]" : "opacity-100"}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  color,
                  ["--narrative-node-size" as string]: `${size}px`
                }}
              >
                {emerging ? <span className="narrative-comet-tail" aria-hidden /> : null}
                <span className="narrative-node-orbit" aria-hidden />
                <span className="narrative-node-core" aria-hidden />
                <span className="narrative-node-copy">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <strong className="text-[11px] font-semibold text-slate-200">{narrative.name}</strong>
                    {childCount ? <span className="rounded-full border border-current/25 px-1.5 py-px font-data text-[8px] text-current">+{childCount}</span> : null}
                  </span>
                  <span className="font-data mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[9px] text-slate-600">
                    <span className="text-current">{narrative.heat_score.toFixed(1)}</span>
                    <span>{narrative.lifecycle}</span>
                    {narrative.heat_change ? <span className={narrative.heat_change > 0 ? "text-long" : "text-short"}>{narrative.heat_change > 0 ? "+" : ""}{narrative.heat_change.toFixed(1)}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}

          {selected ? (
            <div className="narrative-lock-panel absolute bottom-4 left-4 z-30 flex w-[min(390px,calc(100vw-3rem))] items-center gap-3 rounded-xl border border-white/10 bg-[#060b17]/92 px-4 py-3 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:left-5">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-ember/30 bg-ember/10 text-ember">
                <Crosshair className="h-4 w-4" />
                <span className="absolute inset-0 animate-ping rounded-full border border-ember/20" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-kicker block truncate text-[8px] tracking-[0.2em] text-slate-600">SIGNAL LOCKED</span>
                <span className="mt-0.5 flex items-center gap-2">
                  <strong className="truncate text-sm text-slate-100">{selected.name}</strong>
                  <span className="shrink-0 text-[10px]" style={{ color: LIFECYCLE_COLOR[selected.lifecycle] }}>{LIFECYCLE_LABEL[selected.lifecycle]}</span>
                </span>
              </span>
              <button type="button" onClick={onInspect} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/25 bg-gold/[.08] px-3 py-1.5 text-[10px] text-goldhi transition hover:border-gold/50">
                情報室 <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-5 right-5 z-20 hidden items-center gap-3 text-[9px] text-slate-600 lg:flex">
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-ember" />節點大小＝妖氣值</span>
            <span>光環＝生命週期</span>
            <span>拖尾＝熱度加速</span>
          </div>
        </div>
      </div>
      <div className="relative z-20 flex items-center justify-between border-t border-white/5 px-4 py-2 text-[9px] text-slate-600 sm:px-5">
        <span>點擊主賽道展開衛星子賽道</span>
        <span className="inline-flex items-center gap-1 lg:hidden"><ChevronDown className="h-3 w-3 rotate-90" />左右拖曳探索</span>
        <span className="font-data hidden sm:inline">{narratives.length} SIGNALS MAPPED</span>
      </div>
    </div>
  );
}
