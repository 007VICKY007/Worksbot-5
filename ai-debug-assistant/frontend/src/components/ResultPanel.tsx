"use client";
import styles from "./ResultPanel.module.css";
import { useState } from "react";
import type { Diagnosis } from "@/lib/api";
import CodeBlock from "./CodeBlock";

interface Props {
  diagnosis: Diagnosis;
  filename: string;
}

export default function ResultPanel({ diagnosis, filename }: Props) {
  const [tab, setTab] = useState<"bugs" | "fix" | "explain">("bugs");

  const conf      = diagnosis.confidence ?? "MEDIUM";
  const confColor = { HIGH: "#3fb950", MEDIUM: "#d29922", LOW: "#f85149" }[conf];
  const confIcon  = { HIGH: "🟢", MEDIUM: "🟡", LOW: "🔴" }[conf];

  // Extract raw code from fix section
  const codeMatch = diagnosis.fixed_code?.match(/```(?:python)?\s*\n([\s\S]*?)```/);
  const fixedCode = codeMatch ? codeMatch[1].trim() : "";

  function downloadFix() {
    const blob = new Blob([fixedCode], { type: "text/x-python" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename.replace(".py", "_fixed.py");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.panel}>
      {/* ── Summary bar ── */}
      <div className={styles.summaryBar}>
        <div>
          <span className={styles.summaryLabel}>Analysis complete</span>
          <span className={styles.summaryFile}>{filename}</span>
        </div>
        <span className={styles.badge} style={{ color: confColor, borderColor: confColor }}>
          {confIcon} {conf} Confidence
        </span>
      </div>

      {/* ── Root cause ── */}
      {diagnosis.root_cause && (
        <div className={styles.rootCause}>
          <div className={styles.rcLabel}>🔍 Root Cause</div>
          <p className={styles.rcText}>{diagnosis.root_cause}</p>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        {(["bugs", "fix", "explain"] as const).map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => setTab(t)}
          >
            {{ bugs: "🐛 Bugs Found", fix: "✅ Fixed Code", explain: "💡 Explanation" }[t]}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className={styles.tabContent}>
        {tab === "bugs" && (
          <div className={styles.bugList}>
            {diagnosis.bugs
              ? diagnosis.bugs.split("\n").filter(Boolean).map((line, i) => (
                  <div key={i} className={styles.bugItem}>
                    <span className={styles.bugDot}>▸</span>
                    <span>{line.replace(/^[-*•]\s*/, "")}</span>
                  </div>
                ))
              : <p className={styles.empty}>No bugs listed.</p>
            }
          </div>
        )}

        {tab === "fix" && (
          <div>
            {fixedCode ? (
              <>
                <CodeBlock code={fixedCode} language="python" />
                <button className={styles.downloadBtn} onClick={downloadFix}>
                  ⬇️ Download Fixed File
                </button>
              </>
            ) : (
              <div className={styles.rawFix}>
                <pre>{diagnosis.fixed_code || "No fix generated."}</pre>
              </div>
            )}
          </div>
        )}

        {tab === "explain" && (
          <div className={styles.explanation}>
            {diagnosis.explanation
              ? diagnosis.explanation.split("\n").filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))
              : <p className={styles.empty}>No explanation available.</p>
            }
          </div>
        )}
      </div>
    </div>
  );
}
