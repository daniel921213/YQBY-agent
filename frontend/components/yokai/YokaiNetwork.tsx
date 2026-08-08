"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { YokaiNarrative, YokaiSourceStatus, YokaiToken } from "@/lib/types";

interface YokaiNetworkProps {
  narratives: YokaiNarrative[];
  tokens: YokaiToken[];
  sources: YokaiSourceStatus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface NodePoint {
  id: string;
  kind: "source" | "narrative" | "token";
  label: string;
  x: number;
  y: number;
  radius: number;
  heat: number;
  status?: YokaiToken["status"];
}

interface Edge {
  from: NodePoint;
  to: NodePoint;
  strength: number;
}

const lifecycleColor: Record<YokaiNarrative["lifecycle"], string> = {
  潛伏: "rgba(112, 153, 196, .8)",
  顯形: "rgba(76, 194, 255, .95)",
  發酵: "rgba(240, 200, 118, .98)",
  狂熱: "rgba(255, 81, 102, .98)",
  退散: "rgba(100, 116, 139, .72)"
};

export function YokaiNetwork({ narratives, tokens, sources, selectedId, onSelect }: YokaiNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitNodes = useRef<NodePoint[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const topNarratives = useMemo(() => narratives.slice(0, 6), [narratives]);
  const visibleTokens = useMemo(
    () =>
      tokens
        .filter((token) => topNarratives.some((narrative) => token.narrative_ids.includes(narrative.id)))
        .slice(0, 14),
    [tokens, topNarratives]
  );
  const healthySources = useMemo(() => sources.slice(0, 3), [sources]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let running = true;
    let width = 0;
    let height = 0;
    let lastFrame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(rect.width, 320);
      height = Math.max(rect.height, 360);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now: number) => {
      if (!running) return;
      if (!reduceMotion && now - lastFrame < 32) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;
      context.clearRect(0, 0, width, height);

      const compact = width < 640;
      const sourceX = compact ? width * 0.08 : width * 0.09;
      const narrativeX = compact ? width * 0.46 : width * 0.47;
      const tokenX = compact ? width * 0.86 : width * 0.85;
      const top = compact ? 78 : 92;
      const bottom = height - (compact ? 44 : 62);

      const sourceNodes: NodePoint[] = healthySources.map((source, index) => ({
        id: `source:${source.key}`,
        kind: "source",
        label: source.name.replace(" 趨勢", "").replace("全球", ""),
        x: sourceX,
        y: top + ((bottom - top) * (index + 1)) / (healthySources.length + 1),
        radius: compact ? 5 : 7,
        heat: source.health === "HEALTHY" ? 72 : 36
      }));
      const narrativeNodes: NodePoint[] = topNarratives.map((narrative, index) => ({
        id: narrative.id,
        kind: "narrative",
        label: narrative.name.split(" ")[0],
        x: narrativeX,
        y: top + ((bottom - top) * (index + 0.5)) / Math.max(topNarratives.length, 1),
        radius: (compact ? 8 : 10) + narrative.heat_score / (compact ? 18 : 14),
        heat: narrative.heat_score
      }));
      const tokenNodes: NodePoint[] = visibleTokens.map((token, index) => {
        const narrativeIndex = Math.max(
          topNarratives.findIndex((item) => token.narrative_ids.includes(item.id)),
          0
        );
        const baseY = narrativeNodes[narrativeIndex]?.y ?? height / 2;
        const laneOffset = ((index % 3) - 1) * (compact ? 24 : 34);
        return {
          id: `token:${token.symbol}`,
          kind: "token",
          label: token.symbol.replace("USDT", ""),
          x: tokenX + ((index % 2) - 0.5) * (compact ? 16 : 26),
          y: Math.min(Math.max(baseY + laneOffset, top), bottom),
          radius: token.qualified_long ? (compact ? 7 : 9) : compact ? 4.5 : 6,
          heat: token.narrative_heat,
          status: token.status
        };
      });
      const allNodes = [...sourceNodes, ...narrativeNodes, ...tokenNodes];
      hitNodes.current = narrativeNodes;
      const edges: Edge[] = [];
      sourceNodes.forEach((source) => {
        narrativeNodes.forEach((narrative) => {
          const data = topNarratives.find((item) => item.id === narrative.id);
          if (data && data.source_count > 0) {
            edges.push({ from: source, to: narrative, strength: data.heat_score / 100 });
          }
        });
      });
      tokenNodes.forEach((tokenNode) => {
        const token = visibleTokens.find((item) => `token:${item.symbol}` === tokenNode.id);
        token?.narrative_ids.forEach((narrativeId) => {
          const narrativeNode = narrativeNodes.find((item) => item.id === narrativeId);
          if (narrativeNode) edges.push({ from: narrativeNode, to: tokenNode, strength: token.narrative_heat / 100 });
        });
      });

      const ambient = context.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, width * 0.5);
      ambient.addColorStop(0, "rgba(31, 109, 178, .12)");
      ambient.addColorStop(0.55, "rgba(7, 26, 54, .05)");
      ambient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = ambient;
      context.fillRect(0, 0, width, height);

      edges.forEach((edge, index) => {
        const selected = edge.from.id === selectedId || edge.to.id === selectedId;
        context.beginPath();
        context.moveTo(edge.from.x, edge.from.y);
        const bend = (edge.to.x - edge.from.x) * 0.48;
        context.bezierCurveTo(edge.from.x + bend, edge.from.y, edge.to.x - bend, edge.to.y, edge.to.x, edge.to.y);
        context.strokeStyle = selected
          ? "rgba(240, 200, 118, .65)"
          : `rgba(76, 194, 255, ${0.07 + edge.strength * 0.18})`;
        context.lineWidth = selected ? 1.5 : 0.7;
        context.stroke();

        if (!reduceMotion) {
          const progress = ((now / (2600 - Math.min(edge.strength, 0.8) * 900) + index * 0.17) % 1);
          const inv = 1 - progress;
          const x = inv * inv * inv * edge.from.x + 3 * inv * inv * progress * (edge.from.x + bend) + 3 * inv * progress * progress * (edge.to.x - bend) + progress * progress * progress * edge.to.x;
          const y = inv * inv * inv * edge.from.y + 3 * inv * inv * progress * edge.from.y + 3 * inv * progress * progress * edge.to.y + progress * progress * progress * edge.to.y;
          context.beginPath();
          context.arc(x, y, selected ? 2.2 : 1.3, 0, Math.PI * 2);
          context.fillStyle = selected ? "rgba(240, 200, 118, .95)" : "rgba(133, 211, 255, .75)";
          context.shadowBlur = 10;
          context.shadowColor = context.fillStyle;
          context.fill();
          context.shadowBlur = 0;
        }
      });

      allNodes.forEach((node) => {
        const active = node.id === selectedId || node.id === hovered;
        let color = "rgba(76, 194, 255, .9)";
        if (node.kind === "narrative") {
          const narrative = topNarratives.find((item) => item.id === node.id);
          if (narrative) color = lifecycleColor[narrative.lifecycle];
        } else if (node.kind === "token") {
          color = node.status === "QUALIFIED" ? "rgba(35, 221, 141, .95)" : node.status === "RISK" ? "rgba(255, 81, 102, .9)" : "rgba(112, 174, 224, .78)";
        }
        const pulse = reduceMotion ? 0 : Math.sin(now / 850 + node.y) * 1.2;
        context.beginPath();
        context.arc(node.x, node.y, node.radius + (active ? 3 : 0) + pulse, 0, Math.PI * 2);
        context.fillStyle = color.replace(/\.[0-9]+\)$/, ".08)");
        context.fill();
        context.beginPath();
        context.arc(node.x, node.y, Math.max(2.2, node.radius * 0.36), 0, Math.PI * 2);
        context.fillStyle = color;
        context.shadowBlur = active ? 28 : 15;
        context.shadowColor = color;
        context.fill();
        context.shadowBlur = 0;

        const labelRight = true;
        context.textAlign = labelRight ? "left" : "right";
        context.textBaseline = "middle";
        context.font = `${node.kind === "narrative" ? 700 : 600} ${compact ? 10 : 12}px "Noto Sans TC Variable", sans-serif`;
        context.fillStyle = active ? "rgba(248, 250, 252, .98)" : "rgba(203, 213, 225, .78)";
        context.fillText(node.label, node.x + (labelRight ? node.radius + 7 : -node.radius - 7), node.y);
      });

      frame = window.requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      running = !document.hidden;
      if (running) frame = window.requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(draw);
    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [healthySources, hovered, selectedId, topNarratives, visibleTokens]);

  const nodeAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return hitNodes.current.find((node) => Math.hypot(node.x - x, node.y - y) <= node.radius + 12) ?? null;
  };

  return (
    <div className="yokai-network relative h-[410px] overflow-hidden rounded-2xl sm:h-[500px] lg:h-[560px]">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-manipulation"
        aria-label="消息來源、熱門賽道與 Gate 幣種的妖氣關聯網絡"
        onPointerMove={(event) => setHovered(nodeAt(event.clientX, event.clientY)?.id ?? null)}
        onPointerLeave={() => setHovered(null)}
        onClick={(event) => {
          const node = nodeAt(event.clientX, event.clientY);
          if (node?.kind === "narrative") onSelect(node.id);
        }}
      />
      <div className="pointer-events-none absolute inset-x-3 top-[4.1rem] flex items-center justify-between text-[8px] font-medium tracking-[0.18em] text-slate-600 sm:inset-x-5 sm:top-[4.4rem] sm:text-[9px]">
        <span>SOURCE SIGNALS</span>
        <span>NARRATIVE CORE</span>
        <span>GATE MARKET</span>
      </div>
      {!topNarratives.length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          等待第一批外部情報快照
        </div>
      ) : null}
    </div>
  );
}
