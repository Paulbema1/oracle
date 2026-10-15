import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { checkUserDb } from "@/lib/userdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  let url = "";
  try {
    const body = (await req.json()) as { dbUrl?: string };
    url = body.dbUrl ?? "";
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  }
  if (!url.trim()) {
    return NextResponse.json({ ok: false, error: "Chaîne de connexion vide." }, { status: 400 });
  }
  const result = await checkUserDb(url);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
