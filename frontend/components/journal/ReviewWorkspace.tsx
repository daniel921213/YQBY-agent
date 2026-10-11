"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronRight, Clock3, FileText, Inbox, Loader2, PenLine, Quote, Save, Search, Send, Trash2 } from "lucide-react";
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
  if (selected) return <div>{error && <p className={s.error} role="alert">{error}</p>}<ReviewDetail key={selected.id} review={selected} onDirty={changed} onSaved={row => { setSelected(row); setRows(current => current.map(item => item.id === row.id ? row : item)); }} onBack={() => { if (leave()) { setSelected(null); changed(false); void listReviews(inbox).then(setRows).catch(err => setError(reviewError(err))); } }} onPrevious={id => void open(id)} onRevise={id => { if (leave()) { changed(false); onRevise(id); } }} /></div>;
  return <section className={s.surface}>
    <header className={s.heading}><div><p className={s.eyebrow}>{inbox ? "MENTOR DESK" : "REVIEW JOURNEY"}</p><h2 className={s.title}>{inbox ? "每一份覆盤，都值得被看見。" : "從紀錄，到下一次進步。"}</h2><p className={`${s.muted} mt-2`}>{inbox ? "集中處理學生送交的日誌，留下具體、可執行的回饋。" : "追蹤日誌送交進度，回看每一輪老師的建議。"}</p></div><span className="flex items-center gap-2 text-xs text-slate-500"><Inbox size={17} />{rows.length} 份紀錄</span></header>
    <div className={s.toolbar}><div className={s.filters}>{(["all", "pending", "reviewing", "returned"] as const).map(key => <button key={key} className={s.filter} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === "all" ? "全部" : labels[key]} <span className="ml-1 opacity-50">{rows.filter(r => key === "all" || r.status === key).length}</span></button>)}</div><label className={s.search}><Search size={16} /><input aria-label="搜尋作業" placeholder={inbox ? "搜尋學生、UID 或日誌…" : "搜尋老師或日誌…"} value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    {error && <div role="alert" className={`${s.error} mx-5`}>{error}</div>}
    {loading ? <div className={s.empty}><Loader2 className="animate-spin" size={22} /><p>正在整理作業紀錄…</p></div> : visible.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{inbox ? "學生" : "批改老師"}</th><th>交易日誌</th><th>送交時間</th><th>進度</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><span className={s.name}>{inbox ? row.student_name : row.teacher_name}</span>{inbox && <span className={s.meta}>UID {row.student_uid}</span>}</td><td><span className="block max-w-[260px] truncate font-medium">{row.title}</span><span className={s.meta}>第 {row.round_number} 輪覆盤</span></td><td className="whitespace-nowrap text-xs !text-slate-400">{dateLabel(row.created_at)}</td><td><ReviewBadge status={row.status} /></td><td><button className={s.quiet} disabled={opening !== null} onClick={() => void open(row.id)}>{opening === row.id ? <Loader2 className="animate-spin" size={15} /> : <>{inbox && row.status !== "returned" ? row.status === "pending" ? "開始批改" : "繼續批改" : "查看"}<ArrowUpRight size={15} /></>}</button></td></tr>)}</tbody></table></div> : <div className={s.empty}><span className={s.emptyIcon}><FileText size={25} /></span><p className="text-base font-medium text-slate-300">{rows.length ? "沒有符合條件的紀錄" : inbox ? "目前沒有學生作業" : "你的第一輪回饋，從一篇日誌開始"}</p><p className="max-w-sm text-sm leading-7">{rows.length ? "試試其他關鍵字或進度篩選。" : inbox ? "學生送交日誌後，會在這裡依時間排列，並通知你。" : "回到「我的日誌」，完成內容後按「送交批改」。"}</p></div>}
  </section>;
}

