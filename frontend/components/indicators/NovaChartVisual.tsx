// CT_NOVA 指標示意圖：純 SVG、資料寫死（deterministic），只為說明「一次完整的
// 訊號流程」——壓縮 → 突破 → 回踩 → 收復 EMA12 → 進場，並展示通道/風控線的配色。
// 底色與格線讀 --chart-* token，深淺色模式自動跟隨；指標線條用固定品牌色
//（青=小通道、橘=大通道、紫=EMA12），兩種主題下都可讀。

const N = 42; // 根數
const X0 = 28;
const STEP = 16;
const CANDLE_W = 9;

// 收盤價（y 座標，越小越高）：壓縮盤整 → 突破 → 回踩 → 收復 → 續漲
const CLOSES = [
  296, 300, 293, 298, 291, 295, 289, 294, 288, 292, 286, 290, // 0-11 squeeze 盤整
  280, 270, 262, 266, 254, 247, // 12-17 突破（武裝狀態）
  240, 233, 237, // 18-20 延伸
  244, 252, 259, 265, 262, 268, // 21-26 回踩
  258, 249, // 27-28 收復 EMA12 → 進場訊號
  243, 236, 240, 230, 222, 226, 215, 207, 211, 200, 193, 197, 188 // 29-41 續漲
];

const SIGNAL_I = 28;
const ENTRY_Y = 249;
const SL_Y = 285; // 2.5 ATR
const TP1_Y = 213; // +1R
const TP2_Y = 160; // +2.5R

const xAt = (i: number) => X0 + i * STEP;
const xMid = (i: number) => xAt(i) + CANDLE_W / 2;

function ema(values: number[], alpha: number): number[] {
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : out[i - 1] + (v - out[i - 1]) * alpha));
  return out;
}

const EMA12 = ema(CLOSES, 0.2);
const TUNNEL_S_TOP = ema(CLOSES, 0.055); // 小通道（青）
const TUNNEL_S_BOT = TUNNEL_S_TOP.map((v) => v + 11);
const TUNNEL_L_TOP = CLOSES.map((_, i) => 330 - i * 0.28); // 大通道（橘）：緩慢抬升
const TUNNEL_L_BOT = TUNNEL_L_TOP.map((v) => v + 11);

const toPolyline = (ys: number[]) => ys.map((y, i) => `${xMid(i)},${y.toFixed(1)}`).join(" ");
const toBand = (top: number[], bot: number[]) =>
  `M ${top.map((y, i) => `${xMid(i)},${y.toFixed(1)}`).join(" L ")} L ${[...bot]
    .map((y, i) => `${xMid(bot.length - 1 - i)},${y.toFixed(1)}`)
    .reverse()
    .join(" L ")} Z`;

// 動能柱：壓縮期微弱轉強，突破後多方增強、回踩期收斂、訊號後再增強
const MOMENTUM = CLOSES.map((_, i) => {
  if (i < 12) return (i % 2 === 0 ? -1 : 1) * (3 + (i % 3) * 2);
  if (i < 21) return 8 + (i - 12) * 2.2;
  if (i < 28) return Math.max(4, 26 - (i - 20) * 3.4);
  return Math.min(32, 8 + (i - 28) * 2.4);
});
const HIST_BASE = 402;

/** 面板列 */
const PANEL_ROWS: Array<[string, string, string]> = [
  ["階段", "進場訊號", "#f0c876"],
  ["方向", "做多 LONG", "#23dd8d"],
  ["動能", "多方增強", "#2dd4bf"],
  ["4H 同向", "通過", "#23dd8d"]
];

