"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { journalEvents, markJournalEventsRead, type JournalEvent } from "@/lib/journal-api";

export function JournalAlerts() {
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const { me } = useEntitlement();
  const allowed = me?.plan === "lifetime" || (me?.plan === "member" && me.active);

  useEffect(() => {
    if (!allowed) { setEvents([]); return; }
    let alive = true;
    const check = async () => {
      try {
        const result = await journalEvents();
        if (!alive) return;
        if (result.events.length) setEvents((current) => [...result.events, ...current].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).slice(0, 5));
        if (result.needs_ack) await markJournalEventsRead(result.cursor);
      } catch {
        // A temporary network failure will be retried on the next poll.
      }
    };
    void check();
    const timer = window.setInterval(check, 20000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [allowed]);

  if (!allowed || !events.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {events.map((event) => (
        <div key={event.id} className="glass-panel flex items-start gap-3 rounded-xl border border-gold/30 p-4 shadow-2xl">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <a href={`/journal?view=teachers&entry=${event.journal_id}`} className="min-w-0 flex-1 text-sm text-slate-100 hover:text-gold">
            <strong>{event.teacher_name}已更新日誌</strong>
            <span className="mt-1 block truncate text-xs text-slate-400">{event.title}</span>
          </a>
          <button aria-label="關閉通知" onClick={() => setEvents((current) => current.filter((item) => item.id !== event.id))} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
