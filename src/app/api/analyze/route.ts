import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { db, ensureDefaultTable } from "@/db";
import { analyses } from "@/db/schema";
import { getUserDb } from "@/lib/userdb";
import { hasTrendConflict } from "@/lib/trend";
import type { AiAnalysis, AnalyzeRequest, KeyLevel, RiskLevel, TradePlan } from "@/lib/types";
import { MODELS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `Tu es ORACLE, un analyste de marché d'élite combinant analyse technique multi-timeframe, Smart Money Concepts et veille macro-institutionnelle (banques centrales, FMI, presse financière).

Tu reçois :
1. Plusieurs images de graphiques (chandeliers + EMA 20 bleue / EMA 50 orange / EMA 200 violette + volumes) : la 1re image = timeframe d'EXÉCUTION, les suivantes = TIMEFRAMES SUPÉRIEURS (la correspondance exacte est donnée dans le texte).
2. Un tableau d'analyse de tendance automatique par timeframe (calcul algorithmique — fiable).
3. Un briefing macro : calendrier économique à venir et gros titres récents d'institutions fiables (Fed, BCE, FMI, Reuters, Bloomberg…).

═══ RÈGLES ABSOLUES ═══
A. CONFIRMATION MULTI-TIMEFRAME (obligatoire)
- Tu détermines d'abord le biais directionnel sur les TIMEFRAMES SUPÉRIEURS (structure HH/HL ou LH/LL, position vs EMA200).
- Un LONG n'est autorisé que si le contexte HTF est haussier ou neutre-haussier. Un SHORT uniquement si le HTF est baissier ou neutre-baissier.
- En cas de CONFLIT entre le timeframe d'exécution et les HTF → direction = "NEUTRE" (attendre l'alignement) ou confiance ≤ 40 avec alerte explicite.
- L'entrée se joue sur le timeframe d'exécution (pullback vers EMA, order block, support/résistance, FVG…), dans le SENS du biais HTF.

B. RESPECT DU CONTEXTE GLOBAL (économie, géopolitique, marchés)
- Intègre le briefing macro : annonces à fort impact, ton des banques centrales, géopolitique, appétit pour le risque.
- Annonce majeure imminente (FOMC, NFP, CPI, décision BCE…) → réduis la confiance, propose éventuellement "NEUTRE — pas de trade avant l'annonce", et remplis alerte_macro.
- Gros titres contraires au setup (ex: banque centrale hawkish contre un LONG sur biais faible) → mentionne-le dans confluences/alerte_macro.

C. STRATÉGIE ADAPTATIVE
- Choisis la stratégie adaptée au régime réel : "Pullback en tendance", "Breakout confirmé", "Trading de range (bornes)", ou "Pas de trade".
- Tendance forte alignée → pullback ou breakout. Range propre sur TOUS les TF → fades aux bornes avec stops courts. Incertitude/news → pas de trade.
- Jamais de contre-tendance HTF "par conviction".

D. PRÉCISION DES NIVEAUX
- Lis l'échelle de prix (axe de droite) pour des niveaux exacts. Stop loss derrière la structure invalide. TP1 réaliste (R≥1), TP2/TP3 étendus (null si non pertinent).
- LONG : stop_loss < entree < tp1 ≤ tp2 ≤ tp3. SHORT : stop_loss > entree > tp1 ≥ tp2 ≥ tp3.

RÉPONDS UNIQUEMENT avec un objet JSON valide, sans texte autour, sans markdown. Schéma exact :
{
  "direction": "LONG" | "SHORT" | "NEUTRE",
  "tendance": "haussière" | "baissière" | "range",
  "confiance": 0-100,
  "entree": number,
  "stop_loss": number,
  "tp1": number,
  "tp2": number | null,
  "tp3": number | null,
  "strategie": "nom court de la stratégie adoptée (ex: Pullback tendance haussière H4)",
  "regime": "tendance_forte" | "tendance_faible" | "range" | "volatile" | "incertain",
  "confirmation_mtf": "2-3 phrases : biais HTF, alignement/conflit entre timeframes, conclusion",
  "alerte_macro": "string ou null — l'avertissement macro clé (annonce imminente, risque géopolitique…)",
  "risque_environnement": "faible" | "modéré" | "élevé",
  "resumer_tendance": "une phrase percutante : tendance + biais + stratégie",
  "contexte": "2-3 phrases : structure HTF, position du prix, intégration du contexte macro",
  "analyse": "analyse détaillée en français, 3-5 paragraphes courts séparés par une ligne vide : 1) contexte technique MTF, 2) ce que dit le contexte macro/institutionnel et son impact, 3) liquidité/momentum, 4) scénario privilégié et plan d'exécution pas à pas, 5) gestion du risque (taille, surveillance des annonces)",
  "niveaux_cles": [{"prix": number, "type": "support" | "resistance", "label": "court libellé"}],
  "confluences": ["3 à 6 confluences concrètes (technique + macro)"],
  "invalidation": "ce qui invalide précisément le scénario (niveau + condition macro éventuelle)"
}`;

function extractJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("La réponse de l'IA ne contient pas de JSON valide.");
  }
  return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}

