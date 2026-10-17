import type { Headline, MacroContext, MacroEvent, RiskLevel } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Contexte macro : calendrier économique + veille institutionnelle   */
/* ------------------------------------------------------------------ */

const FIAT = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY"] as const;

const KEYWORDS_KNOWN: [RegExp, string][] = [
  [/^(BTC|XBT)/, "bitcoin crypto market"],
  [/^ETH/, "ethereum crypto market"],
  [/^(SOL|XRP|ADA|DOGE|BNB|AVAX|LINK|DOT)/, "crypto market altcoins"],
  [/XAU|GOLD/, "gold price Fed"],
  [/XAG|SILVER/, "silver price gold"],
  [/OIL|WTI|BRENT|CL=F|BZ=F/, "crude oil price OPEC"],
  [/EUR/, "ECB euro Fed rates"],
  [/GBP/, "Bank of England pound"],
  [/JPY/, "Bank of Japan yen"],
  [/US30|DJI|US100|NDX|SPX|US500|NAS/, "stock market Wall Street Fed"],
  [/GER40|DAX/, "European stocks ECB"],
];

/** Devises concernées par l'actif (pour filtrer le calendrier). */
export function currenciesFor(rawSymbol: string): string[] {
  const s = rawSymbol.trim().toUpperCase().replace(/[\s_/.\-]+/g, "");
  const out = new Set<string>();
  if (s.length >= 6) {
    const a = s.slice(0, 3);
    const b = s.slice(3, 6);
    for (const c of [a, b]) if ((FIAT as readonly string[]).includes(c)) out.add(c);
  }
  // Crypto / matières : le dollar pilote la liquidité globale
  if (/USDT|USDC|BTC|ETH|XBT/.test(s) || out.size === 0 || /XAU|XAG|OIL|WTI|GOLD|US30|US100|SPX|NAS/.test(s)) {
    out.add("USD");
  }
  return [...out];
}

function keywordsFor(rawSymbol: string): string {
  const s = rawSymbol.trim().toUpperCase();
  for (const [re, kw] of KEYWORDS_KNOWN) if (re.test(s)) return kw;
  return "global markets economy";
}

async function safeFetch(url: string, ms = 10000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) ORACLE/1.0" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/* ------------------------- Calendrier économique ------------------------- */

interface FfEvent {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
}

async function fetchCalendar(currencies: string[]): Promise<MacroEvent[]> {
  const text = await safeFetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json");
  if (!text) return [];
  try {
    const raw = JSON.parse(text) as FfEvent[];
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    const windowMs = 96 * 3600 * 1000;
    return raw
      .filter((e) => {
        if (!e.date || !e.country || !e.title) return false;
        if (e.impact !== "High" && e.impact !== "Medium") return false;
        if (!currencies.includes(e.country.toUpperCase())) return false;
        const t = new Date(e.date).getTime();
        return Number.isFinite(t) && t > now - 2 * 3600 * 1000 && t < now + windowMs;
      })
      .map((e) => ({
        title: String(e.title).slice(0, 140),
        currency: String(e.country).toUpperCase(),
        date: new Date(String(e.date)).toISOString(),
        impact: e.impact === "High" ? ("High" as const) : ("Medium" as const),
        forecast: String(e.forecast ?? "").slice(0, 30),
        previous: String(e.previous ?? "").slice(0, 30),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);
  } catch {
    return [];
  }
}

/* ------------------------------ Flux RSS ------------------------------ */

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è");
}

interface RssItem {
  title: string;
  link: string;
  date: string;
  source: string;
}

function parseRss(xml: string, forcedSource?: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s>]([\s\S]*?)<\/item>/g) ?? xml.match(/<entry[\s>]([\s\S]*?)<\/entry>/g) ?? [];
  for (const block of blocks.slice(0, 12)) {
    const title = stripTags(block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
    let link =
      block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? stripTags(block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ?? "");
    link = decodeEntities(link);
    if (!/^https?:\/\//i.test(link)) link = ""; // liens http(s) uniquement
    const dateRaw =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)?.[1] ??
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/)?.[1] ??
      block.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/)?.[1] ??
      "";
    const src = stripTags(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
    if (!title) continue;
    items.push({
      title: decodeEntities(title).slice(0, 220),
      link,
      date: dateRaw && Number.isFinite(new Date(dateRaw).getTime()) ? new Date(dateRaw).toISOString() : new Date().toISOString(),
      source: forcedSource ?? decodeEntities(src) ?? "",
    });
  }
  return items;
}

const TRUSTED = [
  "reuters", "bloomberg", "cnbc", "financial times", "ft.com", "marketwatch", "wall street journal",
  "wsj", "investing.com", "fxstreet", "forexlive", "barron", "yahoo finance", "associated press", "ap news",
];

