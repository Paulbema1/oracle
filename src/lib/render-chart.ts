"use client";

import type { OhlcCandle } from "@/lib/types";
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";

function emaSeries(candles: OhlcCandle[], period: number): LineData[] {
  const k = 2 / (period + 1);
  let prev: number | null = null;
  const out: LineData[] = [];
  candles.forEach((c, i) => {
    prev = prev === null ? c.close : c.close * k + prev * (1 - k);
    if (i >= period - 1 && prev !== null) {
      out.push({ time: c.time as UTCTimestamp, value: Number(prev.toFixed(8)) });
    }
  });
  return out;
}

/**
 * Génère un graphique chandeliers type TradingView (lightweight-charts)
 * dans un conteneur hors écran, puis renvoie la capture PNG en data URL.
 */
export async function captureTradingChart(candles: OhlcCandle[]): Promise<string> {
  const mod = await import("lightweight-charts");
  const { createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType } = mod;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1280px;height:720px;overflow:hidden;pointer-events:none;";
  document.body.appendChild(host);

  let chart: IChartApi | null = null;
  try {
    const visible = candles.slice(-150);
    // Sécurité : horodatages strictement croissants et dédupliqués
    const unique = visible.filter((c, i) => i === 0 || c.time > visible[i - 1].time);
    // EMA calculées sur tout l'historique reçu (meilleur échauffement, EMA 200 possible)
    const allUnique = candles.filter((c, i) => i === 0 || c.time > candles[i - 1].time);

    chart = createChart(host, {
      width: 1280,
      height: 720,
      layout: {
        background: { type: ColorType.Solid, color: "#070b0e" },
        textColor: "#7d93a0",
        fontSize: 15,
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(93, 120, 110, 0.12)" },
        horzLines: { color: "rgba(93, 120, 110, 0.12)" },
      },
      rightPriceScale: {
        borderColor: "rgba(125, 147, 160, 0.35)",
        visible: true,
        autoScale: true,
      },
      timeScale: {
        borderColor: "rgba(125, 147, 160, 0.35)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
    });

    const toC = (c: OhlcCandle): CandlestickData => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    candleSeries.setData(unique.map(toC));

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    const volData: HistogramData[] = unique.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)",
    }));
    volSeries.setData(volData);

    const emas: { period: number; color: string; width: 1 | 2 }[] = [
      { period: 20, color: "#4fc3f7", width: 2 },
      { period: 50, color: "#ffb74d", width: 2 },
      { period: 200, color: "#ba68c8", width: 1 },
    ];
    for (const e of emas) {
      const s = chart.addSeries(LineSeries, {
        color: e.color,
        lineWidth: e.width,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const firstTime = unique[0].time;
      s.setData(emaSeries(allUnique, e.period).filter((pt) => (pt.time as number) >= firstTime));
    }

    chart.timeScale().fitContent();

    const canvas = chart.takeScreenshot();
    const dataUrl = canvas.toDataURL("image/png");
    chart.remove();
    chart = null;
    return dataUrl;
  } finally {
    chart?.remove();
    host.remove();
  }
}
