import { timingSafeEqual } from "crypto";

/** Si ACCESS_TOKEN est défini, toutes les routes API exigent l'en-tête x-oracle-token. */
export function authRequired(): boolean {
  return Boolean(process.env.ACCESS_TOKEN);
}

export function isAuthorized(req: Request): boolean {
  const expected = process.env.ACCESS_TOKEN;
  if (!expected) return true;
  const given = req.headers.get("x-oracle-token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return Response.json({ error: "Accès refusé.", detail: "Jeton d'accès manquant ou incorrect." }, { status: 401 });
}
