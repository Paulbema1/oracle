export type Direction = "LONG" | "SHORT" | "NEUTRE";
export type TrendDir = "haussière" | "baissière" | "range";
export type RiskLevel = "faible" | "modéré" | "élevé";

export interface KeyLevel {
  prix: number;
  type: "support" | "resistance" | "autre";
  label: string;
}

/** Tendance déterministe calculée côté serveur pour un timeframe. */
export interface TrendScore {
  tf: string;
  direction: TrendDir;
  strength: number; // 0 - 100
  detail: string;
}

export interface MacroEvent {
  title: string;
  currency: string;
  date: string; // ISO
  impact: "High" | "Medium" | "Low";
  forecast: string;
  previous: string;
}

export interface Headline {
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO
}

export interface MacroContext {
  events: MacroEvent[];
  headlines: Headline[];
  riskLevel: RiskLevel;
  riskReasons: string[];
  summaryText: string;
}

/** Réponse brute normalisée de l'IA */
export interface AiAnalysis {
  direction: Direction;
  tendance: TrendDir;
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
  strategie: string;
  regime: string;
  confirmation_mtf: string;
  alerte_macro: string | null;
  risque_environnement: RiskLevel;
}

/** Enrichi côté serveur : ratio R multiple + sizing */
export interface TradePlan extends AiAnalysis {
  id: string;
  pair: string;
  timeframe: string;
  model: string;
  marketSource: string | null;
  lastPrice: number | null;
  capital: number;
  riskPercent: number;
  riskAmount: number;
  positionSize: number | null;
  notional: number | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  htf_trends: TrendScore[];
  macro_events: MacroEvent[];
  macro_headlines: Headline[];
  createdAt: string;
}

export interface ChartImage {
  tf: string;
  dataUrl: string;
}

export interface AnalyzeRequest {
  apiKey: string;
  dbUrl?: string;
  pair: string;
  timeframe: string;
  capital: number;
  riskPercent: number;
  images: ChartImage[]; // [0] = TF d'exécution, puis TF supérieurs
  marketSource?: string | null;
  lastPrice?: number | null;
  htfTrends?: TrendScore[];
  mtfSummary?: string;
  macro?: MacroContext | null;
}

export interface OhlcCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSeriesBundle {
  tf: string;
  candles: OhlcCandle[];
  trend: TrendScore;
}

export interface MarketResponse {
  provider: "binance" | "kraken" | "yahoo";
  symbol: string;
  tf: string;
  lastClose: number;
  candles: OhlcCandle[];
  trend: TrendScore;
  htf: MarketSeriesBundle[];
}

export interface ApiError {
  error: string;
  detail?: string;
}

export const TIMEFRAMES = [
  "1m", "3m", "5m", "15m", "30m", "45m", "1H", "2H", "4H", "6H", "8H", "12H", "1D", "3D", "1W", "1M",
] as const;

/** Échelle de confirmation : TF d'exécution → timeframes supérieurs. */
export const HTF_MAP: Record<string, string[]> = {
  "5m": ["1H", "4H"],
  "15m": ["1H", "4H"],
  "30m": ["1H", "4H"],
  "1H": ["4H", "1D"],
  "2H": ["4H", "1D"],
  "4H": ["1D", "1W"],
  "1D": ["1W"],
  "1W": [],
};

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

export function trendIcon(d: TrendDir): "up" | "down" | "flat" {
  return d === "haussière" ? "up" : d === "baissière" ? "down" : "flat";
}
