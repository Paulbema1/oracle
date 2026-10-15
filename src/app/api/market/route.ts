import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { fetchMarketData } from "@/lib/providers";
import type { MarketResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.trim() ?? "";
  const tf = searchParams.get("tf")?.trim() ?? "4H";

  if (!symbol) {
    return NextResponse.json({ error: "Précisez l'actif à récupérer (ex : BTCUSDT, EURUSD, XAUUSD)." }, { status: 400 });
  }

  try {
    const data = await fetchMarketData(symbol, tf);
    if (!data) {
      return NextResponse.json(
        {
          error: `Actif « ${symbol.toUpperCase()} » introuvable.`,
          detail:
            "Vérifiez le symbole : crypto au format BTCUSDT / ETHUSDT, forex EURUSD, or XAUUSD, indices US100 / US30, action AAPL…",
        },
        { status: 404 },
      );
    }
    const payload: MarketResponse = {
      provider: data.provider,
      symbol: data.symbol,
      lastClose: data.lastClose,
      candles: data.candles,
    };
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: "Impossible de récupérer les données marché.", detail: e instanceof Error ? e.message : undefined },
      { status: 502 },
    );
  }
}
