"use client";
import styles from "./page.module.css";
import { useState, useRef } from "react";
import { analyseCodeStream, runDemo, type Diagnosis } from "@/lib/api";
import ResultPanel from "@/components/ResultPanel";

export default function Home() {
  const [code, setCode]         = useState("");
  const [filename, setFilename] = useState("code.py");
  const [streaming, setStreaming] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── File picker ─────────────────────────────────────────────────────────────
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCode(ev.target?.result as string ?? "");
    reader.readAsText(file);
    setDiagnosis(null);
    setStreaming("");
    setError("");
  }

  // ── Analyse ─────────────────────────────────────────────────────────────────
  async function handleAnalyse() {
    if (!code.trim()) { setError("Paste or upload a Python file first."); return; }
    setLoading(true);
    setDiagnosis(null);
    setStreaming("");
    setError("");
    try {
      const result = await analyseCodeStream(filename, code, (chunk) =>
        setStreaming((prev) => prev + chunk)
      );
      setDiagnosis(result);
      setStreaming("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // ── Demo ────────────────────────────────────────────────────────────────────
  async function handleDemo() {
    setDemoLoading(true);
    setDiagnosis(null);
    setStreaming("");
    setError("");
    try {
      const result = await runDemo();
      setDiagnosis(result.diagnosis);
      setCode(result.retrieved?.function_src ?? "");
      setFilename("inventory.py");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setDemoLoading(false);
    }
  }

  function handleReset() {
    setCode(""); setFilename("code.py");
    setDiagnosis(null); setStreaming(""); setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.logo}>🐛</span>
          <div>
            <h1 className={styles.title}>AI Debug Assistant</h1>
            <p className={styles.subtitle}>Upload Python code · GPT finds bugs & fixes them</p>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* ── Upload section ── */}
        <section className={styles.uploadSection}>
          <div className={styles.sectionLabel}>Step 1 — Select or paste your Python file</div>

          <div className={styles.uploadRow}>
            <input
              ref={fileRef}
              type="file"
              accept=".py"
              onChange={onFileChange}
              className={styles.fileInput}
              id="file-upload"
            />
            <label htmlFor="file-upload" className={styles.fileLabel}>
              📂 Browse .py File
            </label>
            {filename !== "code.py" && (
              <span className={styles.fileChosen}>📄 {filename}</span>
            )}
          </div>

          <div className={styles.sectionLabel} style={{ marginTop: "1rem" }}>
            Or paste code directly
          </div>
          <textarea
            className={styles.codeArea}
            value={code}
            onChange={(e) => { setCode(e.target.value); setDiagnosis(null); }}
            placeholder={"# Paste your Python code here...\ndef my_function():\n    pass"}
            spellCheck={false}
          />

          {code && (
            <p className={styles.lineCount}>
              {code.split("\n").length} lines · {filename}
            </p>
          )}
        </section>

        {/* ── Buttons ── */}
        <div className={styles.buttonRow}>
          <button
            className={styles.btnPrimary}
            onClick={handleAnalyse}
            disabled={loading || !code.trim()}
          >
            {loading ? "⏳ Analysing…" : "🤖 Analyse with GPT"}
          </button>
          <button
            className={styles.btnSecondary}
            onClick={handleDemo}
            disabled={demoLoading}
          >
            {demoLoading ? "Loading…" : "▶ Run Demo"}
          </button>
          <button className={styles.btnGhost} onClick={handleReset}>
            🔄 Reset
          </button>
        </div>

        {/* ── Error ── */}
        {error && <div className={styles.errorBanner}>❌ {error}</div>}

        {/* ── Streaming output ── */}
        {streaming && (
          <div className={styles.streamBox}>
            <div className={styles.streamLabel}>🤖 GPT is thinking…</div>
            <pre className={styles.streamPre}>{streaming}</pre>
          </div>
        )}

        {/* ── Results ── */}
        {diagnosis && <ResultPanel diagnosis={diagnosis} filename={filename} />}
      </main>
    </div>
  );
}
