# Règles à ne PAS casser (ORACLE)

Pars TOUJOURS de l'état actuel du dépôt, jamais d'un ancien zip : sinon ces correctifs disparaissent.

1. En-têtes HTTP (ex. `X-Title` vers OpenRouter) : ASCII uniquement. Un tiret long ou un « é » fait planter `fetch`.
2. Dans tout SQL écrit à la main (DDL, migrations) : la colonne `analyse` s'écrit `"analyse"` (mot réservé PostgreSQL).
3. `src/db/index.ts` ne doit jamais lever d'erreur à l'import. La table se crée via `ensureSchema()` (userdb.ts) / `ensureDefaultTable()` (db/index.ts), appelés avant toute lecture/écriture.
4. Un pool de connexion qui échoue est retiré du cache (sinon la base reste bloquée jusqu'au redémarrage).
5. Nouvelle colonne en base = 3 endroits : `src/db/schema.ts`, `DDL` et `MIGRATIONS` (`ADD COLUMN IF NOT EXISTS`) dans `src/lib/userdb.ts`.
6. Protection d'accès : chaque route API (sauf `/api/health` et `/api/auth`) commence par `if (!isAuthorized(req)) return unauthorized();`. Chaque `fetch` client vers `/api/*` ajoute `...authHeaders()`.
7. Fichiers à conserver : `src/lib/auth.ts`, `src/lib/client-auth.ts`, `src/app/api/auth/route.ts`, `drizzle.config.ts` (pas de `drizzle.config.json`).
8. Graphique : les EMA se calculent sur tout l'historique reçu, puis on ne garde que les bougies affichées (sinon l'EMA 200 disparaît).
9. Liens d'actualité : seulement `http(s)://`.
10. Ne supprime pas un fichier que tu ne connais pas ; ne remplace pas un fichier entier sans reprendre ces points.
