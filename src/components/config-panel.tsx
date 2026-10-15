"use client";

import { authHeaders } from "@/lib/client-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  KeyRound,
  Eye,
  EyeOff,
  Cpu,
  Coins,
  ImageUp,
  X,
  ShieldCheck,
  Zap,
  Gauge,
  ClipboardPaste,
  TrendingUp,
  Database,
  PlugZap,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { formatMoney } from "@/lib/types";

const TF_CHOICES = ["5m", "15m", "30m", "1H", "2H", "4H", "1D", "1W"];

export interface ConfigState {
  apiKey: string;
  dbUrl: string;
  pair: string;
  timeframe: string;
  capital: string;
  riskPercent: number;
  autoCapture: boolean;
  image: string | null;
  imageAuto: boolean; // true si l'image vient de la capture automatique
}

interface Props {
  cfg: ConfigState;
  onChange: (patch: Partial<ConfigState>) => void;
  busy: boolean;
  onAnalyze: () => void;
}

type DbTestState = { status: "idle" | "testing" | "ok" | "fail"; message?: string };

async function compressImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1500;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const cx = canvas.getContext("2d");
  if (!cx) throw new Error("canvas indisponible");
  cx.imageSmoothingQuality = "high";
  cx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

function FieldLabel({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-fog">
        <span className="text-mint/80">{icon}</span>
        {children}
      </span>
      {aside}
    </div>
  );
}

