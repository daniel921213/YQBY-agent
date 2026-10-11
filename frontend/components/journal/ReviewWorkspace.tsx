"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronRight, Clock3, FileText, Inbox, Loader2, MessageSquare, PenLine, Save, Search, Send, Trash2 } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { getReview, listReviews, reviewError, reviewImageUrl, saveFeedback, startReview, uploadReviewImage, type Review, type ReviewComment, type ReviewStatus, type ReviewSummary } from "@/lib/review-api";
import { RichJournal, emptyDocument } from "./RichJournal";
import { JournalReader } from "./JournalReader";
import { JournalMediaContext } from "./JournalMediaContext";
import { ReviewDialog } from "./ReviewDialog";
import s from "./reviews.module.css";

const labels: Record<ReviewStatus, string> = { pending: "待批改", reviewing: "批改中", returned: "已回覆" };
const dateLabel = (value: string) => new Date(value).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const Icon = status === "returned" ? CheckCircle2 : status === "reviewing" ? PenLine : Clock3;
  return <span className={s.badge} data-status={status}><Icon size={12} />{labels[status]}</span>;
}

export function ReviewWorkspace({ inbox, initialId, onRevise, onDirty }: { inbox: boolean; initialId?: number; onRevise: (id: number) => void; onDirty: (dirty: boolean) => void }) {
  const [rows, setRows] = useState<ReviewSummary[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ReviewStatus>("all");
  const dirty = useRef(false);
  const request = useRef(0);
  const changed = (value: boolean) => { dirty.current = value; onDirty(value); };
  const leave = () => !dirty.current || window.confirm("批改內容尚未儲存，確定離開？");
  const open = async (id: number) => {
    if (!leave()) return;
    const token = ++request.current;
    setOpening(id); setError("");
    try {
      let row = await getReview(id);
      if (row.can_edit && row.status === "pending") row = await startReview(id);
      if (request.current === token) { setSelected(row); changed(false); }
    } catch (err) { if (request.current === token) setError(reviewError(err)); }
    finally { if (request.current === token) setOpening(null); }
  };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    listReviews(inbox).then(data => { if (alive) setRows(data); }).catch(err => { if (alive) setError(reviewError(err)); }).finally(() => { if (alive) setLoading(false); });
    if (initialId) void open(initialId);
    return () => { alive = false; request.current += 1; onDirty(false); };
    // Mounted separately for each mailbox / notification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const check = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", check);
    return () => window.removeEventListener("beforeunload", check);
  }, []);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await listReviews(inbox);
        if (alive) setRows(data);
        // Never replace a teacher's editor while they are writing a draft.
        if (selected?.is_student && selected.status !== "returned") {
          const row = await getReview(selected.id);
          if (alive) setSelected(current => current?.id === row.id ? row : current);
        }
      } catch (err) { if (alive) setError(reviewError(err)); }
    };
    const timer = window.setInterval(() => void refresh(), 20000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [inbox, selected?.id, selected?.is_student, selected?.status]);
  const visible = rows.filter(row => (filter === "all" || row.status === filter) && `${row.title} ${row.student_name} ${row.student_uid} ${row.teacher_name} ${row.created_at}`.toLowerCase().includes(query.toLowerCase()));
  if (selected) return <div>{error && <p className={s.error} role="alert">{error}</p>}<ReviewDetail key={selected.is_student ? `${selected.id}-${selected.version}` : selected.id} review={selected} onDirty={changed} onSaved={row => { setSelected(row); setRows(current => current.map(item => item.id === row.id ? row : item)); }} onBack={() => { if (leave()) { setSelected(null); changed(false); void listReviews(inbox).then(setRows).catch(err => setError(reviewError(err))); } }} onPrevious={id => void open(id)} onRevise={id => { if (leave()) { changed(false); onRevise(id); } }} /></div>;
  return <section className={s.surface}>
    <header className={s.heading}><div><p className={s.eyebrow}>{inbox ? "MENTOR DESK" : "REVIEW JOURNEY"}</p><h2 className={s.title}>{inbox ? "每一份覆盤，都值得被看見。" : "從紀錄，到下一次進步。"}</h2><p className={`${s.muted} mt-2`}>{inbox ? "集中處理學生送交的日誌，留下具體、可執行的回饋。" : "追蹤日誌送交進度，回看每一輪老師的建議。"}</p></div><span className="flex items-center gap-2 text-xs text-slate-500"><Inbox size={17} />{rows.length} 份紀錄</span></header>
    <div className={s.toolbar}><div className={s.filters}>{(["all", "pending", "reviewing", "returned"] as const).map(key => <button key={key} className={s.filter} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === "all" ? "全部" : labels[key]} <span className="ml-1 opacity-50">{rows.filter(r => key === "all" || r.status === key).length}</span></button>)}</div><label className={s.search}><Search size={16} /><input aria-label="搜尋作業" placeholder={inbox ? "搜尋學生、UID 或日誌…" : "搜尋老師或日誌…"} value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    {error && <div role="alert" className={`${s.error} mx-5`}>{error}</div>}
    {loading ? <div className={s.empty}><Loader2 className="animate-spin" size={22} /><p>正在整理作業紀錄…</p></div> : visible.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{inbox ? "學生" : "批改老師"}</th><th>交易日誌</th><th>送交時間</th><th>進度</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><span className={s.name}>{inbox ? row.student_name : row.teacher_name}</span>{inbox && <span className={s.meta}>UID {row.student_uid}</span>}</td><td><span className="block max-w-[260px] truncate font-medium">{row.title}</span><span className={s.meta}>第 {row.round_number} 輪覆盤</span></td><td className="whitespace-nowrap text-xs !text-slate-400">{dateLabel(row.created_at)}</td><td><ReviewBadge status={row.status} /></td><td><button className={s.quiet} disabled={opening !== null} onClick={() => void open(row.id)}>{opening === row.id ? <Loader2 className="animate-spin" size={15} /> : <>{inbox && row.status !== "returned" ? row.status === "pending" ? "開始批改" : "繼續批改" : "查看"}<ArrowUpRight size={15} /></>}</button></td></tr>)}</tbody></table></div> : <div className={s.empty}><span className={s.emptyIcon}><FileText size={25} /></span><p className="text-base font-medium text-slate-300">{rows.length ? "沒有符合條件的紀錄" : inbox ? "目前沒有學生作業" : "你的第一輪回饋，從一篇日誌開始"}</p><p className="max-w-sm text-sm leading-7">{rows.length ? "試試其他關鍵字或進度篩選。" : inbox ? "學生送交日誌後，會在這裡依時間排列，並通知你。" : "回到「我的日誌」，完成內容後按「送交批改」。"}</p></div>}
  </section>;
}

