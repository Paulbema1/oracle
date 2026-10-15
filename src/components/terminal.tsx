"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ScanEye, ArrowDownRight, ArrowUpRight, Radio } from "lucide-react";
import BackgroundCanvas from "@/components/background-canvas";
import ConfigPanel, { type ConfigState } from "@/components/config-panel";
import ResultView, { type ViewStatus } from "@/components/result-view";
import HistoryPanel from "@/components/history-panel";
import { captureTradingChart } from "@/lib/render-chart";
import { authHeaders, setToken } from "@/lib/client-auth";
import type { AnalysisRow } from "@/db/schema";
import type { Direction, MarketResponse, TradePlan } from "@/lib/types";

const LS_KEY = "oracle:cfg:v2";

const TICKER = [
  { s: "BTC/USDT", p: "97 842,5", d: 1.8 },
  { s: "ETH/USDT", p: "3 412,9", d: 2.4 },
  { s: "XAU/USD", p: "2 914,30", d: 0.6 },
  { s: "EUR/USD", p: "1,0842", d: -0.2 },
  { s: "SOL/USDT", p: "214,66", d: 4.1 },
  { s: "GBP/JPY", p: "192,447", d: -0.4 },
  { s: "US30", p: "44 582,1", d: 0.9 },
  { s: "NAS100", p: "21 308,4", d: 1.2 },
  { s: "BNB/USDT", p: "694,20", d: -0.8 },
  { s: "USD/JPY", p: "154,882", d: 0.3 },
];

const AUTO_STEPS = [
  "Téléchargement des chandeliers temps réel",
  "Génération du graphique TradingView (EMA + volumes)",
  "Envoi du graphique au modèle IA",
  "Lecture de la structure & tendance",
  "Placement entrée / SL / TP suivant la tendance",
  "Calcul du sizing & ratio R",
];

const MANUAL_STEPS = [
  "Décodage du graphique envoyé",
  "Lecture de la structure & tendance",
  "Repérage des zones de liquidité",
  "Placement entrée / SL / TP",
  "Calcul du sizing & ratio R",
];