function ReviewDetail({ review, onBack, onSaved, onPrevious, onRevise, onDirty }: { review: Review; onBack: () => void; onSaved: (r: Review) => void; onPrevious: (id: number) => void; onRevise: (id: number) => void; onDirty: (v: boolean) => void }) {
  type Page = "source" | "feedback";
  const [feedback, setFeedback] = useState<JSONContent>(review.feedback ?? emptyDocument);
  const [comments, setComments] = useState<ReviewComment[]>(review.comments);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [page, setPage] = useState<Page>(review.can_edit || review.status === "returned" ? "feedback" : "source");
  const [quote, setQuote] = useState("");
  const [appendContent, setAppendContent] = useState<{ id: number; content: JSONContent[] }>();
  const appendId = useRef(0);
  const source = useRef<HTMLDivElement>(null);
  const toolbarAnchor = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Partial<Record<Page, number>>>({});
  const restoreScroll = useRef(false);
  const media = useMemo(() => ({ imageUrl: (id: number, signal?: AbortSignal) => reviewImageUrl(review.id, id, signal), upload: (file: File) => uploadReviewImage(review.id, file) }), [review.id]);
  useEffect(() => {
    if (!review.is_student) return;
    setFeedback(review.feedback ?? emptyDocument);
    setComments(review.comments);
  }, [review.is_student, review.feedback, review.comments]);
  const touch = () => { setDirty(true); onDirty(true); setNotice(""); };
  const changePage = (next: Page) => {
    if (next === page) return;
    scrollPositions.current[page] = window.scrollY;
    restoreScroll.current = true;
    setPage(next);
  };
  useLayoutEffect(() => {
    if (!restoreScroll.current) return;
    restoreScroll.current = false;
    const top = toolbarAnchor.current ? toolbarAnchor.current.getBoundingClientRect().top + window.scrollY - 90 : 0;
    window.scrollTo({ top: scrollPositions.current[page] ?? Math.max(0, top), behavior: "auto" });
  }, [page]);
  useEffect(() => {
    if (!review.can_edit || page !== "source") { setQuote(""); return; }
    const selectedText = () => {
      const selection = window.getSelection();
      if (!selection || !source.current?.contains(selection.anchorNode) || !source.current.contains(selection.focusNode)) { setQuote(""); return; }
      setQuote(selection.toString().trim());
    };
    document.addEventListener("selectionchange", selectedText);
    return () => document.removeEventListener("selectionchange", selectedText);
  }, [page, review.can_edit]);
  const append = (content: JSONContent[]) => {
    setAppendContent({ id: ++appendId.current, content });
    touch();
  };
  const quoteSelection = () => {
    if (!quote || busy || uploading) return;
    if (quote.length > 8000) { setError("一次最多引用 8,000 字，請縮小選取範圍。"); return; }
    append([
      { type: "blockquote", content: quote.split(/\r?\n/).filter(line => line.trim()).map(text => ({ type: "paragraph", content: [{ type: "text", text }] })) },
      { type: "paragraph" }
    ]);
    changePage("feedback");
    setQuote("");
    window.getSelection()?.removeAllRanges();
    setNotice("已將原文加入批改頁末尾，可接著寫下建議。");
  };
  const originalExcerpt = (anchor: string) => {
    let node: JSONContent | undefined = review.snapshot.document ?? undefined;
    for (const part of anchor.split(".")) node = node?.content?.[Number(part)];
    if (!node) return "對應原稿內容";
    if (node.type === "journalImage") return "學生原稿圖片";
    const text = (value: JSONContent): string => value.text ?? (value.content ?? []).map(text).join(" ");
    const excerpt = text(node).trim();
    return excerpt.length > 240 ? `${excerpt.slice(0, 240)}…` : excerpt || "學生原稿段落";
  };
  const save = async (publish: boolean) => {
    if (busy) return;
    if (uploading) { setError("圖片仍在上傳，請完成後再儲存或送出。"); setConfirm(false); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const row = await saveFeedback(review.id, review.version, feedback, comments, publish);
      onSaved(row); setDirty(false); onDirty(false);
      setNotice(publish ? "回饋已送出，學生已可查看。" : "批改草稿已儲存，學生尚未看到。");
      setConfirm(false);
    } catch (err) { setError(reviewError(err)); setConfirm(false); }
    finally { setBusy(false); }
  };
  const tabId = (tab: Page) => `review-${review.id}-${tab}-tab`;
  const panelId = (tab: Page) => `review-${review.id}-${tab}-page`;

  return <JournalMediaContext.Provider value={media}>
    <div className={s.reviewDocument}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button disabled={busy || uploading} onClick={onBack} className={s.quiet}><ArrowLeft size={16} />返回作業列表</button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">第 {review.round_number} 輪</span><ReviewBadge status={review.status} />
          {review.previous_id && <button disabled={busy || uploading} className={s.quiet} onClick={() => onPrevious(review.previous_id!)}>上一輪回饋<ChevronRight size={14} /></button>}
        </div>
      </div>

      <div ref={toolbarAnchor} />
      <div className={s.documentToolbar}>
        <div className={s.documentToolbarRow}>
          <div className={s.documentTabs} role="tablist" aria-label="作業與批改頁面">
            {(["source", "feedback"] as const).map(tab => <button
              key={tab} id={tabId(tab)} role="tab" aria-selected={page === tab} aria-controls={panelId(tab)}
              tabIndex={page === tab ? 0 : -1} className={s.documentTab} onClick={() => changePage(tab)}
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "source" : event.key === "End" ? "feedback" : tab === "source" ? "feedback" : "source";
                changePage(next); document.getElementById(tabId(next))?.focus({ preventScroll: true });
              }}>
              {tab === "source" ? <FileText size={16} /> : <PenLine size={16} />}{tab === "source" ? "學生日誌" : "老師批改"}
            </button>)}
          </div>
          {review.can_edit ? <div className={s.documentActions}>
            <span className={s.draftStatus}>{uploading ? "圖片上傳中…" : busy ? "處理中…" : dirty ? "尚未儲存" : review.feedback ? "草稿已儲存" : "私人草稿"}</span>
            <button disabled={busy || uploading} className={s.secondary} onClick={() => void save(false)}><Save size={14} />儲存草稿</button>
            <button disabled={busy || uploading} className={s.primary} onClick={() => setConfirm(true)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}送出回饋</button>
          </div> : review.is_student && review.status === "returned" && review.journal_id ? <button className={s.secondary} onClick={() => onRevise(review.journal_id!)}><PenLine size={14} />回到原日誌修訂</button> : null}
        </div>
        {review.can_edit && page === "source" && <div className={s.quoteTools}>
          <span>選取原文，可引用到老師批改頁。</span>
          <button disabled={!quote || busy || uploading} className={s.quiet} onMouseDown={event => event.preventDefault()} onClick={quoteSelection}><Quote size={14} />引用選取文字{quote && <span className={s.quoteCount}>{quote.length} 字</span>}</button>
        </div>}
        {error && <div className={s.documentError} role="alert">{error}</div>}
        {notice && <div className={s.documentNotice} role="status">{notice}</div>}
      </div>

      {/* Keep both pages mounted: preserve editor history, uploads and image aspect ratios. */}
      <section id={panelId("source")} role="tabpanel" aria-labelledby={tabId("source")} hidden={page !== "source"} tabIndex={0} className={`${s.surface} ${s.documentPage}`}>
        <header className={s.paperHeader}>
          <p className={s.eyebrow}>SUBMITTED JOURNAL</p>
          <h2 className={`${s.title} break-words`}>{review.title}</h2>
          <p className={`${s.muted} mt-3`}>{review.student_name}<span className="mx-2 text-slate-600">/</span>{review.snapshot.journal_date}</p>
          <p className={s.meta}>送交 {dateLabel(review.created_at)} · 本輪內容已保留</p>
          {review.snapshot.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{review.snapshot.tags.map(tag => <span key={tag} className="rounded-full bg-gold/10 px-2.5 py-1 text-xs text-gold">{tag}</span>)}</div>}
        </header>
        {review.question && <div className={s.question}><p className="mb-1 text-xs text-gold/70">想請教的問題</p>{review.question}</div>}
        <div ref={source}><JournalReader document={review.snapshot.document ?? emptyDocument} /></div>
      </section>

      <section id={panelId("feedback")} role="tabpanel" aria-labelledby={tabId("feedback")} hidden={page !== "feedback"} tabIndex={0} className={`${s.surface} ${s.documentPage}`}>
        <header className={s.paperHeader}>
          <p className={s.eyebrow}>MENTOR FEEDBACK</p>
          <h2 className={s.title}>{review.teacher_name} 的批改</h2>
          <p className={`${s.muted} mt-3`}>{review.title}<span className="mx-2 text-slate-600">/</span>{review.student_name}</p>
          <p className={`${s.muted} mt-2`}>{review.can_edit ? "在這裡完整寫下觀察與建議，也可以直接貼上截圖。" : review.status === "returned" ? `完成於 ${dateLabel(review.returned_at!)}` : "老師送出回饋後，會在這裡呈現並通知你。"}</p>
        </header>
        {(review.can_edit || review.status === "returned") && <div className={s.feedback}>
          {review.can_edit && !review.feedback && !dirty && <button disabled={busy || uploading} className={`${s.quiet} mb-4 !text-xs`} onClick={() => append(["做得好的地方", "需要改善", "下次練習"].flatMap(text => [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }] }, { type: "paragraph" }]))}>使用回饋提綱</button>}
          <div className={busy ? "pointer-events-none opacity-70" : ""}>
            <RichJournal document={feedback} editable={review.can_edit} disabled={busy} appendContent={appendContent}
              onUploading={value => { setUploading(value); if (value) touch(); }}
              onChange={next => { setFeedback(next); touch(); }} onError={setError} />
          </div>
        </div>}
        {comments.length > 0 && <section className={s.legacyComments} aria-label="先前的段落評語">
          <h3 className="text-sm font-medium text-slate-300">先前的段落評語 <span className="ml-2 text-xs text-slate-500">{comments.length}</span></h3>
          {comments.map((comment, index) => <div className={s.legacyComment} key={`${index}-${comment.anchor}`}>
            <blockquote className={s.originalExcerpt}>{originalExcerpt(comment.anchor)}</blockquote>
            <p className={s.commentText}>{comment.text}</p>
            {review.can_edit && <button disabled={busy} className={`${s.quiet} mt-2 !text-xs`} aria-label={`移除第 ${index + 1} 則舊評語`} onClick={() => { setComments(current => current.filter((_, i) => i !== index)); touch(); }}><Trash2 size={12} />移除此評語</button>}
          </div>)}
        </section>}
      </section>
    </div>
    {confirm && <ReviewDialog label="確認送出批改回饋" onClose={() => { if (!busy) setConfirm(false); }}>
      <p className={s.eyebrow}>READY TO SEND</p><h2 className={s.title}>把這份回饋交給學生。</h2>
      <p className={`${s.muted} mt-4`}>送出後，{review.student_name} 會收到通知，並看到本輪評論與建議。這一輪將完成並保留，後續修訂會另開新一輪。</p>
      <div className={s.footer}><button disabled={busy} className={s.secondary} onClick={() => setConfirm(false)}>再檢查一下</button><button disabled={busy} className={s.primary} onClick={() => void save(true)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}確認送出</button></div>
    </ReviewDialog>}
  </JournalMediaContext.Provider>;
}
