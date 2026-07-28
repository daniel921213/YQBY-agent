"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bot,
  ChevronRight,
  Clock,
  Gauge,
  History,
  Home,
  ListFilter,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X
} from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { SideNav } from "@/components/nav/SideNav";
import type { Entitlement } from "@/lib/api";
import {
  directionLabel,
  directionTone,
  formatCompactNumber,
  formatPercent,
  formatPrice,
  formatRelativeTime,
  percentTone,
  stageHint,
  stagePriority,
  stageTone
} from "@/lib/format";
import { ThemeToggle } from "@/lib/theme";
import type {
  EvidenceDirection,
  OiMover,
  RiskRadarItem,
  ScanItem,
  ScanResponse,
  ScreenerRow,
  Stage,
  TradeDirection
} from "@/lib/types";

type MobileTab = "overview" | "signals" | "radar" | "screener" | "more";
type RadarFilter = "ALL" | "HIGH" | "CONFLICT" | "LIQUIDATION";
type ScreenerSort = "score" | "gainers" | "losers" | "oi";
type StageFilter = "ALL" | Stage;

interface MobileDashboardProps {
  scan: ScanResponse | null;
  loading: boolean;
  error: string | null;
  updatedLabel: string;
  entitlement?: Entitlement | null;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  onRefresh: () => void;
  onShowHistory: () => void;
  onOpenAnalyst: () => void;
}

const NAV_ITEMS: Array<{
  key: MobileTab;
  label: string;
  icon: typeof Home;
  primary?: boolean;
}> = [
  { key: "overview", label: "總覽", icon: Home },
  { key: "radar", label: "5m", icon: Activity },
  { key: "signals", label: "訊號", icon: ShieldCheck, primary: true },
  { key: "screener", label: "選幣", icon: ListFilter },
  { key: "more", label: "更多", icon: MoreHorizontal }
];

const MOBILE_STAGE_FILTERS: StageFilter[] = [
  "ALL",
  "早期異動",
  "趨勢啟動",
  "趨勢延續",
  "過熱風險",
  "反轉警訊",
  "觀察"
];

