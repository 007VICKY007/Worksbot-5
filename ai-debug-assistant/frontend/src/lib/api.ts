import type { Report, AIAnalysis, Issue, ApplyFixResult, VerifyFixResult } from "./types";
import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Server error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password }),
  });
  return handleResponse(res);
}

export interface UserRecord {
  username: string;
  role: string;
  registered_at?: string;
}

export async function registerUser(
  username: string,
  password: string,
  role = "developer",
): Promise<{ token: string; user: UserRecord }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password, role }),
  });
  return handleResponse(res);
}

export async function fetchRegisteredUsers(): Promise<{ users: UserRecord[] }> {
  const res = await fetch(`${BASE}/api/auth/public-users`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse(res);
}

// ── Directory browser ─────────────────────────────────────────────────────────

export interface BrowseResult {
  current: string;
  parent:  string | null;
  items:   { name: string; path: string }[];
}

export async function browseDirectory(path: string): Promise<BrowseResult> {
  const res = await fetch(
    `${BASE}/api/browse?path=${encodeURIComponent(path)}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export async function scanDirectory(directory: string): Promise<Report> {
  const res = await fetch(`${BASE}/api/scan`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({ directory }),
  });
  return handleResponse(res);
}

// ── AI analyze ────────────────────────────────────────────────────────────────

export async function analyzeFile(
  scannedDirectory: string,
  file: string,
  issues: Issue[],
): Promise<AIAnalysis> {
  const res = await fetch(`${BASE}/api/analyze`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({
      scanned_directory: scannedDirectory,
      file,
      issues,
    }),
  });
  return handleResponse(res);
}

export async function analyzeAllFiles(
  scannedDirectory: string,
  files: Record<string, Issue[]>,
): Promise<{ analyses: Record<string, AIAnalysis> }> {
  const res = await fetch(`${BASE}/api/analyze-all`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({
      scanned_directory: scannedDirectory,
      files,
    }),
  });
  return handleResponse(res);
}

export async function fetchAuthenticatedUsers(): Promise<{ users: UserRecord[] }> {
  const res = await fetch(`${BASE}/api/auth/users`, {
    method: "GET",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Code Fix & Verification ──────────────────────────────────────────────────

export async function applyFix(
  scannedDirectory: string,
  file: string,
  fixedCode: string,
): Promise<ApplyFixResult> {
  const res = await fetch(`${BASE}/api/fix/apply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scanned_directory: scannedDirectory,
      file,
      fixed_code: fixedCode,
    }),
  });
  return handleResponse(res);
}

export async function verifyFix(
  scannedDirectory: string,
  file: string,
  originalCode: string,
  fixedCode: string,
  issues: Issue[] = [],
): Promise<VerifyFixResult> {
  const res = await fetch(`${BASE}/api/fix/verify`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scanned_directory: scannedDirectory,
      file,
      original_code: originalCode,
      fixed_code: fixedCode,
      issues,
    }),
  });
  return handleResponse(res);
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
