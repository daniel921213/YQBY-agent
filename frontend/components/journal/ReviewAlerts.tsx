"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, MessageSquare, X } from "lucide-react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { readReviewNotice, reviewNotices, type ReviewNotice } from "@/lib/review-api";

export function ReviewAlerts() {
  const { me } = useEntitlement();
  const [events, setEvents] = useState<ReviewNotice[]>([]);
  useEffect(() => {
    if (!me?.ct_prime) { setEvents([]); return; }
    let alive = true;
    const check = () => { void reviewNotices().then(rows => { if (alive) setEvents(rows.slice(0, 3)); }).catch(() => { if (alive) setEvents([]); }); };
    check(); const timer = window.setInterval(check, 20000);
    window.addEventListener("focus", check);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [me?.ct_prime]);
  if (!me?.ct_prime || !events.length) return null;
  const dismiss = async (id: number) => { try { await readReviewNotice(id); setEvents(current => current.filter(e => e.id !== id)); } catch { /* Keep unread notifications on a failed acknowledgement. */ } };
  return <div className="fixed right-4 top-20 z-[75] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">{events.map(event => <div key={event.id} className="flex items-start gap-3 rounded-xl border border-gold/25 bg-[#122034]/95 p-4 shadow-2xl backdrop-blur-sm"><div className="rounded-lg bg-gold/10 p-2 text-gold"><MessageSquare size={17} /></div><a className="min-w-0 flex-1" href={`/journal?review=${event.review_id}&box=${event.kind === "submitted" ? "inbox" : "mine"}`} onClick={() => void dismiss(event.id)}><p className="text-xs font-medium leading-6 text-slate-100">{event.name}{event.kind === "submitted" ? "送交了一份交易日誌" : "已完成你的日誌批改"}</p><p className="mt-1 truncate text-xs text-slate-400">{event.title}</p><span className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold">查看{event.kind === "submitted" ? "作業" : "回饋"}<ArrowUpRight size={12} /></span></a><button className="text-slate-500 hover:text-slate-100" aria-label="已讀並關閉批改通知" onClick={() => void dismiss(event.id)}><X size={15} /></button></div>)}</div>;
}