export function MobileDashboard({
  scan,
  loading,
  error,
  updatedLabel,
  entitlement,
  selectedSymbol,
  onSelect,
  onRefresh,
  onShowHistory,
  onOpenAnalyst
}: MobileDashboardProps) {
  const [tab, setTab] = useState<MobileTab>("overview");
  const [query, setQuery] = useState("");
  const universe = scan?.universe ?? [];

  const searchResults = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) return [];
    return universe
      .filter((item) => item.symbol.includes(normalized))
      .sort((a, b) => {
        const aStarts = a.symbol.startsWith(normalized) ? 1 : 0;
        const bStarts = b.symbol.startsWith(normalized) ? 1 : 0;
        return bStarts - aStarts || b.score - a.score;
      })
      .slice(0, 6);
  }, [query, universe]);

  const chooseSymbol = (symbol: string) => {
    setQuery("");
    onSelect(symbol);
  };

  return (
    <div className="mobile-dashboard min-h-screen w-full min-w-0 max-w-full pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <div className="mobile-dashboard-top sticky top-0 z-30 -mx-3 border-b border-white/10 bg-[#05080f]/88 px-3 pb-3 pt-[max(.7rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <header className="flex items-center gap-2.5">
          <SideNav />
          <div className="min-w-0 flex-1">
            <div className="font-display truncate bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-lg font-black tracking-[0.04em] text-transparent">
              CT_KILLER
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${scan ? "bg-long shadow-[0_0_8px_rgba(35,221,141,.8)]" : "bg-slate-600"}`} />
              <span>{scan ? `${scan.breadth.total} 幣已覆蓋` : "等待市場資料"}</span>
              <span>·</span>
              <span className="tabular-nums">{updatedLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="更新市場資料"
            className="surface inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/75" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋幣種，例如 BTC、ETH…"
            inputMode="search"
            aria-label="搜尋幣種"
            className="h-12 w-full rounded-xl border border-gold/20 bg-black/35 pl-10 pr-10 text-base text-slate-50 outline-none transition placeholder:text-slate-600 focus:border-gold/50 focus:shadow-[0_0_22px_rgba(212,175,55,.12)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清除搜尋"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}

          {query ? (
            <div className="glass-panel absolute inset-x-0 top-[calc(100%+.45rem)] z-40 overflow-hidden rounded-xl p-1.5 shadow-2xl">
              {searchResults.length ? (
                searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => chooseSymbol(item.symbol)}
                    className="flex min-h-12 w-full items-center justify-between rounded-lg px-3 py-2 text-left transition active:bg-white/[0.06]"
                  >
                    <span>
                      <span className="block font-semibold text-slate-50">{shortSymbol(item.symbol)}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{item.stage}</span>
                    </span>
                    <span className="text-right">
                      <span className={`block text-xs font-medium ${directionTone(item.direction)}`}>
                        {directionLabel(item.direction)}
                      </span>
                      <span className={`mt-0.5 block text-[11px] tabular-nums ${percentTone(item.change_24h)}`}>
                        {formatPercent(item.change_24h)}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-5 text-center text-sm text-slate-500">找不到符合的幣種</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <main className="min-w-0 max-w-full pt-4">
        {error ? <ErrorNotice error={error} /> : null}
        {!scan ? (
          <LoadingState loading={loading} />
        ) : tab === "overview" ? (
          <MobileOverview scan={scan} onSelect={onSelect} onNavigate={setTab} />
        ) : tab === "signals" ? (
          <MobileRecommendations
            items={scan.items}
            selectedSymbol={selectedSymbol}
            onSelect={onSelect}
            onShowHistory={onShowHistory}
          />
        ) : tab === "radar" ? (
          <MobileRiskRadar scan={scan} onSelect={onSelect} />
        ) : tab === "screener" ? (
          <MobileScreener rows={universe} selectedSymbol={selectedSymbol} onSelect={onSelect} />
        ) : (
          <MobileMore
            scan={scan}
            entitlement={entitlement}
            onSelect={onSelect}
          />
        )}
      </main>

      <button
        type="button"
        onClick={onOpenAnalyst}
        aria-label="開啟 CT 分析師"
        title="CT 分析師"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-[#11101a]/92 text-gold shadow-[0_12px_34px_rgba(0,0,0,.5),0_0_24px_rgba(212,175,55,.25)] backdrop-blur-md"
      >
        <Bot className="h-5 w-5" />
      </button>

      <nav
        aria-label="手機版主要功能"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-[#05070d]/94 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-18px_50px_rgba(0,0,0,.55)] backdrop-blur-xl"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setQuery("");
                  setTab(item.key);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
                  active ? "text-gold" : "text-slate-500"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center transition ${
                    item.primary
                      ? `h-12 w-12 -translate-y-3 rounded-full border ${
                          active
                            ? "border-gold/70 bg-gold/15 text-gold shadow-[0_0_26px_rgba(212,175,55,.28)]"
                            : "border-white/15 bg-[#0b1120] text-slate-400"
                        }`
                      : "h-6 w-8"
                  }`}
                >
                  {item.primary ? <MobileCtMark /> : <Icon className="h-5 w-5" />}
                </span>
                <span className={item.primary ? "-mt-3" : ""}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function MobileOverview({
  scan,
  onSelect,
  onNavigate
}: {
  scan: ScanResponse;
  onSelect: (symbol: string) => void;
  onNavigate: (tab: MobileTab) => void;
}) {
  const recommendations = scan.items.filter((item) => item.is_recommend);
  const longRecommendations = recommendations.filter((item) => item.direction === "LONG").length;
  const shortRecommendations = recommendations.filter((item) => item.direction === "SHORT").length;
  const riskItems = scan.risk_radar?.items ?? [];
  const marketStates = [...scan.items.filter((item) => !item.is_recommend)].sort(
    (a, b) => stagePriority(a.stage) - stagePriority(b.stage) || b.score - a.score
  );
  const total = Math.max(scan.breadth.total, 1);
  const longShare = (scan.breadth.long_count / total) * 100;
  const shortShare = (scan.breadth.short_count / total) * 100;

  return (
    <div className="grid gap-4">
      <section className="surface relative overflow-hidden rounded-2xl p-4">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(76,194,255,.13),transparent_38%)]" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-kicker text-[10px] tracking-[0.18em] text-gold">MARKET PULSE</p>
              <h1 className="mt-1 text-xl font-black text-slate-50">市場即時總覽</h1>
            </div>
            <div className="rounded-lg border border-ember/25 bg-ember/10 px-2.5 py-1.5 text-right">
              <span className="block text-[10px] text-slate-500">山寨指數</span>
              <span className="text-sm font-semibold tabular-nums text-ember">
                {scan.altseason?.index ?? "--"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <OverviewMetric label="掃描" value={`${scan.breadth.total}`} suffix="幣" />
            <OverviewMetric label="推薦" value={`${recommendations.length}`} suffix="筆" tone="text-gold" />
            <OverviewMetric label="5m 警戒" value={`${riskItems.filter((item) => item.severity === "HIGH").length}`} suffix="筆" tone="text-short" />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-long">做多 {scan.breadth.long_count}</span>
              <span className="text-slate-600">正式 15m 方向分布</span>
              <span className="text-short">做空 {scan.breadth.short_count}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
              <span className="bg-long" style={{ width: `${longShare}%` }} />
              <span className="bg-slate-600/60" style={{ width: `${Math.max(0, 100 - longShare - shortShare)}%` }} />
              <span className="bg-short" style={{ width: `${shortShare}%` }} />
            </div>
          </div>
        </div>
      </section>

      <MobileSectionHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="做多／做空推薦"
        hint={`多 ${longRecommendations}/3 · 空 ${shortRecommendations}/3`}
        action="查看全部"
        onAction={() => onNavigate("signals")}
      />
      {recommendations.length ? (
        <div className="grid gap-2">
          {recommendations.slice(0, 3).map((item) => (
            <MobileRecommendationCard key={item.symbol} item={item} onClick={() => onSelect(item.symbol)} />
          ))}
        </div>
      ) : (
        <CompactEmpty text="目前沒有同時通過方向、資金結構與 5m 時機的推薦" />
      )}

      <MobileSectionHeader
        icon={<Activity className="h-4 w-4" />}
        title="15m 市場狀態"
        hint={`${marketStates.length} 筆異動`}
        action="查看全部"
        onAction={() => onNavigate("signals")}
      />
      {marketStates.length ? (
        <div className="grid gap-2">
          {marketStates.slice(0, 3).map((item) => (
            <MobileMarketStateCard key={item.symbol} item={item} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <CompactEmpty text="目前沒有正式 15m 市場狀態異動" />
      )}
    </div>
  );
}

function MobileRecommendations({
  items,
  selectedSymbol,
  onSelect,
  onShowHistory
}: {
  items: ScanItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  onShowHistory: () => void;
}) {
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [showAllStages, setShowAllStages] = useState(false);
  const recommendations = items.filter((item) => item.is_recommend);
  const longs = recommendations.filter((item) => item.direction === "LONG").slice(0, 3);
  const shorts = recommendations.filter((item) => item.direction === "SHORT").slice(0, 3);
  const anomalies = [...items.filter((item) => !item.is_recommend)].sort(
    (a, b) => stagePriority(a.stage) - stagePriority(b.stage) || b.score - a.score
  );
  const stageCounts = new Map<Stage, number>();
  for (const item of anomalies) {
    stageCounts.set(item.stage, (stageCounts.get(item.stage) ?? 0) + 1);
  }
  const filteredAnomalies =
    stageFilter === "ALL"
      ? anomalies
      : anomalies.filter((item) => item.stage === stageFilter);
  const visibleAnomalies = showAllStages
    ? filteredAnomalies
    : filteredAnomalies.slice(0, 12);

  const selectStage = (next: StageFilter) => {
    setStageFilter(next);
    setShowAllStages(false);
  };

  return (
    <div className="grid min-w-0 max-w-full gap-5">
      <MobilePageIntro kicker="CONDITION VERIFIED" title="做多／做空推薦" description="只有方向、資金結構與 5m 時機全部確認後才會出現在這裡。" />

      <MobileRecommendationLane title="做多推薦" direction="LONG" items={longs} selectedSymbol={selectedSymbol} onSelect={onSelect} />
      <MobileRecommendationLane title="做空推薦" direction="SHORT" items={shorts} selectedSymbol={selectedSymbol} onSelect={onSelect} />

      <section className="min-w-0 max-w-full">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">市場狀態觀察</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">未進入推薦榜的正式 15m 市場階段</p>
          </div>
          <button type="button" onClick={onShowHistory} className="inline-flex h-10 items-center gap-1.5 px-2 text-xs text-gold">
            <History className="h-3.5 w-3.5" />歷史
          </button>
        </div>

        <div className="mb-2 w-full max-w-full overflow-x-auto [scrollbar-width:none]">
          <div className="flex w-max gap-2 pb-1">
            {MOBILE_STAGE_FILTERS.map((filter) => {
              const count = filter === "ALL" ? anomalies.length : stageCounts.get(filter) ?? 0;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => selectStage(filter)}
                  aria-pressed={stageFilter === filter}
                  className={`h-10 rounded-xl border px-3 text-xs tabular-nums ${
                    stageFilter === filter
                      ? "border-gold/45 bg-gold/10 text-gold"
                      : "border-white/10 bg-white/[0.03] text-slate-500"
                  }`}
                >
                  {filter === "ALL" ? "全部" : filter} {count}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mb-2 text-[11px] leading-5 text-slate-500">
          {stageFilter === "ALL"
            ? "早期、啟動、延續、過熱、反轉與一般觀察分開判讀；過熱與反轉不是反向進場推薦。"
            : stageHint(stageFilter)}
        </p>

        {visibleAnomalies.length ? (
          <div className="grid gap-2">
            {visibleAnomalies.map((item) => (
              <MobileMarketStateCard
                key={item.symbol}
                item={item}
                selected={selectedSymbol === item.symbol}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : (
          <CompactEmpty text={`目前沒有${stageFilter === "ALL" ? "市場狀態" : stageFilter}事件`} />
        )}

        {filteredAnomalies.length > 12 ? (
          <button
            type="button"
            onClick={() => setShowAllStages((value) => !value)}
            className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300"
          >
            {showAllStages
              ? "收合至前 12 筆"
              : `查看全部 ${filteredAnomalies.length} 筆`}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function MobileRecommendationLane({
  title,
  direction,
  items,
  selectedSymbol,
  onSelect
}: {
  title: string;
  direction: TradeDirection;
  items: ScanItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const isLong = direction === "LONG";
  return (
    <section className={`surface relative overflow-hidden rounded-2xl border ${isLong ? "border-long/20" : "border-short/20"} p-3`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${isLong ? "from-long/10" : "from-short/10"} to-transparent`} />
      <div className="relative flex items-center justify-between border-b border-white/10 px-1 pb-2.5">
        <h2 className={`inline-flex items-center gap-2 text-sm font-semibold ${isLong ? "text-long" : "text-short"}`}>
          {isLong ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {title}
        </h2>
        <span className="text-xs tabular-nums text-slate-500">{items.length} / 3</span>
      </div>
      <div className="relative mt-2 grid gap-2">
        {items.length ? items.map((item) => (
          <MobileRecommendationCard
            key={item.symbol}
            item={item}
            selected={selectedSymbol === item.symbol}
            onClick={() => onSelect(item.symbol)}
          />
        )) : <CompactEmpty text={`目前沒有符合條件的${isLong ? "做多" : "做空"}推薦`} />}
      </div>
    </section>
  );
}

function MobileRecommendationCard({ item, selected = false, onClick }: { item: ScanItem; selected?: boolean; onClick: () => void }) {
  const isLong = item.direction === "LONG";
  const tracked = item.first_seen_ts !== null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[76px] rounded-xl border px-3 py-2.5 text-left transition active:scale-[.99] ${
        selected ? "border-ember/55 bg-ember/10" : "border-white/10 bg-black/20"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="flex items-center gap-2">
            <strong className="text-base text-slate-50">{shortSymbol(item.symbol)}</strong>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isLong ? "bg-long/10 text-long" : "bg-short/10 text-short"}`}>
              {isLong ? "做多" : "做空"}
            </span>
          </span>
          <span className="mt-1.5 block text-[11px] text-slate-500">{item.stage} · {item.confluence_pillars}/5 支柱同向</span>
        </span>
        <span className="text-right">
          {tracked ? (
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] tabular-nums text-slate-500">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(item.minutes_since_first)}
            </span>
          ) : null}
          <span className="block text-sm font-medium tabular-nums text-slate-200">{formatPrice(item.price)}</span>
          <span className={`mt-1 block text-xs tabular-nums ${percentTone(item.change_24h)}`}>{formatPercent(item.change_24h)}</span>
        </span>
      </span>
      <span className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-[10px]">
        <span className="text-gold">條件已確認</span>
        <span className="tabular-nums text-slate-600">正式分數 {item.score.toFixed(1)}</span>
      </span>
    </button>
  );
}

function MobileMarketStateCard({
  item,
  selected = false,
  onSelect
}: {
  item: ScanItem;
  selected?: boolean;
  onSelect: (symbol: string) => void;
}) {
  const tracked = item.first_seen_ts !== null;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.symbol)}
      className={`surface flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
        selected ? "signal-glow" : ""
      }`}
    >
      <span className={`h-8 w-1 shrink-0 rounded-full ${item.direction === "LONG" ? "bg-long" : "bg-short"}`} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <strong className="shrink-0 text-sm text-slate-50">{shortSymbol(item.symbol)}</strong>
          <span className={`truncate rounded-sm border px-1.5 py-0.5 text-[10px] ${stageTone(item.stage)}`}>{item.stage}</span>
        </span>
        <span className="mt-1 block truncate text-[11px] text-slate-500">{item.stage_reasons[0] ?? stageHint(item.stage)}</span>
      </span>
      <span className="shrink-0 text-right">
        {tracked ? (
          <span className="mb-1 flex items-center justify-end gap-1 text-[10px] tabular-nums text-slate-500">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(item.minutes_since_first)}
          </span>
        ) : null}
        <span className={`block text-xs ${directionTone(item.direction)}`}>{directionLabel(item.direction)}</span>
        <span className={`mt-1 block text-[11px] tabular-nums ${percentTone(item.change_24h)}`}>{formatPercent(item.change_24h)}</span>
      </span>
    </button>
  );
}

function MobileRiskRadar({ scan, onSelect }: { scan: ScanResponse; onSelect: (symbol: string) => void }) {
  const [filter, setFilter] = useState<RadarFilter>("ALL");
  const items = scan.risk_radar?.items ?? [];
  const high = items.filter((item) => item.severity === "HIGH").length;
  const conflict = items.filter((item) => item.conflicts_official).length;
  const liquidation = items.filter(isLiquidation).length;
  const filtered = items.filter((item) => {
    if (filter === "HIGH") return item.severity === "HIGH";
    if (filter === "CONFLICT") return item.conflicts_official;
    if (filter === "LIQUIDATION") return isLiquidation(item);
    return true;
  });

  return (
    <div className="grid gap-4">
      <MobilePageIntro kicker="CLOSED 5M RADAR" title="5m 短線狀態雷達" description="已收盤提醒，只用來補捉短線風險，不改變正式 15m 推薦。" />

      <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none]">
        <div className="flex w-max gap-2 pb-1">
          <RadarFilterButton label="全部" count={items.length} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
          <RadarFilterButton label="高警戒" count={high} active={filter === "HIGH"} alert onClick={() => setFilter("HIGH")} />
          <RadarFilterButton label="方向衝突" count={conflict} active={filter === "CONFLICT"} onClick={() => setFilter("CONFLICT")} />
          <RadarFilterButton label="爆倉" count={liquidation} active={filter === "LIQUIDATION"} onClick={() => setFilter("LIQUIDATION")} />
          <span className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-500">
            覆蓋 {scan.risk_radar?.covered_count ?? 0}/{scan.risk_radar?.scanned_count ?? 0}
          </span>
        </div>
      </div>

      {filtered.length ? (
        <div className="surface-sunken divide-y divide-white/5 overflow-hidden rounded-2xl">
          {filtered.map((item, index) => <MobileRiskRow key={riskKey(item, index)} item={item} onSelect={onSelect} detailed />)}
        </div>
      ) : (
        <CompactEmpty text="目前沒有符合這個分類的 5m 事件" />
      )}
    </div>
  );
}

function MobileRiskRow({ item, onSelect, detailed = false }: { item: RiskRadarItem; onSelect: (symbol: string) => void; detailed?: boolean }) {
  const direction = item.direction === "LONG" ? "短線偏多" : item.direction === "SHORT" ? "短線偏空" : "短線中性";
  const directionClass = item.direction === "LONG" ? "text-long bg-long/10" : item.direction === "SHORT" ? "text-short bg-short/10" : "text-slate-400 bg-white/5";
  return (
    <button type="button" onClick={() => onSelect(item.symbol)} className="w-full px-3 py-3 text-left transition active:bg-white/[0.04]">
      <span className="flex items-start gap-3">
        <strong className="w-16 shrink-0 pt-0.5 text-sm text-slate-50">{shortSymbol(item.symbol)}</strong>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-300">{item.state}</span>
          <span className="mt-1 block text-[11px] tabular-nums text-slate-500">
            OI {formatPercent(item.oi_qty_change_pct)} · {flowText(item.flow_imbalance)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${directionClass}`}>{direction}</span>
          <span className={`text-[10px] ${item.severity === "HIGH" ? "text-short" : "text-slate-500"}`}>
            {item.severity === "HIGH" ? "高警戒" : item.severity === "MEDIUM" ? "注意" : "一般"}
          </span>
        </span>
      </span>
      {detailed ? (
        <span className="mt-2 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
          <RiskFlag label={item.conflicts_official ? "與 15m 方向衝突" : "未與 15m 正式方向衝突"} alert={item.conflicts_official} />
          {item.flags
            .filter((flag) => !(item.conflicts_official && flag.includes("15m正式方向衝突")))
            .slice(0, 3)
            .map((flag) => <RiskFlag key={flag} label={flag} />)}
        </span>
      ) : null}
    </button>
  );
}

function MobileScreener({ rows, selectedSymbol, onSelect }: { rows: ScreenerRow[]; selectedSymbol: string | null; onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"ALL" | EvidenceDirection>("ALL");
  const [sort, setSort] = useState<ScreenerSort>("score");

  const view = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    const filtered = rows.filter((row) =>
      (!normalized || row.symbol.includes(normalized)) &&
      (direction === "ALL" || row.direction === direction)
    );
    return [...filtered].sort((a, b) => {
      if (sort === "gainers") return b.change_24h - a.change_24h;
      if (sort === "losers") return a.change_24h - b.change_24h;
      if (sort === "oi") return Math.abs(b.oi_change_1h) - Math.abs(a.oi_change_1h);
      return b.score - a.score;
    }).slice(0, 40);
  }, [rows, query, direction, sort]);

  return (
    <div className="grid gap-4">
      <MobilePageIntro kicker="MARKET SCREENER" title="全市場選幣" description={`掃描 ${rows.length} 個合約；手機版每次顯示最符合條件的前 40 個。`} />
      <div className="surface rounded-2xl p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在全市場中搜尋" className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-3 text-base text-slate-50 outline-none focus:border-ember/50" />
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {(["ALL", "LONG", "SHORT", "NEUTRAL"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setDirection(item)} className={`h-9 shrink-0 rounded-lg border px-3 text-xs ${direction === item ? "border-ember/45 bg-ember/15 text-ember" : "border-white/10 text-slate-500"}`}>
              {item === "ALL" ? "全部" : directionLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none]">
        <div className="flex w-max gap-2 pb-1">
          {([
            ["score", "訊號排序"],
            ["gainers", "24h 漲幅"],
            ["losers", "24h 跌幅"],
            ["oi", "OI 異動"]
          ] as Array<[ScreenerSort, string]>).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSort(key)} className={`h-10 rounded-xl border px-3 text-xs ${sort === key ? "border-gold/45 bg-gold/10 text-gold" : "border-white/10 bg-white/[0.03] text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        {view.map((row) => (
          <button key={row.symbol} type="button" onClick={() => onSelect(row.symbol)} className={`surface min-h-[82px] rounded-xl px-3 py-3 text-left ${selectedSymbol === row.symbol ? "signal-glow" : ""}`}>
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className="flex items-center gap-2">
                  <strong className="text-base text-slate-50">{shortSymbol(row.symbol)}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${row.direction === "LONG" ? "bg-long/10 text-long" : row.direction === "SHORT" ? "bg-short/10 text-short" : "bg-white/5 text-slate-400"}`}>
                    {directionLabel(row.direction)}
                  </span>
                </span>
                <span className={`mt-1.5 inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] ${stageTone(row.stage)}`}>{row.stage}</span>
              </span>
              <span className="text-right">
                <span className="block text-sm tabular-nums text-slate-200">{formatPrice(row.price)}</span>
                <span className={`mt-1 block text-xs tabular-nums ${percentTone(row.change_24h)}`}>{formatPercent(row.change_24h)}</span>
              </span>
            </span>
            <span className="mt-2 grid grid-cols-3 border-t border-white/5 pt-2 text-[10px] text-slate-500">
              <span>分數 <b className="font-medium text-slate-300">{row.score.toFixed(1)}</b></span>
              <span className="text-center">OI <b className={`font-medium ${percentTone(row.oi_change_1h)}`}>{formatPercent(row.oi_change_1h)}</b></span>
              <span className="text-right">費率 <b className={`font-medium ${percentTone(row.funding_rate)}`}>{formatPercent(row.funding_rate, 4)}</b></span>
            </span>
          </button>
        ))}
      </div>
      {!view.length ? <CompactEmpty text="找不到符合條件的幣種" /> : null}
      {rows.length > view.length && !query ? <p className="text-center text-[11px] text-slate-600">可使用搜尋與方向篩選快速縮小範圍</p> : null}
    </div>
  );
}

function MobileMore({ scan, entitlement, onSelect }: { scan: ScanResponse; entitlement?: Entitlement | null; onSelect: (symbol: string) => void }) {
  return (
    <div className="grid gap-5">
      <MobilePageIntro kicker="DATA & LEARNING" title="資料與更多功能" description="OI 資金動向、教學資源與帳戶設定。" />

      <section>
        <MobileSectionHeader icon={<BarChart3 className="h-4 w-4" />} title="OI 資金變動 Top 8" hint="近 1 小時 · 依美元變動排序" />
        {scan.oi_movers.length ? (
          <div className="surface-sunken mt-2 divide-y divide-white/5 overflow-hidden rounded-2xl">
            {scan.oi_movers.slice(0, 8).map((item) => <MobileOiRow key={item.symbol} item={item} onSelect={onSelect} />)}
          </div>
        ) : <CompactEmpty text="目前沒有明顯的 OI 異動" />}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <MoreLink href="/beginner" icon={<BookOpen className="h-5 w-5" />} title="新手教學" subtitle="系統使用方式" />
        <MoreLink href="/indicators" icon={<Gauge className="h-5 w-5" />} title="指標專區" subtitle="理解數據邏輯" />
        <MoreLink href="/mentors" icon={<UsersRound className="h-5 w-5" />} title="團隊導師" subtitle="認識核心團隊" />
        <MoreLink href="/indicators/ct-nova" icon={<Sparkles className="h-5 w-5" />} title="CT NOVA" subtitle="查看指標詳情" />
      </section>

      <section className="surface rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">目前方案</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{entitlementLabel(entitlement)}</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-3 border-t border-white/10 pt-3">
          <AccountMenu />
        </div>
      </section>
    </div>
  );
}

function MobileOiRow({ item, onSelect }: { item: OiMover; onSelect: (symbol: string) => void }) {
  const quantityChange = item.oi_qty_change_1h ?? item.oi_change_1h;
  return (
    <button type="button" onClick={() => onSelect(item.symbol)} className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/[0.04]">
      <strong className="w-16 shrink-0 text-sm text-slate-50">{shortSymbol(item.symbol)}</strong>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-slate-300">{item.side}</span>
        <span className="mt-1 block text-[10px] text-slate-600">數量 {formatPercent(quantityChange)} · 價格 {formatPercent(item.price_change_1h)}</span>
      </span>
      <span className={`text-sm font-medium tabular-nums ${percentTone(item.oi_delta)}`}>{formatSignedUsd(item.oi_delta)}</span>
    </button>
  );
}

function MoreLink({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link href={href} className="surface lift min-h-28 rounded-2xl p-3">
      <span className="text-ember">{icon}</span>
      <strong className="mt-4 block text-sm text-slate-100">{title}</strong>
      <span className="mt-1 block text-[11px] text-slate-500">{subtitle}</span>
    </Link>
  );
}

function MobileCtMark() {
  return (
    <span className="relative block h-8 w-8 overflow-hidden rounded-full" aria-hidden>
      <img
        src="/logo.png"
        alt=""
        className="absolute left-0 top-1/2 h-8 w-auto max-w-none -translate-y-1/2"
      />
    </span>
  );
}

function MobileSectionHeader({ icon, title, hint, action, onAction }: { icon: React.ReactNode; title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gold">{icon}</span>
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      {hint ? <span className="text-[11px] tabular-nums text-slate-600">{hint}</span> : null}
      {action && onAction ? (
        <button type="button" onClick={onAction} className="ml-auto inline-flex min-h-10 items-center gap-1 px-1 text-xs text-gold">
          {action}<ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function MobilePageIntro({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <header>
      <p className="font-kicker text-[10px] tracking-[0.2em] text-gold">{kicker}</p>
      <h1 className="mt-1 text-xl font-black text-slate-50">{title}</h1>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
    </header>
  );
}

function OverviewMetric({ label, value, suffix, tone = "text-slate-50" }: { label: string; value: string; suffix: string; tone?: string }) {
  return (
    <div className="surface-sunken rounded-xl px-2 py-2.5 text-center">
      <span className="block text-[10px] text-slate-600">{label}</span>
      <span className={`mt-1 block text-lg font-semibold tabular-nums ${tone}`}>{value}<small className="ml-0.5 text-[10px] font-normal text-slate-500">{suffix}</small></span>
    </div>
  );
}

function RadarFilterButton({ label, count, active, onClick, alert = false }: { label: string; count: number; active: boolean; onClick: () => void; alert?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`h-10 rounded-xl border px-3 text-xs tabular-nums ${active ? (alert ? "border-short/50 bg-short/15 text-short" : "border-ember/45 bg-ember/15 text-ember") : "border-white/10 bg-white/[0.03] text-slate-500"}`}>
      {label} {count}
    </button>
  );
}

function RiskFlag({ label, alert = false }: { label: string; alert?: boolean }) {
  return <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] ${alert ? "border-short/35 bg-short/10 text-short" : "border-white/10 bg-white/[0.03] text-slate-500"}`}>{label}</span>;
}

function CompactEmpty({ text }: { text: string }) {
  return <div className="surface-sunken flex min-h-20 items-center justify-center rounded-2xl px-4 text-center text-xs leading-5 text-slate-500">{text}</div>;
}

function ErrorNotice({ error }: { error: string }) {
  return <div className="mb-4 flex items-start gap-2 rounded-xl border border-short/30 bg-short/10 px-3 py-3 text-xs leading-5 text-red-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>;
}

function LoadingState({ loading }: { loading: boolean }) {
  return <div className="surface-sunken flex h-44 flex-col items-center justify-center rounded-2xl text-sm text-slate-500"><Sparkles className={`mb-3 h-5 w-5 text-gold ${loading ? "animate-pulse" : ""}`} />{loading ? "正在載入市場資料…" : "目前沒有市場資料"}</div>;
}

function flowText(value: number): string {
  if (value > 0.005) return `買方 ${formatPercent(value)}`;
  if (value < -0.005) return `賣方 ${formatPercent(value)}`;
  return `主動流 ${formatPercent(value)}`;
}

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${formatCompactNumber(Math.abs(value))}`;
}

function isLiquidation(item: RiskRadarItem): boolean {
  return item.flags.some((flag) => flag.includes("爆倉"));
}

function riskKey(item: RiskRadarItem, index: number): string {
  return `${item.symbol}-${item.event_time}-${item.state}-${index}`;
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

function entitlementLabel(entitlement?: Entitlement | null): string {
  if (!entitlement) return "讀取中";
  if (entitlement.plan === "lifetime") return "永久會員";
  if (entitlement.plan === "member") return `正式會員 · 剩餘 ${entitlement.days_left ?? 0} 天`;
  if (entitlement.plan === "trial") return `試用方案 · 剩餘 ${entitlement.days_left ?? 0} 天`;
  return "尚未啟用";
}
