"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MemberFeatureGate } from "@/components/auth/MemberFeatureGate";
import { PageHeader } from "@/components/nav/PageHeader";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { deleteTrade, listTrades, saveTrade, type Trade, type TradeInput } from "@/lib/journal-api";

const blank = (): TradeInput => ({ symbol: "", market: "crypto", currency: "USD", side: "long", entry_at: "", exit_at: "", entry_price: "", exit_price: "", quantity: "", point_value: "1", fees: "0", strategy: "", note: "" });
const money = (value: number, currency: string) => `${value < 0 ? "−" : ""}${currency} ${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
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
    curve
  };
}

function MiniChart({ values, positive }: { values: number[]; positive: boolean }) {
  const points = [0, ...values];
  const low = Math.min(...points, 0);
  const high = Math.max(...points, 0);
  const span = Math.max(high - low, 1);
  const coords = points.map((value, index) => `${index * 300 / Math.max(points.length - 1, 1)},${62 - (value - low) / span * 56}`).join(" ");
  return <svg viewBox="0 0 300 68" preserveAspectRatio="none" className="mt-5 h-16 w-full" aria-hidden="true"><polyline points={coords} fill="none" stroke={positive ? "rgb(var(--c-long))" : "rgb(var(--c-short))"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function Donut({ percent, label }: { percent: number; label: string }) {
  const value = Math.min(100, Math.max(0, percent));
  return <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" role="img" aria-label={`${label} ${value.toFixed(0)}%`}><circle cx="50" cy="50" r="38" fill="none" stroke="rgb(var(--c-slate-700))" strokeWidth="8" /><circle cx="50" cy="50" r="38" fill="none" stroke="rgb(var(--c-long))" strokeWidth="8" strokeDasharray={`${value * 2.388} 238.8`} strokeLinecap="round" transform="rotate(-90 50 50)" /></svg>;
}

function EquityChart({ values }: { values: number[] }) {
  if (!values.length) return <div className="flex h-64 items-center justify-center text-sm text-slate-500">輸入第一筆已平倉交易後，這裡會顯示累積損益曲線。</div>;
  const points = [0, ...values];
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = Math.max(high - low, 1);
  const coords = points.map((value, index) => `${36 + index * 660 / Math.max(points.length - 1, 1)},${215 - (value - low) / span * 170}`);
  const last = coords[coords.length - 1].split(",");
  return (
    <svg viewBox="0 0 720 255" className="h-64 w-full" role="img" aria-label="累積損益曲線">
      <defs><linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--c-long))" stopOpacity="0.2" /><stop offset="100%" stopColor="rgb(var(--c-long))" stopOpacity="0" /></linearGradient></defs>
      {[45, 130, 215].map((y) => <line key={y} x1="36" x2="696" y1={y} y2={y} stroke="rgb(var(--c-slate-700))" strokeDasharray="4 6" opacity="0.6" />)}
      <polygon points={`36,215 ${coords.join(" ")} 696,215`} fill="url(#equity-fill)" />
      <polyline points={coords.join(" ")} fill="none" stroke="rgb(var(--c-long))" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="5" fill="rgb(var(--c-long))" />
      <text x="36" y="238" fill="rgb(var(--c-slate-400))" fontSize="12">起始</text>
      <text x="650" y="238" fill="rgb(var(--c-slate-400))" fontSize="12">最新</text>
    </svg>
  );
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

  useEffect(() => { listTrades().then(setTrades).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  const currencies = [...new Set(trades.map((row) => row.currency))];
  useEffect(() => { if (currencies.length && !currencies.includes(currency)) setCurrency(currencies[0]); }, [currencies.join("|"), currency]);
  const matching = trades.filter((row) => row.currency === currency && `${row.symbol} ${row.strategy ?? ""}`.toLowerCase().includes(query.toLowerCase()));
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
        <div className="glass-panel min-h-[190px] rounded-xl border border-white/10 p-5"><p className="text-sm text-slate-400">累計淨損益</p><div className="mt-4 flex items-end gap-2"><p className={`font-data text-3xl font-bold ${stats.net >= 0 ? "text-long" : "text-short"}`}>{money(stats.net, currency)}</p><span className="mb-1 rounded bg-white/5 px-2 py-1 text-[11px] text-slate-400">{stats.count} 筆交易</span></div><MiniChart values={stats.curve} positive={stats.net >= 0} /></div>
        <div className="glass-panel min-h-[190px] rounded-xl border border-white/10 p-5"><p className="text-sm text-slate-400">獲利因子</p><div className="mt-4 flex items-center justify-between"><div><p className="font-data text-3xl font-bold text-white">{stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)}</p><p className="mt-2 text-xs text-slate-500">總獲利 / 總虧損</p></div><Donut percent={stats.grossWin + stats.grossLoss ? stats.grossWin / (stats.grossWin + stats.grossLoss) * 100 : 0} label="總獲利占比" /></div></div>
        <div className="glass-panel min-h-[190px] rounded-xl border border-white/10 p-5"><p className="text-sm text-slate-400">交易勝率</p><div className="mt-4 flex items-center justify-between"><div><p className="font-data text-3xl font-bold text-white">{stats.winRate.toFixed(1)}%</p><p className="mt-2 text-xs text-slate-500">{stats.wins} 勝 · {stats.losses} 負</p></div><Donut percent={stats.winRate} label="交易勝率" /></div></div>
        <div className="glass-panel min-h-[190px] rounded-xl border border-white/10 p-5"><p className="text-sm text-slate-400">平均盈虧比</p><p className="mt-4 font-data text-3xl font-bold text-white">{stats.winLossRatio === null ? "—" : stats.winLossRatio.toFixed(2)}</p><div className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/10"><span className="bg-long" style={{ width: `${stats.avgWin + Math.abs(stats.avgLoss) ? stats.avgWin / (stats.avgWin + Math.abs(stats.avgLoss)) * 100 : 0}%` }} /><span className="bg-short" style={{ width: `${stats.avgWin + Math.abs(stats.avgLoss) ? Math.abs(stats.avgLoss) / (stats.avgWin + Math.abs(stats.avgLoss)) * 100 : 0}%` }} /></div><div className="mt-2 flex justify-between gap-2 text-[11px]"><span className="text-long">{money(stats.avgWin, currency)}</span><span className="text-short">{money(stats.avgLoss, currency)}</span></div></div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(270px,1fr)]"><section className="glass-panel rounded-xl border border-white/10 p-5"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-gold" /><h3 className="font-bold text-white">累計損益曲線</h3></div><p className="mt-1 text-xs text-slate-500">每筆交易累積的淨損益</p><EquityChart values={stats.curve} /></section><section className="glass-panel rounded-xl border border-white/10 p-5"><h3 className="font-bold text-white">績效快覽</h3><div className="mt-4 divide-y divide-white/10 text-sm">{[["總交易次數", `${stats.count} 筆`], ["平均每筆損益", money(stats.count ? stats.net / stats.count : 0, currency)], ["最大回撤", money(-stats.drawdown, currency)], ["最佳單筆交易", money(stats.best, currency)], ["交易日勝率", `${stats.dayWinRate.toFixed(1)}%`], ["最佳交易日", money(stats.bestDay, currency)], ["最佳日占總獲利", `${stats.bestDayShare.toFixed(1)}%`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3"><span className="text-slate-400">{label}</span><strong className="font-data text-right text-slate-100">{value}</strong></div>)}</div></section></div>
      <section className="glass-panel overflow-hidden rounded-xl border border-white/10"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><h3 className="font-bold text-white">交易紀錄</h3><p className="text-xs text-slate-400">{matching.length} 筆符合條件</p></div><div className="flex gap-2"><input aria-label="搜尋商品或策略" placeholder="搜尋商品或策略" value={query} onChange={(event) => setQuery(event.target.value)} className="w-40 rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm text-white sm:w-56" /><button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200"><Download className="h-4 w-4" />CSV</button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-white/5 text-xs text-slate-400"><tr>{["出場時間", "商品", "方向", "進場價", "出場價", "數量", "淨損益", "策略", "操作"].map((head) => <th key={head} className="px-4 py-3 font-medium">{head}</th>)}</tr></thead><tbody>{matching.map((row) => <tr key={row.id} className="border-t border-white/10 text-slate-200"><td className="px-4 py-3">{new Date(row.exit_at).toLocaleString("zh-TW")}</td><td className="px-4 py-3 font-semibold text-white">{row.symbol}</td><td className="px-4 py-3">{row.side === "long" ? "做多" : "做空"}</td><td className="px-4 py-3">{row.entry_price}</td><td className="px-4 py-3">{row.exit_price}</td><td className="px-4 py-3">{row.quantity}</td><td className={`px-4 py-3 font-semibold ${Number(row.net_pnl) >= 0 ? "text-long" : "text-short"}`}>{money(Number(row.net_pnl), row.currency)}</td><td className="px-4 py-3">{row.strategy || "—"}</td><td className="flex gap-2 px-4 py-3"><button aria-label="編輯交易" onClick={() => edit(row)} className="text-slate-400 hover:text-gold"><Pencil className="h-4 w-4" /></button><button aria-label="刪除交易" onClick={() => remove(row.id)} className="text-slate-400 hover:text-short"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>{!loading && !matching.length && <p className="p-8 text-center text-sm text-slate-500">尚無交易紀錄</p>}</div></section>
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