function normalize(raw: Record<string, unknown>, conflict: boolean): AiAnalysis {
  const dir = String(raw.direction ?? "NEUTRE").toUpperCase();
  const dirTyped: AiAnalysis["direction"] = dir === "LONG" || dir === "SHORT" ? dir : "NEUTRE";
  let direction = dirTyped;
  const tendanceRaw = String(raw.tendance ?? "range").toLowerCase();
  const tendance = tendanceRaw.startsWith("hauss") ? "haussière" : tendanceRaw.startsWith("baiss") ? "baissière" : "range";
  const niveaux: KeyLevel[] = Array.isArray(raw.niveaux_cles)
    ? (raw.niveaux_cles as unknown[]).slice(0, 8).map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        return {
          prix: toNumber(o.prix) ?? 0,
          type: o.type === "resistance" ? "resistance" : o.type === "support" ? "support" : "autre",
          label: str(o.label, 80),
        };
      })
    : [];
  const risqueRaw = str(raw.risque_environnement, 20).toLowerCase();
  const risque_environnement: RiskLevel = risqueRaw.includes("lev") ? "élevé" : risqueRaw.includes("mod") ? "modéré" : "faible";
  // Garde-fou : en cas de conflit MTF avéré, on n'autorise pas un signal agressif sans alerte.
  if (conflict && direction !== "NEUTRE" && !str(raw.alerte_macro, 10) && !str(raw.confirmation_mtf, 10).toLowerCase().includes("conflit")) {
    direction = "NEUTRE";
  }
  return {
    direction,
    tendance,
    confiance: Math.max(0, Math.min(100, Math.round(toNumber(raw.confiance) ?? 0))),
    entree: toNumber(raw.entree) ?? 0,
    stop_loss: toNumber(raw.stop_loss) ?? 0,
    tp1: toNumber(raw.tp1) ?? 0,
    tp2: toNumber(raw.tp2),
    tp3: toNumber(raw.tp3),
    strategie: str(raw.strategie, 120) || "Lecture de marché",
    regime: str(raw.regime, 40) || "incertain",
    confirmation_mtf: str(raw.confirmation_mtf, 600),
    alerte_macro: raw.alerte_macro ? str(raw.alerte_macro, 400) : null,
    risque_environnement,
    resumer_tendance: str(raw.resumer_tendance, 300),
    contexte: str(raw.contexte, 800),
    analyse: str(raw.analyse, 6000),
    niveaux_cles: niveaux.filter((n) => n.prix > 0),
    confluences: Array.isArray(raw.confluences)
      ? (raw.confluences as unknown[]).slice(0, 8).map((c) => str(c, 180))
      : [],
    invalidation: str(raw.invalidation, 400),
  };
}

function rr(direction: string, entry: number, sl: number, tp: number | null): number | null {
  if (tp === null || !entry || !sl) return null;
  const risk = Math.abs(entry - sl);
  if (risk === 0) return null;
  const reward = direction === "SHORT" ? entry - tp : tp - entry;
  return Math.round((reward / risk) * 100) / 100;
}

interface OrAttempt {
  model: string;
  status: number | null;
  message: string;
}

type ImagePart = { type: "image_url"; image_url: { url: string } };
type TextPart = { type: "text"; text: string };

