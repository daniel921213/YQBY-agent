"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp
} from "lightweight-charts";
import type { MarketChartPayload } from "@/lib/types";

interface LightweightMarketChartProps {
  chart: MarketChartPayload;
}

export function LightweightMarketChart({ chart }: LightweightMarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const instance = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0a111f" },
        textColor: "#8fa9c9"
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" }
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)"
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: 1
      }
    });

    // 單一光源敘事：漲 = 發光冰藍，跌 = 暗冷鋼藍（亮度只給上漲）。
    const candleSeries = instance.addCandlestickSeries({
      upColor: "#6fc6ff",
      downColor: "#42507a",
      borderUpColor: "#6fc6ff",
      borderDownColor: "#42507a",
      wickUpColor: "#6fc6ff",
      wickDownColor: "#42507a"
    });

    const cvdSeries = instance.addLineSeries({
      color: "#d6e7ff",
      lineWidth: 2,
      priceScaleId: "cvd"
    });

    instance.priceScale("cvd").applyOptions({
      scaleMargins: {
        top: 0.72,
        bottom: 0.06
      },
      borderColor: "rgba(140,199,255,0.12)"
    });

    candleSeries.setData(
      chart.candles.map((item) => ({
        time: item.time as UTCTimestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close
      }))
    );

    cvdSeries.setData(
      chart.cvd.map((item) => ({
        time: item.time as UTCTimestamp,
        value: item.value
      }))
    );

    instance.timeScale().fitContent();
    chartRef.current = instance;

    return () => {
      instance.remove();
      chartRef.current = null;
    };
  }, [chart]);

  return <div ref={containerRef} className="h-[420px] w-full" />;
}
