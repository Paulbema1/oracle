import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { db, ensureDefaultTable } from "@/db";
import { analyses } from "@/db/schema";
import { getUserDb } from "@/lib/userdb";
import type { AiAnalysis, AnalyzeRequest, KeyLevel, TradePlan } from "@/lib/types";
import { MODELS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `Tu es ORACLE, un analyste technique d'élite spécialisé en price action, structure de marché (Smart Money Concepts), liquidité et gestion du risque. On te fournit un graphique en chandeliers avec moyennes mobiles (EMA 20 bleue, EMA 50 orange, EMA 200 violette) et volumes, généré à partir de données de marché réelles. L'échelle des prix est sur l'axe de droite.

MISSION ABSOLUE : TU SUIS TOUJOURS LA TENDANCE DOMINANTE. Jamais de contre-tendance.
- Identifie d'abord la tendance (structure HH/HL = haussière, LH/LL = baissière, sinon range).
- En tendance haussière : tu proposes UNIQUEMENT un LONG, idéalement sur pullback vers un support, un order block, une EMA ou une zone de demande.
- En tendance baissière : tu proposes UNIQUEMENT un SHORT, idéalement sur retracement vers une résistance, un order block ou une zone d'offre.
- Si la structure est illisible / en range : direction = "NEUTRE", tu conseilles d'attendre.

RÈGLES DU PLAN :
- L'entrée est un prix précis lu sur l'échelle du graphique (pas une moyenne de l'image).
- Le stop loss se place derrière la structure invalide (dernier plus bas/haut, sous le support ou au-dessus de la résistance).
- TP1 = premier objectif réaliste (ratio >= 1). TP2 / TP3 = objectifs étendus (peuvent être null si non pertinents).
- Sois strict sur la cohérence : pour LONG, stop_loss < entree < tp1 < tp2 < tp3. Pour SHORT, stop_loss > entree > tp1 > tp2 > tp3.

RÉPONDS UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, sans bloc markdown. Schéma exact :
{
  "direction": "LONG" | "SHORT" | "NEUTRE",
  "tendance": "haussière" | "baissière" | "range",
  "confiance": 0-100,
  "entree": number,
  "stop_loss": number,
  "tp1": number,
  "tp2": number | null,
  "tp3": number | null,
  "resumer_tendance": "une phrase percutante décrivant la tendance et le biais",
  "contexte": "2-3 phrases : contexte macro du graphique, structure HTF, position du prix",
  "analyse": "analyse détaillée en français, 2-4 paragraphes courts séparés par une ligne vide : structure, liquidité, momentum, scénario privilégié et plan d'exécution",
  "niveaux_cles": [{"prix": number, "type": "support" | "resistance", "label": "court libellé"}],
  "confluences": ["liste de 3 à 6 confluences concrètes observées sur le graphique"],
  "invalidation": "ce qui invalide précisément le scénario"
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

function normalize(raw: Record<string, unknown>): AiAnalysis {
  const dir = String(raw.direction ?? "NEUTRE").toUpperCase();
  const direction = dir === "LONG" || dir === "SHORT" ? dir : "NEUTRE";
  const tendanceRaw = String(raw.tendance ?? "range").toLowerCase();
  const tendance = tendanceRaw.startsWith("hauss") ? "haussière" : tendanceRaw.startsWith("baiss") ? "baissière" : "range";
  const niveaux: KeyLevel[] = Array.isArray(raw.niveaux_cles)
    ? (raw.niveaux_cles as unknown[]).slice(0, 8).map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        return {
          prix: toNumber(o.prix) ?? 0,
          type: o.type === "resistance" ? "resistance" : o.type === "support" ? "support" : "autre",
          label: String(o.label ?? "").slice(0, 80),
        };
      })
    : [];
  return {
    direction,
    tendance,
    confiance: Math.max(0, Math.min(100, Math.round(toNumber(raw.confidence ?? raw.confiance) ?? 0))),
    entree: toNumber(raw.entree) ?? 0,
    stop_loss: toNumber(raw.stop_loss) ?? 0,
    tp1: toNumber(raw.tp1) ?? 0,
    tp2: toNumber(raw.tp2),
    tp3: toNumber(raw.tp3),
    resumer_tendance: String(raw.resumer_tendance ?? "").slice(0, 300),
    contexte: String(raw.contexte ?? "").slice(0, 800),
    analyse: String(raw.analyse ?? "").slice(0, 4000),
    niveaux_cles: niveaux.filter((n) => n.prix > 0),
    confluences: Array.isArray(raw.confluences)
      ? (raw.confluences as unknown[]).slice(0, 8).map((c) => String(c).slice(0, 160))
      : [],
    invalidation: String(raw.invalidation ?? "").slice(0, 400),
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

/** Appel OpenRouter pour UN modèle, avec timeout. */
async function callModel(
  apiKey: string,
  model: string,
  userText: string,
  image: string,
  timeoutMs = 60_000,
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
        "X-Title": "ORACLE — Analyse IA de marché",
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: 2500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: image } },
            ],
          },
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
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return { ok: false, status: res.status, message: "Réponse vide" };
    return { ok: true, content };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error && e.name === "AbortError" ? "Délai dépassé" : "Réseau injoignable";
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

  const { apiKey, dbUrl, pair, timeframe, capital, riskPercent, image, marketSource, lastPrice } = body;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
    return NextResponse.json({ error: "Clé API OpenRouter invalide (elle doit commencer par « sk- »)." }, { status: 400 });
  }
  if (!image || typeof image !== "string" || !image.startsWith("data:image")) {
    return NextResponse.json({ error: "Image du graphique manquante ou invalide." }, { status: 400 });
  }
  if (image.length > 12_000_000) {
    return NextResponse.json({ error: "Image trop lourde (12 Mo max)." }, { status: 400 });
  }
  if (!pair?.trim()) {
    return NextResponse.json({ error: "Précisez la paire à analyser (ex : BTC/USDT)." }, { status: 400 });
  }

  const last = typeof lastPrice === "number" && Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null;
  const userText = `Analyse ce graphique.

Paire : ${pair.trim()}
Timeframe : ${timeframe}
${last ? `Dernier prix de clôture connu : ${last}` : ""}
Contexte trader : capital ${capital} $, risque ${riskPercent} % par position.

Lis l'échelle de prix visible sur le graphique (axe de droite) pour donner des niveaux PRÉCIS. Respecte la tendance dominante. Réponds en JSON pur.`;

  /* ---------- Sélection automatique du modèle ---------- */
  let ai: AiAnalysis | null = null;
  let usedModel = "";
  const attempts: OrAttempt[] = [];
  const MAX_ATTEMPTS = 3;

  for (const candidate of MODELS.slice(0, MAX_ATTEMPTS)) {
    const res = await callModel(apiKey, candidate.id, userText, image);
    if (!res.ok) {
      attempts.push({ model: candidate.id, status: res.status, message: res.message });
      // Clé refusée → inutile d'essayer les autres modèles.
      if (res.status === 401) {
        return NextResponse.json(
          { error: "Clé API refusée par OpenRouter.", detail: res.message },
          { status: 401 },
        );
      }
      continue;
    }
    try {
      ai = normalize(extractJson(res.content));
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
    resumerTendance: plan.resumer_tendance,
    contexte: plan.contexte,
    analyse: plan.analyse,
    invalidation: plan.invalidation,
    niveauxCles: plan.niveaux_cles,
    confluences: plan.confluences,
  };

  // Persistance : base utilisateur si fournie, sinon base locale.
  // La clé API et l'image ne sont JAMAIS stockées.
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
