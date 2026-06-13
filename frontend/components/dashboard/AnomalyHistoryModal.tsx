"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, History } from "lucide-react";
import { fetchAnomalyHistory } from "@/lib/api";
import type { AnomalyHistoryItem } from "@/lib/types";
import { formatPercent, formatPrice, percentTone } from "@/lib/format";
import { ModalShell } from "@/components/dashboard/ModalShell";

interface AnomalyHistoryModalProps {
  onClose: () => void;
}

function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts * 1000));
}

export function AnomalyHistoryModal({ onClose }: AnomalyHistoryModalProps) {
  const [items, setItems] = useState<AnomalyHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAnomalyHistory()
      .then((res) => active && setItems(res.items))
      .catch((err) => active && setError(err instanceof Error ? err.message : "讀取失敗"));
    return () => {
      active = false;
    };
  }, []);

  return (
    <ModalShell
      title="異常警報歷史"
      subtitle="已結束的警報與其存活期間表現"
      icon={<History className="h-4 w-4" />}
      onClose={onClose}
      widthClass="max-w-2xl"
    >
      {error ? (
        <div className="py-10 text-center text-sm text-short">{error}</div>
      ) : items === null ? (
        <div className="py-10 text-center text-sm text-slate-400">載入中…</div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          目前還沒有結束的警報。系統運行一段時間後，消退的警報會在此累積。
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => {
            const isLong = item.direction === "LONG";
            const Icon = isLong ? ArrowUpRight : ArrowDownRight;
            const tone = isLong ? "text-long" : "text-short";
            return (
              <li
                key={`${item.symbol}-${item.first_seen_ts}-${i}`}
                className="surface rounded-lg px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
                  <span className="text-sm font-medium text-slate-50">{item.symbol}</span>
                  <span className="rounded-sm border border-white/10 px-1.5 py-px text-[10px] text-slate-400">
                    {item.category}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-500">
                    存活 {item.duration_minutes} 分 · 觸發 {item.trigger_count} 則
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span>
                    {formatPrice(item.first_seen_price)} → {formatPrice(item.last_price)}{" "}
                    <span className={percentTone(item.change_over_life)}>
                      {formatPercent(item.change_over_life)}
                    </span>
                  </span>
                  <span>峰值分數 {item.peak_score.toFixed(1)}</span>
                  <span>{formatClock(item.first_seen_ts)} – {formatClock(item.resolved_ts)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}
