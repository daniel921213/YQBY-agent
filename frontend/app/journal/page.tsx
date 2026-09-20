"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, ImagePlus, Plus, Send, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/nav/PageHeader";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { fetchMe, type Entitlement } from "@/lib/api";
import { deleteJournal, journalImageUrl, myJournals, newJournal, publicJournal, publicJournals, publishJournal, saveJournal, teachers, unpublishJournal, uploadJournalImage, type Block, type Journal, type Teacher } from "@/lib/journal-api";

function SecureImage({ id, alt }: { id: number; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true; let objectUrl = ""; journalImageUrl(id).then((value) => { objectUrl = value; if (active) setUrl(value); else URL.revokeObjectURL(value); }).catch(() => {}); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [id]);
  return url ? <img src={url} alt={alt} className="max-h-[700px] w-full rounded-lg border border-white/10 object-contain" /> : <div className="flex h-36 items-center justify-center rounded-lg border border-white/10 text-sm text-slate-500">載入圖片中…</div>;
}

function ReadBlocks({ blocks }: { blocks: Block[] }) {
  return <div className="space-y-4 text-slate-200">{blocks.map((block, index) => <div key={index} className="prose prose-invert max-w-none prose-p:text-slate-200 prose-li:text-slate-200">{block.type === "image" && block.image_id ? <SecureImage id={block.image_id} alt={block.text || "交易圖表"} /> : block.type === "heading" ? <h2 className="text-xl font-bold text-white">{block.text}</h2> : block.type === "bullet" ? <ul><li><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>{block.text}</ReactMarkdown></li></ul> : <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>{block.text || " "}</ReactMarkdown>}</div>)}</div>;
}

