import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { db, ensureDefaultTable } from "@/db";
import { analyses } from "@/db/schema";
import { getUserDb } from "@/lib/userdb";
import { desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTarget(req: Request): Promise<NodePgDatabase> {
  const dbUrl = req.headers.get("x-oracle-db");
  if (dbUrl) {
    const conn = getUserDb(dbUrl);
    if (conn) {
      await conn.ready;
      return conn.db;
    }
  }
  await ensureDefaultTable();
  return db;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const target = await resolveTarget(req);
    const rows = await target.select().from(analyses).orderBy(desc(analyses.createdAt)).limit(40);
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json(
      { error: "Historique indisponible sur cette base.", detail: e instanceof Error ? e.message : undefined },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const target = await resolveTarget(req);
    await target.delete(analyses);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Suppression impossible.", detail: e instanceof Error ? e.message : undefined },
      { status: 500 },
    );
  }
}
