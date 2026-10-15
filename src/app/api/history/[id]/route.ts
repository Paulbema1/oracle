import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { db, ensureDefaultTable } from "@/db";
import { analyses } from "@/db/schema";
import { getUserDb } from "@/lib/userdb";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const runtime = "nodejs";

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

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const { id } = await ctx.params;
    const target = await resolveTarget(req);
    await target.delete(analyses).where(eq(analyses.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Suppression impossible.", detail: e instanceof Error ? e.message : undefined },
      { status: 500 },
    );
  }
}
