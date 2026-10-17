import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ensureSchema } from "@/lib/userdb";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// Pas d'erreur à l'import si DATABASE_URL manque (build possible) : l'erreur survient à la requête.
export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

let defaultReady: Promise<void> | null = null;

/** Crée la table `analyses` dans la base par défaut si besoin (réessaie après un échec). */
export function ensureDefaultTable(): Promise<void> {
  if (!databaseUrl) return Promise.reject(new Error("DATABASE_URL manquante"));
  if (!defaultReady) {
    defaultReady = ensureSchema(pool);
    defaultReady.catch(() => {
      defaultReady = null;
    });
  }
  return defaultReady;
}
