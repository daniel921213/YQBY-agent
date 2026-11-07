"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp
} from "lightweight-charts";
import type { MarketChartPayload } from "@/lib/types";
import { useThemeMode } from "@/lib/theme";

interface LightweightMarketChartProps {
  chart: MarketChartPayload;
}

export function LightweightMarketChart({ chart }: LightweightMarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // 主題切換時整張圖重建（lightweight-charts 的顏色在建立時決定）。
  const theme = useThemeMode();

  useEffect(() => {
    if (!containerRef.current) return;

    // 圖表顏色跟著 globals.css 的 --chart-* 變數走，深淺模式共用同一套語意。
    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      css.getPropertyValue(name).trim() || fallback;

    const container = containerRef.current;
    const instance = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: token("--chart-bg", "#121113") },
        textColor: token("--chart-ink", "#a89e8f")
      },
      grid: {
        vertLines: { color: token("--chart-grid", "rgba(255,250,242,0.05)") },
        horzLines: { color: token("--chart-grid", "rgba(255,250,242,0.05)") }
      },
      rightPriceScale: {
        borderColor: token("--chart-frame", "rgba(255,250,242,0.08)")
      },
      timeScale: {
        borderColor: token("--chart-frame", "rgba(255,250,242,0.08)"),
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        mode: 1
      }
    });

    // 單一光源敘事：漲 = 發光香檳金，跌 = 暗暖灰（亮度只給上漲）。
    const up = token("--chart-up", "#e6c48e");
    const down = token("--chart-down", "#5f5752");
    const candleSeries = instance.addCandlestickSeries({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down
    });

    const cvdSeries = instance.addLineSeries({
      color: token("--chart-cvd", "#a0b4c4"),
      lineWidth: 2,
      priceScaleId: "cvd"
    });

    instance.priceScale("cvd").applyOptions({
      scaleMargins: {
        top: 0.72,
        bottom: 0.06
      },
      borderColor: token("--chart-frame", "rgba(255,250,242,0.08)")
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
  }, [chart, theme]);

  return <div ref={containerRef} className="h-[420px] w-full" />;
}