export default function ConfigPanel({ cfg, onChange, busy, onAnalyze }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [showDb, setShowDb] = useState(false);
  const [dbTest, setDbTest] = useState<DbTestState>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Réinitialise l'état du test quand la chaîne change
  useEffect(() => {
    setDbTest({ status: "idle" });
  }, [cfg.dbUrl]);

  const testDb = async () => {
    if (!cfg.dbUrl.trim()) return;
    setDbTest({ status: "testing" });
    try {
      const res = await fetch("/api/dbcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dbUrl: cfg.dbUrl }),
      });
      const data = (await res.json()) as { ok: boolean; count?: number; latencyMs?: number; error?: string };
      if (res.ok && data.ok) {
        setDbTest({
          status: "ok",
          message: `Connectée en ${data.latencyMs ?? "?"} ms — ${data.count ?? 0} analyse(s) trouvée(s)`,
        });
      } else {
        setDbTest({ status: "fail", message: data.error ?? "Connexion impossible" });
      }
    } catch {
      setDbTest({ status: "fail", message: "Serveur injoignable" });
    }
  };

  // Collage direct (Ctrl/Cmd+V) en mode manuel
  useEffect(() => {
    if (cfg.autoCapture) return;
    const onPaste = async (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      try {
        onChange({ image: await compressImage(file), imageAuto: false });
        setImgError(null);
      } catch {
        setImgError("Impossible de lire l'image collée.");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onChange, cfg.autoCapture]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setImgError("Format non supporté — envoyez une image (PNG, JPG…).");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setImgError("Image trop lourde (15 Mo max).");
        return;
      }
      try {
        onChange({ image: await compressImage(file), imageAuto: false });
        setImgError(null);
      } catch {
        setImgError("Impossible de traiter cette image.");
      }
    },
    [onChange],
  );

  const capNum = Number(cfg.capital.replace(",", "."));
  const riskAmount = Number.isFinite(capNum) && capNum > 0 ? (capNum * cfg.riskPercent) / 100 : 0;
  const canAnalyze = Boolean(cfg.apiKey.trim() && cfg.pair.trim() && (cfg.autoCapture || cfg.image)) && !busy;

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="panel flex flex-col gap-6 p-6 lg:p-7"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-white/90">
          Paramètres d&apos;analyse
        </h2>
        <span className="chip">
          <ShieldCheck size={12} className="text-mint" />
          clé locale
        </span>
      </div>

      {/* Clé API */}
      <div>
        <FieldLabel
          icon={<KeyRound size={13} />}
          aside={
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-[0.68rem] text-mint/70 underline-offset-2 transition-colors hover:text-mint hover:underline"
            >
              obtenir une clé ↗
            </a>
          }
        >
          Clé API OpenRouter
        </FieldLabel>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={cfg.apiKey}
            onChange={(e) => onChange({ apiKey: e.target.value.trim() })}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            spellCheck={false}
            className="field font-data pr-11 text-[0.82rem]"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fog/70 transition-colors hover:text-mint"
            aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Chaîne de connexion PostgreSQL */}
      <div>
        <FieldLabel
          icon={<Database size={13} />}
          aside={
            cfg.dbUrl.trim() ? (
              <span className="chip !border-mint/30 !py-[2px] !text-[0.58rem] !text-mint">votre base</span>
            ) : (
              <span className="text-[0.66rem] text-fog/55">optionnel · base locale sinon</span>
            )
          }
        >
          Chaîne PostgreSQL
        </FieldLabel>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showDb ? "text" : "password"}
              value={cfg.dbUrl}
              onChange={(e) => onChange({ dbUrl: e.target.value.trim() })}
              placeholder="postgresql://user:pass@host/db"
              autoComplete="off"
              spellCheck={false}
              className="field font-data pr-10 text-[0.78rem]"
            />
            <button
              type="button"
              onClick={() => setShowDb((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fog/70 transition-colors hover:text-mint"
              aria-label={showDb ? "Masquer la chaîne" : "Afficher la chaîne"}
            >
              {showDb ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button
            type="button"
            onClick={testDb}
            disabled={!cfg.dbUrl.trim() || dbTest.status === "testing"}
            className="btn-ghost shrink-0 !px-3.5 disabled:opacity-40"
            title="Tester la connexion"
          >
            {dbTest.status === "testing" ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
            Tester
          </button>
        </div>
        {dbTest.status === "ok" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-mint">
            <CheckCircle2 size={13} /> {dbTest.message}
          </p>
        )}
        {dbTest.status === "fail" && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[0.7rem] leading-snug text-danger">
            <XCircle size={13} className="mt-0.5 shrink-0" /> {dbTest.message}
          </p>
        )}
        {dbTest.status === "idle" && cfg.dbUrl.trim() && !/^postgres(ql)?:\/\//i.test(cfg.dbUrl.trim()) && (
          <p className="mt-1.5 text-[0.7rem] text-gold">Format attendu : postgresql://utilisateur:motdepasse@hôte/base</p>
        )}
        {dbTest.status === "idle" && !cfg.dbUrl.trim() && (
          <p className="mt-1.5 text-[0.68rem] leading-relaxed text-fog/60">
            Collez ici votre chaîne Neon / Supabase / VPS pour archiver les analyses sur VOTRE base.
          </p>
        )}
      </div>

      {/* IA automatique */}
      <div className="flex items-start gap-3 rounded-2xl border border-mint/20 bg-mint/[0.05] px-4 py-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-mint/25 bg-mint/10 text-mint">
          <Cpu size={15} />
        </span>
        <div>
          <p className="text-[0.8rem] font-semibold text-white/90">Modèle IA : sélection automatique</p>
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-fog/75">
            ORACLE choisit le meilleur modèle vision disponible (Gemini, GPT-4o, Claude…) et bascule tout seul sur
            un modèle de secours en cas d&apos;indisponibilité.
          </p>
        </div>
      </div>

      {/* Paire + Timeframe */}
      <div className="grid grid-cols-[1fr] gap-5">
        <div>
          <FieldLabel icon={<TrendingUp size={13} />}>Actif</FieldLabel>
          <input
            value={cfg.pair}
            onChange={(e) => onChange({ pair: e.target.value.toUpperCase().slice(0, 20) })}
            placeholder="BTCUSDT, XAUUSD, EURUSD, US100, AAPL…"
            spellCheck={false}
            className="field font-data text-[0.9rem] tracking-wide"
          />
        </div>
        <div>
          <FieldLabel icon={<Gauge size={13} />}>Timeframe</FieldLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {TF_CHOICES.map((tf) => (
              <button
                key={tf}
                type="button"
                data-active={cfg.timeframe === tf}
                onClick={() => onChange({ timeframe: tf })}
                className="tf-chip"
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Capital + Risque */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel icon={<Coins size={13} />}>Capital ($)</FieldLabel>
          <input
            value={cfg.capital}
            onChange={(e) => onChange({ capital: e.target.value.replace(/[^0-9.,]/g, "") })}
            placeholder="10 000"
            inputMode="decimal"
            className="field font-data text-[0.9rem]"
          />
        </div>
        <div>
          <FieldLabel
            icon={<Zap size={13} />}
            aside={<span className="font-data text-[0.72rem] text-mint">{cfg.riskPercent.toFixed(2).replace(".", ",")} %</span>}
          >
            Risque / position
          </FieldLabel>
          <div className="flex h-[42px] items-center">
            <input
              type="range"
              min={0.25}
              max={5}
              step={0.25}
              value={cfg.riskPercent}
              onChange={(e) => onChange({ riskPercent: Number(e.target.value) })}
              className="range-mint"
            />
          </div>
        </div>
      </div>

      {riskAmount > 0 && (
        <div className="-mt-2 flex items-center justify-between rounded-xl border border-mint/15 bg-mint/[0.05] px-4 py-2.5">
          <span className="text-[0.7rem] uppercase tracking-[0.14em] text-fog">Montant risqué par trade</span>
          <span className="font-data text-sm font-semibold text-mint">{formatMoney(riskAmount)}</span>
        </div>
      )}

      <div className="divider" />

      {/* Source du graphique */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-fog">
            <span className="text-mint/80"><ImageUp size={13} /></span>
            Graphique à analyser
          </span>
          {/* Bascule auto / manuel */}
          <div className="flex rounded-full border border-line bg-ink/70 p-0.5">
            {[
              { key: true, label: "Auto · TradingView" },
              { key: false, label: "Ma capture" },
            ].map((opt) => (
              <button
                key={String(opt.key)}
                type="button"
                onClick={() => onChange({ autoCapture: opt.key })}
                className={`rounded-full px-3 py-1 text-[0.66rem] font-medium transition-all ${
                  cfg.autoCapture === opt.key
                    ? "bg-mint/15 text-mint shadow-[0_0_12px_rgba(46,242,161,0.15)]"
                    : "text-fog/70 hover:text-white/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {cfg.autoCapture ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-mint/25 bg-mint/[0.04] px-4 py-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-mint/25 bg-mint/10 text-mint">
                <Sparkles size={16} />
              </span>
              <div>
                <p className="text-[0.8rem] font-semibold text-white/90">Capture automatique activée</p>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed text-fog/75">
                  En cliquant sur « Analyser », ORACLE télécharge les chandeliers{" "}
                  <span className="font-data text-mint">{cfg.timeframe}</span> de{" "}
                  <span className="font-data text-mint">{cfg.pair.trim() || "l'actif"}</span>, génère le graphique
                  TradingView (EMA 20/50/200 + volumes) puis l&apos;envoie à l&apos;IA.
                </p>
              </div>
            </div>
            {cfg.image && cfg.imageAuto && (
              <div className="group relative overflow-hidden rounded-2xl border border-mint/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cfg.image} alt="Graphique généré automatiquement" className="max-h-56 w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/85 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                  <span className="chip !normal-case !tracking-normal">dernière capture auto</span>
                  <button
                    type="button"
                    onClick={() => onChange({ image: null, imageAuto: false })}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-abyss/70 text-fog backdrop-blur transition-all hover:border-danger/50 hover:text-danger"
                    aria-label="Retirer la capture"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : cfg.image && !cfg.imageAuto ? (
          <div className="group relative overflow-hidden rounded-2xl border border-mint/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cfg.image} alt="Graphique à analyser" className="max-h-64 w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-abyss/85 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
              <span className="chip !normal-case !tracking-normal">capture prête</span>
              <button
                type="button"
                onClick={() => onChange({ image: null })}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-abyss/70 text-fog backdrop-blur transition-all hover:border-danger/50 hover:text-danger"
                aria-label="Retirer l'image"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={`relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed px-6 py-8 text-center transition-all duration-300 ${
              dragging
                ? "border-mint/70 bg-mint/[0.07] shadow-[0_0_40px_rgba(46,242,161,0.12)]"
                : "border-line bg-ink/50 hover:border-mint/35 hover:bg-ink/80"
            }`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
              <ImageUp size={19} />
            </span>
            <span className="text-sm text-white/80">
              Glissez votre capture, <span className="text-mint">cliquez</span> ou collez (Ctrl+V)
            </span>
            <span className="flex items-center gap-1.5 text-[0.68rem] text-fog/55">
              <ClipboardPaste size={11} /> cadrez pour que l&apos;échelle des prix soit visible
            </span>
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {imgError && <p className="mt-2 text-[0.72rem] text-danger">{imgError}</p>}
      </div>

      <button type="button" disabled={!canAnalyze} onClick={onAnalyze} className="btn-primary mt-1">
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-abyss/30 border-t-abyss" />
            Analyse en cours…
          </>
        ) : (
          <>
            <Zap size={16} strokeWidth={2.4} />
            Analyser le marché
          </>
        )}
      </button>

      {!canAnalyze && !busy && (
        <p className="-mt-3 text-center text-[0.68rem] text-fog/55">
          {!cfg.apiKey.trim()
            ? "Renseignez votre clé API OpenRouter pour commencer."
            : !cfg.pair.trim()
              ? "Indiquez l'actif à analyser."
              : !cfg.autoCapture && !cfg.image
                ? "Ajoutez une capture du graphique ou activez la capture automatique."
                : null}
        </p>
      )}
    </motion.section>
  );
}
