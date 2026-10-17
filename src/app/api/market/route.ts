import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { fetchBinance, fetchKraken, fetchYahoo, krakenPair, resolveSymbol } from "@/lib/providers";
import { analyzeTrend, mtfSummaryText } from "@/lib/trend";
import type { MarketResponse, MarketSeriesBundle, OhlcCandle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Provider = "binance" | "kraken" | "yahoo";

async function fetchFromProvider(provider: Provider, symbol: string, tf: string): Promise<OhlcCandle[] | null> {
  if (provider === "binance") return fetchBinance(symbol, tf);
  if (provider === "kraken") return fetchKraken(symbol, tf);
  return fetchYahoo(symbol, tf);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.trim() ?? "";
  const tf = searchParams.get("tf")?.trim() ?? "4H";
  const extraRaw = searchParams.get("extra")?.trim() ?? "";
  const extraTfs = extraRaw
    ? [...new Set(extraRaw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 2)
    : [];

  if (!symbol) {
    return NextResponse.json({ error: "Précisez l'actif à récupérer (ex : BTCUSDT, EURUSD, XAUUSD)." }, { status: 400 });
  }

  const resolved = resolveSymbol(symbol);

  // 1) Trouve un provider qui connaît l'actif (sur le TF principal)
  let provider: Provider | null = null;
  let providerSymbol = "";
  let primary: OhlcCandle[] | null = null;

  if (resolved.binance) {
    const c = await fetchBinance(resolved.binance, tf);
    if (c?.length) { provider = "binance"; providerSymbol = resolved.binance; primary = c; }
  }
  if (!primary) {
    const kp = krakenPair(symbol.toUpperCase().replace(/[\s_/.-]+/g, ""));
    if (kp) {
      const c = await fetchKraken(kp, tf);
      if (c?.length) { provider = "kraken"; providerSymbol = kp; primary = c; }
    }
  }
  if (!primary) {
    for (const ys of resolved.yahoo.slice(0, 4)) {
      const c = await fetchYahoo(ys, tf);
      if (c?.length) { provider = "yahoo"; providerSymbol = ys; primary = c; break; }
    }
  }

  if (!provider || !primary) {
    return NextResponse.json(
      {
        error: `Actif « ${symbol.toUpperCase()} » introuvable.`,
        detail:
          "Vérifiez le symbole : crypto au format BTCUSDT / ETHUSDT, forex EURUSD, or XAUUSD, indices US100 / US30, action AAPL…",
      },
      { status: 404 },
    );
  }

  // 2) Même provider pour les TF supérieurs
  const htf: MarketSeriesBundle[] = [];
  for (const htfTf of extraTfs) {
    try {
      const candles = await fetchFromProvider(provider, providerSymbol, htfTf);
      if (candles?.length) {
        htf.push({ tf: htfTf, candles, trend: analyzeTrend(candles, htfTf) });
      }
    } catch {
      /* TF supérieur indisponible — on continue sans */
    }
  }

  const payload: MarketResponse & { mtfText: string } = {
    provider,
    symbol: providerSymbol,
    tf,
    lastClose: primary[primary.length - 1].close,
    candles: primary,
    trend: analyzeTrend(primary, tf),
    htf,
    mtfText: "",
  };
  payload.mtfText = mtfSummaryText([payload.trend, ...htf.map((h) => h.trend)]);

  return NextResponse.json(payload);
}
