import { assetClassLabel } from "@/lib/market";
import type { MarketSession } from "@/lib/types";

/** 外匯版代號旁的小標籤：資產類別 + 休市提示。加密貨幣沒有這兩個欄位，不會顯示。 */
export function MarketTags({
  assetClass,
  session,
  compact = false
}: {
  assetClass?: string | null;
  session?: MarketSession | null;
  compact?: boolean;
}) {
  const label = assetClassLabel(assetClass);
  if (!label && session !== "CLOSED") return null;
  const size = compact ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle">
      {label ? (
        <span className={`rounded-sm border border-white/10 bg-white/[0.03] font-medium text-slate-400 ${size}`}>
          {label}
        </span>
      ) : null}
      {session === "CLOSED" ? (
        <span
          className={`rounded-sm border border-ember/40 bg-ember/10 font-medium text-ember ${size}`}
          title="標的市場休市中：量能偏低、開盤可能跳空，休市期間不列入推薦"
        >
          休市
        </span>
      ) : null}
    </span>
  );
}
