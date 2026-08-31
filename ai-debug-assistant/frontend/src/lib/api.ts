// src/lib/api.ts — typed API client for the Flask backend

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export interface ParsedError {
  error_type: string;
  message: string;
  file: string;
  line: number;
  function: string;
}

export interface Retrieved {
  found: boolean;
  file_path: string;
  context_src: string;
  function_src: string;
}

export interface Diagnosis {
  bugs: string;
  root_cause: string;
  fixed_code: string;
  explanation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  raw: string;
}

export interface AnalyseResult {
  parsed?: ParsedError;
  retrieved?: Retrieved;
  diagnosis: Diagnosis;
  fixed_code: string;
}

export interface StreamChunk {
  type: "chunk" | "result" | "error";
  text?: string;
  data?: Diagnosis;
  message?: string;
}

// ── Analyse Python code directly (streaming) ──────────────────────────────────
export async function analyseCodeStream(
  filename: string,
  code: string,
  onChunk: (text: string) => void
): Promise<Diagnosis> {
  const res = await fetch(`${BASE}/api/analyse-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, code }),
  });

  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let diagnosis: Diagnosis | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split("\n").filter(Boolean);
    for (const line of lines) {
      const chunk: StreamChunk = JSON.parse(line);
      if (chunk.type === "chunk" && chunk.text) onChunk(chunk.text);
      if (chunk.type === "result" && chunk.data) diagnosis = chunk.data;
      if (chunk.type === "error") throw new Error(chunk.message);
    }
  }

  if (!diagnosis) throw new Error("No result received from server");
  return diagnosis;
}

// ── Demo endpoint ─────────────────────────────────────────────────────────────
export async function runDemo(): Promise<AnalyseResult> {
  const res = await fetch(`${BASE}/api/demo`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Demo failed");
  return data as AnalyseResult;
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
