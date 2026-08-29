"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  ExternalLink,
  Gauge,
  Loader2,
  Newspaper,
  Orbit,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X
} from "lucide-react";
import { AnalystChat } from "@/components/analyst/AnalystChat";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ModalShell } from "@/components/dashboard/ModalShell";
import { SideNav } from "@/components/nav/SideNav";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { NarrativeUniverse } from "@/components/yokai/NarrativeUniverse";
import { YokaiAccessWall } from "@/components/yokai/YokaiAccessWall";
import { YokaiNetwork } from "@/components/yokai/YokaiNetwork";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useYokai } from "@/hooks/useYokai";
import { directionLabel, directionTone, formatPercent, formatPrice, percentTone, stageTone } from "@/lib/format";
import { ThemeToggle } from "@/lib/theme";
import type {
  YokaiHistoryPoint,
  YokaiLifecycle,
  YokaiNarrative,
  YokaiSourceHealth,
  YokaiToken,
  YokaiTokenStatus
} from "@/lib/types";

type TokenFilter = "ALL" | YokaiTokenStatus;

const LIFECYCLE_TONE: Record<YokaiLifecycle, string> = {
  潛伏: "border-white/10 bg-white/5 text-slate-400",
  顯形: "border-ember/40 bg-ember/10 text-ember",
  發酵: "border-gold/40 bg-gold/10 text-goldhi",
  狂熱: "border-short/45 bg-short/10 text-short",
  退散: "border-white/10 bg-black/20 text-slate-500"
};

const SOURCE_TONE: Record<YokaiSourceHealth, string> = {
  HEALTHY: "bg-long shadow-[0_0_10px_rgba(35,221,141,.75)]",
  STALE: "bg-gold shadow-[0_0_10px_rgba(202,138,4,.65)]",
  OFFLINE: "bg-short shadow-[0_0_10px_rgba(255,81,102,.55)]"
};

export default function YokaiPage() {
  return (
    <AuthGuard>
      <YokaiEntitlementGate />
    </AuthGuard>
  );
}