function ReviewDetail({ review, onBack, onSaved, onPrevious, onRevise, onDirty }: { review: Review; onBack: () => void; onSaved: (r: Review) => void; onPrevious: (id: number) => void; onRevise: (id: number) => void; onDirty: (v: boolean) => void }) {
  const [feedback, setFeedback] = useState<JSONContent>(review.feedback ?? emptyDocument);
  const [comments, setComments] = useState<ReviewComment[]>(review.comments);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [mobile, setMobile] = useState<"source" | "feedback">("source");
  const media = useMemo(() => ({ imageUrl: (id: number, signal?: AbortSignal) => reviewImageUrl(review.id, id, signal), upload: (file: File) => uploadReviewImage(review.id, file) }), [review.id]);
  const touch = () => { setDirty(true); onDirty(true); setNotice(""); };
  const nodes = review.snapshot.document?.content ?? [];
  const chooseAnchor = (value: string) => { if (commentText.trim() && !window.confirm("尚有未加入的評論，確定切換段落？")) return; setAnchor(value); setCommentText(""); setMobile("feedback"); };
  const addComment = () => {
    if (anchor === null || !commentText.trim()) return;
    setComments(current => [...current, { anchor, text: commentText.trim() }]); setCommentText(""); setAnchor(null); touch();
  };
  const save = async (publish: boolean) => {
    if (busy) return;
    if (uploading) { setError("圖片仍在上傳，請完成後再儲存或送出。"); setConfirm(false); return; }
    if (commentText.trim()) { setError("請先按「加入評論」，或清空尚未加入的評論文字。"); setConfirm(false); return; }
    setBusy(true); setError(""); setNotice("");
    try { const row = await saveFeedback(review.id, review.version, feedback, comments, publish); onSaved(row); setDirty(false); onDirty(false); setNotice(publish ? "回饋已送出，學生已可查看。" : "批改草稿已儲存，學生尚未看到。 "); setConfirm(false); }
    catch (err) { setError(reviewError(err)); setConfirm(false); }
    finally { setBusy(false); }
  };
  return <JournalMediaContext.Provider value={media}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><button disabled={busy} onClick={onBack} className={s.quiet}><ArrowLeft size={16} />返回作業列表</button><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-slate-500">第 {review.round_number} 輪</span><ReviewBadge status={review.status} />{review.previous_id && <button disabled={busy} className={s.quiet} onClick={() => onPrevious(review.previous_id!)}>上一輪回饋<ChevronRight size={14} /></button>}</div></div>
    {error && <div className={s.error} role="alert">{error}</div>}{notice && <div className={s.notice} role="status">{notice}</div>}
    <div className={s.mobileTabs}><button className={mobile === "source" ? s.primary : s.secondary} onClick={() => setMobile("source")}>日誌內容</button><button className={mobile === "feedback" ? s.primary : s.secondary} onClick={() => setMobile("feedback")}>批改回饋{comments.length > 0 && ` · ${comments.length}`}</button></div>
    <div className={s.detailGrid}>
      <article className={`${s.surface} ${s.paper} ${mobile !== "source" ? s.mobileHidden : ""}`}><header className={s.paperHeader}><p className={s.eyebrow}>SUBMITTED JOURNAL</p><h2 className={`${s.title} break-words`}>{review.title}</h2><p className={`${s.muted} mt-3`}>{review.student_name} <span className="mx-2 text-slate-600">/</span> {review.snapshot.journal_date}</p><p className={s.meta}>送交 {dateLabel(review.created_at)} · 本輪內容已保留</p></header>{review.question && <div className={s.question}><p className="mb-1 text-xs text-gold/70">想請教的問題</p>{review.question}</div>}
        {nodes.map((node, index) => <div key={index} id={`review-block-${index}`} className={s.block} data-active={anchor === String(index)}><JournalReader document={{ type: "doc", content: [node] }} />{review.can_edit && ["paragraph", "heading", "journalImage", "bulletList", "orderedList", "blockquote", "codeBlock"].includes(node.type ?? "") && <div className={s.annotate}><button disabled={busy} onClick={() => chooseAnchor(String(index))} className={s.quiet}><MessageSquare size={13} /><span className="text-xs">{node.type === "journalImage" ? "評論這張圖片" : "評論這段"}</span></button></div>}{comments.filter(c => c.anchor === String(index)).length > 0 && <span className={s.meta}>{comments.filter(c => c.anchor === String(index)).length} 則評論</span>}</div>)}
      </article>
      <aside className={`${s.surface} ${s.paper} ${mobile !== "feedback" ? s.mobileHidden : ""}`}><header className={s.paperHeader}><p className={s.eyebrow}>MENTOR FEEDBACK</p><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">{review.teacher_name} 的回饋</h2><MessageSquare size={18} className="text-gold/60" /></div><p className={`${s.muted} mt-2`}>{review.can_edit ? "把觀察化為具體建議，協助學生找到下一步。" : review.status === "returned" ? `完成於 ${dateLabel(review.returned_at!)}` : "老師送出回饋後，會在這裡呈現並通知你。"}</p></header>
        {review.can_edit && anchor !== null && <div className={s.comment}><p className={s.commentLabel}>正在評論第 {Number(anchor) + 1} 個內容區塊</p><textarea aria-label="段落評論" className={s.input} rows={4} maxLength={5000} value={commentText} disabled={busy} placeholder="說明你觀察到的問題，以及可以怎麼調整…" onChange={e => { setCommentText(e.target.value); touch(); }} /><div className="mt-3 flex justify-end gap-2"><button disabled={busy} className={s.quiet} onClick={() => { setAnchor(null); setCommentText(""); }}>取消</button><button disabled={busy || !commentText.trim()} className={s.secondary} onClick={addComment}><Check size={14} />加入評論</button></div></div>}
        {comments.length > 0 && <section className="mb-6"><h3 className="text-xs tracking-wider text-slate-500">段落與圖片評論 · {comments.length}</h3>{comments.map((comment, index) => <div className={s.comment} key={`${index}-${comment.anchor}`}><div className={s.commentLabel}><button onClick={() => { setMobile("source"); setAnchor(comment.anchor); window.setTimeout(() => document.getElementById(`review-block-${comment.anchor}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 20); }}>第 {Number(comment.anchor) + 1} 個內容區塊 ↗</button>{review.can_edit && <button disabled={busy} aria-label="刪除此則評論" onClick={() => { setComments(current => current.filter((_, i) => i !== index)); touch(); }}><Trash2 size={13} /></button>}</div><p className={s.commentText}>{comment.text}</p></div>)}</section>}
        {(review.can_edit || review.status === "returned") && <section className={s.feedback}><h3 className="mb-4 text-sm font-medium text-slate-200">整體建議</h3>{review.can_edit && !review.feedback && !dirty && <button className={`${s.quiet} mb-3 !text-xs`} onClick={() => { setEditorRevision(v => v + 1); setFeedback({ type: "doc", content: ["做得好的地方", "需要改善", "下次練習"].flatMap(text => [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }] }, { type: "paragraph" }]) }); touch(); }}>使用回饋提綱</button>}<div className={busy ? "pointer-events-none opacity-70" : ""}><RichJournal key={`${review.id}-${editorRevision}`} document={feedback} editable={review.can_edit} disabled={busy} onUploading={setUploading} onChange={next => { setFeedback(next); touch(); }} onError={setError} /></div></section>}
        {review.can_edit ? <div className={s.savebar}><span className="text-xs text-slate-500">{uploading ? "圖片上傳中…" : busy ? "處理中…" : dirty ? "有尚未儲存的變更" : review.feedback ? "草稿已儲存" : "回饋草稿"}</span><div className="flex gap-2"><button disabled={busy || uploading} className={s.secondary} onClick={() => void save(false)}><Save size={14} />儲存草稿</button><button disabled={busy || uploading} className={s.primary} onClick={() => setConfirm(true)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}送出回饋</button></div></div> : review.status === "returned" && !review.can_edit && <div className={s.savebar}><span className={s.muted}>保留這次回饋，帶進下一輪覆盤。</span>{review.is_student && review.journal_id && <button className={s.secondary} onClick={() => onRevise(review.journal_id!)}><PenLine size={14} />回到原日誌修訂</button>}</div>}
      </aside>
    </div>
    {confirm && <ReviewDialog label="確認送出批改回饋" onClose={() => { if (!busy) setConfirm(false); }}><p className={s.eyebrow}>READY TO SEND</p><h2 className={s.title}>把這份回饋交給學生。</h2><p className={`${s.muted} mt-4`}>送出後，{review.student_name} 會收到通知，並看到本輪評論與建議。這一輪將完成並保留，後續修訂會另開新一輪。</p><div className={s.footer}><button disabled={busy} className={s.secondary} onClick={() => setConfirm(false)}>再檢查一下</button><button disabled={busy} className={s.primary} onClick={() => void save(true)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}確認送出</button></div></ReviewDialog>}
  </JournalMediaContext.Provider>;
}
