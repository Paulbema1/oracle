"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ShieldAlert,
  Crosshair,
  CheckCircle2,
  Copy,
  Check,
  RotateCcw,
  ScanSearch,
  Layers,
  ListChecks,
  BookOpenText,
  OctagonAlert,
  Wallet,
  Loader2,
  Clock3,
  Sparkles,
  CandlestickChart,
} from "lucide-react";
import type { TradePlan } from "@/lib/types";
import { modelLabel, formatPrice, formatMoney } from "@/lib/types";

export type ViewStatus = "idle" | "loading" | "done" | "error";

interface Props {
  status: ViewStatus;
  plan: TradePlan | null;
  error: { message: string; detail?: string } | null;
  image: string | null;
  steps: string[];
  onReset: () => void;
}

/* ------------------------------ Loader ------------------------------ */

function AnalysisLoader({ image, steps }: { image: string | null; steps: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 2200);
    return () => clearInterval(t);
  }, [steps]);

  return (
    <motion.div
      key="loader"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="panel flex flex-col items-center gap-8 p-8 lg:p-12"
    >
      {image && (
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-mint/25">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Graphique en cours d'analyse" className="w-full opacity-80" />
          <div className="absolute inset-0 bg-abyss/25" />
          <div className="scan-line" style={{ animation: "scan 2.4s ease-in-out infinite" }} />
          <span className="absolute left-3 top-3 chip !border-mint/40 !text-mint">scan IA actif</span>
        </div>
      )}
      <div className="w-full max-w-md space-y-3">
        {steps.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div
              key={s}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-500 ${
                done
                  ? "border-mint/25 bg-mint/[0.06]"
                  : active
                    ? "border-mint/40 bg-mint/[0.08] shadow-[0_0_24px_rgba(46,242,161,0.1)]"
                    : "border-line bg-transparent opacity-40"
              }`}
            >
              {done ? (
                <CheckCircle2 size={17} className="shrink-0 text-mint" />
              ) : active ? (
                <Loader2 size={17} className="shrink-0 animate-spin text-mint" />
              ) : (
                <span className="h-[17px] w-[17px] shrink-0 rounded-full border border-fog/30" />
              )}
              <span className={`text-sm ${done || active ? "text-white/90" : "text-fog"}`}>{s}</span>
              {active && <span className="ml-auto animate-blink font-data text-mint">▍</span>}
            </div>
          );
        })}
      </div>
      <p className="font-data text-[0.7rem] uppercase tracking-[0.3em] text-fog/60">
        le modèle vision décortique votre marché
      </p>
    </motion.div>
  );
}

/* --------------------------- Confidence ring --------------------------- */

function ConfidenceRing({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? "#2ef2a1" : value >= 45 ? "#f5c66a" : "#ff5470";
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(148,233,205,0.12)" strokeWidth="5" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * value) / 100 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-data text-sm font-bold leading-none" style={{ color }}>
          {value}
        </span>
        <span className="text-[0.5rem] uppercase tracking-wider text-fog/70">conf.</span>
      </div>
    </div>
  );
}

/* ------------------------------- Ladder ------------------------------- */

interface LadderPoint {
  key: string;
  label: string;
  price: number;
  color: string;
  glow: string;
  rr: number | null;
  dashed?: boolean;
}

function TradeLadder({ plan }: { plan: TradePlan }) {
  const isShort = plan.direction === "SHORT";
  const points: LadderPoint[] = [
    { key: "sl", label: "STOP LOSS", price: plan.stop_loss, color: "#ff5470", glow: "rgba(255,84,112,0.5)", rr: -1 },
    { key: "entry", label: "ENTRÉE", price: plan.entree, color: "#eafff6", glow: "rgba(234,255,246,0.45)", rr: null },
  ];
  if (plan.tp1) points.push({ key: "tp1", label: "TP 1", price: plan.tp1, color: "#2ef2a1", glow: "rgba(46,242,161,0.5)", rr: plan.rr1, dashed: true });
  if (plan.tp2) points.push({ key: "tp2", label: "TP 2", price: plan.tp2, color: "#6cf7bc", glow: "rgba(46,242,161,0.4)", rr: plan.rr2, dashed: true });
  if (plan.tp3) points.push({ key: "tp3", label: "TP 3", price: plan.tp3, color: "#9ffbd1", glow: "rgba(46,242,161,0.3)", rr: plan.rr3, dashed: true });

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.abs(plan.entree) * 0.002 || 1;
  const lo = min - span * 0.14;
  const hi = max + span * 0.14;
  const pct = (v: number) => ((hi - v) / (hi - lo)) * 100;

  const entryPct = pct(plan.entree);
  const slPct = pct(plan.stop_loss);
  const tps = points.filter((p) => p.key.startsWith("tp")).map((p) => p.price);
  const farTp = tps.length ? (isShort ? Math.min(...tps) : Math.max(...tps)) : null;
  const tpPct = farTp !== null ? pct(farTp) : null;

  const zoneTop = isShort ? slPct : tpPct ?? entryPct;
  const zoneMid1 = isShort ? entryPct : entryPct;
  // Zone gain (mint) entre entrée et TP le plus lointain ; zone risque (rouge) entre entrée et SL.
  const winTop = isShort ? entryPct : tpPct ?? entryPct;
  const winBottom = isShort ? tpPct ?? entryPct : entryPct;
  const riskTop = isShort ? slPct : entryPct;
  const riskBottom = isShort ? entryPct : slPct;
  void zoneTop; void zoneMid1;

  return (
    <div className="relative h-[430px] select-none overflow-hidden rounded-2xl border border-line bg-ink/70">
      {/* grille */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,233,205,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,233,205,0.05) 1px, transparent 1px)",
          backgroundSize: "100% 20%, 12.5% 100%",
        }}
      />
      {/* zone gain */}
      {tpPct !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="absolute left-0 right-0"
          style={{
            top: `${Math.min(winTop, winBottom)}%`,
            height: `${Math.abs(winBottom - winTop)}%`,
            background: "linear-gradient(180deg, rgba(46,242,161,0.14), rgba(46,242,161,0.02))",
          }}
        />
      )}
      {/* zone risque */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.8 }}
        className="absolute left-0 right-0"
        style={{
          top: `${Math.min(riskTop, riskBottom)}%`,
          height: `${Math.abs(riskBottom - riskTop)}%`,
          background: "linear-gradient(180deg, rgba(255,84,112,0.03), rgba(255,84,112,0.13))",
        }}
      />

      {points.map((p, i) => {
        const top = pct(p.price);
        return (
          <motion.div
            key={p.key}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + i * 0.14, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0"
            style={{ top: `${top}%` }}
          >
            <div
              className={`h-px w-full ${p.dashed ? "" : ""}`}
              style={{
                background: p.dashed
                  ? `repeating-linear-gradient(90deg, ${p.color} 0 8px, transparent 8px 15px)`
                  : p.color,
                boxShadow: `0 0 12px ${p.glow}`,
                opacity: 0.9,
              }}
            />
            <span
              className="absolute -top-[11px] left-4 rounded-md border px-2 py-[3px] text-[0.6rem] font-bold uppercase tracking-[0.14em]"
              style={{ color: p.color, borderColor: `${p.color}55`, background: "rgba(4,9,11,0.9)", marginLeft: 0 }}
            >
              {p.label}
              {p.rr !== null && p.rr > 0 && (
                <span className="ml-1.5 font-data font-medium opacity-80">+{String(p.rr).replace(".", ",")}R</span>
              )}
              {p.rr === -1 && <span className="ml-1.5 font-data font-medium opacity-80">−1R</span>}
            </span>
            <span
              className="font-data absolute -top-[11px] right-4 rounded-md px-2 py-[3px] text-[0.78rem] font-semibold"
              style={{ color: p.color, background: "rgba(4,9,11,0.85)", textShadow: `0 0 12px ${p.glow}` }}
            >
              {formatPrice(p.price)}
            </span>
          </motion.div>
        );
      })}

      <span className="absolute bottom-3 left-4 font-data text-[0.6rem] uppercase tracking-[0.25em] text-fog/40">
        Échelle du plan · {plan.timeframe}
      </span>
    </div>
  );
}

/* ------------------------------ Result view ------------------------------ */

const rise = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function ResultView({ status, plan, error, image, steps, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  const copyPlan = async () => {
    if (!plan) return;
    const lines = [
      `ORACLE · ${plan.pair} (${plan.timeframe})`,
      `Biais : ${plan.direction} — tendance ${plan.tendance} · confiance ${plan.confiance}%`,
      `Entrée : ${formatPrice(plan.entree)}`,
      `Stop Loss : ${formatPrice(plan.stop_loss)}`,
      `TP1 : ${formatPrice(plan.tp1)}${plan.rr1 ? ` (+${plan.rr1}R)` : ""}`,
      plan.tp2 ? `TP2 : ${formatPrice(plan.tp2)}${plan.rr2 ? ` (+${plan.rr2}R)` : ""}` : null,
      plan.tp3 ? `TP3 : ${formatPrice(plan.tp3)}${plan.rr3 ? ` (+${plan.rr3}R)` : ""}` : null,
      plan.positionSize ? `Taille : ${formatPrice(plan.positionSize)} unités (risque ${formatMoney(plan.riskAmount)})` : null,
      plan.invalidation ? `Invalidation : ${plan.invalidation}` : null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* presse-papier indisponible */
    }
  };

  return (
    <div className="min-h-[520px]">
      <AnimatePresence mode="wait">
        {status === "loading" && <AnalysisLoader key="l" image={image} steps={steps} />}

        {status === "error" && (
          <motion.div
            key="e"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="panel flex flex-col items-center gap-4 border-danger/25 p-10 text-center"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
              <OctagonAlert size={26} />
            </span>
            <h3 className="font-display text-lg font-semibold text-white">{error?.message ?? "Erreur inattendue"}</h3>
            {error?.detail && (
              <p className="max-w-md font-data text-[0.75rem] leading-relaxed text-fog/80">{error.detail}</p>
            )}
            <p className="max-w-md text-[0.78rem] leading-relaxed text-fog/60">
              Vérifiez votre clé, vos crédits OpenRouter et la lisibilité du graphique (échelle de prix visible),
              puis relancez l&apos;analyse.
            </p>
            <button onClick={onReset} className="btn-ghost mt-2">
              <RotateCcw size={14} /> Réessayer
            </button>
          </motion.div>
        )}

        {status === "idle" && (
          <motion.div
            key="i"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="panel relative flex min-h-[520px] flex-col items-center justify-center gap-8 overflow-hidden p-10 text-center"
          >
            <span className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-mint/10 blur-[90px]" />
            <div className="relative">
              <span className="absolute inset-0 animate-ping rounded-full border border-mint/30" style={{ animationDuration: "2.4s" }} />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-mint/25 bg-mint/[0.07] text-mint shadow-[0_0_50px_rgba(46,242,161,0.15)]">
                <ScanSearch size={34} strokeWidth={1.6} />
              </span>
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold text-white/90">En attente d&apos;un graphique</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fog/75">
                Configurez votre environnement à gauche, importez la capture du marché, et ORACLE tracera le plan :
                tendance, entrée, stop loss et objectifs.
              </p>
            </div>
            <div className="grid w-full max-w-lg grid-cols-3 gap-3">
              {[
                { n: "01", t: "Clé & modèle", d: "Connectez OpenRouter" },
                { n: "02", t: "Capture", d: "Paire + timeframe + image" },
                { n: "03", t: "Plan de trade", d: "Entrée · SL · TP suivant la tendance" },
              ].map((s, i) => (
                <motion.div
                  key={s.n}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={i}
                  className="rounded-2xl border border-line bg-ink/60 p-4 text-left"
                >
                  <span className="font-data text-[0.62rem] tracking-[0.3em] text-mint/70">{s.n}</span>
                  <p className="mt-1.5 text-[0.8rem] font-semibold text-white/85">{s.t}</p>
                  <p className="mt-0.5 text-[0.68rem] leading-snug text-fog/60">{s.d}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {status === "done" && plan && (
          <motion.div key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* En-tête */}
            <motion.div variants={rise} initial="hidden" animate="show" custom={0} className="panel flex flex-wrap items-center gap-5 p-6">
              <div
                className={`flex items-center gap-3 rounded-2xl border px-5 py-3.5 ${
                  plan.direction === "LONG"
                    ? "border-mint/40 bg-mint/[0.09] shadow-[0_0_40px_rgba(46,242,161,0.15)]"
                    : plan.direction === "SHORT"
                      ? "border-danger/40 bg-danger/[0.09] shadow-[0_0_40px_rgba(255,84,112,0.15)]"
                      : "border-gold/40 bg-gold/[0.08]"
                }`}
              >
                {plan.direction === "LONG" && <TrendingUp size={26} className="text-glow-mint text-mint" />}
                {plan.direction === "SHORT" && <TrendingDown size={26} className="text-glow-danger text-danger" />}
                {plan.direction === "NEUTRE" && <Minus size={26} className="text-gold" />}
                <div>
                  <p
                    className={`font-display text-2xl font-bold leading-none tracking-wide ${
                      plan.direction === "LONG" ? "text-glow-mint text-mint" : plan.direction === "SHORT" ? "text-glow-danger text-danger" : "text-gold"
                    }`}
                  >
                    {plan.direction === "NEUTRE" ? "ATTENTE" : plan.direction}
                  </p>
                  <p className="mt-1 text-[0.66rem] uppercase tracking-[0.2em] text-fog">tendance {plan.tendance}</p>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-white">{plan.pair}</h3>
                  <span className="chip !text-mint !border-mint/30">{plan.timeframe}</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-[0.84rem] leading-relaxed text-fog">{plan.resumer_tendance}</p>
              </div>

              <ConfidenceRing value={plan.confiance} />
            </motion.div>

            {/* Meta + actions */}
            <motion.div variants={rise} initial="hidden" animate="show" custom={1} className="flex flex-wrap items-center gap-2.5 px-1">
              <span className="chip">
                <Clock3 size={11} />
                {new Date(plan.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="chip !border-mint/25">
                <Sparkles size={11} className="text-mint" />
                IA auto · {modelLabel(plan.model)}
              </span>
              {plan.marketSource && (
                <span className="chip">
                  <CandlestickChart size={11} className="text-mint" />
                  {plan.marketSource}
                </span>
              )}
              {plan.lastPrice !== null && plan.lastPrice !== undefined && (
                <span className="chip">
                  dernier&nbsp;<span className="font-data text-white/85">{formatPrice(plan.lastPrice)}</span>
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={copyPlan} className="btn-ghost">
                  {copied ? <Check size={14} className="text-mint" /> : <Copy size={14} />}
                  {copied ? "Copié !" : "Copier le plan"}
                </button>
                <button onClick={onReset} className="btn-ghost">
                  <RotateCcw size={14} /> Nouvelle analyse
                </button>
              </div>
            </motion.div>

            {/* Échelle + cartes niveaux */}
            <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <motion.div variants={rise} initial="hidden" animate="show" custom={2} className="panel p-5">
                <h4 className="mb-4 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-fog">
                  <Crosshair size={13} className="text-mint" /> Cartographie du plan
                </h4>
                <TradeLadder plan={plan} />
              </motion.div>

              <motion.div variants={rise} initial="hidden" animate="show" custom={3} className="flex flex-col gap-5">
                {/* Niveaux */}
                <div className="panel p-5">
                  <h4 className="mb-4 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-fog">
                    <Target size={13} className="text-mint" /> Niveaux d&apos;exécution
                  </h4>
                  <div className="space-y-2.5">
                    {[
                      { l: "Entrée", v: plan.entree, c: "#eafff6", icon: <Crosshair size={14} />, d: null as string | null },
                      {
                        l: "Stop Loss",
                        v: plan.stop_loss,
                        c: "#ff5470",
                        icon: <ShieldAlert size={14} />,
                        d: `${(((plan.stop_loss - plan.entree) / plan.entree) * 100).toFixed(2).replace(".", ",")} %`,
                      },
                      { l: "Take Profit 1", v: plan.tp1, c: "#2ef2a1", icon: <Target size={14} />, d: plan.rr1 ? `+${String(plan.rr1).replace(".", ",")}R` : null },
                      plan.tp2 ? { l: "Take Profit 2", v: plan.tp2, c: "#6cf7bc", icon: <Target size={14} />, d: plan.rr2 ? `+${String(plan.rr2).replace(".", ",")}R` : null } : null,
                      plan.tp3 ? { l: "Take Profit 3", v: plan.tp3, c: "#9ffbd1", icon: <Target size={14} />, d: plan.rr3 ? `+${String(plan.rr3).replace(".", ",")}R` : null } : null,
                    ]
                      .filter((x): x is NonNullable<typeof x> => Boolean(x))
                      .map((row) => (
                        <div
                          key={row.l}
                          className="flex items-center gap-3 rounded-xl border border-line bg-ink/60 px-4 py-3 transition-colors hover:border-mint/25"
                        >
                          <span style={{ color: row.c }}>{row.icon}</span>
                          <span className="text-[0.78rem] font-medium text-fog">{row.l}</span>
                          {row.d && (
                            <span className="font-data rounded-md px-1.5 py-0.5 text-[0.66rem]" style={{ color: row.c, background: `${row.c}14` }}>
                              {row.d}
                            </span>
                          )}
                          <span className="font-data ml-auto text-[0.92rem] font-semibold" style={{ color: row.c }}>
                            {formatPrice(row.v)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Sizing */}
                <div className="panel p-5">
                  <h4 className="mb-4 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-fog">
                    <Wallet size={13} className="text-mint" /> Dimensionnement
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { l: "Capital", v: formatMoney(plan.capital) },
                      { l: `Risque (${String(plan.riskPercent).replace(".", ",")} %)`, v: formatMoney(plan.riskAmount), accent: true },
                      { l: "Taille position", v: plan.positionSize ? `${formatPrice(plan.positionSize)} u.` : "—", accent: true },
                      {
                        l: "Valeur notionnelle",
                        v: plan.notional ? formatMoney(plan.notional) : "—",
                        sub: plan.notional && plan.capital ? `≈ ×${(plan.notional / plan.capital).toFixed(2).replace(".", ",")} du capital` : undefined,
                      },
                    ].map((c) => (
                      <div key={c.l} className={`rounded-xl border px-3.5 py-3 ${c.accent ? "border-mint/20 bg-mint/[0.05]" : "border-line bg-ink/60"}`}>
                        <p className="text-[0.62rem] uppercase tracking-[0.14em] text-fog/70">{c.l}</p>
                        <p className={`font-data mt-1 text-[0.95rem] font-semibold ${c.accent ? "text-mint" : "text-white/90"}`}>{c.v}</p>
                        {c.sub && <p className="mt-0.5 text-[0.62rem] text-fog/55">{c.sub}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Niveaux clés */}
            {plan.niveaux_cles.length > 0 && (
              <motion.div variants={rise} initial="hidden" animate="show" custom={4} className="panel p-5">
                <h4 className="mb-4 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-fog">
                  <Layers size={13} className="text-mint" /> Niveaux clés du graphique
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  {plan.niveaux_cles.map((n, i) => (
                    <span key={i} className="flex items-center gap-2 rounded-xl border border-line bg-ink/60 px-3.5 py-2.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: n.type === "support" ? "#2ef2a1" : n.type === "resistance" ? "#ff5470" : "#f5c66a",
                          boxShadow: `0 0 10px ${n.type === "support" ? "rgba(46,242,161,0.7)" : n.type === "resistance" ? "rgba(255,84,112,0.7)" : "rgba(245,198,106,0.7)"}`,
                        }}
                      />
                      <span className="font-data text-[0.82rem] font-semibold text-white/90">{formatPrice(n.prix)}</span>
                      <span className="text-[0.7rem] text-fog/75">{n.label || (n.type === "support" ? "Support" : n.type === "resistance" ? "Résistance" : "Niveau")}</span>
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Analyse + confluences */}
            <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <motion.div variants={rise} initial="hidden" animate="show" custom={5} className="panel p-6">
                <h4 className="mb-4 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-fog">
                  <BookOpenText size={13} className="text-mint" /> Lecture du marché
                </h4>
                {plan.contexte && (
                  <p className="mb-4 rounded-xl border border-mint/15 bg-mint/[0.05] px-4 py-3 text-[0.84rem] leading-relaxed text-mint/90">
                    {plan.contexte}
                  </p>
                )}
                <div className="space-y-3.5">
                  {plan.analyse
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((p, i) => (
                      <p key={i} className="text-[0.86rem] leading-[1.75] text-white/75">
                        {p}
                      </p>
                    ))}
                </div>
              </motion.div>

              <motion.div variants={rise} initial="hidden" animate="show" custom={6} className="flex flex-col gap-5">
                {plan.confluences.length > 0 && (
                  <div className="panel p-6">
                    <h4 className="mb-4 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-fog">
                      <ListChecks size={13} className="text-mint" /> Confluences détectées
                    </h4>
                    <ul className="space-y-3">
                      {plan.confluences.map((c, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: 14 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.7 + i * 0.1 }}
                          className="flex items-start gap-3 text-[0.82rem] leading-relaxed text-white/80"
                        >
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-mint" />
                          {c}
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                )}

                {plan.invalidation && (
                  <div className="panel !border-danger/25 p-6">
                    <h4 className="mb-3 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-danger/90">
                      <OctagonAlert size={13} /> Invalidation
                    </h4>
                    <p className="text-[0.82rem] leading-relaxed text-white/75">{plan.invalidation}</p>
                  </div>
                )}
              </motion.div>
            </div>

            <motion.p variants={rise} initial="hidden" animate="show" custom={7} className="px-2 pb-4 text-center text-[0.66rem] leading-relaxed text-fog/45">
              ORACLE est un outil d&apos;aide à la décision — les marchés comportent des risques. Ceci n&apos;est pas un conseil
              financier : validez toujours par votre propre analyse et respectez votre gestion du risque.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