function YokaiEntitlementGate() {
  const { me, loading, error, refresh } = useEntitlement();

  if (loading || !me) {
    return (
      <main className="yokai-shell relative grid min-h-screen place-items-center overflow-hidden px-4">
        <SpaceParticleField />
        <div className="yokai-aurora" aria-hidden />
        <div className="glass-panel relative z-10 flex max-w-sm flex-col items-center rounded-2xl px-8 py-9 text-center">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-ember" /> : <ShieldAlert className="h-6 w-6 text-gold" />}
          <p className="font-kicker mt-4 text-[9px] tracking-[0.24em] text-gold">YOKAI ACCESS CONTROL</p>
          <p className="mt-2 text-sm text-slate-300">{loading ? "正在驗證內測權限…" : error ?? "帳號資格讀取失敗"}</p>
          {!loading ? (
            <button type="button" onClick={() => void refresh()} className="mt-5 rounded-md border border-white/10 px-4 py-2 text-xs text-slate-300 transition hover:border-ember/40 hover:text-ember">
              重新驗證
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  const hasYokaiAccess = me.plan === "lifetime" || (me.plan === "member" && me.active);
  if (!hasYokaiAccess) return <YokaiAccessWall entitlement={me} />;
  return <YokaiIntelligence />;
}

function YokaiIntelligence() {
  const { data, loading, error, refresh } = useYokai();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<YokaiToken | null>(null);
  const [filter, setFilter] = useState<TokenFilter>("ALL");
  const [query, setQuery] = useState("");
  const [analystOpen, setAnalystOpen] = useState(false);

  useEffect(() => {
    if (!selectedId && data?.narratives.length) setSelectedId(data.narratives[0].id);
    if (selectedId && data && !data.narratives.some((item) => item.id === selectedId)) {
      setSelectedId(data.narratives[0]?.id ?? null);
    }
  }, [data, selectedId]);

  const selectedNarrative = useMemo(
    () => data?.narratives.find((item) => item.id === selectedId) ?? data?.narratives[0] ?? null,
    [data, selectedId]
  );
  const narrativeTokens = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    return (data?.tokens ?? []).filter((token) => {
      if (selectedNarrative && !token.narrative_ids.includes(selectedNarrative.id)) return false;
      if (filter !== "ALL" && token.status !== filter) return false;
      return !normalized || token.symbol.includes(normalized);
    });
  }, [data, filter, query, selectedNarrative]);

  return (
    <main className="yokai-shell relative min-h-screen overflow-hidden px-3 pb-24 pt-3 sm:px-5 lg:px-8 lg:pb-16 lg:pt-5">
      <SpaceParticleField />
      <div className="yokai-aurora" aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-[1500px]">
        <header className="glass-panel sticky top-3 z-30 flex items-center gap-3 rounded-xl px-3 py-3 sm:px-4">
          <SideNav />
          <div className="min-w-0">
            <p className="font-kicker truncate text-[9px] tracking-[0.26em] text-gold sm:text-[10px]">
              YOKAI NARRATIVE INTELLIGENCE
            </p>
            <h1 className="font-display mt-0.5 truncate bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-lg font-black text-transparent sm:text-xl">
              妖怪篩選器
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-400 md:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${data?.external_ready && data?.gate_ready ? SOURCE_TONE.HEALTHY : SOURCE_TONE.STALE}`} />
              {data?.external_ready && data?.gate_ready ? "雙層情報在線" : "情報暖機中"}
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="hidden h-10 w-10 items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-ember/50 hover:text-ember disabled:opacity-40 sm:inline-flex"
              title="重新讀取"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <ThemeToggle />
            <div className="hidden sm:block"><AccountMenu /></div>
          </div>
        </header>

        {error ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-short/30 bg-short/10 px-4 py-3 text-sm text-red-100">
            <CircleAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <section className="grid min-h-[calc(100svh-6rem)] items-center gap-5 py-6 lg:grid-cols-[minmax(300px,.72fr)_minmax(640px,1.55fr)] lg:gap-7 lg:py-8">
          <div className="relative z-10 px-2 py-5 sm:px-4 lg:py-10">
            <div className="mb-5 flex items-center gap-2 font-kicker text-[10px] tracking-[0.26em] text-ember">
              <Radio className="h-3.5 w-3.5" />
              LIVE NARRATIVE MAPPING
            </div>
            <h2 className="font-display max-w-2xl text-4xl font-black leading-[1.08] tracking-[-0.04em] text-slate-50 sm:text-5xl lg:text-6xl">
              先找到市場正在
              <span className="yokai-gradient-text block">聚集的妖氣</span>
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
              外部情報只負責發現題材；真正的做多資格，仍需通過 Gate 的 15m 正式方向、OI、主動流與 5m 時機確認。
            </p>
            <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
              <HeroMetric label="活躍賽道" value={data?.narratives.filter((item) => item.heat_score > 0).length ?? 0} suffix="條" />
              <HeroMetric label="Gate 覆蓋" value={data?.coverage_symbols ?? 0} suffix="幣" />
              <HeroMetric label="確認做多" value={data?.qualified_longs.length ?? 0} suffix="筆" tone="long" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {(data?.sources ?? []).map((source) => (
                <div key={source.key} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${SOURCE_TONE[source.health]}`} />
                  <span>{source.name}</span>
                  <span className="font-data text-slate-600">{source.item_count}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/5 px-3 py-3 text-xs leading-5 text-slate-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span>{data?.notice ?? "正在讀取妖怪情報…"}</span>
            </div>
          </div>

          <div className="yokai-core-frame relative min-w-0 rounded-[1.6rem] p-px">
            <div className="relative overflow-hidden rounded-[calc(1.6rem-1px)] bg-[#050811]/88">
              <div className="pointer-events-none absolute left-5 top-5 z-10">
                <div className="font-kicker text-[9px] tracking-[0.24em] text-slate-500">DETECTION CORE</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Orbit className="h-4 w-4 text-ember" />
                  妖氣偵測核心
                </div>
              </div>
              <YokaiNetwork
                narratives={data?.narratives ?? []}
                tokens={data?.tokens ?? []}
                sources={data?.sources ?? []}
                selectedId={selectedNarrative?.id ?? null}
                onSelect={(id) => {
                  setSelectedId(id);
                  document.getElementById("narrative-room")?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
          </div>
        </section>

        <SectionDivider label="NARRATIVE UNIVERSE" />

        <section className="py-8 lg:py-12" aria-labelledby="narrative-title">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-kicker text-[10px] tracking-[0.26em] text-gold">MARKET LIFECYCLE</p>
              <h2 id="narrative-title" className="font-display mt-1 text-2xl font-black text-slate-50 sm:text-3xl">妖氣賽道宇宙</h2>
            </div>
            <p className="text-xs leading-5 text-slate-500">潛伏 → 顯形 → 發酵 → 狂熱 → 退散</p>
          </div>

          {data?.narratives.length ? (
            <NarrativeUniverse
              narratives={data.narratives}
              selectedId={selectedNarrative?.id ?? null}
              onSelect={(id) => {
                setSelectedId(id);
                setFilter("ALL");
                setQuery("");
              }}
              onInspect={() => document.getElementById("narrative-room")?.scrollIntoView({ behavior: "smooth" })}
            />
          ) : (
            <div className="grid min-h-72 place-items-center rounded-[1.6rem] border border-white/10 bg-[#030711]/92 p-6 text-center text-sm text-slate-500">
              {loading ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />正在建立全市場敘事星圖…</> : "等待第一批題材資料，原有 Gate 功能仍正常運作。"}
            </div>
          )}
        </section>

        <SectionDivider label="INTELLIGENCE ROOM" />

        <section id="narrative-room" className="scroll-mt-28 py-8 lg:py-12">
          {selectedNarrative ? (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,.82fr)_minmax(560px,1.18fr)]">
              <NarrativeRoom narrative={selectedNarrative} />
              <TokenMatrix
                narrative={selectedNarrative}
                tokens={narrativeTokens}
                allTokens={data?.tokens.filter((token) => token.narrative_ids.includes(selectedNarrative.id)) ?? []}
                filter={filter}
                query={query}
                onFilter={setFilter}
                onQuery={setQuery}
                onSelect={setSelectedToken}
              />
            </div>
          ) : (
            <div className="surface-sunken flex min-h-72 items-center justify-center rounded-2xl text-sm text-slate-500">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在建立妖氣情報…</> : "目前沒有可用的題材情報"}
            </div>
          )}
        </section>
      </div>

      {!analystOpen ? (
        <button
          type="button"
          onClick={() => setAnalystOpen(true)}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full border border-gold/45 bg-[#10172a]/92 text-gold shadow-[0_12px_40px_rgba(0,0,0,.55),0_0_28px_rgba(202,138,4,.3)] backdrop-blur-xl transition hover:scale-105 hover:bg-gold/15 lg:bottom-6 lg:right-6 lg:h-auto lg:w-auto lg:gap-2 lg:px-4 lg:py-3"
          aria-label="開啟 CT 分析師"
        >
          <Bot className="h-5 w-5" />
          <span className="hidden text-sm font-medium lg:inline">分析師</span>
        </button>
      ) : (
        <div className="glass-panel fixed inset-x-2 bottom-2 top-2 z-40 flex flex-col gap-2 rounded-xl p-3 sm:left-auto sm:right-3 sm:w-[400px]">
          <div className="flex items-center justify-between px-1">
            <span className="font-kicker text-xs tracking-[0.18em] text-gold">CT_TRADER ANALYST</span>
            <button type="button" onClick={() => setAnalystOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:text-ember">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1"><AnalystChat /></div>
        </div>
      )}

      {selectedToken ? <TokenDetail token={selectedToken} onClose={() => setSelectedToken(null)} /> : null}
    </main>
  );
}

function HeroMetric({ label, value, suffix, tone = "default" }: { label: string; value: number; suffix: string; tone?: "default" | "long" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <div className={`font-data text-xl font-semibold sm:text-2xl ${tone === "long" ? "text-long" : "text-slate-50"}`}>{value}</div>
      <div className="mt-1 text-[10px] text-slate-500">{label}・{suffix}</div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ember/35 to-gold/45" />
      <span className="font-kicker text-[9px] tracking-[0.28em] text-slate-600">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-ember/35 to-gold/45" />
    </div>
  );
}

function NarrativeRoom({ narrative }: { narrative: YokaiNarrative }) {
  return (
    <article className="glass-panel overflow-hidden rounded-2xl">
      <div className="relative border-b border-white/10 p-5 sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-ember/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="font-kicker text-[10px] tracking-[0.25em] text-gold">{narrative.english_name}</p>
            <h2 className="font-display mt-2 text-2xl font-black text-slate-50 sm:text-3xl">{narrative.name}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{narrative.summary}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${LIFECYCLE_TONE[narrative.lifecycle]}`}>{narrative.lifecycle}</span>
            <div className="font-data mt-3 text-3xl font-semibold text-goldhi">{narrative.heat_score.toFixed(1)}</div>
            <div className={`font-data mt-1 text-[10px] ${narrative.heat_change >= 0 ? "text-long" : "text-short"}`}>{narrative.heat_change >= 0 ? "+" : ""}{narrative.heat_change.toFixed(1)} 本輪</div>
          </div>
        </div>
        <div className="mt-6"><HeatChart points={narrative.history} /></div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <MiniMetric label="近 1h" value={narrative.mentions_1h} />
          <MiniMetric label="近 6h" value={narrative.mentions_6h} />
          <MiniMetric label="近 24h" value={narrative.mentions_24h} />
          <MiniMetric label="近 7d" value={narrative.mentions_7d} />
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {narrative.keywords.map((keyword) => <span key={keyword} className="rounded-full border border-ember/20 bg-ember/5 px-2.5 py-1 text-[10px] text-slate-400">#{keyword}</span>)}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Newspaper className="h-4 w-4 text-ember" />消息時間線</h3>
          <span className="font-data text-[10px] text-slate-600">{narrative.source_count} SOURCES</span>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          {narrative.articles.slice(0, 8).map((article) => (
            <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="group flex gap-3 py-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ember shadow-[0_0_8px_rgba(76,194,255,.7)]" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-5 text-slate-300 transition group-hover:text-ember">{article.title}</span>
                <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-600"><span>{article.source}</span><span>・</span><span>{relativeFromEpoch(article.published_at)}</span></span>
              </span>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-700 transition group-hover:text-ember" />
            </a>
          ))}
          {!narrative.articles.length ? <p className="py-8 text-center text-xs text-slate-600">目前由 CoinGecko 趨勢偵測，尚無可列出的新聞來源。</p> : null}
        </div>
      </div>
    </article>
  );
}

interface HeatPlotPoint {
  x: number;
  y: number;
  value: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothHeatPath(points: HeatPlotPoint[], includeMove = true): string {
  if (!points.length) return "";
  if (points.length === 1) return includeMove ? `M${points[0].x},${points[0].y}` : "";

  const segments = includeMove ? [`M${points[0].x},${points[0].y}`] : [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, minY, maxY);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, minY, maxY);
    segments.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`);
  }
  return segments.join(" ");
}

function HeatChart({ points }: { points: YokaiHistoryPoint[] }) {
  if (!points.length) return <div className="h-28 rounded-xl bg-black/15" />;
  const width = 640;
  const height = 118;
  const centerY = 56;
  const maxHalfHeight = 38;
  const xForIndex = (index: number) => (index / Math.max(points.length - 1, 1)) * width;
  const upper = points.map((point, index) => ({
    x: xForIndex(index),
    y: centerY - 1.2 - (point.value / 100) * maxHalfHeight,
    value: point.value
  }));
  const lower = points.map((point, index) => ({
    x: xForIndex(index),
    y: centerY + 1.2 + (point.value / 100) * maxHalfHeight,
    value: point.value
  }));
  const upperPath = smoothHeatPath(upper);
  const lowerPath = smoothHeatPath(lower);
  const lastLower = lower[lower.length - 1];
  const ribbon = `${upperPath} L${lastLower.x},${lastLower.y} ${smoothHeatPath([...lower].reverse(), false)} Z`;
  const eventPoints = points
    .map((point, index) => ({ ...point, x: xForIndex(index) }))
    .filter((point) => point.count > 0);
  const latestEvent = eventPoints[eventPoints.length - 1] ?? null;
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-white/5 bg-[radial-gradient(circle_at_72%_50%,rgba(240,200,118,.045),transparent_30%),rgba(0,0,0,.15)]">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-label="近七天題材敘事能量流">
        <defs>
          <linearGradient id="yokaiCurrent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4cc2ff" stopOpacity=".16" />
            <stop offset=".48" stopColor="#79ddff" stopOpacity=".26" />
            <stop offset=".78" stopColor="#b9d9d2" stopOpacity=".32" />
            <stop offset="1" stopColor="#f0c876" stopOpacity=".4" />
          </linearGradient>
          <linearGradient id="yokaiCurrentEdge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4cc2ff" />
            <stop offset=".58" stopColor="#8adfff" />
            <stop offset="1" stopColor="#f0c876" />
          </linearGradient>
          <filter id="yokaiHeatGlow" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="5.2" /></filter>
        </defs>
        <line x1="0" x2={width} y1={centerY} y2={centerY} stroke="rgba(143,169,201,.08)" strokeDasharray="2 9" />
        <path d={ribbon} fill="url(#yokaiCurrent)" opacity=".62" filter="url(#yokaiHeatGlow)" />
        <path d={ribbon} fill="url(#yokaiCurrent)" />
        <path className="yokai-heat-line" pathLength="1" d={upperPath} fill="none" stroke="url(#yokaiCurrentEdge)" strokeWidth="1.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path className="yokai-heat-line" pathLength="1" d={lowerPath} fill="none" stroke="url(#yokaiCurrentEdge)" strokeWidth="1.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {eventPoints.map((point) => (
          <g key={`${point.time}:${point.count}`}>
            <line x1={point.x} x2={point.x} y1={centerY - 5} y2={centerY + 5} stroke="rgba(217,244,255,.18)" strokeWidth=".8" />
            <circle cx={point.x} cy={centerY} r={1.7 + Math.min(point.count, 4) * .45} fill="#d9f4ff" fillOpacity=".88">
              <title>{point.count} 個真實消息事件</title>
            </circle>
          </g>
        ))}
        {latestEvent ? <circle className="yokai-heat-latest" cx={latestEvent.x} cy={centerY} r="3" fill="#f0c876" /> : null}
      </svg>
      <div className="pointer-events-none absolute inset-x-3 top-2 flex items-center justify-between font-kicker text-[7px] tracking-[0.2em] text-slate-700">
        <span>NARRATIVE CURRENT</span>
        <span>{eventPoints.length ? `${eventPoints.reduce((sum, point) => sum + point.count, 0)} EVENTS` : "SIGNAL QUIET"}</span>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex items-center justify-between font-data text-[7px] tracking-[0.12em] text-slate-700">
        <span>7D</span><span>3D</span><span>NOW</span>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-black/20 px-2 py-2 text-center"><div className="font-data text-sm text-slate-200">{value}</div><div className="mt-0.5 text-[9px] text-slate-600">{label}</div></div>;
}

