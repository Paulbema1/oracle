import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Connexions PostgreSQL fournies par l'utilisateur (Neon, Supabase, VPS…).
 * Les pools sont mis en cache par chaîne de connexion, jamais persistés.
 */

export const DDL = `
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY,
  pair text NOT NULL,
  timeframe text NOT NULL,
  model text NOT NULL,
  direction text NOT NULL,
  tendance text NOT NULL DEFAULT 'range',
  confiance integer NOT NULL DEFAULT 0,
  entree double precision,
  stop_loss double precision,
  tp1 double precision,
  tp2 double precision,
  tp3 double precision,
  rr1 double precision,
  rr2 double precision,
  rr3 double precision,
  capital double precision,
  risk_percent double precision,
  risk_amount double precision,
  position_size double precision,
  notional double precision,
  market_source text,
  last_price double precision,
  resumer_tendance text DEFAULT '',
  contexte text DEFAULT '',
  analyse text DEFAULT '',
  invalidation text DEFAULT '',
  niveaux_cles jsonb DEFAULT '[]'::jsonb,
  confluences jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

const pools = new Map<string, { pool: Pool; db: NodePgDatabase; ready: Promise<void> }>();

export function normalizeDbUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (!/^(postgres(ql)?):\/\//i.test(t)) return null;
  return t;
}

export function getUserDb(rawUrl: string): { db: NodePgDatabase; ready: Promise<void> } | null {
  const url = normalizeDbUrl(rawUrl);
  if (!url) return null;

  let entry = pools.get(url);
  if (!entry) {
    const pool = new Pool({
      connectionString: url,
      max: 3,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30_000,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    const db = drizzle(pool);
    const ready = (async () => {
      await pool.query(DDL);
    })();
    entry = { pool, db, ready };
    pools.set(url, entry);
    // Échec (ex. Neon en réveil) : on oublie ce pool pour que la prochaine requête réessaie.
    ready.catch((e) => {
      console.error("[userdb] ensure table failed:", e);
      if (pools.get(url) === entry) pools.delete(url);
      void pool.end().catch(() => {});
    });
  }
  return { db: entry.db, ready: entry.ready };
}

/** Teste la connexion + crée la table si besoin. Renvoie latence & nombre d'analyses. */
export async function checkUserDb(rawUrl: string): Promise<{ ok: boolean; count?: number; latencyMs?: number; error?: string }> {
  const conn = getUserDb(rawUrl);
  if (!conn) return { ok: false, error: "Format invalide — attendu : postgresql://utilisateur:motdepasse@hote/base" };
  const start = Date.now();
  try {
    await conn.ready;
    const res = await conn.db.execute<{ count: string }>(`SELECT count(*)::text as count FROM analyses`);
    const count = Number(res.rows?.[0]?.count ?? 0);
    return { ok: true, count, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connexion impossible" };
  }
}
