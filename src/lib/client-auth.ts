export const TOKEN_KEY = "oracle:token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* stockage indisponible */
  }
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { "x-oracle-token": t } : {};
}