function TokenMatrix({ narrative, tokens, allTokens, filter, query, onFilter, onQuery, onSelect }: {
  narrative: YokaiNarrative;
  tokens: YokaiToken[];
  allTokens: YokaiToken[];
  filter: TokenFilter;
  query: string;
  onFilter: (filter: TokenFilter) => void;
  onQuery: (query: string) => void;
  onSelect: (token: YokaiToken) => void;
}) {
  const counts: Record<TokenFilter, number> = {
    ALL: allTokens.length,
    QUALIFIED: allTokens.filter((item) => item.status === "QUALIFIED").length,
    WATCH: allTokens.filter((item) => item.status === "WATCH").length,
    RISK: allTokens.filter((item) => item.status === "RISK").length
  };
  return (
    <section className="glass-panel overflow-hidden rounded-2xl xl:sticky xl:top-24">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-kicker text-[9px] tracking-[0.24em] text-ember">GATE CONFIRMATION MATRIX</p>
            <h2 className="mt-1 text-xl font-bold text-slate-50">Gate 幣種確認</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{narrative.name}相關幣種；有幾個通過就顯示幾個，不設名額。</p>
          </div>
          <div className="rounded-xl border border-long/25 bg-long/[.08] px-3 py-2 text-right">
            <div className="font-data text-xl font-semibold text-long">{counts.QUALIFIED}</div>
            <div className="text-[9px] text-slate-500">確認做多</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜尋 Gate 幣種" className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-ember/45" />
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([
            ["ALL", "全部"],
            ["QUALIFIED", "做多確認"],
            ["WATCH", "觀察中"],
            ["RISK", "風險排除"]
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => onFilter(key)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${filter === key ? "border-ember/45 bg-ember/[.12] text-ember" : "border-white/10 bg-white/5 text-slate-500 hover:text-slate-300"}`}>{label} <span className="font-data ml-1">{counts[key]}</span></button>
          ))}
        </div>
      </div>
      <div className="max-h-[780px] divide-y divide-white/5 overflow-y-auto">
        {tokens.map((token) => <TokenRow key={token.symbol} token={token} onSelect={onSelect} />)}
        {!tokens.length ? <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center"><Database className="h-7 w-7 text-slate-700" /><p className="text-sm text-slate-500">{allTokens.length ? "目前篩選條件下沒有幣種" : "這個題材目前沒有對應到 Gate 掃描範圍"}</p></div> : null}
      </div>
    </section>
  );
}

function TokenRow({ token, onSelect }: { token: YokaiToken; onSelect: (token: YokaiToken) => void }) {
  const status = token.qualified_long
    ? { label: "做多確認", tone: "border-long/35 bg-long/10 text-long", bar: "bg-long" }
    : token.status === "RISK"
      ? { label: "風險排除", tone: "border-short/35 bg-short/10 text-short", bar: "bg-short" }
      : { label: "觀察中", tone: "border-white/10 bg-white/5 text-slate-400", bar: "bg-ember" };
  return (
    <button type="button" onClick={() => onSelect(token)} className="group relative grid w-full grid-cols-[5px_minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition hover:bg-white/[.035] sm:px-5">
      <span className={`h-full min-h-16 rounded-full ${status.bar} opacity-80 shadow-[0_0_12px_currentColor]`} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="font-data text-base text-slate-50">{token.symbol}</strong>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${status.tone}`}>{status.label}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${LIFECYCLE_TONE[token.narrative_lifecycle]}`}>{token.narrative_lifecycle}</span>
        </span>
        <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
          <MetricText label="24h" value={formatPercent(token.change_24h)} tone={percentTone(token.change_24h)} />
          <MetricText label="OI 1h" value={formatPercent(token.oi_change_1h)} tone={percentTone(token.oi_change_1h)} />
          <MetricText label="15m" value={token.formal_stage} />
          <MetricText label="5m" value={token.five_minute_state ?? "等待資料"} />
        </span>
        <span className="mt-2 line-clamp-1 text-xs text-slate-500">{token.qualified_long ? token.reasons.join("・") : token.blocked_reasons.slice(0, 2).join("・")}</span>
      </span>
      <span className="flex h-full items-center"><ChevronRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-ember" /></span>
    </button>
  );
}

function MetricText({ label, value, tone = "text-slate-300" }: { label: string; value: string; tone?: string }) {
  return <span className="min-w-0"><span className="text-slate-600">{label} </span><span className={`truncate ${tone}`}>{value}</span></span>;
}

function TokenDetail({ token, onClose }: { token: YokaiToken; onClose: () => void }) {
  return (
    <ModalShell title={token.symbol} subtitle={token.narrative_names.join("・")} icon={<Sparkles className="h-4 w-4" />} onClose={onClose} widthClass="max-w-4xl">
      <div className="grid gap-4 sm:grid-cols-3">
        <DetailMetric icon={<Gauge />} label="妖氣值" value={token.narrative_heat.toFixed(1)} hint={`${token.narrative_lifecycle}階段`} />
        <DetailMetric icon={<Activity />} label="Gate 正式方向" value={directionLabel(token.formal_direction)} hint={token.formal_stage} tone={directionTone(token.formal_direction)} />
        <DetailMetric icon={<TrendingUp />} label="近 1h OI" value={formatPercent(token.oi_change_1h)} hint={token.oi_side ?? "象限等待中"} tone={percentTone(token.oi_change_1h)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SmallDetail label="現價" value={formatPrice(token.price)} />
        <SmallDetail label="24h" value={formatPercent(token.change_24h)} tone={percentTone(token.change_24h)} />
        <SmallDetail label="資金費率" value={formatPercent(token.funding_rate, 4)} tone={percentTone(-Math.abs(token.funding_rate))} />
        <SmallDetail label="全體帳戶多空比" value={token.account_ratio.toFixed(2)} />
        <SmallDetail label="5m 狀態" value={token.five_minute_state ?? "等待資料"} />
        <SmallDetail label="5m 方向" value={token.five_minute_direction ? directionLabel(token.five_minute_direction) : "尚未確認"} tone={token.five_minute_direction ? directionTone(token.five_minute_direction) : undefined} />
        <SmallDetail label="主動流品質" value={token.flow_quality} tone={token.flow_quality === "REAL" ? "text-long" : "text-short"} />
        <SmallDetail label="主動流方向" value={`${directionLabel(token.active_flow_direction)} ${(token.active_flow_strength * 100).toFixed(0)}%`} tone={directionTone(token.active_flow_direction)} />
        <SmallDetail label="CVD 訊號" value={token.cvd_signal ?? "目前沒有明顯背離"} />
        <SmallDetail label="確認狀態" value={token.qualified_long ? "做多確認" : "觀察中"} tone={token.qualified_long ? "text-long" : "text-slate-400"} />
      </div>
      <ConfirmationProgress token={token} />
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-xs leading-5 text-slate-400">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        妖氣值是題材熱度，不是上漲機率；「做多確認」代表題材、資金結構與時機投票成立且沒有紅色否決，不代表可忽略進場位置與風控。
      </div>
    </ModalShell>
  );
}

function DetailMetric({ icon, label, value, hint, tone = "text-slate-50" }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: string }) {
  return <div className="surface-sunken rounded-xl p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</div><div className={`font-data mt-3 text-2xl font-semibold ${tone}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{hint}</div></div>;
}

function SmallDetail({ label, value, tone = "text-slate-200" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/15 px-3 py-3"><div className="text-[10px] text-slate-600">{label}</div><div className={`font-data mt-1 text-sm ${tone}`}>{value}</div></div>;
}

const CONFIRMATION_STEPS = [
  { prefix: "題材確認", label: "題材確認", fallback: "0/2" },
  { prefix: "資金結構", label: "資金結構", fallback: "0/2" },
  { prefix: "進場時機", label: "進場時機", fallback: "0/4" }
] as const;

function ConfirmationProgress({ token }: { token: YokaiToken }) {
  const progressPrefixes = CONFIRMATION_STEPS.map((step) => step.prefix);
  const riskReasons = token.blocked_reasons.filter(
    (reason) => !progressPrefixes.some((prefix) => reason.startsWith(prefix))
  );

  return (
    <div className="mt-5 space-y-4">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">做多確認進度</h3>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] ${token.qualified_long ? "border-long/30 bg-long/10 text-long" : "border-white/10 bg-white/5 text-slate-500"}`}>
            {token.qualified_long ? "條件成立" : "持續觀察"}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {CONFIRMATION_STEPS.map((step) => {
            const passedReason = token.reasons.find((reason) => reason.startsWith(step.prefix));
            const blockedReason = token.blocked_reasons.find((reason) => reason.startsWith(step.prefix));
            const reason = passedReason ?? blockedReason;
            const score = reason?.match(/(\d+)\/(\d+)/)?.[0] ?? step.fallback;
            const detail = reason?.replace(`${step.prefix} ${score}：`, "") ?? "等待進入評估";
            const [current, total] = score.split("/").map(Number);
            const progress = total ? Math.min(100, (current / total) * 100) : 0;
            const complete = Boolean(passedReason);
            return (
              <div key={step.prefix} className={`rounded-xl border p-4 ${complete ? "border-long/20 bg-long/[.045]" : "border-white/[.07] bg-black/15"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    {complete ? <CheckCircle2 className="h-4 w-4 text-long" /> : <CircleAlert className="h-4 w-4 text-gold" />}
                    {step.label}
                  </span>
                  <span className={`font-data text-sm ${complete ? "text-long" : "text-goldhi"}`}>{score}</span>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[.06]">
                  <div className={`h-full rounded-full ${complete ? "bg-long" : "bg-gold"}`} style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">{detail}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 ${riskReasons.length ? "border-short/20 bg-short/[.04]" : "border-long/15 bg-long/[.03]"}`}>
        <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          {riskReasons.length ? <ShieldAlert className="h-4 w-4 text-short" /> : <CheckCircle2 className="h-4 w-4 text-long" />}
          紅色否決／資料狀態
        </h3>
        {riskReasons.length ? (
          <div className="mt-2 space-y-1.5">
            {riskReasons.map((reason) => <p key={reason} className="text-xs leading-5 text-slate-400">• {reason}</p>)}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">目前沒有紅色否決；尚未確認時，只需等待上方進度補足。</p>
        )}
      </div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="surface-sunken col-span-full flex min-h-40 items-center justify-center rounded-2xl px-5 text-center text-sm text-slate-500">{text}</div>;
}

function relativeFromEpoch(epoch: number) {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - epoch) / 60));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}
