"use client";
import { useState, useEffect, useCallback } from "react";
import { browseDirectory, type BrowseResult } from "@/lib/api";
import styles from "./DirBrowser.module.css";

interface Props {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function DirBrowser({ initialPath = "/", onSelect, onClose }: Props) {
  const [result,  setResult]  = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [typed,   setTyped]   = useState(initialPath);

  const navigate = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await browseDirectory(path);
      setResult(data);
      setTyped(data.current);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not open directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial path on mount
  useEffect(() => {
    navigate(initialPath);
  }, [navigate, initialPath]);

  // Breadcrumb segments
  const segments = result
    ? result.current
        .split("/")
        .filter(Boolean)
        .map((seg, i, arr) => ({
          label: seg,
          path:  "/" + arr.slice(0, i + 1).join("/"),
        }))
    : [];

  function handleTypedSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(typed.trim() || "/");
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Browse directory</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {/* Manual path input */}
        <form className={styles.pathForm} onSubmit={handleTypedSubmit}>
          <input
            className={styles.pathInput}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="/path/to/directory"
            spellCheck={false}
          />
          <button type="submit" className={styles.goBtn} disabled={loading}>
            Go
          </button>
        </form>

        {/* Breadcrumb */}
        {result && (
          <div className={styles.breadcrumb}>
            <button className={styles.crumb} onClick={() => navigate("/")}>
              Root
            </button>
            {segments.map((seg, i) => (
              <span key={seg.path} className={styles.crumbRow}>
                <span className={styles.crumbSep}>/</span>
                {i === segments.length - 1 ? (
                  <span className={styles.crumbCurrent}>{seg.label}</span>
                ) : (
                  <button className={styles.crumb} onClick={() => navigate(seg.path)}>
                    {seg.label}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Directory listing */}
        <div className={styles.listing}>
          {loading && (
            <div className={styles.listRow}>
              <div className={styles.spinner} />
              <span className={styles.loadText}>Loading…</span>
            </div>
          )}

          {error && <div className={styles.errorMsg}>{error}</div>}

          {!loading && result && (
            <>
              {/* Parent folder */}
              {result.parent && (
                <button
                  className={`${styles.dirRow} ${styles.dirRowParent}`}
                  onClick={() => navigate(result.parent!)}
                >
                  <FolderIcon />
                  <span>..</span>
                  <span className={styles.parentLabel}>Parent folder</span>
                </button>
              )}

              {/* Subdirectories */}
              {result.items.length === 0 && !result.parent && (
                <p className={styles.empty}>No subdirectories found.</p>
              )}
              {result.items.map((item) => (
                <button
                  key={item.path}
                  className={styles.dirRow}
                  onClick={() => navigate(item.path)}
                >
                  <FolderIcon />
                  <span className={styles.dirName}>{item.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className={styles.footer}>
          <span className={styles.selectedPath}>{result?.current ?? ""}</span>
          <div className={styles.footerBtns}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button
              className={styles.selectBtn}
              onClick={() => { if (result) { onSelect(result.current); onClose(); } }}
              disabled={!result}
            >
              Select this folder
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, color: "#9098a9" }}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
    </svg>
  );
}
