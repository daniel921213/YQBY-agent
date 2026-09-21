"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Plus, Send, Trash2, XCircle } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MemberFeatureGate } from "@/components/auth/MemberFeatureGate";
import { RichJournal, documentExcerpt, legacyDocument } from "@/components/journal/RichJournal";
import { PageHeader } from "@/components/nav/PageHeader";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { fetchMe, type Entitlement } from "@/lib/api";
import { deleteJournal, myJournals, newJournal, publicJournal, publicJournals, publishJournal, saveJournal, teachers, unpublishJournal, type Journal, type Teacher } from "@/lib/journal-api";

export default function JournalPage() { return <AuthGuard><MemberFeatureGate title="交易日誌"><JournalWorkspace /></MemberFeatureGate></AuthGuard>; }

type Notice = { message: string; kind: "success" | "error" };

function JournalWorkspace() {
  const [view, setView] = useState<"mine" | "teachers">("mine");
  const [mine, setMine] = useState<Journal[]>([]);
  const [published, setPublished] = useState<Journal[]>([]);
  const [teacherList, setTeacherList] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Journal | null>(null);
  const [publicSelected, setPublicSelected] = useState<Journal | null>(null);
  const [title, setTitle] = useState("");
  const [journalDate, setJournalDate] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [document, setDocument] = useState<JSONContent>(legacyDocument([]));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [me, setMe] = useState<Entitlement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const selectedId = useRef<number | null>(null);
  const notify = (message: string, kind: Notice["kind"] = "success") => setNotice({ message, kind });
  const reportError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    const friendly = message === "journal_content_required" ? "請先輸入日誌內容，再發布。" : message;
    setError(friendly); notify(friendly, "error");
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshPublic = async () => { const [all, people] = await Promise.all([publicJournals(), teachers()]); setPublished(all); setTeacherList(people); };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "teachers") setView("teachers");
    Promise.all([myJournals(), publicJournals(), teachers(), fetchMe()]).then(async ([own, all, people, account]) => {
      setMine(own); setPublished(all); setTeacherList(people); setMe(account);
      if (own[0]) selectMine(own[0]);
      const entry = Number(params.get("entry"));
      if (entry) {
        const found = all.find((item) => item.id === entry) ?? await publicJournal(entry).catch(() => null);
        if (found) { setPublicSelected(found); setView("teachers"); }
      }
    }).catch((err) => setError(err.message));
  }, []);

  const persist = (id: number, nextTitle: string, nextDate: string, nextTags: string, nextDocument: JSONContent) => {
    const task = saveQueue.current.then(() => saveJournal(id, nextTitle, nextDate, nextTags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10), nextDocument));
    saveQueue.current = task.catch(() => {});
    return task;
  };

  useEffect(() => {
    if (!selected || !dirty) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const id = selected.id;
    saveTimer.current = window.setTimeout(() => {
      setSaving(true);
      const savedRevision = revision.current;
      persist(id, title, journalDate, tagsText, document).then((row) => {
        setMine((current) => current.map((item) => item.id === id ? row : item));
        if (selectedId.current === id && revision.current === savedRevision) setDirty(false);
      }).catch((err) => reportError(err, "自動儲存失敗")).finally(() => setSaving(false));
    }, 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [selected?.id, title, journalDate, tagsText, document, dirty]);

  function selectMine(row: Journal) {
    selectedId.current = row.id; revision.current += 1;
    setSelected(row); setTitle(row.title); setJournalDate(row.journal_date);
    setTagsText(row.tags.join(", ")); setDocument(row.document ?? legacyDocument(row.blocks));
    setDirty(false); setError("");
  }
  const touch = () => { revision.current += 1; setDirty(true); };
  const flush = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (selected && dirty) {
      const savedRevision = revision.current;
      const row = await persist(selected.id, title, journalDate, tagsText, document);
      setMine((current) => current.map((item) => item.id === row.id ? row : item));
      if (revision.current === savedRevision) setDirty(false);
    }
    await saveQueue.current;
  };
  const create = async () => { if (busy) return; try { setBusy(true); await flush(); const row = await newJournal(); setMine((current) => [row, ...current]); selectMine(row); setView("mine"); notify("新日誌已建立，可以開始輸入。"); } catch (err) { reportError(err, "新增失敗"); } finally { setBusy(false); } };
  const publish = async () => { if (!selected || busy) return; try { setBusy(true); setError(""); await flush(); const updating = selected.is_published; const row = await publishJournal(selected.id); setSelected(row); setMine((current) => current.map((item) => item.id === row.id ? row : item)); await refreshPublic().catch(() => {}); notify(updating ? "日誌更新成功，讀者已可看到最新版。" : "日誌發布成功，讀者已可查看。"); } catch (err) { reportError(err, "發布失敗"); } finally { setBusy(false); } };
  const unpublish = async () => { if (!selected || busy || !window.confirm("確定取消發布？讀者將無法再查看這篇日誌。")) return; try { setBusy(true); setError(""); const row = await unpublishJournal(selected.id); setSelected(row); setMine((current) => current.map((item) => item.id === row.id ? row : item)); await refreshPublic().catch(() => {}); notify("已取消發布，這篇日誌現在只有你看得到。"); } catch (err) { reportError(err, "取消發布失敗"); } finally { setBusy(false); } };
  const remove = async () => { if (!selected || busy || !window.confirm("確定刪除這篇日誌？")) return; try { setBusy(true); if (saveTimer.current) window.clearTimeout(saveTimer.current); await saveQueue.current; await deleteJournal(selected.id); const remaining = mine.filter((item) => item.id !== selected.id); setMine(remaining); if (remaining[0]) selectMine(remaining[0]); else { selectedId.current = null; setSelected(null); } await refreshPublic().catch(() => {}); notify("日誌已刪除。"); } catch (err) { reportError(err, "刪除失敗"); } finally { setBusy(false); } };
  const switchView = async (next: "mine" | "teachers") => { try { if (next === "teachers") await flush(); setView(next); setError(""); } catch (err) { reportError(err, "切換失敗"); } };
  const visible = published.filter((item) => teacherId === null || item.author_id === teacherId);

  return <main className="relative min-h-screen px-4 py-5 sm:px-6 lg:px-8"><SpaceParticleField /><div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-5"><PageHeader title="交易日誌" kicker="TRADING JOURNAL" />
    <div><h2 className="text-2xl font-bold text-white">交易日誌</h2><p className="mt-1 text-sm text-slate-400">記下每次交易的想法，也可閱讀老師公開的日誌。</p></div>
    {error && <p role="alert" className="rounded-lg border border-short/30 bg-short/10 p-3 text-sm text-short">{error}</p>}
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} aria-live={notice.kind === "error" ? "assertive" : "polite"} className={`fixed bottom-5 right-5 z-[70] flex max-w-[min(380px,calc(100vw-40px))] items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${notice.kind === "success" ? "border-long/40 bg-[#173429] text-long" : "border-short/40 bg-[#402329] text-short"}`}>{notice.kind === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}<span>{notice.message}</span><button type="button" aria-label="關閉提示" onClick={() => setNotice(null)} className="ml-1 opacity-70 hover:opacity-100">×</button></div>}
    <div className="flex gap-2 border-b border-white/10"><button onClick={() => switchView("mine")} className={`px-4 py-3 text-sm ${view === "mine" ? "border-b-2 border-gold font-bold text-gold" : "text-slate-400"}`}>我的日誌</button><button onClick={() => switchView("teachers")} className={`px-4 py-3 text-sm ${view === "teachers" ? "border-b-2 border-gold font-bold text-gold" : "text-slate-400"}`}>老師日誌</button></div>
    {view === "mine" ? <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]"><aside className="glass-panel h-fit rounded-xl border border-white/10 p-3"><button disabled={busy} onClick={create} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><Plus className="h-4 w-4" />{busy ? "處理中…" : "新增日誌"}</button><div className="space-y-1">{mine.map((row) => <button key={row.id} onClick={async () => { try { await flush(); selectMine(row); } catch (err) { reportError(err, "切換失敗"); } }} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.id === row.id ? "bg-gold/10 text-gold" : "text-slate-300 hover:bg-white/5"}`}><span className="block truncate">{row.title}</span><span className="text-[11px] text-slate-500">{row.is_published ? "已發布" : "私人草稿"} · {new Date(row.updated_at ?? row.created_at).toLocaleDateString("zh-TW")}</span></button>)}</div></aside>
      <section className="glass-panel min-h-[600px] rounded-xl border border-white/10 p-4 sm:p-7">{selected ? <><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><span className="text-xs text-slate-400">{selected.is_published ? "已發布 · 修改後需重新發布" : "私人草稿"} · {saving ? "儲存中…" : dirty ? "等待儲存" : "已儲存"}</span><div className="flex flex-wrap gap-2">{me?.plan === "lifetime" && <button disabled={busy} onClick={publish} className="inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{busy ? "處理中…" : selected.is_published ? "發布更新" : "發布日誌"}</button>}{selected.is_published && <button disabled={busy} onClick={unpublish} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:opacity-50">取消發布</button>}<button disabled={busy} aria-label="刪除日誌" onClick={remove} className="rounded-lg border border-short/30 px-3 py-2 text-xs text-short disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></div>
        <input aria-label="日誌標題" value={title} onChange={(event) => { setTitle(event.target.value); touch(); }} maxLength={200} placeholder="未命名日誌" className="my-6 w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-slate-600" />
        <div className="mb-6 flex flex-wrap gap-3 border-b border-white/10 pb-5"><label className="flex items-center gap-2 text-xs text-slate-400">日期<input type="date" value={journalDate} onChange={(event) => { if (event.target.value) { setJournalDate(event.target.value); touch(); } }} className="rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm text-white" /></label><label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-slate-400">標籤<input value={tagsText} onChange={(event) => { setTagsText(event.target.value); touch(); }} placeholder="ICT, SMC, SP500" className="w-full rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm text-white" /></label></div>
        <RichJournal key={selected.id} journalId={selected.id} document={document} editable onChange={(next) => { setDocument(next); touch(); }} onError={(message) => reportError(new Error(message), "圖片上傳失敗")} />
      </> : <div className="flex h-96 flex-col items-center justify-center gap-3 text-slate-500"><BookOpen className="h-8 w-8" /><p>新增一篇日誌，開始記錄交易想法。</p></div>}</section></div> : <div className="space-y-4">
      <nav aria-label="老師日誌分類" className="glass-panel flex flex-wrap gap-2 rounded-xl border border-white/10 p-3"><button onClick={() => { setTeacherId(null); setPublicSelected(null); }} className={`rounded-lg px-4 py-2 text-sm ${teacherId === null ? "bg-gold/15 font-bold text-gold" : "text-slate-300 hover:bg-white/5"}`}>全部老師 <span className="ml-1 text-xs opacity-60">{published.length}</span></button>{teacherList.map((teacher) => <button key={teacher.id} onClick={() => { setTeacherId(teacher.id); setPublicSelected(null); }} className={`rounded-lg px-4 py-2 text-sm ${teacherId === teacher.id ? "bg-gold/15 font-bold text-gold" : "text-slate-300 hover:bg-white/5"}`}>{teacher.name} <span className="ml-1 text-xs opacity-60">{teacher.count}</span></button>)}</nav>
      <section className="space-y-4">{publicSelected ? <article className="glass-panel rounded-xl border border-white/10 p-5 sm:p-8"><button onClick={() => setPublicSelected(null)} className="mb-6 text-xs text-gold">← 返回日誌列表</button><p className="text-xs text-gold">{publicSelected.author_name} · 交易日期 {publicSelected.journal_date} · 更新 {new Date(publicSelected.updated_at ?? publicSelected.created_at).toLocaleString("zh-TW")}</p><h2 className="mb-3 mt-2 text-3xl font-bold text-white">{publicSelected.title}</h2><div className="mb-7 flex flex-wrap gap-2">{publicSelected.tags.map((tag) => <span key={tag} className="rounded-full bg-gold/10 px-2 py-1 text-xs text-gold">{tag}</span>)}</div><RichJournal key={`public-${publicSelected.id}-${publicSelected.updated_at}`} document={publicSelected.document ?? legacyDocument(publicSelected.blocks)} /></article> : visible.length ? visible.map((row) => <button key={row.id} onClick={() => setPublicSelected(row)} className="glass-panel block w-full rounded-xl border border-white/10 p-5 text-left transition hover:border-gold/40"><span className="text-xs text-gold">{row.author_name} · 交易日期 {row.journal_date}</span><h3 className="mt-2 text-xl font-bold text-white">{row.title}</h3><p className="mt-2 line-clamp-2 text-sm text-slate-400">{documentExcerpt(row.document, row.blocks)}</p></button>) : <div className="glass-panel rounded-xl border border-white/10 p-10 text-center text-sm text-slate-500">目前沒有已發布的老師日誌</div>}</section>
    </div>}
  </div></main>;
}
