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
        background: { type: ColorType.Solid, color: "#18212c" },
        textColor: "#a8b3c4"
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

    const candleSeries = instance.addCandlestickSeries({
      upColor: "#8cc7ff",
      downColor: "#b89d5b",
      borderUpColor: "#8cc7ff",
      borderDownColor: "#b89d5b",
      wickUpColor: "#8cc7ff",
      wickDownColor: "#b89d5b"
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
