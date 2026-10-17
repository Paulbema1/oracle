# ORACLE — Dossier de passation (à donner à la nouvelle discussion)

## 1. Qui / contexte
- Paul, travaille uniquement depuis son téléphone (Acode + Android IDE), pas d'ordinateur. Réponses en français, courtes, étapes simples à faire depuis un téléphone.
- Il veut économiser son quota : relecture de code sans lancer de tests/build quand c'est possible.
- Autre projet à part : TradeVision AI (FastAPI + Android). Ne pas confondre avec ORACLE.

## 2. Le projet ORACLE
App Next.js 16 (Turbopack) + React 19 + Tailwind 4 + Drizzle ORM + pg + framer-motion + lightweight-charts. Usage personnel.
Principe : l'utilisateur tape un actif + timeframe -> l'app télécharge les bougies, dessine un graphique (chandeliers, volumes, EMA 20/50/200) -> envoie l'image à un modèle vision via OpenRouter -> le modèle renvoie un plan de trade en JSON (direction, entrée, SL, TP1-3, analyse...). Le serveur calcule ratio R, montant risqué et taille de position.

Fichiers clés :
- `src/app/api/analyze/route.ts` : prompt système, appel OpenRouter (3 modèles essayés dans l'ordre : Gemini 2.5 Flash, GPT-4o, Claude Sonnet 4), normalisation JSON, sizing, enregistrement en base.
- `src/app/api/market/route.ts` + `src/lib/providers.ts` : bougies Binance -> Kraken -> Yahoo (Binance bloque les IP US, d'où le repli).
- `src/app/api/context/route.ts` + `src/lib/news.ts` : calendrier éco (faireconomy) + RSS (Google News, Fed, BCE, FMI) + niveau de risque événementiel.
- `src/lib/trend.ts` : tendance calculée par algorithme (EMA, pente, structure HH/HL) par timeframe.
- `src/lib/render-chart.ts` : graphique généré dans le navigateur (JPEG).
- `src/lib/userdb.ts` : DDL + migrations de la table `analyses`, pools de connexion, base perso optionnelle (en-tête `x-oracle-db`).
- `src/db/index.ts` : base par défaut (`DATABASE_URL`) + `ensureDefaultTable()`.
- `src/lib/auth.ts`, `src/lib/client-auth.ts`, `src/app/api/auth/route.ts` : protection par jeton `ACCESS_TOKEN` (en-tête `x-oracle-token`).
- `src/components/terminal.tsx` (logique client), `config-panel.tsx`, `result-view.tsx`, `history-panel.tsx`.

## 3. Déploiement actuel
- Render (Web Service Node), URL : https://oracle-tfu4.onrender.com — plan Free (se met en veille, premier chargement ~1 min).
- Build : `npm install && npm run build` — Start : `npm start`.
- Variables Render : `DATABASE_URL` (URL Neon avec `-pooler` et `?sslmode=require`, SANS `channel_binding=require`), `ACCESS_TOKEN` (mot de passe du site), `NODE_VERSION=22`.
- Base : Neon Postgres. La table `analyses` est créée toute seule (aucun `drizzle-kit push` nécessaire).
- Clé OpenRouter (`sk-...`) : saisie dans l'interface, stockée dans le localStorage du navigateur, jamais côté serveur.
- Dépôt GitHub : l'utilisateur pousse lui-même depuis Acode (le compte GitHub n'est pas relié à Claude). Render redéploie à chaque push.
- Un avertissement `sslmode` du driver pg dans les logs est inoffensif.

## 4. Bugs déjà trouvés et corrigés (version en ligne)
1. En-tête `X-Title` avec un tiret long et un é -> `fetch` plantait -> « Réseau injoignable ». Remplacé par du texte ASCII.
2. Colonne `analyse` non entre guillemets dans le SQL de création de table : `analyse` est un mot réservé PostgreSQL -> la table n'était jamais créée -> historique vide. Corrigé : `"analyse"`.
3. Pool de connexion en cache même après un échec (Neon qui se réveille) -> corrigé (le cache est vidé en cas d'échec).
4. `DATABASE_URL` obligatoire à l'import (cassait le build) -> plus d'erreur à l'import, création de table à la demande.
5. EMA du graphique calculées sur 150 bougies seulement (EMA 200 jamais visible) -> calculées sur tout l'historique.
6. Pas de protection d'accès -> jeton `ACCESS_TOKEN` sur toutes les routes API + écran de saisie.
7. `drizzle.config.json` en dur vers localhost -> remplacé par `drizzle.config.ts` (lit `DATABASE_URL`). Supprimer l'ancien `.json`.

## 5. Dernière mise à jour reçue (oracle.0.1.zip) — nouveautés
Analyse multi-timeframe (table `HTF_MAP` : 4H -> 1D+1W, 1H -> 4H+1D, etc., jusqu'à 3 images), briefing macro (calendrier + titres Fed/BCE/FMI/presse), stratégie adaptative (pullback / breakout / range / pas de trade), nouveaux champs en base (strategie, regime, confirmation_mtf, alerte_macro, risque_env, htf_trends, macro_events, macro_headlines) avec migrations `ADD COLUMN IF NOT EXISTS`, images en JPEG, garde-fou : conflit entre timeframes -> NEUTRE si le modèle ne signale pas le conflit.

PROBLÈME : ce zip avait été construit à partir de l'ancienne base, donc il SUPPRIMAIT tous les correctifs du point 4 (X-Title cassé, `analyse` sans guillemets, plus de jeton, etc.). Le pousser tel quel aurait recassé l'analyse et l'historique.

## 6. Version fusionnée (à utiliser)
`oracle-merged.zip` = nouveautés de oracle.0.1 + tous les correctifs du point 4 réappliqués, plus : migrations aussi appliquées à la base par défaut (fonction `ensureSchema`), garde jeton aussi sur `/api/context`.
ATTENTION : cette version n'a été ni compilée, ni testée (relecture + modifications automatiques avec vérification de chaque remplacement). Au premier déploiement, lire le log de build Render et, en cas d'erreur TypeScript, le coller dans la discussion.
Pour la mettre en ligne depuis Acode : dézipper par-dessus le dépôt, supprimer `drizzle.config.json`, puis `git add -A`, `git commit -m "..."`, `git push`.

## 7. Points ouverts / risques connus
- Non relu en détail : `result-view.tsx` et `history-panel.tsx` de la nouvelle version (nouveaux champs, prop `charts`), `globals.css`.
- Si le modèle répond NEUTRE sans niveaux d'entrée/stop, le serveur renvoie 502 « Plan incomplet » (la vérification s'applique aussi à NEUTRE). À assouplir.
- Si le flux du calendrier économique est indisponible (faireconomy limite souvent), le risque événementiel affiché est « faible » : trompeur. Mieux : « inconnu ».
- Le serveur ne vérifie pas que SL/TP sont du bon côté de l'entrée.
- Seuls 3 modèles sont réellement utilisés (`MODELS.slice(0, 3)`), les 2 autres de la liste ne sont jamais appelés.
- Yahoo peut refuser les IP de serveurs ; Binance renvoie 451 depuis les USA (le repli Kraken couvre surtout BTC/ETH et paires USD).
- Les titres RSS sont insérés dans le prompt (risque faible d'injection de prompt).
- Le score de confiance est l'impression du modèle, pas une probabilité ; la méthode n'est pas backtestée. À présenter comme une deuxième lecture, pas un signal fiable.
- Idées proposées : afficher l'image envoyée à l'IA avec le résultat ; afficher l'erreur réelle dans le panneau d'historique ; vérification de cohérence SL/TP.

## 8. Diagnostic rapide en cas de problème
- `/api/health` doit afficher `{"ok":true}` (connexion base).
- Historique vide : chercher `DB insert failed` ou `ensure table failed` dans les logs Render.
- « Réseau injoignable » / « Appel impossible : ... » : regarder le message exact (en-têtes, clé OpenRouter, crédits).
- Site sans écran de jeton : `ACCESS_TOKEN` absent ou mal nommé.