async function fetchHeadlines(rawSymbol: string): Promise<Headline[]> {
  const kw = keywordsFor(rawSymbol);
  const gnewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${kw} when:4d`)}&hl=en-US&gl=US&ceid=US:en`;

  const [gnews, fed, ecb, imf] = await Promise.all([
    safeFetch(gnewsUrl).then((x) => (x ? parseRss(x) : [])),
    safeFetch("https://www.federalreserve.gov/feeds/press_all.xml").then((x) => (x ? parseRss(x, "Réserve Fédérale (Fed)") : [])),
    safeFetch("https://www.ecb.europa.eu/rss/press.html").then((x) => (x ? parseRss(x, "BCE") : [])),
    safeFetch("https://www.imf.org/en/News/rss").then((x) => (x ? parseRss(x, "FMI") : [])),
  ]);

  // Gros titres presse : priorité aux sources fiables
  const trusted = gnews.filter((h) => TRUSTED.some((t) => h.source.toLowerCase().includes(t)));
  const press = (trusted.length >= 4 ? trusted : [...trusted, ...gnews.filter((g) => !trusted.includes(g))]).slice(0, 6);

  // Institutions : 1-2 éléments récents chacune
  const institutions = [fed[0], ecb[0], imf[0], fed[1], ecb[1]].filter((x): x is RssItem => Boolean(x));

  const merged = [...press, ...institutions]
    .filter((h) => h.title.length > 8)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 9)
    .map<Headline>((h) => ({
      title: h.title,
      source: h.source || "Presse financière",
      url: h.link,
      publishedAt: h.date,
    }));
  return merged;
}

/* ------------------------------ Orchestration ------------------------------ */

function computeRisk(events: MacroEvent[], currencies: string[]): { level: RiskLevel; reasons: string[] } {
  const now = Date.now();
  const reasons: string[] = [];
  const high12 = events.filter((e) => e.impact === "High" && inHours(e.date, 12));
  const high36 = events.filter((e) => e.impact === "High" && inHours(e.date, 36));
  const med12 = events.filter((e) => e.impact === "Medium" && inHours(e.date, 12));

  if (high12.length > 0) {
    reasons.push(`${high12.length} annonce(s) à fort impact ${currList(currencies)} dans les 12 h (${high12[0].title})`);
    return { level: "élevé", reasons };
  }
  if (high36.length >= 2) {
    reasons.push(`${high36.length} annonces à fort impact ${currList(currencies)} sous 36 h`);
    return { level: "modéré", reasons };
  }
  if (high36.length === 1) {
    reasons.push(`1 annonce à fort impact ${currList(currencies)} sous 36 h (${high36[0].title})`);
    return { level: "modéré", reasons };
  }
  if (med12.length > 0) {
    reasons.push(`${med12.length} annonce(s) d'impact moyen sous 12 h`);
    return { level: "modéré", reasons };
  }
  return { level: "faible", reasons: ["aucune annonce majeure imminente sur les devises concernées"] };

  function inHours(iso: string, h: number): boolean {
    const t = new Date(iso).getTime();
    return t > now - 3600 * 1000 && t < now + h * 3600 * 1000;
  }
  function currList(c: string[]): string {
    return c.length ? `(${c.join("/")})` : "";
  }
}

function fmtEventDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
}

function relativeFr(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export async function fetchMacroContext(rawSymbol: string): Promise<MacroContext> {
  const currencies = currenciesFor(rawSymbol);
  const [events, headlines] = await Promise.all([fetchCalendar(currencies), fetchHeadlines(rawSymbol)]);
  const { level, reasons } = computeRisk(events, currencies);

  const lines: string[] = [];
  lines.push(`ACTIF : ${rawSymbol.toUpperCase()} — devises surveillées : ${currencies.join(", ") || "USD (global)"}.`);
  if (events.length) {
    lines.push("ANNONCES ÉCONOMIQUES À VENIR (heure UTC) :");
    for (const e of events) {
      lines.push(
        `  - [${e.impact === "High" ? "FORT IMPACT" : "impact moyen"}] ${fmtEventDate(e.date)} UTC · ${e.currency} · ${e.title}` +
          (e.forecast || e.previous ? ` — consensus ${e.forecast || "?"} / précédent ${e.previous || "?"}` : ""),
      );
    }
  } else {
    lines.push("Aucune annonce économique majeure détectée sur les devises concernées dans les prochains jours (ou calendrier indisponible).");
  }
  if (headlines.length) {
    lines.push("DERNIÈRES ANALYSES & GROS TITRES (institutions et presse financière fiables) :");
    for (const h of headlines) {
      lines.push(`  - [${h.source} · ${relativeFr(h.publishedAt)}] ${h.title}`);
    }
  } else {
    lines.push("Aucun gros titre récupéré (flux indisponibles).");
  }
  lines.push(`NIVEAU DE RISQUE ÉVÉNEMENTIEL : ${level.toUpperCase()} — ${reasons.join(" ; ")}.`);
  if (level === "élevé") {
    lines.push("CONSIGNE : annonce majeure imminente → privilégie NEUTRE/pas de trade avant l'annonce, ou impose une taille réduite et un stop plus large. Signale-le dans alerte_macro.");
  } else if (level === "modéré") {
    lines.push("CONSIGNE : prudence → réduis la confiance et mentionne-le dans alerte_macro si pertinent.");
  }

  return { events, headlines, riskLevel: level, riskReasons: reasons, summaryText: lines.join("\n") };
}