export default function JournalPage() { return <AuthGuard><JournalWorkspace /></AuthGuard>; }

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
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<Entitlement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const selectedId = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

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

  const persist = (id: number, nextTitle: string, nextDate: string, nextTags: string, nextBlocks: Block[]) => {
    const task = saveQueue.current.then(() => saveJournal(id, nextTitle, nextDate, nextTags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10), nextBlocks));
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
      persist(id, title, journalDate, tagsText, blocks).then((row) => {
        setMine((current) => current.map((item) => item.id === id ? row : item));
        if (selectedId.current === id && revision.current === savedRevision) setDirty(false);
      }).catch((err) => setError(err.message)).finally(() => setSaving(false));
    }, 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [selected?.id, title, journalDate, tagsText, blocks, dirty]);

  function selectMine(row: Journal) { selectedId.current = row.id; revision.current += 1; setSelected(row); setTitle(row.title); setJournalDate(row.journal_date); setTagsText(row.tags.join(", ")); setBlocks(row.blocks); setDirty(false); setError(""); }
  const touch = () => { revision.current += 1; setDirty(true); };
  const flush = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (selected && dirty) {
      const row = await persist(selected.id, title, journalDate, tagsText, blocks);
      setMine((current) => current.map((item) => item.id === row.id ? row : item));
      setDirty(false);
    }
    await saveQueue.current;
  };
  const create = async () => { try { await flush(); const row = await newJournal(); setMine((current) => [row, ...current]); selectMine(row); setView("mine"); } catch (err) { setError(err instanceof Error ? err.message : "新增失敗"); } };
  const updateBlock = (index: number, block: Block) => { setBlocks((current) => current.map((item, i) => i === index ? block : item)); touch(); };
  const addBlock = (type: Block["type"]) => { setBlocks((current) => [...current, { type, text: "" }]); touch(); };
  const moveBlock = (index: number, delta: number) => { const next = [...blocks]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setBlocks(next); touch(); };
  const upload = async (file?: File) => {
    if (!file || !selected) return;
    if (file.size > 5_000_000) { setError("圖片上限 5 MB"); return; }
    try { setBusy(true); const imageId = await uploadJournalImage(selected.id, file); setBlocks((current) => [...current, { type: "image", text: file.name, image_id: imageId }]); touch(); }
    catch (err) { setError(err instanceof Error ? err.message : "上傳失敗"); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  const publish = async () => { if (!selected) return; try { setBusy(true); await flush(); const row = await publishJournal(selected.id); setSelected(row); setMine((current) => current.map((item) => item.id === row.id ? row : item)); await refreshPublic(); } catch (err) { setError(err instanceof Error ? err.message : "發布失敗"); } finally { setBusy(false); } };
  const unpublish = async () => { if (!selected || !window.confirm("取消發布後，其他會員將無法查看這篇日誌。確定嗎？")) return; try { setBusy(true); const row = await unpublishJournal(selected.id); setSelected(row); setMine((current) => current.map((item) => item.id === row.id ? row : item)); await refreshPublic(); } catch (err) { setError(err instanceof Error ? err.message : "取消發布失敗"); } finally { setBusy(false); } };
  const remove = async () => { if (!selected || !window.confirm("確定刪除這篇日誌？")) return; try { if (saveTimer.current) window.clearTimeout(saveTimer.current); await saveQueue.current; await deleteJournal(selected.id); const remaining = mine.filter((item) => item.id !== selected.id); setMine(remaining); if (remaining[0]) selectMine(remaining[0]); else { selectedId.current = null; setSelected(null); } await refreshPublic(); } catch (err) { setError(err instanceof Error ? err.message : "刪除失敗"); } };
  const switchView = async (next: "mine" | "teachers") => { try { if (next === "teachers") await flush(); setView(next); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "儲存失敗"); } };

  const visible = published.filter((item) => teacherId === null || item.author_id === teacherId);

  return <main className="relative min-h-screen px-4 py-5 sm:px-6 lg:px-8"><SpaceParticleField /><div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-5"><PageHeader title="交易日誌" kicker="TRADING JOURNAL" />
    <div><h2 className="text-2xl font-bold text-white">交易日誌</h2><p className="mt-1 text-sm text-slate-400">記錄市場觀察與交易想法，閱讀老師已發布的日誌。</p></div>
    {error && <p role="alert" className="rounded-lg border border-short/30 bg-short/10 p-3 text-sm text-short">{error}</p>}
    <div className="flex gap-2 border-b border-white/10"><button onClick={() => switchView("mine")} className={`px-4 py-3 text-sm ${view === "mine" ? "border-b-2 border-gold font-bold text-gold" : "text-slate-400"}`}>我的日誌</button><button onClick={() => switchView("teachers")} className={`px-4 py-3 text-sm ${view === "teachers" ? "border-b-2 border-gold font-bold text-gold" : "text-slate-400"}`}>老師日誌</button></div>
    {view === "mine" ? <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]"><aside className="glass-panel h-fit rounded-xl border border-white/10 p-3"><button onClick={create} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2.5 text-sm font-bold text-slate-950"><Plus className="h-4 w-4" />新增日誌</button><div className="space-y-1">{mine.map((row) => <button key={row.id} onClick={async () => { try { await flush(); selectMine(row); } catch (err) { setError(err instanceof Error ? err.message : "儲存失敗"); } }} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.id === row.id ? "bg-gold/10 text-gold" : "text-slate-300 hover:bg-white/5"}`}><span className="block truncate">{row.title}</span><span className="text-[11px] text-slate-500">{row.is_published ? "已發布" : "私人"} · {new Date(row.updated_at ?? row.created_at).toLocaleDateString("zh-TW")}</span></button>)}</div></aside>
      <section className="glass-panel min-h-[500px] rounded-xl border border-white/10 p-4 sm:p-7">{selected ? <><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><span className="text-xs text-slate-400">{selected.is_published ? "已發布 · 編輯後需按發布更新" : "私人草稿"} · {saving ? "儲存中…" : dirty ? "尚未儲存" : "已儲存"}</span><div className="flex flex-wrap gap-2">{me?.plan === "lifetime" && <button disabled={busy} onClick={publish} className="inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{selected.is_published ? "發布更新" : "發布日誌"}</button>}{selected.is_published && <button disabled={busy} onClick={unpublish} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">取消發布</button>}<button onClick={remove} className="rounded-lg border border-short/30 px-3 py-2 text-xs text-short"><Trash2 className="h-4 w-4" /></button></div></div>
        <input aria-label="日誌標題" value={title} onChange={(event) => { setTitle(event.target.value); touch(); }} maxLength={200} placeholder="今天的交易日誌" className="my-6 w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-slate-600" />
        <div className="mb-6 flex flex-wrap gap-3 border-b border-white/10 pb-5"><label className="flex items-center gap-2 text-xs text-slate-400">日期<input type="date" value={journalDate} onChange={(event) => { if (event.target.value) { setJournalDate(event.target.value); touch(); } }} className="rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm text-white" /></label><label className="flex min-w-[220px] flex-1 items-center gap-2 text-xs text-slate-400">標籤<input value={tagsText} onChange={(event) => { setTagsText(event.target.value); touch(); }} placeholder="ICT, SMC, SP500" className="w-full rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm text-white" /></label></div>
        <button onClick={() => setPreview((current) => !current)} className="mb-5 rounded-lg border border-white/10 px-3 py-2 text-xs text-gold">{preview ? "返回編輯" : "預覽排版"}</button>
        <div className={preview ? "hidden" : "space-y-3"}>{blocks.map((block, index) => <div key={index} className="group flex gap-2"><div className="flex w-6 shrink-0 flex-col gap-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100"><button aria-label="上移區塊" onClick={() => moveBlock(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></button><button aria-label="下移區塊" onClick={() => moveBlock(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></button><button aria-label="刪除區塊" onClick={() => { setBlocks(blocks.filter((_, i) => i !== index)); touch(); }}><Trash2 className="h-3.5 w-3.5 text-short" /></button></div><div className="min-w-0 flex-1">{block.type === "image" && block.image_id ? <><SecureImage id={block.image_id} alt={block.text} /><input aria-label="圖片說明" value={block.text} onChange={(event) => updateBlock(index, { ...block, text: event.target.value })} className="mt-2 w-full bg-transparent text-xs text-slate-400 outline-none" /></> : <div className="flex gap-2"><select aria-label="區塊類型" value={block.type} onChange={(event) => updateBlock(index, { ...block, type: event.target.value as Block["type"] })} className="h-fit rounded-md border border-white/10 bg-graphite px-2 py-1 text-xs text-slate-400"><option value="paragraph">段落</option><option value="heading">標題</option><option value="bullet">條列</option></select><textarea value={block.text} onChange={(event) => updateBlock(index, { ...block, text: event.target.value })} rows={block.type === "heading" ? 1 : 3} placeholder={block.type === "heading" ? "小標題" : "輸入內容，支援 **粗體** 等 Markdown 語法"} className={`w-full resize-y rounded-md border border-white/10 bg-graphite/50 px-3 py-2 text-slate-100 outline-none focus:border-gold/50 ${block.type === "heading" ? "text-xl font-bold" : "text-sm leading-7"}`} /></div>}</div></div>)}</div>
        <div className={preview ? "hidden" : "mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5"}>{([ ["paragraph", "段落"], ["heading", "標題"], ["bullet", "條列"] ] as const).map(([type, label]) => <button key={type} onClick={() => addBlock(type)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-gold/40"><Plus className="h-3 w-3" />{label}</button>)}<button onClick={() => fileInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-gold/40"><ImagePlus className="h-3.5 w-3.5" />插入圖片</button><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => upload(event.target.files?.[0])} /></div>
        {preview && <ReadBlocks blocks={blocks} />}
      </> : <div className="flex h-96 flex-col items-center justify-center gap-3 text-slate-500"><BookOpen className="h-8 w-8" /><p>新增一篇日誌，開始記錄交易想法。</p></div>}</section></div> : <div className="space-y-4">
      <nav aria-label="老師日誌分頁" className="glass-panel flex flex-wrap gap-2 rounded-xl border border-white/10 p-3">
        <button onClick={() => { setTeacherId(null); setPublicSelected(null); }} className={`rounded-lg px-4 py-2 text-sm ${teacherId === null ? "bg-gold/15 font-bold text-gold" : "text-slate-300 hover:bg-white/5"}`}>全部老師 <span className="ml-1 text-xs opacity-60">{published.length}</span></button>
        {teacherList.map((teacher) => <button key={teacher.id} onClick={() => { setTeacherId(teacher.id); setPublicSelected(null); }} className={`rounded-lg px-4 py-2 text-sm ${teacherId === teacher.id ? "bg-gold/15 font-bold text-gold" : "text-slate-300 hover:bg-white/5"}`}>{teacher.name}老師 <span className="ml-1 text-xs opacity-60">{teacher.count}</span></button>)}
      </nav>
      <section className="space-y-4">{publicSelected ? <article className="glass-panel rounded-xl border border-white/10 p-5 sm:p-8">
        <button onClick={() => setPublicSelected(null)} className="mb-6 text-xs text-gold">← 返回日誌列表</button>
        <p className="text-xs text-gold">{publicSelected.author_name}老師 · 交易日期 {publicSelected.journal_date} · 更新 {new Date(publicSelected.updated_at ?? publicSelected.created_at).toLocaleString("zh-TW")}</p>
        <h2 className="mb-3 mt-2 text-3xl font-bold text-white">{publicSelected.title}</h2>
        <div className="mb-7 flex flex-wrap gap-2">{publicSelected.tags.map((tag) => <span key={tag} className="rounded-full bg-gold/10 px-2 py-1 text-xs text-gold">{tag}</span>)}</div>
        <ReadBlocks blocks={publicSelected.blocks} />
      </article> : visible.length ? visible.map((row) => <button key={row.id} onClick={() => setPublicSelected(row)} className="glass-panel block w-full rounded-xl border border-white/10 p-5 text-left transition hover:border-gold/40"><span className="text-xs text-gold">{row.author_name}老師 · 交易日期 {row.journal_date}</span><h3 className="mt-2 text-xl font-bold text-white">{row.title}</h3><p className="mt-2 line-clamp-2 text-sm text-slate-400">{row.blocks.find((block) => block.type !== "image")?.text || "點擊閱讀交易日誌"}</p></button>) : <div className="glass-panel rounded-xl border border-white/10 p-10 text-center text-sm text-slate-500">目前沒有已發布的老師日誌</div>}</section></div>}
  </div></main>;
}
