import { pgTable, uuid, text, doublePrecision, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import type { Headline, MacroEvent, TrendScore } from "@/lib/types";

export const analyses = pgTable("analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  pair: text("pair").notNull(),
  timeframe: text("timeframe").notNull(),
  model: text("model").notNull(),
  direction: text("direction").notNull(), // LONG | SHORT | NEUTRE
  tendance: text("tendance").notNull().default("range"),
  confiance: integer("confiance").notNull().default(0),
  entree: doublePrecision("entree"),
  stopLoss: doublePrecision("stop_loss"),
  tp1: doublePrecision("tp1"),
  tp2: doublePrecision("tp2"),
  tp3: doublePrecision("tp3"),
  rr1: doublePrecision("rr1"),
  rr2: doublePrecision("rr2"),
  rr3: doublePrecision("rr3"),
  capital: doublePrecision("capital"),
  riskPercent: doublePrecision("risk_percent"),
  riskAmount: doublePrecision("risk_amount"),
  positionSize: doublePrecision("position_size"),
  notional: doublePrecision("notional"),
  marketSource: text("market_source"),
  lastPrice: doublePrecision("last_price"),
  // Stratégie adaptative & multi-timeframe
  strategie: text("strategie").default(""),
  regime: text("regime").default(""),
  confirmationMtf: text("confirmation_mtf").default(""),
  alerteMacro: text("alerte_macro"),
  risqueEnv: text("risque_env").default("modéré"),
  htfTrends: jsonb("htf_trends").$type<TrendScore[]>().default([]),
  macroEvents: jsonb("macro_events").$type<MacroEvent[]>().default([]),
  macroHeadlines: jsonb("macro_headlines").$type<Headline[]>().default([]),
  resumerTendance: text("resumer_tendance").default(""),
  contexte: text("contexte").default(""),
  analyse: text("analyse").default(""),
  invalidation: text("invalidation").default(""),
  niveauxCles: jsonb("niveaux_cles").$type<{ prix: number; type: string; label: string }[]>().default([]),
  confluences: jsonb("confluences").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AnalysisRow = typeof analyses.$inferSelect;
