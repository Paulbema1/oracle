import type { OhlcCandle } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Résolution du symbole : Binance (crypto) puis Yahoo Finance        */
/* ------------------------------------------------------------------ */

const YAHOO_KNOWN: Record<string, string> = {
  XAUUSD: "GC=F",
  GOLD: "GC=F",
  XAGUSD: "SI=F",
  SILVER: "SI=F",
  OIL: "CL=F",
  WTI: "CL=F",
  USOIL: "CL=F",
  BRENT: "BZ=F",
  US30: "^DJI",
  DJI: "^DJI",
  US100: "^NDX",
  NAS100: "^NDX",
  NDX: "^NDX",
  US500: "^GSPC",
  SPX500: "^GSPC",
  SPX: "^GSPC",
  GER40: "^GDAXI",
  DAX: "^GDAXI",
  FRA40: "^FCHI",
  UK100: "^FTSE",
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  SOLUSD: "SOL-USD",
};

export interface ResolvedSymbol {
  binance?: string;
  yahoo: string[];
}

export function resolveSymbol(raw: string): ResolvedSymbol {
  const clean = raw.trim().toUpperCase().replace(/[\s_]+/g, "");
  const flat = clean.replace(/[/.]/g, "").replace(/-/g, "");

  const res: ResolvedSymbol = { yahoo: [] };

  // Candidat Binance : paire crypto "plate" type BTCUSDT / ETHBTC / SOLUSDC…
  if (/^[A-Z0-9]{4,20}$/.test(flat) && /(USDT|USDC|FDUSD|BUSD|BTC|ETH|BNB)$/.test(flat)) {
    res.binance = flat;
  }

  // Candidats Yahoo
  if (YAHOO_KNOWN[flat]) res.yahoo.push(YAHOO_KNOWN[flat]);
  if (flat.endsWith("USDT") && flat.length > 4) res.yahoo.push(`${flat.slice(0, -4)}-USD`);
  if (flat.endsWith("USDC") && flat.length > 4) res.yahoo.push(`${flat.slice(0, -4)}-USD`);
  // Forex 6 lettres (EURUSD, GBPJPY…) → EURUSD=X
  if (/^[A-Z]{6}$/.test(flat) && !YAHOO_KNOWN[flat] && !flat.endsWith("USD") ) res.yahoo.push(`${flat}=X`);
  if (/^[A-Z]{6}$/.test(flat) && !YAHOO_KNOWN[flat] && flat.endsWith("USD") && flat !== "BTCUSD" && flat !== "ETHUSD" && flat.length === 6) {
    // EURUSD, GBPUSD…
    res.yahoo.push(`${flat}=X`);
  }
  // Symbole brut (actions, symboles déjà formatés Yahoo : AAPL, EURUSD=X, GC=F…)
  res.yahoo.push(raw.trim().toUpperCase());

  // dédoublonnage
  res.yahoo = [...new Set(res.yahoo)];
  return res;
}

/* ------------------------------------------------------------------ */
/*  Mappage des timeframes                                             */
/* ------------------------------------------------------------------ */

const BINANCE_INTERVAL: Record<string, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1h",
  "2H": "2h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

const KRAKEN_INTERVAL: Record<string, { interval: number; aggregate?: number }> = {
  "5m": { interval: 5 },
  "15m": { interval: 15 },
  "30m": { interval: 30 },
  "1H": { interval: 60 },
  "2H": { interval: 60, aggregate: 7200 },
  "4H": { interval: 240 },
  "1D": { interval: 1440 },
  "1W": { interval: 10080 },
};

/** BTCUSDT → XBTUSD, ETHUSDT → ETHUSD… */
function krakenPair(flat: string): string | null {
  if (!/^[A-Z0-9]{4,20}$/.test(flat)) return null;
  let base: string | null = null;
  for (const q of ["USDT", "USDC"]) {
    if (flat.endsWith(q) && flat.length > q.length) {
      base = flat.slice(0, -q.length);
      break;
    }
  }
  if (!base) return null;
  if (base === "BTC") base = "XBT";
  return `${base}USD`;
}

const YAHOO_CFG: Record<string, { interval: string; range: string; aggregate?: number }> = {
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "1mo" },
  "30m": { interval: "30m", range: "1mo" },
  "1H": { interval: "1h", range: "3mo" },
  "2H": { interval: "1h", range: "6mo", aggregate: 7200 },
  "4H": { interval: "1h", range: "6mo", aggregate: 14400 },
  "1D": { interval: "1d", range: "1y" },
  "1W": { interval: "1wk", range: "5y" },
};

