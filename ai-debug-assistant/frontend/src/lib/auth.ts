// src/lib/auth.ts
// Token storage and session helpers — uses localStorage.

const TOKEN_KEY = "debug_assistant_token";
const USER_KEY  = "debug_assistant_user";
const ROLE_KEY  = "debug_assistant_role";

const VALID_ROLES = ["developer", "qa", "tester", "admin"];
// Legacy role names stored by older versions (kept in sync with backend/auth.py ROLE_ALIASES).
const ROLE_ALIASES: Record<string, string> = { qa_tester: "qa", "qa-tester": "qa", qatester: "qa", dev: "developer", test: "tester" };

/** Canonical role for routing/RBAC; unknown roles fall back to "developer". */
export function normalizeRole(role?: string | null): string {
  const r = String(role ?? "").trim().toLowerCase();
  const mapped = ROLE_ALIASES[r] ?? r;
  return VALID_ROLES.includes(mapped) ? mapped : "developer";
}

export function saveSession(token: string, username: string, role: string = "developer") {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY,  username);
  localStorage.setItem(ROLE_KEY,  normalizeRole(role));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t || t === "undefined" || t === "null" || t.trim() === "") {
    clearSession();
    return null;
  }
  try {
    const parts = t.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) throw new Error("Malformed token");
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    // This is only a session precheck; the API still verifies the JWT signature.
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      throw new Error("Expired token");
    }
  } catch {
    clearSession();
    return null;
  }
  return t;
}

export function getUsername(): string | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem(USER_KEY);
  if (!u || u === "undefined" || u === "null" || u.trim() === "") {
    return null;
  }
  return u;
}

export function getUserRole(): string {
  if (typeof window === "undefined") return "developer";
  const r = localStorage.getItem(ROLE_KEY);
  if (!r || r === "undefined" || r === "null") return "developer";
  return normalizeRole(r);
}

export function isAdmin(): boolean {
  return getUserRole() === "admin";
}

export function isQA(): boolean {
  return getUserRole() === "qa";
}

export function isTester(): boolean {
  return getUserRole() === "tester";
}

export function isDeveloper(): boolean {
  return getUserRole() === "developer";
}

export function getRoleRoute(role?: string): string {
  const r = normalizeRole(role || getUserRole());
  if (r === "admin") return "/admin";
  if (r === "qa") return "/qa";
  if (r === "tester") return "/testing";
  return "/";
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