async function callModel(
  apiKey: string,
  model: string,
  content: (TextPart | ImagePart)[],
  timeoutMs = 75_000,
): Promise<{ ok: true; content: string } | { ok: false; status: number | null; message: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://oracle-terminal.local",
        "X-Title": "ORACLE - AI market analysis",
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: 3000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j?.error?.message) message = j.error.message;
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, message };
    }
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return { ok: false, status: res.status, message: "Réponse vide" };
    return { ok: true, content: text };
  } catch (e) {
    clearTimeout(timer);
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Délai dépassé"
        : `Appel impossible : ${e instanceof Error ? e.message : "erreur réseau"}`;
    return { ok: false, status: null, message: msg };
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { apiKey, dbUrl, pair, timeframe, capital, riskPercent, images, marketSource, lastPrice, htfTrends, mtfSummary, macro } = body;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
    return NextResponse.json({ error: "Clé API OpenRouter invalide (elle doit commencer par « sk- »)." }, { status: 400 });
  }
  if (!pair?.trim()) {
    return NextResponse.json({ error: "Précisez l'actif à analyser (ex : BTCUSDT)." }, { status: 400 });
  }
  const validImages = (Array.isArray(images) ? images : [])
    .filter((i) => i && typeof i.dataUrl === "string" && i.dataUrl.startsWith("data:image") && i.dataUrl.length > 5000)
    .slice(0, 3);
  if (validImages.length === 0) {
    return NextResponse.json({ error: "Aucun graphique valide fourni." }, { status: 400 });
  }
  const totalSize = validImages.reduce((s, i) => s + i.dataUrl.length, 0);
  if (totalSize > 24_000_000) {
    return NextResponse.json({ error: "Images trop lourdes (24 Mo cumulés max)." }, { status: 400 });
  }

  const last = typeof lastPrice === "number" && Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null;
  const trends = Array.isArray(htfTrends) ? htfTrends : [];
  const conflict = trends.length ? hasTrendConflict(trends) : false;

  const imageRoles = validImages
    .map((img, i) => (i === 0 ? `Image ${i + 1} = timeframe d'EXÉCUTION (${img.tf})` : `Image ${i + 1} = TIMEFRAME SUPÉRIEUR (${img.tf})`))
    .join(" · ");

  const userText = `Analyse ce marché et construis le plan de trade complet.

ACTIF : ${pair.trim()}
TIMEFRAME D'EXÉCUTION : ${timeframe}
${last ? `DERNIER PRIX DE CLÔTURE CONNU : ${last}` : ""}
PROFIL TRADER : capital ${capital} $, risque ${riskPercent} % par position.

IMAGES FOURNIES (dans l'ordre) : ${imageRoles}

TENDANCES AUTOMATIQUES PAR TIMEFRAME (calcul algorithmique EMA + structure — à confirmer visuellement) :
${mtfSummary?.trim() || trends.map((t) => `- ${t.tf} : ${t.direction.toUpperCase()} (${t.strength}/100) · ${t.detail}`).join("\n") || "non fournies"}
${conflict ? "⚠ CONFLIT MULTI-TIMEFRAME DÉTECTÉ : les timeframes ne sont pas alignés — applique la règle A (NEUTRE ou forte prudence)." : ""}

═══ BRIEFING MACRO & INSTITUTIONNEL ═══
${macro?.summaryText?.trim() || "(non fourni — base-toi uniquement sur le technique et signale l'absence de contexte macro dans alerte_macro)"}

Lis l'échelle de prix à droite des graphiques pour des niveaux PRÉCIS. Respecte toutes les règles absolues (A : confirmation MTF, B : contexte global, C : stratégie adaptative, D : précision). Réponds en JSON pur.`;

  const content: (TextPart | ImagePart)[] = [
    { type: "text", text: userText },
    ...validImages.map<ImagePart>((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
  ];

  /* ---------- Sélection automatique du modèle ---------- */
  let ai: AiAnalysis | null = null;
  let usedModel = "";
  const attempts: OrAttempt[] = [];
  const MAX_ATTEMPTS = 3;

  for (const candidate of MODELS.slice(0, MAX_ATTEMPTS)) {
    const res = await callModel(apiKey, candidate.id, content);
    if (!res.ok) {
      attempts.push({ model: candidate.id, status: res.status, message: res.message });
      if (res.status === 401) {
        return NextResponse.json(
          { error: "Clé API refusée par OpenRouter.", detail: res.message },
          { status: 401 },
        );
      }
      continue;
    }
    try {
      ai = normalize(extractJson(res.content), conflict);
      usedModel = candidate.id;
      break;
    } catch (e) {
      attempts.push({
        model: candidate.id,
        status: 200,
        message: e instanceof Error ? e.message : "JSON illisible",
      });
    }
  }

  if (!ai) {
    const lastFail = attempts[attempts.length - 1];
    const credits = attempts.some((a) => a.status === 402);
    return NextResponse.json(
      {
        error: credits
          ? "Crédits insuffisants sur votre compte OpenRouter."
          : "Aucun modèle n'a réussi l'analyse.",
        detail: attempts.length
          ? `Modèles essayés : ${attempts.map((a) => a.model.split("/")[1] ?? a.model).join(", ")} — dernière erreur : ${lastFail?.message}`
          : undefined,
      },
      { status: 502 },
    );
  }

  if (!ai.entree || !ai.stop_loss || ai.entree === ai.stop_loss) {
    return NextResponse.json(
      { error: "Plan incomplet : niveaux d'entrée / stop loss illisibles.", detail: "Relancez l'analyse — ou changez de timeframe." },
      { status: 502 },
    );
  }

  // Sizing
  const cap = Number(capital) > 0 ? Number(capital) : 0;
  const rp = Number(riskPercent) > 0 ? Number(riskPercent) : 1;
  const riskAmount = cap > 0 ? (cap * rp) / 100 : 0;
  const perUnit = Math.abs(ai.entree - ai.stop_loss);
  const positionSize = riskAmount > 0 && perUnit > 0 ? riskAmount / perUnit : null;
  const notional = positionSize !== null ? positionSize * ai.entree : null;

  const plan: TradePlan = {
    ...ai,
    id: crypto.randomUUID(),
    pair: pair.trim().toUpperCase(),
    timeframe,
    model: usedModel,
    marketSource: marketSource ?? null,
    lastPrice: last,
    capital: cap,
    riskPercent: rp,
    riskAmount,
    positionSize,
    notional,
    rr1: rr(ai.direction, ai.entree, ai.stop_loss, ai.tp1),
    rr2: rr(ai.direction, ai.entree, ai.stop_loss, ai.tp2),
    rr3: rr(ai.direction, ai.entree, ai.stop_loss, ai.tp3),
    htf_trends: trends,
    macro_events: macro?.events ?? [],
    macro_headlines: macro?.headlines ?? [],
    createdAt: new Date().toISOString(),
  };

  const insertValues = {
    id: plan.id,
    pair: plan.pair,
    timeframe: plan.timeframe,
    model: plan.model,
    direction: plan.direction,
    tendance: plan.tendance,
    confiance: plan.confiance,
    entree: plan.entree,
    stopLoss: plan.stop_loss,
    tp1: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    rr1: plan.rr1,
    rr2: plan.rr2,
    rr3: plan.rr3,
    capital: plan.capital,
    riskPercent: plan.riskPercent,
    riskAmount: plan.riskAmount,
    positionSize: plan.positionSize,
    notional: plan.notional,
    marketSource: plan.marketSource,
    lastPrice: plan.lastPrice,
    strategie: plan.strategie,
    regime: plan.regime,
    confirmationMtf: plan.confirmation_mtf,
    alerteMacro: plan.alerte_macro,
    risqueEnv: plan.risque_environnement,
    htfTrends: plan.htf_trends,
    macroEvents: plan.macro_events,
    macroHeadlines: plan.macro_headlines,
    resumerTendance: plan.resumer_tendance,
    contexte: plan.contexte,
    analyse: plan.analyse,
    invalidation: plan.invalidation,
    niveauxCles: plan.niveaux_cles,
    confluences: plan.confluences,
  };

  // Persistance : base utilisateur si fournie, sinon base locale.
  // La clé API et les images ne sont JAMAIS stockées.
  const userConn = dbUrl ? getUserDb(dbUrl) : null;
  try {
    if (userConn) {
      await userConn.ready;
      await userConn.db.insert(analyses).values(insertValues);
    } else {
      await ensureDefaultTable();
      await db.insert(analyses).values(insertValues);
    }
  } catch (e) {
    console.error("DB insert failed (analysis still returned)", e);
  }

  return NextResponse.json(plan);
}