async function safeFetch(url: string, headers: HeadersInit, ms = 12000): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { headers, signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return res;
  } catch {
    return null;
  }
}

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) ORACLE/1.0" };

/* ------------------------------ Binance ------------------------------ */

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

export async function fetchBinance(symbol: string, tf: string): Promise<OhlcCandle[] | null> {
  const interval = BINANCE_INTERVAL[tf];
  if (!interval) return null;
  const res = await safeFetch(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=220`,
    UA,
  );
  if (!res || !res.ok) return null;
  try {
    const raw = (await res.json()) as BinanceKline[];
    if (!Array.isArray(raw) || raw.length < 30) return null;
    const candles: OhlcCandle[] = raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
    return candles;
  } catch {
    return null;
  }
}

/* ------------------------------- Kraken ------------------------------ */

type KrakenKline = [number, string, string, string, string, string, string, number];

interface KrakenResp {
  error?: string[];
  result?: Record<string, KrakenKline[] | number>;
}

export async function fetchKraken(pair: string, tf: string): Promise<OhlcCandle[] | null> {
  const cfg = KRAKEN_INTERVAL[tf];
  if (!cfg) return null;
  const res = await safeFetch(
    `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${cfg.interval}`,
    UA,
  );
  if (!res || !res.ok) return null;
  try {
    const body = (await res.json()) as KrakenResp;
    if (body.error?.length || !body.result) return null;
    const key = Object.keys(body.result).find((k) => k !== "last");
    if (!key) return null;
    const rows = body.result[key] as KrakenKline[];
    if (!Array.isArray(rows) || rows.length < 30) return null;
    let candles: OhlcCandle[] = rows.map((k) => ({
      time: k[0],
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[6]),
    }));
    if (cfg.aggregate) candles = aggregate(candles, cfg.aggregate);
    return candles.slice(-260);
  } catch {
    return null;
  }
}

/* ------------------------------- Yahoo ------------------------------- */

interface YahooQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface YahooChart {
  chart?: {
    result?: { timestamp?: number[]; indicators?: { quote?: YahooQuote[] } }[] | null;
    error?: unknown;
  };
}

function aggregate(candles: OhlcCandle[], bucket: number): OhlcCandle[] {
  const map = new Map<number, OhlcCandle>();
  for (const c of candles) {
    const t = Math.floor(c.time / bucket) * bucket;
    const cur = map.get(t);
    if (!cur) {
      map.set(t, { ...c, time: t });
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export async function fetchYahoo(ySymbol: string, tf: string): Promise<OhlcCandle[] | null> {
  const cfg = YAHOO_CFG[tf];
  if (!cfg) return null;
  const res = await safeFetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false`,
    UA,
  );
  if (!res || !res.ok) return null;
  try {
    const body = (await res.json()) as YahooChart;
    const result = body.chart?.result?.[0];
    const ts = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!ts || !q?.close) return null;
    let candles: OhlcCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close[i];
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      if (c == null || o == null || h == null || l == null) continue;
      candles.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
    if (candles.length < 25) return null;
    if (cfg.aggregate) candles = aggregate(candles, cfg.aggregate);
    return candles.slice(-260);
  } catch {
    return null;
  }
}

/* --------------------------- Orchestrateur --------------------------- */

export interface MarketData {
  provider: "binance" | "kraken" | "yahoo";
  symbol: string;
  candles: OhlcCandle[];
  lastClose: number;
}

export async function fetchMarketData(rawSymbol: string, tf: string): Promise<MarketData | null> {
  const resolved = resolveSymbol(rawSymbol);

  if (resolved.binance) {
    const candles = await fetchBinance(resolved.binance, tf);
    if (candles?.length) {
      return { provider: "binance", symbol: resolved.binance, candles, lastClose: candles[candles.length - 1].close };
    }
  }

  const kPair = krakenPair(rawSymbol.trim().toUpperCase().replace(/[\s_/.-]+/g, ""));
  if (kPair) {
    const candles = await fetchKraken(kPair, tf);
    if (candles?.length) {
      return { provider: "kraken", symbol: kPair, candles, lastClose: candles[candles.length - 1].close };
    }
  }

  for (const ys of resolved.yahoo.slice(0, 4)) {
    const candles = await fetchYahoo(ys, tf);
    if (candles?.length) {
      return { provider: "yahoo", symbol: ys, candles, lastClose: candles[candles.length - 1].close };
    }
  }

  return null;
}
