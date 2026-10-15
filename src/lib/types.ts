export type Direction = "LONG" | "SHORT" | "NEUTRE";

export interface KeyLevel {
  prix: number;
  type: "support" | "resistance" | "autre";
  label: string;
}

/** Réponse brute normalisée de l'IA */
export interface AiAnalysis {
  direction: Direction;
  tendance: "haussière" | "baissière" | "range";
  confiance: number; // 0 - 100
  entree: number;
  stop_loss: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  resumer_tendance: string;
  contexte: string;
  analyse: string;
  niveaux_cles: KeyLevel[];
  confluences: string[];
  invalidation: string;
}

/** Enrichi côté serveur : ratio R multiple + sizing */
export interface TradePlan extends AiAnalysis {
  id: string;
  pair: string;
  timeframe: string;
  model: string;
  marketSource: string | null; // ex: "Binance · BTCUSDT" ou "Capture manuelle"
  lastPrice: number | null;
  capital: number;
  riskPercent: number;
  riskAmount: number;
  positionSize: number | null; // en unités de l'actif
  notional: number | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  createdAt: string;
}

export interface AnalyzeRequest {
  apiKey: string;
  dbUrl?: string;
  pair: string;
  timeframe: string;
  capital: number;
  riskPercent: number;
  image: string; // data URL
  marketSource?: string | null;
  lastPrice?: number | null;
}

export interface OhlcCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketResponse {
  provider: "binance" | "kraken" | "yahoo";
  symbol: string;
  lastClose: number;
  candles: OhlcCandle[];
}

export interface ApiError {
  error: string;
  detail?: string;
}

export const TIMEFRAMES = [
  "1m", "3m", "5m", "15m", "30m", "45m", "1H", "2H", "4H", "6H", "8H", "12H", "1D", "3D", "1W", "1M",
] as const;

/**
 * Chaîne de sélection automatique des modèles vision.
 * Le serveur essaie dans l'ordre et bascule automatiquement en cas d'indisponibilité.
 */
export const MODELS: { id: string; label: string; hint: string }[] = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "prioritaire" },
  { id: "openai/gpt-4o", label: "GPT-4o", hint: "secours n°1" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", hint: "secours n°2" },
  { id: "qwen/qwen2.5-vl-72b-instruct", label: "Qwen 2.5 VL 72B", hint: "secours n°3" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (gratuit)", hint: "dernier recours" },
];

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export function formatPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  let decimals = 2;
  if (abs >= 10000) decimals = 1;
  else if (abs >= 1000) decimals = 2;
  else if (abs >= 100) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 5;
  else decimals = 6;
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(v: number | null | undefined, currency = "$"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return (
    v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency
  );
}
