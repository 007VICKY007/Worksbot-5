"use client";
import styles from "./CodeBlock.module.css";
import { useState } from "react";

interface Props {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language = "python" }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lines = code.split("\n");

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <span className={styles.lang}>{language}</span>
        <button className={styles.copyBtn} onClick={copy}>
          {copied ? "✅ Copied" : "📋 Copy"}
        </button>
      </div>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className={styles.row}>
                <td className={styles.lineNum}>{i + 1}</td>
                <td className={styles.lineCode}>{line || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
