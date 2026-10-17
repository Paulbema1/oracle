import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { fetchMacroContext } from "@/lib/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) {
    return NextResponse.json({ error: "Précisez l'actif (ex : BTCUSDT, EURUSD, XAUUSD)." }, { status: 400 });
  }
  try {
    const ctx = await fetchMacroContext(symbol);
    return NextResponse.json(ctx);
  } catch (e) {
    // Le contexte ne doit jamais bloquer une analyse
    return NextResponse.json(
      {
        events: [],
        headlines: [],
        riskLevel: "faible",
        riskReasons: ["contexte indisponible — analyse technique seule"],
        summaryText: "CONTEXTE MACRO : flux d'actualité indisponibles pour le moment, analyse sur données techniques uniquement.",
        _warning: e instanceof Error ? e.message : undefined,
      },
      { status: 200 },
    );
  }
}
