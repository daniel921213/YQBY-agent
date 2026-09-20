"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Download, Info, Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MemberFeatureGate } from "@/components/auth/MemberFeatureGate";
import { PageHeader } from "@/components/nav/PageHeader";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { deleteTrade, listTrades, saveTrade, type Trade, type TradeInput } from "@/lib/journal-api";

const blank = (): TradeInput => ({ symbol: "", market: "crypto", currency: "USD", side: "long", entry_at: "", exit_at: "", entry_price: "", exit_price: "", quantity: "", point_value: "1", fees: "0", strategy: "", note: "" });
const money = (value: number, currency: string) => `${value < 0 ? "−" : ""}${currency} ${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const amount = (value: number) => Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ratio = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyMark = (currency: string) => currency === "USD" ? "$" : currency;
const dateLabel = (value: string) => new Date(value).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
const localInput = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function tradeStats(trades: Trade[]) {
  const rows = [...trades].sort((a, b) => new Date(a.exit_at).getTime() - new Date(b.exit_at).getTime());
  const pnls = rows.map((row) => Number(row.net_pnl));
  const wins = pnls.filter((value) => value > 0);
  const losses = pnls.filter((value) => value < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = -losses.reduce((a, b) => a + b, 0);
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  const curve = pnls.map((value) => { equity += value; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); return equity; });
  const days = new Map<string, number>();
  rows.forEach((row, index) => { const key = new Date(row.exit_at).toLocaleDateString("en-CA"); days.set(key, (days.get(key) ?? 0) + pnls[index]); });
  const bestDay = days.size ? Math.max(...days.values()) : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;
  return {
    count: rows.length, net: equity, wins: wins.length, losses: losses.length,
    grossWin, grossLoss,
    winRate: rows.length ? wins.length / rows.length * 100 : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    avgWin, avgLoss,
    winLossRatio: avgLoss ? avgWin / Math.abs(avgLoss) : null,
    drawdown, best: pnls.length ? Math.max(...pnls) : 0, bestDay,
    bestDayShare: grossWin > 0 && bestDay > 0 ? bestDay / grossWin * 100 : 0,
    dayWinRate: days.size ? [...days.values()].filter((value) => value > 0).length / days.size * 100 : 0,
    curve,
    curveDates: rows.map((row) => row.exit_at)
  };
}

function MiniChart({ values, positive }: { values: number[]; positive: boolean }) {
  const points = [0, ...values];
  const minimum = Math.min(...points, 0);
  const maximum = Math.max(...points, 0);
  const low = minimum === maximum ? minimum - 0.5 : minimum;
  const high = minimum === maximum ? maximum + 0.5 : maximum;
  const span = high - low;
  const coords = points.map((value, index) => `${index * 300 / Math.max(points.length - 1, 1)},${62 - (value - low) / span * 56}`);
  const tone = positive ? "rgb(var(--c-long))" : "rgb(var(--c-short))";
  return <svg viewBox="0 0 300 68" preserveAspectRatio="none" className="mt-auto h-16 w-full pt-1" aria-hidden="true"><defs><linearGradient id="mini-equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tone} stopOpacity="0.2" /><stop offset="100%" stopColor={tone} stopOpacity="0" /></linearGradient></defs><polygon points={`0,68 ${coords.join(" ")} 300,68`} fill="url(#mini-equity-fill)" /><polyline points={coords.join(" ")} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function Donut({ green, red, neutral = 0, label }: { green: number; red: number; neutral?: number; label: string }) {
  const total = green + red + neutral;
  const circumference = 2 * Math.PI * 38;
  const greenLength = total ? green / total * circumference : 0;
  const redLength = total ? red / total * circumference : 0;
  return <svg viewBox="0 0 100 100" className="h-[88px] w-[88px] shrink-0" role="img" aria-label={`${label}：獲利 ${green.toFixed(0)}，虧損 ${red.toFixed(0)}`}><circle cx="50" cy="50" r="38" fill="none" stroke="rgb(var(--c-slate-700))" strokeWidth="8" opacity="0.7" />{redLength > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="rgb(var(--c-short))" strokeWidth="8" strokeDasharray={`${redLength} ${circumference}`} strokeDashoffset={-greenLength} transform="rotate(-90 50 50)" />}{greenLength > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="rgb(var(--c-long))" strokeWidth="8" strokeDasharray={`${greenLength} ${circumference}`} transform="rotate(-90 50 50)" />}</svg>;
}

function EquityChart({ values, dates, currency }: { values: number[]; dates: string[]; currency: string }) {
  if (!values.length) return <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">輸入第一筆已平倉交易後，這裡會顯示累積損益曲線。</div>;
  const points = [0, ...values];
  const minimum = Math.min(...points);
  const maximum = Math.max(...points);
  const low = minimum === maximum ? minimum - 0.5 : minimum;
  const high = minimum === maximum ? maximum + 0.5 : maximum;
  const span = high - low;
  const tone = values[values.length - 1] >= 0 ? "rgb(var(--c-long))" : "rgb(var(--c-short))";
  const x = (index: number) => 84 + index * 886 / Math.max(points.length - 1, 1);
  const y = (value: number) => 246 - (value - low) / span * 206;
  const coords = points.map((value, index) => `${x(index)},${y(value)}`);
  const axisValue = (value: number) => `${value < 0 ? "−" : ""}${currencyMark(currency)}${Math.abs(value) >= 1_000_000 ? `${(Math.abs(value) / 1_000_000).toFixed(1)}m` : Math.abs(value) >= 10_000 ? `${(Math.abs(value) / 1_000).toFixed(1)}k` : Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const dateIndexes = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
  return (
    <svg viewBox="0 0 1000 290" className="mt-4 aspect-[1000/290] min-w-[680px] w-full" role="img" aria-label="累積損益曲線">
      <defs><linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tone} stopOpacity="0.2" /><stop offset="100%" stopColor={tone} stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((tick) => { const value = high - tick * span / 4; const lineY = y(value); return <g key={tick}><line x1="84" x2="970" y1={lineY} y2={lineY} stroke="rgb(var(--c-slate-700))" strokeDasharray="4 6" opacity="0.6" /><text x="75" y={lineY + 4} textAnchor="end" fill="rgb(var(--c-slate-400))" fontSize="11">{axisValue(value)}</text></g>; })}
      <polygon points={`84,246 ${coords.join(" ")} 970,246`} fill="url(#equity-fill)" />
      <polyline points={coords.join(" ")} fill="none" stroke={tone} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r="5" fill={tone} stroke="rgb(var(--c-ink))" strokeWidth="2" />
      <text x="84" y="276" textAnchor="start" fill="rgb(var(--c-slate-400))" fontSize="11">起始</text>
      {dateIndexes.map((index) => <text key={index} x={x(index + 1)} y="276" textAnchor={index === dates.length - 1 ? "end" : "middle"} fill="rgb(var(--c-slate-400))" fontSize="11">{dateLabel(dates[index])}</text>)}
    </svg>
  );
}

function MetricCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <div className="glass-panel relative flex min-h-[214px] min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.12)]"><span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" /><div className="relative flex items-center justify-between gap-2"><h3 className="shrink-0 text-sm font-medium text-slate-200">{title}</h3><span title={hint} className="inline-flex min-w-0 items-center gap-1.5 text-[10px] tracking-wide text-slate-500"><span className="truncate">{hint}</span><Info className="h-3.5 w-3.5 shrink-0" /></span></div>{children}</div>;
}

function LegendDot({ tone, children }: { tone: "long" | "short"; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${tone === "long" ? "bg-long" : "bg-short"}`} />{children}</span>;
}

export default function BacktestPage() { return <AuthGuard><MemberFeatureGate title="回測系統"><Backtest /></MemberFeatureGate></AuthGuard>; }

function Backtest() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<TradeInput>(blank());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [query, setQuery] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "win" | "loss" | "flat">("all");

  useEffect(() => { listTrades().then(setTrades).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  const currencies = [...new Set(trades.map((row) => row.currency))];
  useEffect(() => { if (currencies.length && !currencies.includes(currency)) setCurrency(currencies[0]); }, [currencies.join("|"), currency]);
  const symbols = [...new Set(trades.filter((row) => row.currency === currency).map((row) => row.symbol))].sort();
  const activeSymbol = symbols.includes(symbolFilter) ? symbolFilter : "all";
  const matching = trades.filter((row) => {
    if (row.currency !== currency || (activeSymbol !== "all" && row.symbol !== activeSymbol)) return false;
    const pnl = Number(row.net_pnl);
    if ((statusFilter === "win" && pnl <= 0) || (statusFilter === "loss" && pnl >= 0) || (statusFilter === "flat" && pnl !== 0)) return false;
    return `${row.symbol} ${row.strategy ?? ""} ${row.note ?? ""} ${new Date(row.entry_at).toLocaleDateString("zh-TW")} ${new Date(row.exit_at).toLocaleDateString("zh-TW")}`.toLowerCase().includes(query.toLowerCase());
  });
  const largestTradePnl = Math.max(1, ...matching.map((row) => Math.abs(Number(row.net_pnl))));
  const stats = useMemo(() => tradeStats(trades.filter((row) => row.currency === currency)), [trades, currency]);

  const edit = (row?: Trade) => {
    setError("");
    setEditing(row?.id ?? null);
    setForm(row ? { symbol: row.symbol, market: row.market, currency: row.currency, side: row.side, entry_at: localInput(row.entry_at), exit_at: localInput(row.exit_at), entry_price: row.entry_price, exit_price: row.exit_price, quantity: row.quantity, point_value: row.point_value, fees: row.fees, strategy: row.strategy ?? "", note: row.note ?? "" } : blank());
    setOpen(true);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = { ...form, entry_at: new Date(form.entry_at).toISOString(), exit_at: new Date(form.exit_at).toISOString() };
      const row = await saveTrade(data, editing ?? undefined);
      setTrades((current) => editing ? current.map((item) => item.id === editing ? row : item) : [row, ...current]);
      setCurrency(row.currency); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "儲存失敗"); }
    finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!window.confirm("確定刪除這筆交易？")) return;
    try { await deleteTrade(id); setTrades((current) => current.filter((row) => row.id !== id)); }
    catch (err) { setError(err instanceof Error ? err.message : "刪除失敗"); }
  };
  const exportCsv = () => {
    const headers = ["symbol", "market", "currency", "side", "entry_at", "exit_at", "entry_price", "exit_price", "quantity", "point_value", "fees", "net_pnl", "strategy", "note"] as const;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.join(","), ...matching.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); link.download = "trades.csv"; link.click(); URL.revokeObjectURL(link.href);
  };

  return (
    <main className="relative min-h-screen px-4 py-5 sm:px-6 lg:px-8"><SpaceParticleField /><div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="回測系統" kicker="TRADE PERFORMANCE" />
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-white">交易績效總覽</h2><p className="mt-1 text-sm text-slate-400">每筆交易由你記錄，僅你本人可以查看。</p></div><button onClick={() => edit()} className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-slate-950"><Plus className="h-4 w-4" />新增交易</button></div>
      {error && <p role="alert" className="rounded-lg border border-short/30 bg-short/10 p-3 text-sm text-short">{error}</p>}
      <div className="flex items-center gap-2"><span className="text-sm text-slate-400">統計幣別</span><select className="rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm text-white" value={currency} onChange={(event) => setCurrency(event.target.value)}>{(currencies.length ? currencies : ["USD"]).map((item) => <option key={item}>{item}</option>)}</select><span className="text-xs text-slate-500">不同幣別分開統計</span></div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="績效統計">
        <MetricCard title="累計淨損益" hint="Net cumulative P&L">
          <div className="relative mt-5 flex flex-wrap items-center gap-2"><span className={`font-display whitespace-nowrap text-[clamp(1.6rem,2vw,2.15rem)] font-bold leading-none tracking-tight ${stats.net >= 0 ? "text-white" : "text-short"}`}>{stats.net < 0 ? "−" : ""}<span className="mr-1 text-[0.62em] text-slate-400">{currencyMark(currency)}</span>{amount(stats.net)}</span><span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium ${stats.net >= 0 ? "border-long/20 bg-long/10 text-long" : "border-short/20 bg-short/10 text-short"}`}>{stats.net >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{stats.count} 筆交易</span></div>
          <MiniChart values={stats.curve} positive={stats.net >= 0} />
        </MetricCard>
        <MetricCard title="獲利因子" hint="Profit factor">
          <div className="mt-4 flex min-w-0 items-center justify-between gap-2"><div className="min-w-0"><p className="font-display truncate text-[clamp(1.6rem,2vw,2.15rem)] font-bold leading-none text-white" title={ratio(stats.profitFactor)}>{ratio(stats.profitFactor)}</p><p className="mt-2 text-[11px] text-slate-500">Profit factor</p></div><Donut green={stats.grossWin} red={stats.grossLoss} label="總獲利與總虧損" /></div>
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-[11px] text-slate-400"><LegendDot tone="long">總獲利</LegendDot><LegendDot tone="short">總虧損</LegendDot></div>
        </MetricCard>
        <MetricCard title="交易勝率" hint="Trade win rate">
          <div className="mt-4 flex items-center justify-between gap-2"><div><p className="font-display text-[clamp(1.6rem,2vw,2.15rem)] font-bold leading-none text-white">{stats.winRate.toFixed(1)}<span className="text-[0.66em]">%</span></p><p className="mt-2 text-[11px] text-slate-500">Trade win rate</p></div><Donut green={stats.wins} red={stats.losses} neutral={stats.count - stats.wins - stats.losses} label="交易勝負" /></div>
          <div className="mt-auto flex gap-2 pt-2 text-[11px]"><span className="rounded-full bg-long/10 px-2 py-0.5 text-long">{stats.wins} 勝</span><span className="rounded-full bg-short/10 px-2 py-0.5 text-short">{stats.losses} 負</span>{stats.count > stats.wins + stats.losses && <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-400">{stats.count - stats.wins - stats.losses} 平</span>}</div>
        </MetricCard>
        <MetricCard title="平均盈虧比" hint="Avg. winning / losing trade">
          <p className="mt-5 font-display text-[clamp(1.6rem,2vw,2.15rem)] font-bold leading-none text-white" title={ratio(stats.winLossRatio)}>{ratio(stats.winLossRatio)}</p>
          <div className="mt-auto"><div className="flex h-1.5 overflow-hidden rounded-full bg-white/10"><span className="bg-long" style={{ width: `${stats.avgWin + Math.abs(stats.avgLoss) ? stats.avgWin / (stats.avgWin + Math.abs(stats.avgLoss)) * 100 : 0}%` }} /><span className="bg-short" style={{ width: `${stats.avgWin + Math.abs(stats.avgLoss) ? Math.abs(stats.avgLoss) / (stats.avgWin + Math.abs(stats.avgLoss)) * 100 : 0}%` }} /></div><div className="mt-2 flex justify-between gap-2 text-[11px]"><span className="truncate text-long" title={money(stats.avgWin, currency)}>{money(stats.avgWin, currency)}</span><span className="truncate text-right text-short" title={money(stats.avgLoss, currency)}>{money(stats.avgLoss, currency)}</span></div><p className="mt-1 text-[10px] text-slate-500">平均獲利 / 平均虧損</p></div>
        </MetricCard>
      </section>
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
        <section className="glass-panel min-w-0 overflow-hidden rounded-xl border border-white/10 p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gold" /><h3 className="font-bold text-white">累計損益曲線</h3><span className="text-[10px] text-slate-500">Equity curve</span></div><p className="mt-1 text-xs text-slate-500">每一筆交易，都是策略的軌跡。</p></div><span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${stats.net >= 0 ? "bg-long" : "bg-short"}`} />淨損益</span></div><div className="overflow-x-auto"><EquityChart values={stats.curve} dates={stats.curveDates} currency={currency} /></div></section>
        <section className="glass-panel flex flex-col overflow-hidden rounded-xl border border-white/10"><div className="flex items-center justify-between p-5 pb-3"><div className="flex items-center gap-2"><h3 className="font-bold text-white">績效快覽</h3><span className="text-[10px] text-slate-500">Performance</span></div><Activity className="h-4 w-4 text-gold" /></div><div className="divide-y divide-white/10 px-5 text-sm">{[["總交易次數", `${stats.count} 筆`, "neutral"], ["平均每筆損益", money(stats.count ? stats.net / stats.count : 0, currency), stats.net >= 0 ? "long" : "short"], ["最大回撤", money(-stats.drawdown, currency), "short"], ["最佳單筆交易", money(stats.best, currency), stats.best >= 0 ? "long" : "short"]].map(([label, value, tone]) => <div key={label} className="flex items-center justify-between gap-3 py-3.5"><span className="text-slate-400">{label}</span><strong className={`font-data text-right text-xs tabular-nums ${tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-slate-100"}`}>{value}</strong></div>)}</div><div className="mt-auto border-t border-white/5 bg-white/[0.03] px-5 py-3"><p className="flex items-center gap-2 text-[11px] text-slate-500"><Activity className="h-3.5 w-3.5" />讓紀錄成為你的交易優勢。</p><p className="mt-1 text-[10px] text-slate-500">交易日勝率 {stats.dayWinRate.toFixed(1)}% · 最佳日 {money(stats.bestDay, currency)} · 最佳日占獲利 {stats.bestDayShare.toFixed(1)}%</p></div></section>
      </div>
      <section className="glass-panel overflow-hidden rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5"><div className="flex items-center gap-3"><h3 className="font-bold text-white">交易紀錄</h3><span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-data text-[11px] text-long">{matching.length}</span><span className="text-[10px] text-slate-500">Trade history</span></div><button onClick={exportCsv} disabled={!matching.length} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 transition hover:border-gold/40 hover:text-gold disabled:opacity-40"><Download className="h-3.5 w-3.5" />匯出 CSV</button></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 pb-4"><label className="flex min-w-[210px] max-w-sm flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 text-slate-500"><Search className="h-4 w-4 shrink-0" /><input aria-label="搜尋商品、策略或日期" placeholder="搜尋商品、策略或日期…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500" /></label><div className="flex flex-wrap gap-2"><select aria-label="篩選商品" value={activeSymbol} onChange={(event) => setSymbolFilter(event.target.value)} className="rounded-lg border border-white/10 bg-graphite px-3 py-2 text-xs text-slate-200"><option value="all">所有商品</option>{symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}</select><select aria-label="篩選交易狀態" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-lg border border-white/10 bg-graphite px-3 py-2 text-xs text-slate-200"><option value="all">所有狀態</option><option value="win">獲利</option><option value="loss">虧損</option><option value="flat">打平</option></select></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="bg-white/[0.04] text-[11px] text-slate-400"><tr>{["進場日期", "商品", "狀態", "方向", "出場日期", "進場價格", "出場價格", "數量", "淨損益", "策略", "損益表現", "操作"].map((head) => <th key={head} className="whitespace-nowrap px-4 py-3 font-medium">{head}</th>)}</tr></thead><tbody>{matching.map((row) => { const pnl = Number(row.net_pnl); const width = pnl === 0 ? 0 : Math.max(3, Math.abs(pnl) / largestTradePnl * 46); return <tr key={row.id} className="border-t border-white/10 text-slate-300 transition hover:bg-white/[0.03]"><td className="whitespace-nowrap px-4 py-3"><span className="font-semibold text-slate-100">{new Date(row.entry_at).toLocaleDateString("zh-TW")}</span><span className="block text-[10px] text-slate-500">{new Date(row.entry_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</span></td><td className="px-4 py-3 font-bold text-white">{row.symbol}</td><td className="px-4 py-3"><span className={`inline-flex min-w-12 justify-center rounded px-2 py-1 text-[10px] font-bold ${pnl > 0 ? "bg-long/10 text-long" : pnl < 0 ? "bg-short/10 text-short" : "bg-white/10 text-slate-300"}`}>{pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "FLAT"}</span></td><td className={`whitespace-nowrap px-4 py-3 ${row.side === "long" ? "text-long" : "text-short"}`}>{row.side === "long" ? "↗ 做多" : "↘ 做空"}</td><td className="whitespace-nowrap px-4 py-3">{new Date(row.exit_at).toLocaleDateString("zh-TW")}<span className="block text-[10px] text-slate-500">{new Date(row.exit_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</span></td><td className="whitespace-nowrap px-4 py-3 font-data text-slate-200">{Number(row.entry_price).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td><td className="whitespace-nowrap px-4 py-3 font-data text-slate-200">{Number(row.exit_price).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td><td className="px-4 py-3 font-data">{row.quantity}</td><td className={`whitespace-nowrap px-4 py-3 font-data font-bold ${pnl > 0 ? "text-long" : pnl < 0 ? "text-short" : "text-slate-200"}`}>{money(pnl, row.currency)}</td><td className="max-w-[130px] truncate px-4 py-3" title={row.strategy ?? ""}>{row.strategy || "—"}</td><td className="px-4 py-3"><div className="relative h-px w-20 bg-white/20"><span className="absolute -top-[2px] h-[5px] rounded-sm" style={{ left: pnl >= 0 ? "50%" : `${50 - width}%`, width: `${width}%`, backgroundColor: pnl >= 0 ? "rgb(var(--c-long))" : "rgb(var(--c-short))" }} /></div></td><td className="px-4 py-3"><div className="flex gap-3"><button aria-label={`編輯 ${row.symbol} 交易`} onClick={() => edit(row)} className="text-slate-400 hover:text-gold"><Pencil className="h-4 w-4" /></button><button aria-label={`刪除 ${row.symbol} 交易`} onClick={() => remove(row.id)} className="text-slate-400 hover:text-short"><Trash2 className="h-4 w-4" /></button></div></td></tr>; })}</tbody></table>{!loading && !matching.length && <p className="p-8 text-center text-sm text-slate-500">{trades.length ? "沒有符合篩選條件的交易" : "尚無交易紀錄，新增第一筆交易後會顯示在這裡。"}</p>}</div>
      </section>
    </div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}><form onClick={(event) => event.stopPropagation()} onSubmit={submit} className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/15 p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold text-white">{editing ? "編輯交易" : "新增交易"}</h3><button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400">關閉</button></div><div className="grid gap-3 sm:grid-cols-2">
      <Field label="商品"><input required maxLength={64} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="BTCUSDT / MNQ" /></Field>
      <Field label="市場"><select value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value as TradeInput["market"] })}><option value="crypto">加密貨幣</option><option value="futures">期貨</option><option value="other">其他</option></select></Field>
      <Field label="損益幣別"><input required maxLength={12} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
      <Field label="方向"><select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as TradeInput["side"] })}><option value="long">做多</option><option value="short">做空</option></select></Field>
      <Field label="進場時間"><input required type="datetime-local" value={form.entry_at} onChange={(e) => setForm({ ...form, entry_at: e.target.value })} /></Field>
      <Field label="出場時間"><input required type="datetime-local" value={form.exit_at} onChange={(e) => setForm({ ...form, exit_at: e.target.value })} /></Field>
      {(["entry_price", "exit_price", "quantity", "point_value", "fees"] as const).map((key) => <Field key={key} label={{ entry_price: "進場價格", exit_price: "出場價格", quantity: "數量／合約口數", point_value: "每點價值／合約乘數", fees: "總手續費" }[key]}><input required type="number" step="any" min={key === "fees" ? "0" : "0.00000001"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>)}
      <Field label="策略"><input value={form.strategy ?? ""} onChange={(e) => setForm({ ...form, strategy: e.target.value })} /></Field><Field label="備註"><input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
    </div><p className="mt-4 text-xs text-slate-400">淨損益＝（出場價－進場價）×數量×每點價值×方向－手續費。期貨請填正確合約乘數。</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300">取消</button><button disabled={busy} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{busy ? "儲存中…" : "儲存交易"}</button></div></form></div>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1 text-xs text-slate-400">{label}<span className="[&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-white/10 [&>input]:bg-graphite [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:text-white [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-white/10 [&>select]:bg-graphite [&>select]:px-3 [&>select]:py-2 [&>select]:text-sm [&>select]:text-white">{children}</span></label>; }
