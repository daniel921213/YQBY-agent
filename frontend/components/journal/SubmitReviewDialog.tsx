"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, FileText, Loader2, X } from "lucide-react";
import { submitReview, reviewError, reviewMeta, type ReviewMeta } from "@/lib/review-api";
import { ReviewDialog } from "./ReviewDialog";
import s from "./reviews.module.css";

export function SubmitReviewDialog({ journalId, title, meta, flush, onClose, onSubmitted }: {
  journalId: number; title: string; meta: ReviewMeta; flush: () => Promise<void>; onClose: () => void; onSubmitted: (id: number) => void;
}) {
  const [teacher, setTeacher] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [currentMeta, setCurrentMeta] = useState(meta);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      setLoading(true); setLoadFailed(false);
      try {
        const latest = await reviewMeta();
        if (alive) {
          setCurrentMeta(latest);
          setTeacher(value => latest.teachers.some(t => String(t.id) === value) ? value : "");
        }
      } catch { if (alive) setLoadFailed(true); }
      finally { if (alive) setLoading(false); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); };
  }, [attempt]);
  const submit = async () => {
    if (!teacher || busy || loading || loadFailed) return;
    setBusy(true); setError("");
    try { await flush(); const row = await submitReview(journalId, Number(teacher), question, key); onSubmitted(row.id); }
    catch (err) { setError(reviewError(err)); }
    finally { setBusy(false); }
  };
  return <ReviewDialog label="送交日誌批改" onClose={() => { if (!busy) onClose(); }}>
    <div className={s.modalTop}><div><p className={s.eyebrow}>JOURNAL REVIEW</p><h2 className={s.title}>讓每次覆盤，都有回饋。</h2></div><button className={s.quiet} aria-label="關閉送交視窗" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    <p className={`${s.muted} mt-3`}>選擇一位老師，分享這次交易的判斷與疑問。</p>
    <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-4"><FileText className="shrink-0 text-gold/70" size={19} /><div className="min-w-0"><span className={s.meta}>本次送交日誌</span><p className="truncate text-sm text-slate-100">{title || "未命名日誌"}</p></div></div>
    {error && <div className={`${s.error} mt-4`} role="alert">{error}</div>}
    <label className={s.field}>批改老師<select className={s.input} value={teacher} onChange={(e) => setTeacher(e.target.value)} disabled={busy || loading || loadFailed}><option value="">{loading ? "正在更新老師名單…" : "請選擇老師"}</option>{currentMeta.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    {loadFailed && <p role="alert" className={`${s.muted} mt-2`}>老師名單載入失敗。<button className={s.quiet} onClick={() => setAttempt(value => value + 1)}>重新載入</button></p>}
    {!loading && !loadFailed && !currentMeta.teachers.length && <p className={`${s.muted} mt-2`}>目前沒有可接收作業的老師，請稍後再試。</p>}
    <label className={s.field}>這次最想請教什麼？ <span className="text-slate-600">選填</span><textarea className={s.input} rows={4} maxLength={4000} placeholder="例如：我是否太早進場？止損位置可以怎麼調整？" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} /></label>
    <p className={`${s.muted} mt-4 text-xs`}>僅你與指定老師可查看。送交後會保留本次內容，後續修改不會覆蓋這一版。</p>
    <div className={s.footer}><button disabled={busy} className={s.secondary} onClick={onClose}>繼續編輯</button><button disabled={busy || !teacher || loading || loadFailed} onClick={submit} className={s.primary}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={16} />}{busy ? "正在送交…" : "確認送交"}</button></div>
  </ReviewDialog>;
}