export function NovaChartVisual() {
  return (
    <svg
      viewBox="0 0 760 460"
      role="img"
      aria-label="CT_NOVA 訊號流程示意圖：價格在 Squeeze 壓縮後突破小通道，回踩並收復 EMA12，動能同向增強後標出進場、停損與 TP1、TP2"
      className="block h-auto w-full"
    >
      <rect x="0" y="0" width="760" height="460" rx="10" fill="var(--chart-bg)" />

      {/* 橫向格線 */}
      {[80, 140, 200, 260, 320].map((y) => (
        <line key={y} x1="16" x2="744" y1={y} y2={y} stroke="var(--chart-grid)" />
      ))}
      {/* 主圖與動能柱的分隔線 */}
      <line x1="16" x2="744" y1="352" y2="352" stroke="var(--chart-frame)" />

      {/* Squeeze 壓縮區（灰底） */}
      <rect x={X0 - 6} y="34" width={12 * STEP} height="312" fill="rgba(148,163,184,0.09)" />
      <text x={X0 + 6 * STEP} y="52" textAnchor="middle" fontSize="10" letterSpacing="2" fill="var(--chart-ink)">
        SQUEEZE
      </text>

      {/* 大 Vegas 通道（橘 576/676） */}
      <path d={toBand(TUNNEL_L_TOP, TUNNEL_L_BOT)} fill="rgba(251,146,60,0.14)" />
      <polyline points={toPolyline(TUNNEL_L_TOP)} fill="none" stroke="#fb923c" strokeWidth="1.4" opacity="0.75" />
      <polyline points={toPolyline(TUNNEL_L_BOT)} fill="none" stroke="#fb923c" strokeWidth="1.4" opacity="0.45" />

      {/* 小 Vegas 通道（青 144/169） */}
      <path d={toBand(TUNNEL_S_TOP, TUNNEL_S_BOT)} fill="rgba(34,211,238,0.12)" />
      <polyline points={toPolyline(TUNNEL_S_TOP)} fill="none" stroke="#22d3ee" strokeWidth="1.4" opacity="0.85" />
      <polyline points={toPolyline(TUNNEL_S_BOT)} fill="none" stroke="#22d3ee" strokeWidth="1.4" opacity="0.5" />

      {/* EMA12 觸發線（紫） */}
      <polyline points={toPolyline(EMA12)} fill="none" stroke="#a78bfa" strokeWidth="1.8" />

      {/* K 棒 */}
      {CLOSES.map((close, i) => {
        const open = i === 0 ? 298 : CLOSES[i - 1];
        const up = close <= open;
        const bodyTop = Math.min(open, close);
        const bodyH = Math.max(2, Math.abs(open - close));
        const wick = 3 + ((i * 7) % 4);
        const color = up ? "var(--chart-up)" : "var(--chart-down)";
        return (
          <g key={i}>
            <line
              x1={xMid(i)}
              x2={xMid(i)}
              y1={bodyTop - wick}
              y2={bodyTop + bodyH + wick}
              stroke={color}
              strokeWidth="1"
            />
            <rect x={xAt(i)} y={bodyTop} width={CANDLE_W} height={bodyH} rx="1" fill={color} />
          </g>
        );
      })}

      {/* 進場 / 停損 / TP 水平線（從訊號 K 棒延伸到右緣） */}
      {(
        [
          [ENTRY_Y, "#f0c876", "進場"],
          [SL_Y, "#ff5166", "停損"],
          [TP1_Y, "#23dd8d", "TP1 +1R"],
          [TP2_Y, "#23dd8d", "TP2 +2.5R"]
        ] as Array<[number, string, string]>
      ).map(([y, color, label]) => (
        <g key={label}>
          <line x1={xAt(SIGNAL_I) - 4} x2="688" y1={y} y2={y} stroke={color} strokeWidth="1.2" strokeDasharray="5 4" opacity="0.85" />
          <text x="694" y={y + 3.5} fontSize="10" fill={color}>
            {label}
          </text>
        </g>
      ))}

      {/* 進場訊號標籤 */}
      <g>
        <path
          d={`M ${xMid(SIGNAL_I)} ${SL_Y + 16} l 5.5 9 h -11 Z`}
          fill="#23dd8d"
        />
        <text x={xMid(SIGNAL_I)} y={SL_Y + 40} textAnchor="middle" fontSize="10" fontWeight="600" fill="#23dd8d">
          做多進場
        </text>
      </g>

      {/* 右上：CT_NOVA 即時面板 */}
      <g>
        <rect x="576" y="40" width="152" height="84" rx="7" fill="rgba(7,12,24,0.78)" stroke="var(--chart-frame)" />
        <text x="588" y="58" fontSize="9" letterSpacing="1.5" fill="var(--chart-ink)">
          CT_NOVA PANEL
        </text>
        {PANEL_ROWS.map(([k, v, color], i) => (
          <g key={k}>
            <text x="588" y={74 + i * 13} fontSize="9" fill="var(--chart-ink)">
              {k}
            </text>
            <text x="716" y={74 + i * 13} fontSize="9" textAnchor="end" fill={color}>
              {v}
            </text>
          </g>
        ))}
      </g>

      {/* 下方：CT_Squeeze 動能柱 */}
      <text x="28" y="372" fontSize="9" letterSpacing="1.5" fill="var(--chart-ink)">
        CT_SQUEEZE
      </text>
      <line x1="16" x2="744" y1={HIST_BASE} y2={HIST_BASE} stroke="var(--chart-grid)" />
      {MOMENTUM.map((m, i) => {
        const h = Math.abs(m);
        const positive = m >= 0;
        const grow = i > 0 && Math.abs(MOMENTUM[i]) >= Math.abs(MOMENTUM[i - 1]);
        const fill = positive
          ? grow
            ? "rgba(45,212,191,0.95)"
            : "rgba(45,212,191,0.45)"
          : grow
            ? "rgba(255,81,102,0.8)"
            : "rgba(255,81,102,0.4)";
        return (
          <rect
            key={i}
            x={xAt(i)}
            y={positive ? HIST_BASE - h : HIST_BASE}
            width={CANDLE_W}
            height={h}
            rx="1"
            fill={fill}
          />
        );
      })}
    </svg>
  );
}
