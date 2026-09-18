// src/lib/auth.ts
// Token storage and session helpers — uses localStorage.

const TOKEN_KEY = "debug_assistant_token";
const USER_KEY  = "debug_assistant_user";

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY,  username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
