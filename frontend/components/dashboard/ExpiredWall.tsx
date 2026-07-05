import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { Reveal } from "@/components/visual/Reveal";

// 開通 NOVA 指標：LINE 官方帳號（與 CT_NOVA 詳頁同一條漏斗）
const ACTIVATE_URL = "https://lin.ee/RP6APHg";

/* 打馬底下的「展示假資料」——寫死的示意快照，不是模糊真資料：
   到期後後端根本不回資料（403），這層只負責讓畫面看起來像運作中的主控台。 */
const FAUX_TILES = [
  { label: "掃描標的", value: "218" },
  { label: "多方訊號", value: "64" },
  { label: "空方訊號", value: "41" },
  { label: "異常警報", value: "12" }
] as const;

const FAUX_ROWS = [
  { symbol: "BTCUSDT", price: "67,412.5", change: "+2.41%", up: true, score: 86, tag: "轉多" },
  { symbol: "ETHUSDT", price: "3,518.2", change: "+1.87%", up: true, score: 81, tag: "推薦" },
  { symbol: "SOLUSDT", price: "142.66", change: "-3.12%", up: false, score: 77, tag: "轉空" },
  { symbol: "BNBUSDT", price: "584.10", change: "+0.94%", up: true, score: 74, tag: "推薦" },
  { symbol: "XRPUSDT", price: "0.5231", change: "-1.45%", up: false, score: 71, tag: "疑似反轉" },
  { symbol: "DOGEUSDT", price: "0.1244", change: "+4.03%", up: true, score: 69, tag: "轉多" },
  { symbol: "AVAXUSDT", price: "26.84", change: "-2.20%", up: false, score: 66, tag: "轉空" },
  { symbol: "LINKUSDT", price: "14.02", change: "+1.12%", up: true, score: 63, tag: "推薦" }
] as const;

interface ExpiredWallProps {
  /** 到期日已過 = "expired"；（下一輪的未啟用場景再加 "inactive"） */
  title?: string;
  description?: string;
}

/**
 * 試用到期擋板：假快照主控台墊底，模糊由上往下加重（頂部數字隱約可辨、
 * 表格全糊），中央 glass 卡導去 LINE 開通。真資料由後端 403 擋住，
 * 這裡的打馬是視覺呈現，不是安全機制。
 */
export function ExpiredWall({
  title = "試用已到期",
  description = "7 天試用已結束。你的帳號與紀錄都還在——開通後立即恢復完整功能。"
}: ExpiredWallProps) {
  return (
    <section className="relative min-h-[72vh] overflow-hidden rounded-xl">
      {/* 假快照層（純展示，隔絕互動與輔助技術） */}
      <div aria-hidden className="pointer-events-none select-none p-1">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FAUX_TILES.map((tile) => (
            <div key={tile.label} className="surface rounded-lg px-4 py-3">
              <p className="text-[11px] text-slate-500">{tile.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{tile.value}</p>
            </div>
          ))}
        </div>

        <div className="surface-sunken mt-3 overflow-hidden rounded-lg">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-2 border-b border-white/5 px-4 py-2.5 text-[11px] text-slate-500">
            <span>幣種</span>
            <span className="text-right">價格</span>
            <span className="text-right">24h</span>
            <span className="text-right">分數</span>
            <span className="text-right">狀態</span>
          </div>
          {FAUX_ROWS.map((row) => (
            <div
              key={row.symbol}
              className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] items-center gap-2 border-b border-white/5 px-4 py-3 text-sm"
            >
              <span className="font-medium text-slate-200">{row.symbol}</span>
              <span className="text-right tabular-nums text-slate-300">{row.price}</span>
              <span className={`text-right tabular-nums ${row.up ? "text-long" : "text-short"}`}>
                {row.change}
              </span>
              <span className="text-right tabular-nums text-slate-300">{row.score}</span>
              <span className="text-right text-[12px] text-gold/80">{row.tag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 打馬層：兩段 backdrop-blur 疊加，遮罩讓模糊由上往下加重 */}
      <div aria-hidden className="absolute inset-0 backdrop-blur-[4px]" />
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-[14px] [mask-image:linear-gradient(180deg,transparent_0%,#000_46%)]"
      />
      {/* 暗色 scrim：確保中央卡片文字對比 */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-[rgba(5,7,15,0.18)] via-[rgba(5,7,15,0.5)] to-[rgba(5,7,15,0.78)]"
      />

      {/* 中央行動卡 */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <Reveal>
          <div className="glass-panel flex w-full max-w-md flex-col items-center gap-4 rounded-2xl px-8 py-10 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold shadow-[0_0_32px_rgba(202,138,4,0.25)]">
              <Lock className="h-6 w-6" />
            </span>
            <h2 className="text-xl font-semibold text-slate-50">{title}</h2>
            <p className="text-sm leading-7 text-slate-400">{description}</p>
            <a
              href={ACTIVATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold"
            >
              開通 NOVA 指標
              <ExternalLink className="h-4 w-4" />
            </a>
            <Link
              href="/indicators"
              className="text-sm text-slate-400 transition hover:text-ember"
            >
              先看看指標介紹 →
            </Link>
            <p className="text-[11px] text-slate-600">已有啟用碼？輸入功能即將開放</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
