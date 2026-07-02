import type { PillarScore, TradeDirection } from "@/lib/types";

interface SignalRadarProps {
  pillars: PillarScore[];
  direction: TradeDirection;
}

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 74;

function pointAt(count: number, index: number, fraction: number): [number, number] {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const r = RADIUS * fraction;
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
}

export function SignalRadar({ pillars, direction }: SignalRadarProps) {
  // 走 CSS 變數，深淺模式自動換色（淺色時多空色深一階以保持對比）。
  const tone = direction === "LONG" ? "rgb(var(--c-long))" : "rgb(var(--c-short))";
  const toneFill =
    direction === "LONG" ? "rgb(var(--c-long) / 0.14)" : "rgb(var(--c-short) / 0.14)";
  const count = pillars.length;
  const values = pillars.map((p) => Math.max(p.strength, 0.04));

  const shape = values.map((v, i) => pointAt(count, i, v).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[220px] w-[220px]"
        role="img"
        aria-label="五支柱訊號雷達圖"
      >
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={pillars.map((_, i) => pointAt(count, i, ring).join(",")).join(" ")}
            fill="none"
            stroke="var(--chart-frame)"
            strokeWidth={1}
          />
        ))}

        {pillars.map((_, i) => {
          const [x, y] = pointAt(count, i, 1);
          return (
            <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y}
              stroke="var(--chart-frame)" strokeWidth={1} />
          );
        })}

        <polygon points={shape} fill={toneFill} stroke={tone} strokeWidth={1.75} />

        {values.map((v, i) => {
          const [x, y] = pointAt(count, i, v);
          return <circle key={i} cx={x} cy={y} r={2.6} fill={tone} />;
        })}

        {pillars.map((p, i) => {
          const [x, y] = pointAt(count, i, 1.24);
          return (
            <text key={p.pillar} x={x} y={y} fill="var(--chart-ink)" fontSize={10}
              textAnchor="middle" dominantBaseline="middle">
              {p.pillar}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