function rowToPlan(r: AnalysisRow): TradePlan {
  return {
    id: r.id,
    pair: r.pair,
    timeframe: r.timeframe,
    model: r.model,
    marketSource: r.marketSource ?? null,
    lastPrice: r.lastPrice ?? null,
    direction: (r.direction as Direction) || "NEUTRE",
    tendance: r.tendance === "haussière" || r.tendance === "baissière" ? r.tendance : "range",
    confiance: r.confiance ?? 0,
    entree: r.entree ?? 0,
    stop_loss: r.stopLoss ?? 0,
    tp1: r.tp1 ?? 0,
    tp2: r.tp2,
    tp3: r.tp3,
    rr1: r.rr1,
    rr2: r.rr2,
    rr3: r.rr3,
    capital: r.capital ?? 0,
    riskPercent: r.riskPercent ?? 1,
    riskAmount: r.riskAmount ?? 0,
    positionSize: r.positionSize,
    notional: r.notional,
    resumer_tendance: r.resumerTendance ?? "",
    contexte: r.contexte ?? "",
    analyse: r.analyse ?? "",
    invalidation: r.invalidation ?? "",
    niveaux_cles: (r.niveauxCles ?? []).map((n) => ({
      prix: n.prix,
      type: n.type === "resistance" ? "resistance" : n.type === "support" ? "support" : "autre",
      label: n.label,
    })),
    confluences: r.confluences ?? [],
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

export default function Terminal() {
  const [cfg, setCfg] = useState<ConfigState>({
    apiKey: "",
    dbUrl: "",
    pair: "",
    timeframe: "4H",
    capital: "10000",
    riskPercent: 1,
    autoCapture: true,
    image: null,
    imageAuto: false,
  });
  const [hydrated, setHydrated] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "ok" | "locked">("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState(false);
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [plan, setPlan] = useState<TradePlan | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [loaderSteps, setLoaderSteps] = useState<string[]>(AUTO_STEPS);
  const resultRef = useRef<HTMLDivElement>(null);

  // Restauration locale (clé API, chaîne DB & préférences — jamais persistées ailleurs).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<ConfigState>;
        setCfg((c) => ({ ...c, ...saved, image: null, imageAuto: false }));
      }
    } catch {
      /* stockage indisponible */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const { image: _img, imageAuto: _ia, ...rest } = cfg;
      localStorage.setItem(LS_KEY, JSON.stringify(rest));
    } catch {
      /* stockage indisponible */
    }
  }, [cfg, hydrated]);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store", headers: authHeaders() });
      const j = (await res.json()) as { required: boolean; ok: boolean };
      const ok = !j.required || j.ok;
      setAuthState(ok ? "ok" : "locked");
      return ok;
    } catch {
      setAuthState("ok"); // serveur injoignable : on laisse l'UI, les appels afficheront l'erreur
      return true;
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const submitToken = async () => {
    setToken(tokenInput.trim());
    const ok = await checkAuth();
    setTokenError(!ok);
  };

  const patchCfg = useCallback((patch: Partial<ConfigState>) => {
    setCfg((c) => ({ ...c, ...patch }));
  }, []);

  const dbHeaders = useCallback((): HeadersInit => {
    return { ...authHeaders(), ...(cfg.dbUrl.trim() ? { "x-oracle-db": cfg.dbUrl.trim() } : {}) };
  }, [cfg.dbUrl]);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history", { cache: "no-store", headers: dbHeaders() });
      if (res.ok) setHistory((await res.json()) as AnalysisRow[]);
      else setHistory([]);
    } catch {
      /* silencieux */
    } finally {
      setHistLoading(false);
    }
  }, [dbHeaders]);

  useEffect(() => {
    if (!hydrated || authState !== "ok") return;
    setHistLoading(true);
    void refreshHistory();
  }, [hydrated, authState, refreshHistory]);

  const scrollToResult = () => {
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  /** Capture auto : récupère les chandeliers et génère la capture TradingView. */
  const captureAuto = async (): Promise<{ image: string; source: string; lastClose: number }> => {
    const res = await fetch(
      `/api/market?symbol=${encodeURIComponent(cfg.pair.trim())}&tf=${encodeURIComponent(cfg.timeframe)}`,
      { cache: "no-store", headers: authHeaders() },
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(JSON.stringify({ message: data.error ?? "Données introuvables.", detail: data.detail }));
    }
    const market = data as MarketResponse;
    const shot = await captureTradingChart(market.candles);
    const providerLabel = market.provider === "binance" ? "Binance" : market.provider === "kraken" ? "Kraken" : "Yahoo Finance";
    const source = `${providerLabel} · ${market.symbol}`;
    patchCfg({ image: shot, imageAuto: true });
    return { image: shot, source, lastClose: market.lastClose };
  };

  const analyze = async () => {
    if (status === "loading") return;
    setError(null);

    let image = cfg.image;
    let marketSource: string | null = null;
    let lastPrice: number | null = null;

    setLoaderSteps(cfg.autoCapture ? AUTO_STEPS : MANUAL_STEPS);
    setStatus("loading");
    scrollToResult();

    try {
      if (cfg.autoCapture) {
        const cap = await captureAuto();
        image = cap.image;
        marketSource = cap.source;
        lastPrice = cap.lastClose;
      }

      if (!image) {
        setError({ message: "Aucun graphique à analyser.", detail: "Ajoutez une capture ou activez le mode automatique." });
        setStatus("error");
        return;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          apiKey: cfg.apiKey,
          dbUrl: cfg.dbUrl.trim() || undefined,
          pair: cfg.pair,
          timeframe: cfg.timeframe,
          capital: Number(cfg.capital.replace(",", ".")) || 0,
          riskPercent: cfg.riskPercent,
          image,
          marketSource: marketSource ?? (cfg.imageAuto ? "Capture auto" : "Capture manuelle"),
          lastPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.error ?? "Analyse impossible.", detail: data.detail });
        setStatus("error");
      } else {
        setPlan(data as TradePlan);
        setStatus("done");
        void refreshHistory();
      }
    } catch (e) {
      let parsed = { message: "Connexion interrompue.", detail: "Le processus a échoué. Réessayez." };
      if (e instanceof Error) {
        try {
          parsed = JSON.parse(e.message) as typeof parsed;
        } catch {
          parsed = { message: e.message || parsed.message, detail: parsed.detail };
        }
      }
      setError(parsed);
      setStatus("error");
    }
  };

  const deleteOne = async (id: string) => {
    setHistory((h) => h.filter((r) => r.id !== id));
    try {
      await fetch(`/api/history/${id}`, { method: "DELETE", headers: dbHeaders() });
    } catch {
      /* silencieux */
    }
  };

  const clearAll = async () => {
    setHistory([]);
    try {
      await fetch("/api/history", { method: "DELETE", headers: dbHeaders() });
    } catch {
      /* silencieux */
    }
  };

  const openFromHistory = (row: AnalysisRow) => {
    setPlan(rowToPlan(row));
    setStatus("done");
    setError(null);
    scrollToResult();
  };

  const busy = status === "loading";

  if (authState !== "ok") {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-5">
        <BackgroundCanvas />
        {authState === "locked" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitToken();
            }}
            className="relative z-10 flex w-full max-w-sm flex-col gap-3"
          >
            <p className="font-display text-lg font-bold tracking-[0.18em] text-white">
              ORACLE<span className="text-mint">.</span>
            </p>
            <input
              type="password"
              autoFocus
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Jeton d'accès"
              className="field font-data text-[0.9rem]"
            />
            {tokenError && <p className="text-[0.75rem] text-danger">Jeton incorrect.</p>}
            <button type="submit" className="chip !border-mint/30 !text-mint justify-center py-2">
              Entrer
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <BackgroundCanvas />
      <div className="grid-bg pointer-events-none fixed inset-0 z-0" />
      <div className="noise" />
      <span className="pointer-events-none fixed -left-40 top-1/3 z-0 h-[420px] w-[420px] rounded-full bg-mint/[0.05] blur-[120px]" />
      <span className="pointer-events-none fixed -right-40 top-0 z-0 h-[380px] w-[380px] rounded-full bg-ice/[0.04] blur-[110px]" />

      {/* ------------------------------ Header ------------------------------ */}
      <header className="sticky top-0 z-30 border-b border-line/60 bg-abyss/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-5 py-3.5 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-mint/30 bg-mint/10 text-mint shadow-[0_0_28px_rgba(46,242,161,0.25)]">
              <ScanEye size={20} strokeWidth={1.8} />
            </span>
            <div>
              <p className="font-display text-lg font-bold leading-none tracking-[0.18em] text-white">
                ORACLE<span className="text-mint text-glow-mint">.</span>
              </p>
              <p className="mt-1 text-[0.6rem] uppercase tracking-[0.3em] text-fog/70">analyse ia de marché</p>
            </div>
          </div>

          {/* ticker */}
          <div className="relative ml-4 hidden flex-1 overflow-hidden md:block" style={{ maskImage: "linear-gradient(90deg, transparent, black 6%, black 94%, transparent)" }}>
            <div className="animate-ticker flex w-max items-center gap-8 py-1">
              {[...TICKER, ...TICKER].map((t, i) => (
                <span key={i} className="flex items-center gap-2 whitespace-nowrap font-data text-[0.7rem]">
                  <span className="text-fog/80">{t.s}</span>
                  <span className="text-white/80">{t.p}</span>
                  <span className={`flex items-center gap-0.5 ${t.d >= 0 ? "text-mint" : "text-danger"}`}>
                    {t.d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {Math.abs(t.d).toFixed(1).replace(".", ",")}%
                  </span>
                </span>
              ))}
            </div>
          </div>

          {cfg.dbUrl.trim() && (
            <span className="chip hidden !border-ice/30 !text-ice sm:inline-flex">base perso</span>
          )}
          <span className={`chip !border-mint/30 !text-mint ${cfg.dbUrl.trim() ? "" : "ml-auto"}`}>
            <Radio size={11} className="animate-pulse-soft" />
            openrouter
          </span>
        </div>
      </header>

      {/* ------------------------------- Hero ------------------------------- */}
      <div className="relative z-10 mx-auto max-w-[1500px] px-5 pt-10 lg:px-8 lg:pt-14">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <p className="font-data text-[0.66rem] uppercase tracking-[0.42em] text-mint/80">
            // terminal d&apos;analyse · graphique auto · ia vision openrouter
          </p>
          <h1 className="font-display mt-4 max-w-4xl text-[clamp(2rem,4.6vw,3.6rem)] font-bold leading-[1.04] tracking-tight text-white">
            Donnez un actif.
            <br />
            <span className="text-glow-mint text-mint">ORACLE</span> capte le marché et trace le{" "}
            <span className="relative inline-block">
              plan de trade
              <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 220 10" fill="none" preserveAspectRatio="none">
                <path d="M2 8C60 2 160 2 218 6" stroke="rgba(46,242,161,0.5)" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </span>
            .
          </h1>
          <p className="mt-4 max-w-xl text-[0.92rem] leading-relaxed text-fog">
            Tapez simplement l&apos;actif et le timeframe : le graphique TradingView est généré automatiquement à partir
            des données temps réel, puis l&apos;IA lit la tendance et calcule entrée, stop loss, objectifs et taille de position.
          </p>
        </motion.div>
      </div>

      {/* ------------------------------- Main ------------------------------- */}
      <main className="relative z-10 mx-auto grid max-w-[1500px] items-start gap-6 px-5 py-8 lg:grid-cols-[410px_minmax(0,1fr)] lg:px-8 lg:py-10">
        <div className="lg:sticky lg:top-[76px]">
          <ConfigPanel cfg={cfg} onChange={patchCfg} busy={busy} onAnalyze={analyze} />
        </div>

        <div ref={resultRef} className="flex min-w-0 scroll-mt-24 flex-col gap-6">
          <ResultView
            status={status}
            plan={plan}
            error={error}
            image={cfg.image}
            steps={loaderSteps}
            onReset={() => setStatus("idle")}
          />
          <HistoryPanel
            rows={history}
            loading={histLoading}
            externalDb={Boolean(cfg.dbUrl.trim())}
            onOpen={openFromHistory}
            onDelete={deleteOne}
            onClear={clearAll}
            onRefresh={() => {
              setHistLoading(true);
              void refreshHistory();
            }}
          />
        </div>
      </main>

      <footer className="relative z-10 border-t border-line/50">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-5 lg:px-8">
          <p className="font-data text-[0.62rem] uppercase tracking-[0.3em] text-fog/45">
            oracle © 2026 — trader est risqué, analysez deux fois
          </p>
          <p className="text-[0.66rem] text-fog/40">
            Historique sur base locale ou VOTRE PostgreSQL · vos secrets restent dans votre navigateur.
          </p>
        </div>
      </footer>
    </div>
  );
}
