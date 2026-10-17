import type { OhlcCandle, TrendScore } from "@/lib/types";

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

interface Swing {
  price: number;
  index: number;
}

function swings(candles: OhlcCandle[], leftRight = 3): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  const n = candles.length;
  for (let i = leftRight; i < n - leftRight; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= leftRight; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ price: candles[i].high, index: i });
    if (isLow) lows.push({ price: candles[i].low, index: i });
  }
  return { highs, lows };
}

/**
 * Analyse déterministe de la tendance d'une série de chandeliers :
 * alignement EMA 20/50/200, pente de l'EMA 50, structure HH/HL vs LH/LL.
 */
export function analyzeTrend(candles: OhlcCandle[], tf: string): TrendScore {
  if (!candles || candles.length < 60) {
    return { tf, direction: "range", strength: 10, detail: "données insuffisantes" };
  }

  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const l20 = e20[e20.length - 1];
  const l50 = e50[e50.length - 1];
  const l200 = e200[e200.length - 1];

  let score = 0;
  const pros: string[] = [];
  const cons: string[] = [];

  if (last > l20) { score++; pros.push("prix > EMA20"); } else { score--; cons.push("prix < EMA20"); }
  if (last > l50) { score++; pros.push("prix > EMA50"); } else { score--; cons.push("prix < EMA50"); }
  if (last > l200) { score++; pros.push("prix > EMA200"); } else { score--; cons.push("prix < EMA200"); }
  if (l20 > l50) { score++; pros.push("EMA20 > EMA50"); } else { score--; cons.push("EMA20 < EMA50"); }
  if (l50 > l200) { score++; pros.push("EMA50 > EMA200"); } else { score--; cons.push("EMA50 < EMA200"); }

  // Pente de l'EMA50 sur 10 périodes, normalisée en %
  const back = Math.max(0, e50.length - 11);
  const slopePct = ((l50 - e50[back]) / l50) * 100;
  if (slopePct > 0.15) { score++; pros.push("pente EMA50 positive"); }
  else if (slopePct < -0.15) { score--; cons.push("pente EMA50 négative"); }

  // Structure de marché (2 derniers pivots)
  const sw = swings(candles.slice(-100));
  const hh = sw.highs.length >= 2 && sw.highs[sw.highs.length - 1].price > sw.highs[sw.highs.length - 2].price;
  const hl = sw.lows.length >= 2 && sw.lows[sw.lows.length - 1].price > sw.lows[sw.lows.length - 2].price;
  const lh = sw.highs.length >= 2 && sw.highs[sw.highs.length - 1].price < sw.highs[sw.highs.length - 2].price;
  const ll = sw.lows.length >= 2 && sw.lows[sw.lows.length - 1].price < sw.lows[sw.lows.length - 2].price;

  if (hh && hl) { score += 2; pros.push("structure HH/HL"); }
  else if (lh && ll) { score -= 2; cons.push("structure LH/LL"); }
  else { cons.push("structure indécise"); }

  const direction = score >= 3 ? "haussière" : score <= -3 ? "baissière" : "range";
  const strength = Math.min(100, 18 + Math.abs(score) * 11);
  const detail =
    direction === "range"
      ? `marché sans direction nette (${cons.slice(0, 2).join(", ") || "signaux mixtes"})`
      : `${direction} — ${(direction === "haussière" ? pros : cons).slice(0, 3).join(", ")}`;

  return { tf, direction, strength, detail };
}

/** Résumé texte MTF injecté dans le prompt de l'IA. */
export function mtfSummaryText(trends: TrendScore[]): string {
  return trends
    .map((t) => `- ${t.tf} : ${t.direction.toUpperCase()} (force ${t.strength}/100) · ${t.detail}`)
    .join("\n");
}

/** Conflit flagrant entre le TF d'exécution et les HTF. */
export function hasTrendConflict(trends: TrendScore[]): boolean {
  const dirs = trends.map((t) => t.direction).filter((d) => d !== "range");
  if (dirs.length < 2) return false;
  return dirs.includes("haussière") && dirs.includes("baissière");
}
