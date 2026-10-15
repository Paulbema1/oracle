"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Trash2, TrendingUp, TrendingDown, Minus, ChevronRight, RefreshCcw, DatabaseZap } from "lucide-react";
import type { AnalysisRow } from "@/db/schema";
import { formatPrice } from "@/lib/types";

interface Props {
  rows: AnalysisRow[];
  loading: boolean;
  externalDb: boolean;
  onOpen: (row: AnalysisRow) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onRefresh: () => void;
}

export default function HistoryPanel({ rows, loading, externalDb, onOpen, onDelete, onClear, onRefresh }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="panel p-5 lg:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-fog">
          <History size={14} className="text-mint" />
          Historique des analyses
          {rows.length > 0 && (
            <span className="font-data rounded-md bg-mint/10 px-1.5 py-0.5 text-[0.66rem] text-mint">{rows.length}</span>
          )}
          <span
            className={`font-data rounded-md border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-wider ${
              externalDb ? "border-ice/35 text-ice" : "border-line text-fog/55"
            }`}
          >
            {externalDb ? "votre base" : "base locale"}
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          <button onClick={onRefresh} className="btn-ghost !px-2.5 !py-1.5" aria-label="Rafraîchir">
            <RefreshCcw size={13} />
          </button>
          {rows.length > 0 &&
            (confirmClear ? (
              <button
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
                onMouseLeave={() => setConfirmClear(false)}
                className="btn-ghost !border-danger/40 !px-2.5 !py-1.5 !text-danger"
              >
                Confirmer ?
              </button>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="btn-ghost !px-2.5 !py-1.5" aria-label="Tout effacer">
                <Trash2 size={13} />
              </button>
            ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl border border-line bg-ink/50" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink/60 text-fog/50">
            <DatabaseZap size={20} />
          </span>
          <p className="max-w-[240px] text-[0.78rem] leading-relaxed text-fog/60">
            Aucune analyse enregistrée pour l&apos;instant — vos prochains plans apparaîtront ici.
          </p>
        </div>
      ) : (
        <ul className="max-h-[430px] space-y-2.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const dir = r.direction;
              const color = dir === "LONG" ? "#2ef2a1" : dir === "SHORT" ? "#ff5470" : "#f5c66a";
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.22 } }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(r)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(r)}
                    className="group relative flex w-full cursor-pointer items-center gap-3.5 overflow-hidden rounded-xl border border-line bg-ink/60 px-4 py-3.5 text-left transition-all hover:border-mint/30 hover:bg-ink"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                      style={{ color, borderColor: `${color}45`, background: `${color}12` }}
                    >
                      {dir === "LONG" ? <TrendingUp size={16} /> : dir === "SHORT" ? <TrendingDown size={16} /> : <Minus size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display truncate text-[0.88rem] font-semibold text-white/90">{r.pair}</span>
                        <span className="chip !px-2 !py-[2px] !text-[0.58rem]">{r.timeframe}</span>
                        <span className="font-data text-[0.66rem]" style={{ color }}>
                          {r.confiance}%
                        </span>
                      </div>
                      <p className="font-data mt-1 truncate text-[0.7rem] text-fog/65">
                        {r.entree ? `E ${formatPrice(r.entree)}` : "—"} · {r.stopLoss ? `SL ${formatPrice(r.stopLoss)}` : "—"} ·{" "}
                        {r.tp1 ? `TP ${formatPrice(r.tp1)}` : "—"}
                      </p>
                    </div>
                    <span className="hidden shrink-0 font-data text-[0.62rem] text-fog/45 sm:block">
                      {new Date(r.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(r.id);
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fog/40 opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                      aria-label="Supprimer cette analyse"
                    >
                      <Trash2 size={13} />
                    </button>
                    <ChevronRight size={15} className="shrink-0 text-fog/40 transition-transform group-hover:translate-x-0.5 group-hover:text-mint" />
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
