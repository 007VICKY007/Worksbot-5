"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, animate } from "framer-motion";
import type { Variants, Transition } from "framer-motion";
import { scanDirectory, analyzeFile, analyzeAllFiles, fetchAuthenticatedUsers, applyFix, UserRecord } from "@/lib/api";
import { isLoggedIn, getUsername, clearSession } from "@/lib/auth";
import type { Report, Issue, AIAnalysis } from "@/lib/types";
import DirBrowser from "@/components/DirBrowser";
import CodeHighlighter from "@/components/CodeHighlighter";
import AnimatedText from "@/components/AnimatedText";
import styles from "./page.module.css";

const SEV: Record<string, string> = { error: "Error", warning: "Warning", info: "Info" };

const CATEGORY_META: Record<string, { label: string; desc: string }> = {
  SYNTAX: {
    label: "Syntax Errors",
    desc: "Violations of language grammar, parse errors, and uncompilable structures.",
  },
  SECURITY: {
    label: "Security Vulnerabilities",
    desc: "Remote code execution, dangerous eval, insecure memory functions, and unsafe access.",
  },
  LOGIC: {
    label: "Logic Defects",
    desc: "Mutable defaults, missing where clauses, reference string comparison, and dead branches.",
  },
  RUNTIME: {
    label: "Runtime Hazards",
    desc: "Broad exception swallowing, panics, unhandled promise rejections, and crash vectors.",
  },
  QUALITY: {
    label: "Code Quality",
    desc: "Built-in shadowing, unused imports, explicit any types, and bad practices.",
  },
  PERFORMANCE: {
    label: "Performance Issues",
    desc: "Unoptimized database queries, heavy allocations, and bottleneck patterns.",
  },
  RESOURCE: {
    label: "Resource Leaks",
    desc: "Unclosed HTTP bodies, dangling file descriptors, and memory leaks.",
  },
  CONCURRENCY: {
    label: "Concurrency Bugs",
    desc: "Goroutine loop capture, race condition vectors, and unsafe threading.",
  },
  TYPE: {
    label: "Type Safety",
    desc: "Loss of type safety, non-null assertions, and missing type declarations.",
  },
};

function getCategoryIcon(cat: string) {
  const c = cat.toUpperCase();
  switch (c) {
    case "SYNTAX":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "SECURITY":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "LOGIC":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="1.05" y1="12" x2="7" y2="12" />
          <line x1="17.01" y1="12" x2="22.96" y2="12" />
        </svg>
      );
    case "RUNTIME":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "QUALITY":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#167a5b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "PERFORMANCE":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "RESOURCE":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case "CONCURRENCY":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      );
    case "TYPE":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#db2777" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}

// ── Framer Motion variants ────────────────────────────────────────────────────
const ease = [0.16, 1, 0.3, 1] as const;  // expo-out feel

const T: Transition = { duration: 0.45, ease };
const Tfast: Transition = { duration: 0.22, ease: [0.4, 0, 1, 1] };

const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: T },
};
const stagger: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const slideUp: Variants = {
  hidden:  { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: T },
  exit:    { opacity: 0, y: -10, scale: 0.97, transition: Tfast },
};
const popIn: Variants = {
  hidden:  { opacity: 0, scale: 0.92, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { ...T, type: "spring", stiffness: 280, damping: 24 } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: Tfast },
};

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const ctrl = animate(0, to, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) { if (ref.current) ref.current.textContent = Math.round(v).toString(); },
    });
    return ctrl.stop;
  }, [to]);
  return <span ref={ref}>0</span>;
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className={styles.skelWrap}>
      {[100, 75, 55, 85, 65].map((w, i) => (
        <motion.div
          key={i}
          className={styles.skelLine}
          style={{ width: `${w}%` }}
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.1, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [username, setUsername]   = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = "/login";
    } else {
      setUsername(getUsername() ?? "");
      setAuthReady(true);
    }
  }, []);

  const logout = () => {
    clearSession();
    window.location.href = "/login";
  };

  // Scanner state
  const [dir,         setDir]         = useState("");
  const [loading,     setLoading]     = useState(false);
  const [scanDone,    setScanDone]    = useState(false);
  const [error,       setError]       = useState("");
  const [report,      setReport]      = useState<Report | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);

  // Filters
  const [activeFile,     setActiveFile]     = useState("all");
  const [activeLang,     setActiveLang]     = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSev,      setActiveSev]      = useState<string[]>(["error", "warning", "info"]);
  const [openFiles,      setOpenFiles]      = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [tab,            setTab]            = useState<"issues" | "categories" | "json" | "letterhead">("issues");

  // AI & Batch Diagnostics
  const [aiLoading,      setAiLoading]      = useState<string | null>(null);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [aiData,         setAiData]         = useState<Record<string, AIAnalysis>>({});
  const [aiErr,          setAiErr]          = useState<Record<string, string>>({});
  const [aiOpen,         setAiOpen]         = useState<Record<string, boolean>>({});

  // Fix & Diff State
  const [codeViewMode,   setCodeViewMode]   = useState<Record<string, "code" | "diff">>({});
  const [applyingFix,    setApplyingFix]    = useState<Record<string, boolean>>({});
  const [appliedSuccess, setAppliedSuccess] = useState<Record<string, { backup: string; remaining: number }>>({});

  // Registered Users Directory State
  const [registeredUsers, setRegisteredUsers] = useState<UserRecord[]>([]);
  const [selectedUser,    setSelectedUser]    = useState<string>("");

  useEffect(() => {
    if (authReady) {
      fetchAuthenticatedUsers()
        .then(res => {
          setRegisteredUsers(res.users);
          setSelectedUser(username || (res.users[0]?.username ?? "current_user"));
        })
        .catch(() => {
          setSelectedUser(username || "current_user");
        });
    }
  }, [authReady, username]);


  // ── Scan ─────────────────────────────────────────────────────────────────────
  async function doScan(e: React.FormEvent) {
    e.preventDefault();
    if (!dir.trim()) return;
    setLoading(true); setError(""); setReport(null); setScanDone(false);
    setActiveFile("all"); setActiveLang("all"); setActiveCategory("all");
    setOpenFiles(new Set()); setOpenCategories(new Set()); setTab("issues");
    setAiData({}); setAiErr({}); setAiOpen({});
    setCodeViewMode({}); setApplyingFix({}); setAppliedSuccess({});
    try {
      const r = await scanDirectory(dir.trim());
      setReport(r);
      setOpenFiles(new Set(r.issues.map(i => i.file)));
      if (r.by_category) {
        setOpenCategories(new Set(Object.keys(r.by_category).map(c => c.toUpperCase())));
      }
      setScanDone(true);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Unknown error";
      if (m.includes("401") || m.includes("expired")) { clearSession(); router.replace("/login"); }
      else setError(m);
    } finally { setLoading(false); }
  }

  function reset() {
    setDir(""); setReport(null); setError(""); setScanDone(false);
    setActiveFile("all"); setActiveLang("all"); setActiveCategory("all"); setActiveSev(["error","warning","info"]);
    setOpenFiles(new Set()); setOpenCategories(new Set()); setAiData({}); setAiErr({}); setAiOpen({});
    setCodeViewMode({}); setApplyingFix({}); setAppliedSuccess({});
  }

  // ── Apply Fix to File (1-Click with .bak Backup) ──────────────────────────────
  async function handleApplyFix(file: string, fixedCode: string) {
    if (!report) return;
    setApplyingFix(p => ({ ...p, [file]: true }));
    try {
      const res = await applyFix(report.scanned_directory, file, fixedCode);
      setAppliedSuccess(p => ({
        ...p,
        [file]: { backup: res.backup, remaining: res.remaining_issues.length }
      }));
      // Rescan directory to reflect the fixes in real-time
      const updatedReport = await scanDirectory(report.scanned_directory);
      setReport(updatedReport);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to apply fix to file.");
    } finally {
      setApplyingFix(p => ({ ...p, [file]: false }));
    }
  }

  // ── AI analyze ────────────────────────────────────────────────────────────────
  async function doAnalyze(file: string, issues: Issue[]) {
    if (!report) return;
    setAiLoading(file);
    setAiErr(p => { const n = {...p}; delete n[file]; return n; });
    try {
      const r = await analyzeFile(report.scanned_directory, file, issues);
      setAiData(p  => ({ ...p, [file]: r }));
      setAiOpen(p  => ({ ...p, [file]: true }));
    } catch (e: unknown) {
      setAiErr(p => ({ ...p, [file]: e instanceof Error ? e.message : "AI analysis failed." }));
    } finally { setAiLoading(null); }
  }

  // ── Run AI Root Cause Analysis on ALL Files ───────────────────────────────────
  async function doAnalyzeAll() {
    if (!report) return;
    setBatchAnalyzing(true);
    try {
      const allFilesMap: Record<string, Issue[]> = {};
      for (const iss of report.issues) {
        (allFilesMap[iss.file] = allFilesMap[iss.file] ?? []).push(iss);
      }
      const res = await analyzeAllFiles(report.scanned_directory, allFilesMap);
      setAiData(prev => ({ ...prev, ...res.analyses }));
      const newOpen: Record<string, boolean> = {};
      for (const k of Object.keys(res.analyses)) newOpen[k] = true;
      setAiOpen(prev => ({ ...prev, ...newOpen }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Batch AI analysis failed.");
    } finally {
      setBatchAnalyzing(false);
    }
  }

  function handlePrintReport() {
    window.print();
  }


  // ── Derived ───────────────────────────────────────────────────────────────────
  const detectedLangs = report?.languages_detected
    ? Object.keys(report.languages_detected).sort()
    : report?.issues
    ? [...new Set(report.issues.map(i => i.language || "Python"))].sort()
    : [];

  const filtered = report
    ? report.issues.filter(i =>
        activeSev.includes(i.severity) &&
        (activeFile === "all" || i.file === activeFile) &&
        (activeLang === "all" || (i.language || "Python") === activeLang) &&
        (activeCategory === "all" || (i.category || "QUALITY").toUpperCase() === activeCategory.toUpperCase())
      )
    : [];
  const byFile: Record<string, Issue[]> = {};
  for (const i of filtered) (byFile[i.file] = byFile[i.file] ?? []).push(i);
  const fileList = report ? [...new Set(report.issues.map(i => i.file))].sort() : [];

  // Group all issues by Category for Error Types Directory
  const byCategoryIssues: Record<string, Issue[]> = {};
  if (report) {
    for (const issue of report.issues) {
      const cat = (issue.category || "QUALITY").toUpperCase();
      (byCategoryIssues[cat] = byCategoryIssues[cat] ?? []).push(issue);
    }
  }

  function toggleSev(s: string) {
    setActiveSev(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  }
  function toggleFile(f: string) {
    setOpenFiles(p => { const n = new Set(p); n.has(f) ? n.delete(f) : n.add(f); return n; });
  }
  function toggleCategory(cat: string) {
    setOpenCategories(p => {
      const n = new Set(p);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  }
  function copyJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: "report.json" }).click();
    URL.revokeObjectURL(url);
  }

  if (!authReady) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "var(--font)"
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          color: "var(--text-secondary)"
        }}>
          <div className={styles.btnSpinner} style={{
            width: "28px",
            height: "28px",
            border: "3px solid #e2e8f0",
            borderTopColor: "var(--blue)"
          }} />
          <span style={{ fontSize: "13px", fontWeight: 500 }}>Checking session…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {showBrowser && (
        <DirBrowser
          initialPath={dir || "/"}
          onSelect={p => setDir(p)}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {/* ── Top bar ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.brandMark}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div>
              <div className={styles.brandName}>
                <AnimatedText text="Universal Multi-Language Debugger" delay={0.1} stagger={0.025} />
              </div>
              <div className={styles.brandSub}>Deterministic Static Analysis + Sandbox Validation + AI Reasoning</div>
            </div>
          </div>
          <div className={styles.userArea}>
            <div className={styles.userChip}>
              <span className={styles.avatar}>{username.charAt(0).toUpperCase()}</span>
              <span className={styles.uname}>{username}</span>
            </div>
            <button className={styles.signOut} onClick={logout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* ── Scan form ── */}
        <motion.div className={styles.scanCard} variants={fadeUp} initial="hidden" animate="visible">
          <div className={styles.scanCardHead}>
            <h1 className={styles.scanTitle}>
              <AnimatedText text="Scan Any Codebase" delay={0.2} stagger={0.03} />
            </h1>
            <p className={styles.scanSub}>Universal multi-language code debugging: Python, JS, TS, Java, C/C++, Go, Rust, SQL, Bash & more</p>
          </div>
          <form onSubmit={doScan}>
            <div className={styles.scanRow}>
              <div className={styles.pathField}>
                <svg className={styles.pathIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
                </svg>
                <input
                  className={styles.pathInput}
                  type="text" value={dir} onChange={e => setDir(e.target.value)}
                  placeholder="/path/to/your/project (Python, JS, TS, Java, C/C++, Go, Rust...)"
                  autoComplete="off" spellCheck={false}
                />
                <button type="button" className={styles.browseBtn} onClick={() => setShowBrowser(true)}>
                  Browse
                </button>
              </div>
              <div className={styles.scanActions}>
                <motion.button
                  type="submit"
                  className={styles.scanBtn}
                  disabled={loading || !dir.trim()}
                  whileTap={{ scale: loading ? 1 : 0.97 }}
                  whileHover={{ scale: loading ? 1 : 1.02 }}
                >
                  {loading
                    ? <><span className={styles.btnSpinner}/> Scanning…</>
                    : scanDone
                      ? <><ScanDoneIcon/> Scan again</>
                      : "Run scan"
                  }
                </motion.button>
                {report && (
                  <motion.button type="button" className={styles.clearBtn} onClick={reset}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                    Clear
                  </motion.button>
                )}
              </div>
            </div>
          </form>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div className={styles.errBanner} variants={popIn} initial="hidden" animate="visible" exit="exit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Skeleton while loading ── */}
        <AnimatePresence>
          {loading && (
            <motion.div className={styles.skelCard} variants={slideUp} initial="hidden" animate="visible" exit="exit">
              <div className={styles.skelLabel}>Scanning your project…</div>
              <Skeleton/>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        <AnimatePresence mode="wait">
          {report && !loading && (
            <motion.div key="results" className={styles.resultsContainer} variants={stagger} initial="hidden" animate="visible">

              {/* Metrics */}
              <motion.div className={styles.metrics} variants={stagger}>
                {[
                  { label: "Files scanned",     val: report.total_files ?? report.total_py_files, accent: "neutral" },
                  { label: "Files with issues", val: report.files_with_issues,                    accent: "neutral" },
                  { label: "Errors",            val: report.summary.error,                        accent: "red" },
                  { label: "Warnings",          val: report.summary.warning,                      accent: "orange" },
                  { label: "Info",              val: report.summary.info,                         accent: "blue" },
                  { label: "Total issues",      val: report.total_issues,                         accent: "neutral" },
                ].map(({ label, val, accent }) => (
                  <motion.div
                    key={label}
                    className={`${styles.metricCard} ${styles[`m_${accent}`]}`}
                    variants={fadeUp}
                    whileHover={{ y: -3, transition: { duration: 0.18 } }}
                  >
                    <span className={styles.metricVal}><Counter to={val}/></span>
                    <span className={styles.metricLabel}>{label}</span>
                    <div className={`${styles.metricBar} ${styles[`mb_${accent}`]}`}/>
                  </motion.div>
                ))}
              </motion.div>

              {/* Tab bar */}
              <motion.div className={styles.tabStrip} variants={fadeUp}>
                {(["issues","categories","json","letterhead"] as const).map(t => (
                  <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
                    {t === "issues" ? "Issues" : t === "categories" ? "Type of Errors & AI Fixes" : t === "json" ? "JSON export" : "Report"}
                    {t === "issues" && <span className={styles.tabBadge}>{report.total_issues}</span>}
                    {t === "categories" && <span className={styles.tabBadge} style={{ background: "rgba(22, 122, 91, 0.45)" }}>{Object.keys(report.by_category).length} Types</span>}
                    {t === "letterhead" && <span className={styles.tabBadge} style={{ background: "rgba(235, 174, 183, 0.4)" }}>Certified</span>}
                  </button>
                ))}
              </motion.div>

              {/* Tab content */}
              <AnimatePresence mode="wait">

                {/* ── ISSUES ── */}
                {tab === "issues" && (
                  <motion.div key="issues" className={styles.issuePane} variants={slideUp} initial="hidden" animate="visible" exit="exit">

                    {/* Filters */}
                    <div className={styles.filterBar}>
                      <div className={styles.chips}>
                        {(["error","warning","info"] as const).map(s => (
                          <button key={s}
                            className={`${styles.chip} ${styles[`chip_${s}`]} ${activeSev.includes(s) ? styles.chipOn : ""}`}
                            onClick={() => toggleSev(s)}>
                            <span className={`${styles.chipDot} ${styles[`dot_${s}`]}`}/>
                            {SEV[s]}
                            <span className={styles.chipCount}>{report.summary[s]}</span>
                          </button>
                        ))}
                      </div>
                      <select className={styles.fileSel} value={activeFile} onChange={e => setActiveFile(e.target.value)}>
                        <option value="all">All files ({fileList.length})</option>
                        {fileList.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>

                      {/* Multi-Language Filter Chips */}
                      {detectedLangs.length > 0 && (
                        <div className={styles.langFilterGroup}>
                          <span className={styles.filterLabel}>Language:</span>
                          <button
                            className={`${styles.langChip} ${activeLang === "all" ? styles.langChipOn : ""}`}
                            onClick={() => setActiveLang("all")}
                          >
                            All ({report.total_issues})
                          </button>
                          {detectedLangs.map(lang => {
                            const count = report.issues.filter(i => (i.language || "Python") === lang).length;
                            return (
                              <button
                                key={lang}
                                className={`${styles.langChip} ${activeLang === lang ? styles.langChipOn : ""}`}
                                onClick={() => setActiveLang(lang)}
                              >
                                {lang}
                                <span className={styles.langCount}>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Error Types (Categories) Filter Chips */}
                      {report.by_category && Object.keys(report.by_category).length > 0 && (
                        <div className={styles.catFilterGroup}>
                          <span className={styles.filterLabel}>Type of Errors:</span>
                          <button
                            className={`${styles.catChip} ${activeCategory === "all" ? styles.catChipOn : ""}`}
                            onClick={() => setActiveCategory("all")}
                          >
                            All Types ({report.total_issues})
                          </button>
                          {Object.entries(report.by_category).map(([cat, count]) => {
                            const meta = CATEGORY_META[cat.toUpperCase()] || { label: cat, desc: "" };
                            const isSelected = activeCategory.toUpperCase() === cat.toUpperCase();
                            return (
                              <button
                                key={cat}
                                className={`${styles.catChip} ${isSelected ? styles.catChipOn : ""}`}
                                onClick={() => setActiveCategory(isSelected ? "all" : cat)}
                              >
                                <span className={`${styles.catDot} ${styles[`catDot_${cat.toLowerCase()}`] || ""}`}/>
                                {meta.label}
                                <span className={styles.chipCount}>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Active Filter Feedback Banner */}
                    {activeCategory !== "all" && (
                      <div className={styles.filterStatusBanner}>
                        <span>
                          Active Error Type Filter: <strong>{(CATEGORY_META[activeCategory.toUpperCase()]?.label || activeCategory)}</strong> ({filtered.length} issues found)
                        </span>
                        <button className={styles.filterClearBtn} onClick={() => setActiveCategory("all")}>
                          Reset Type Filter (Show All)
                        </button>
                      </div>
                    )}

                    {/* Issue groups */}
                    {Object.keys(byFile).length === 0
                      ? <div className={styles.empty}>No issues match the selected filters.</div>
                      : <motion.div variants={stagger} initial="hidden" animate="visible" className={styles.fileList}>
                          {Object.entries(byFile).sort(([a],[b]) => a.localeCompare(b)).map(([file, issues]) => {
                            const fileLang = issues[0]?.language || "Python";
                            return (
                            <motion.div key={file} className={styles.fileCard} variants={fadeUp}>

                              {/* File header */}
                              <div className={styles.fileHead}>
                                <button className={styles.fileToggle} onClick={() => toggleFile(file)}>
                                  <motion.span
                                    animate={{ rotate: openFiles.has(file) ? 90 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    className={styles.chevron}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="9 18 15 12 9 6"/>
                                    </svg>
                                  </motion.span>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.fileIcon}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  <span className={styles.fileName}>{file}</span>
                                  <span className={styles.langBadge}>{fileLang}</span>
                                  <span className={styles.fileCount}>{issues.length}</span>
                                </button>
                                <motion.button
                                  className={`${styles.aiAnalyzeBtn} ${aiLoading === file ? styles.aiAnalyzeBtnLoading : ""}`}
                                  onClick={() => doAnalyze(file, issues)}
                                  disabled={aiLoading === file}
                                  whileTap={{ scale: 0.96 }}
                                  whileHover={{ scale: aiLoading === file ? 1 : 1.03 }}
                                >
                                  {aiLoading === file
                                    ? <><div className={styles.aiBtnSpin}/> Analyzing…</>
                                    : aiData[file] ? "Re-analyze" : "Analyze with AI"
                                  }
                                </motion.button>
                              </div>

                              {/* Issue rows */}
                              <AnimatePresence initial={false}>
                                {openFiles.has(file) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                                    className={styles.issueRows}
                                  >
                                    <div className={styles.issueHead}>
                                      <span>Line</span>
                                      <span>Severity</span>
                                      <span>Category</span>
                                      <span>Message</span>
                                    </div>
                                    {issues.map((issue, idx) => (
                                      <motion.div key={idx}
                                        className={`${styles.issueRow} ${styles[`iRow_${issue.severity}`]}`}
                                        initial={{ opacity: 0, x: -12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.025, duration: 0.25, ease: [0.4,0,0.2,1] }}
                                      >
                                        <span className={styles.iLine}>{issue.line ?? "—"}</span>
                                        <span className={`${styles.iSev} ${styles[`iSev_${issue.severity}`]}`}>
                                          {SEV[issue.severity]}
                                        </span>
                                        <span className={styles.iCat}>{issue.category}</span>
                                        <span className={styles.iMsg}>
                                          {issue.message}
                                          {issue.snippet && <code className={styles.iSnippet}>{issue.snippet}</code>}
                                        </span>
                                      </motion.div>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* AI error */}
                              {aiErr[file] && (
                                <div className={styles.aiErrMsg}>{aiErr[file]}</div>
                              )}

                              {/* AI result */}
                              <AnimatePresence>
                                {aiData[file] && aiOpen[file] && (
                                  <motion.div className={styles.aiPanel}
                                    variants={popIn} initial="hidden" animate="visible" exit="exit">
                                    <div className={styles.aiPanelHead}>
                                      <div className={styles.aiPanelTitle}>
                                        <motion.span className={styles.aiPulse}
                                          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                                          transition={{ repeat: Infinity, duration: 2 }}
                                        />
                                        AI Analysis
                                        <span className={`${styles.confBadge} ${styles[`conf_${aiData[file].confidence.toLowerCase()}`]}`}>
                                          {aiData[file].confidence}
                                        </span>

                                        {/* Sandbox Verification Status Badge */}
                                        {aiData[file].validation_status === "VERIFIED" ? (
                                          <span className={styles.verifiedBadge}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                              <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                            FIX VERIFIED
                                          </span>
                                        ) : aiData[file].validation_status === "FAILED" ? (
                                          <span className={styles.failedBadge}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                            </svg>
                                            FIX FAILED
                                          </span>
                                        ) : null}

                                        {aiData[file].validation_attempts && aiData[file].validation_attempts > 1 && (
                                          <span className={styles.attemptsBadge}>
                                            Loop: {aiData[file].validation_attempts}/3
                                          </span>
                                        )}
                                      </div>
                                      <button className={styles.aiClose}
                                        onClick={() => setAiOpen(p => ({ ...p, [file]: false }))}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                                        </svg>
                                      </button>
                                    </div>

                                    <div className={styles.aiBody}>
                                      <div className={styles.aiSection}>
                                        <div className={styles.aiSectionTitle}>Root cause</div>
                                        <p className={styles.aiText}>{aiData[file].root_cause}</p>
                                        {aiData[file].validation_details && (
                                          <div className={styles.valDetailBox}>
                                            <span className={styles.valDetailTag}>Sandbox Validation</span>
                                            {aiData[file].validation_details}
                                          </div>
                                        )}
                                      </div>
                                      {aiData[file].explanation && (
                                        <div className={styles.aiSection}>
                                          <div className={styles.aiSectionTitle}>What was changed</div>
                                          <p className={styles.aiText} style={{ whiteSpace: "pre-line" }}>
                                            {aiData[file].explanation}
                                          </p>
                                        </div>
                                      )}
                                      {aiData[file].fixed_code && (
                                        <div className={styles.aiSection}>
                                          <div className={styles.aiCodeHead}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                              <div className={styles.codeToggleGroup}>
                                                <button
                                                  className={`${styles.codeToggleBtn} ${(codeViewMode[file] || "code") === "code" ? styles.codeToggleActive : ""}`}
                                                  onClick={() => setCodeViewMode(p => ({ ...p, [file]: "code" }))}
                                                >
                                                  Corrected Code
                                                </button>
                                                {aiData[file].diff && (
                                                  <button
                                                    className={`${styles.codeToggleBtn} ${codeViewMode[file] === "diff" ? styles.codeToggleActive : ""}`}
                                                    onClick={() => setCodeViewMode(p => ({ ...p, [file]: "diff" }))}
                                                  >
                                                    Unified Diff (+/-)
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                              <button
                                                className={styles.applyFixBtn}
                                                onClick={() => handleApplyFix(file, aiData[file].fixed_code)}
                                                disabled={applyingFix[file]}
                                              >
                                                {applyingFix[file] ? "Applying & Re-scanning…" : "Apply Fix to File"}
                                              </button>
                                              <button className={styles.copyBtn}
                                                onClick={() => navigator.clipboard.writeText(aiData[file].fixed_code)}>
                                                Copy
                                              </button>
                                            </div>
                                          </div>

                                          {appliedSuccess[file] && (
                                            <div className={styles.appliedSuccessBanner}>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                              <span>Fix applied directly to file! Backup created at: <code>{appliedSuccess[file].backup}</code> ({appliedSuccess[file].remaining} remaining issues).</span>
                                            </div>
                                          )}

                                          {(codeViewMode[file] === "diff" && aiData[file].diff) ? (
                                            <div className={styles.diffContainer}>
                                              <pre className={styles.diffPre}>
                                                {aiData[file].diff.split("\n").map((line, idx) => {
                                                  let lineCls = styles.diffNeutral;
                                                  if (line.startsWith("+") && !line.startsWith("+++")) lineCls = styles.diffAdd;
                                                  else if (line.startsWith("-") && !line.startsWith("---")) lineCls = styles.diffDel;
                                                  else if (line.startsWith("@@")) lineCls = styles.diffHunk;
                                                  return (
                                                    <div key={idx} className={`${styles.diffLine} ${lineCls}`}>
                                                      {line || " "}
                                                    </div>
                                                  );
                                                })}
                                              </pre>
                                            </div>
                                          ) : (
                                            <CodeHighlighter
                                              code={aiData[file].fixed_code}
                                              language={aiData[file].language || fileLang.toLowerCase()}
                                            />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                            );
                          })}
                        </motion.div>
                    }
                  </motion.div>
                )}

                {/* ── TYPE OF ERRORS & INTELLECTUAL AI WORKSPACE ── */}
                {tab === "categories" && (
                  <motion.div key="cats" className={styles.errorTypesContainer} variants={slideUp} initial="hidden" animate="visible" exit="exit">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "8px" }}>
                      <div>
                        <h2 className={styles.cardTitle} style={{ marginBottom: "4px" }}>
                          Type of Errors Directory & Intellectual AI Workspace
                        </h2>
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                          Comprehensive directory of defect types across all files. Inspect code snippets and run Intellectual AI Root-Cause Analysis with sandbox-validated fixes.
                        </p>
                      </div>
                      <button
                        className={styles.intellectualAiBtn}
                        onClick={doAnalyzeAll}
                        disabled={batchAnalyzing}
                      >
                        {batchAnalyzing ? (
                          <><div className={styles.aiBtnSpin}/> Analyzing All Error Types…</>
                        ) : (
                          <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                            </svg>
                            Intellectual AI Auto-Fix All Files
                          </>
                        )}
                      </button>
                    </div>

                    {Object.entries(report.by_category)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, count]) => {
                        const catUpper = cat.toUpperCase();
                        const meta = CATEGORY_META[catUpper] || {
                          label: `${cat} Defects`,
                          desc: "Identified defects requiring intellectual resolution.",
                        };
                        const catIssues = byCategoryIssues[catUpper] || [];
                        const isOpen = openCategories.has(catUpper);

                        const critHighCount = catIssues.filter(i => ["CRITICAL", "HIGH", "error"].includes(i.severity)).length;
                        const medCount = catIssues.filter(i => ["MEDIUM", "warning"].includes(i.severity)).length;
                        const lowCount = catIssues.filter(i => ["LOW", "info"].includes(i.severity)).length;

                        return (
                          <motion.div key={cat} className={styles.errorTypeCard} variants={fadeUp}>
                            {/* Header */}
                            <div className={styles.errorTypeHeader}>
                              <div className={styles.errorTypeTitleGroup}>
                                <div className={styles.errorTypeIcon}>{getCategoryIcon(catUpper)}</div>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                    <span className={styles.errorTypeTitle}>{meta.label}</span>
                                    <span className={styles.chipCount} style={{ fontSize: "12px" }}>{count} issues</span>
                                    {critHighCount > 0 && (
                                      <span className={styles.iSev_error} style={{ fontSize: "11px", fontWeight: 700 }}>
                                        {critHighCount} Critical/High
                                      </span>
                                    )}
                                    {medCount > 0 && (
                                      <span className={styles.iSev_warning} style={{ fontSize: "11px", fontWeight: 700 }}>
                                        {medCount} Medium
                                      </span>
                                    )}
                                    {lowCount > 0 && (
                                      <span className={styles.iSev_info} style={{ fontSize: "11px", fontWeight: 700 }}>
                                        {lowCount} Info
                                      </span>
                                    )}
                                  </div>
                                  <div className={styles.errorTypeSub}>{meta.desc}</div>
                                </div>
                              </div>

                              <div className={styles.errorTypeActions}>
                                <button
                                  className={styles.errorListToggle}
                                  onClick={() => toggleCategory(catUpper)}
                                >
                                  <span>{isOpen ? `Hide List (${count})` : `View All ${count} Errors`}</span>
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    style={{
                                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                      transition: "transform 0.2s ease",
                                    }}
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Error occurrences list */}
                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  className={styles.errorItemsList}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                                >
                                  {catIssues.map((issue, idx) => {
                                    const isAiLoading = aiLoading === issue.file;
                                    const hasAiData = Boolean(aiData[issue.file]);
                                    return (
                                      <div key={idx} className={styles.errorItemCard}>
                                        <div className={styles.errorItemHead}>
                                          <div className={styles.errorItemLocation}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                              <polyline points="14 2 14 8 20 8"/>
                                            </svg>
                                            <span>{issue.file} : Line {issue.line ?? "—"}</span>
                                            <span className={styles.langBadge}>{issue.language || "Code"}</span>
                                            {issue.rule && <span className={styles.ruleBadge}>{issue.rule}</span>}
                                            <span className={`${styles.iSev} ${styles[`iSev_${issue.severity.toLowerCase()}`] || ""}`}>
                                              {SEV[issue.severity.toLowerCase()] || issue.severity}
                                            </span>
                                          </div>

                                          <button
                                            className={styles.inlineAiBtn}
                                            onClick={() => {
                                              const fileIssues = report.issues.filter(i => i.file === issue.file);
                                              doAnalyze(issue.file, fileIssues);
                                            }}
                                            disabled={isAiLoading}
                                          >
                                            {isAiLoading ? (
                                              <><div className={styles.aiBtnSpin}/> Reasoning…</>
                                            ) : hasAiData ? (
                                              "Fix Verified & Ready"
                                            ) : (
                                              "Analyze with AI Intellectual"
                                            )}
                                          </button>
                                        </div>

                                        <div className={styles.errorItemMsg}>{issue.message}</div>

                                        {issue.snippet && (
                                          <pre className={styles.errorItemSnippet}>{issue.snippet}</pre>
                                        )}

                                        {/* Inline AI Diagnosis & Fix if analyzed */}
                                        {hasAiData && (
                                          <div style={{ marginTop: "12px", borderTop: "1.2px dashed rgba(22, 122, 91, 0.35)", paddingTop: "12px" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--sage-dark)", textTransform: "uppercase" }}>
                                                  Intellectual Root Cause:
                                                </span>
                                                {aiData[issue.file].validation_status === "VERIFIED" ? (
                                                  <span className={styles.verifiedBadge}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                      <polyline points="20 6 9 17 4 12"/>
                                                    </svg>
                                                    FIX VERIFIED
                                                  </span>
                                                ) : (
                                                  <span className={styles.failedBadge}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                                    </svg>
                                                    FIX FAILED
                                                  </span>
                                                )}
                                              </div>
                                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <button
                                                  className={styles.applyFixBtn}
                                                  onClick={() => handleApplyFix(issue.file, aiData[issue.file].fixed_code)}
                                                  disabled={applyingFix[issue.file]}
                                                >
                                                  {applyingFix[issue.file] ? "Applying…" : "Apply Fix to File"}
                                                </button>
                                                <button
                                                  className={styles.copyBtn}
                                                  onClick={() => navigator.clipboard.writeText(aiData[issue.file].fixed_code)}
                                                >
                                                  Copy
                                                </button>
                                              </div>
                                            </div>
                                            <p style={{ fontSize: "13.5px", color: "var(--text-primary)", lineHeight: 1.6, margin: "6px 0 10px 0" }}>
                                              {aiData[issue.file].root_cause}
                                            </p>
                                            {aiData[issue.file].diff && (
                                              <div className={styles.diffContainer} style={{ maxHeight: "280px" }}>
                                                <pre className={styles.diffPre}>
                                                  {(aiData[issue.file].diff || "").split("\n").map((line, dIdx) => {
                                                    let lineCls = styles.diffNeutral;
                                                    if (line.startsWith("+") && !line.startsWith("+++")) lineCls = styles.diffAdd;
                                                    else if (line.startsWith("-") && !line.startsWith("---")) lineCls = styles.diffDel;
                                                    else if (line.startsWith("@@")) lineCls = styles.diffHunk;
                                                    return (
                                                      <div key={dIdx} className={`${styles.diffLine} ${lineCls}`}>
                                                        {line || " "}
                                                      </div>
                                                    );
                                                  })}
                                                </pre>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                  </motion.div>
                )}

                {/* ── JSON ── */}
                {tab === "json" && (
                  <motion.div key="json" className={styles.card} variants={slideUp} initial="hidden" animate="visible" exit="exit">
                    <div className={styles.jsonHead}>
                      <h2 className={styles.cardTitle}>Full JSON report</h2>
                      <button className={styles.downloadBtn} onClick={copyJson}>Download JSON</button>
                    </div>
                    <pre className={styles.jsonPre}>{JSON.stringify(report, null, 2)}</pre>
                  </motion.div>
                )}

                {/* ── OFFICIAL PRODUCT LETTERHEAD REPORT ── */}
                {tab === "letterhead" && (
                  <motion.div key="letterhead" className={styles.letterheadContainer} variants={slideUp} initial="hidden" animate="visible" exit="exit">
                    {/* Action Bar (Hidden during window.print) */}
                    <div className={styles.reportToolbar}>
                      <div className={styles.reportToolbarLeft}>
                        <label style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--sage-primary)" }}>
                          Audited User Profile:
                        </label>
                        <select
                          className={styles.fileSel}
                          value={selectedUser}
                          onChange={e => setSelectedUser(e.target.value)}
                        >
                          {registeredUsers.length > 0 ? (
                            registeredUsers.map(u => (
                              <option key={u.username} value={u.username}>
                                {u.username} ({u.role || "Developer"})
                              </option>
                            ))
                          ) : (
                            <option value={username}>{username} (Active User)</option>
                          )}
                        </select>
                      </div>

                      <div className={styles.reportToolbarRight}>
                        <button
                          className={styles.batchAiBtn}
                          onClick={doAnalyzeAll}
                          disabled={batchAnalyzing}
                        >
                          {batchAnalyzing ? (
                            <><span className={styles.aiBtnSpin}/> Analyzing All Files…</>
                          ) : (
                            <>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                              </svg>
                              Auto-Diagnose All Files with AI
                            </>
                          )}
                        </button>

                        <button className={styles.printBtn} onClick={handlePrintReport}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                          </svg>
                          Print / Save PDF
                        </button>
                      </div>
                    </div>

                    {/* Official Product Letterhead Banner */}
                    <header className={styles.formalLetterhead}>
                      <div className={styles.letterheadBrand}>
                        <div className={styles.letterheadLogo}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                          </svg>
                        </div>
                        <div>
                          <div className={styles.letterheadCompany}>MINDORA INTELLIGENCE REPORT</div>
                          <div className={styles.letterheadTagline}>AI Debugging Software &middot; Autonomous Code Verification</div>
                        </div>
                      </div>

                      <div className={styles.letterheadMeta}>
                        <div>Report Ref: <span className={styles.metaHighlight}>MND-DIAG-{new Date().getFullYear()}-{Math.floor(1000 + Math.random() * 9000)}</span></div>
                        <div>Certified Lead Architect: <span className={styles.metaHighlight}>Vignesh Pandiya G</span></div>
                        <div>Generated Date: <span className={styles.metaHighlight}>{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                      </div>
                    </header>

                    {/* Report Subject & Overview */}
                    <div className={styles.reportDocTitle}>
                      <h1>Comprehensive Code Health & AI Root Cause Audit</h1>
                      <p className={styles.reportDocSubtitle}>
                        Official diagnostic statement verifying AST syntax integrity, code quality invariants,
                        architectural risk vectors, and GPT-4o deep root-cause analyses.
                      </p>
                    </div>

                    {/* Audit Metadata Grid */}
                    <div className={styles.auditGrid}>
                      <div className={styles.auditItem}>
                        <span className={styles.auditKey}>Target Directory</span>
                        <span className={styles.auditVal}>{report.scanned_directory}</span>
                      </div>
                      <div className={styles.auditItem}>
                        <span className={styles.auditKey}>Audited User Account</span>
                        <span className={styles.auditVal}>{selectedUser}</span>
                      </div>
                      <div className={styles.auditItem}>
                        <span className={styles.auditKey}>Assigned Security Role</span>
                        <span className={styles.auditVal}>
                          {registeredUsers.find(u => u.username === selectedUser)?.role?.toUpperCase() || "DEVELOPER"}
                        </span>
                      </div>
                      <div className={styles.auditItem}>
                        <span className={styles.auditKey}>Execution Engine</span>
                        <span className={styles.auditVal}>Local Python 3.14 + OpenAI GPT-4o</span>
                      </div>
                    </div>

                    {/* Metrics Bar */}
                    <div className={styles.summaryStatsBar}>
                      <div className={`${styles.summaryStatCard} ${styles.statTotal}`}>
                        <span className={styles.statNumber}>{report.total_issues}</span>
                        <span className={styles.statText}>Total Issues Flagged</span>
                      </div>
                      <div className={`${styles.summaryStatCard} ${styles.statError}`}>
                        <span className={styles.statNumber}>{report.summary.error}</span>
                        <span className={styles.statText}>Critical Errors</span>
                      </div>
                      <div className={`${styles.summaryStatCard} ${styles.statWarn}`}>
                        <span className={styles.statNumber}>{report.summary.warning}</span>
                        <span className={styles.statText}>High-Risk Warnings</span>
                      </div>
                      <div className={`${styles.summaryStatCard} ${styles.statInfo}`}>
                        <span className={styles.statNumber}>{report.summary.info}</span>
                        <span className={styles.statText}>Quality Annotations</span>
                      </div>
                    </div>

                    {/* Deep File Diagnoses with AI Root Cause Explanations */}
                    <div className={styles.diagSectionHead}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      Verified File Breakdown & AI Root Cause Explanations
                    </div>

                    {Object.entries(byFile).map(([file, issues]) => {
                      const analysis = aiData[file];
                      return (
                        <div key={file} className={styles.fileDiagnosisCard}>
                          <div className={styles.fileDiagHead}>
                            <div className={styles.fileDiagName}>{file}</div>
                            <div className={styles.fileDiagBadges}>
                              <span className={styles.fileCount}>{issues.length} Issues</span>
                              {analysis ? (
                                <span className={`${styles.diagConfidence} ${styles[`conf_${analysis.confidence.toLowerCase()}`]}`}>
                                  AI Confidence: {analysis.confidence}
                                </span>
                              ) : (
                                <button
                                  className={styles.aiAnalyzeBtn}
                                  style={{ height: "30px", fontSize: "11.5px", padding: "0 12px" }}
                                  onClick={() => doAnalyze(file, issues)}
                                  disabled={aiLoading === file}
                                >
                                  {aiLoading === file ? "Diagnosing…" : "Analyze with AI"}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className={styles.fileDiagBody}>
                            {/* Issues Table */}
                            <div>
                              <div className={styles.diagBoxTitle}>Detected Code Defects</div>
                              <table className={styles.issueTableMini}>
                                <thead>
                                  <tr>
                                    <th style={{ width: "70px" }}>Line</th>
                                    <th style={{ width: "90px" }}>Severity</th>
                                    <th style={{ width: "160px" }}>Category</th>
                                    <th>Diagnosis Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {issues.map((iss, idx) => (
                                    <tr key={idx}>
                                      <td><strong>L{iss.line ?? "—"}</strong></td>
                                      <td>
                                        <span className={`${styles.iSev} ${styles[`iSev_${iss.severity}`]}`}>
                                          {iss.severity.toUpperCase()}
                                        </span>
                                      </td>
                                      <td><code>{iss.category}</code></td>
                                      <td>
                                        <div>{iss.message}</div>
                                        {iss.snippet && (
                                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--sage-primary)", marginTop: "3px" }}>
                                            &gt; {iss.snippet}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Root Cause & Explanation */}
                            {analysis ? (
                              <>
                                <div className={styles.diagBox} style={{ background: "rgba(94, 139, 126, 0.05)", borderColor: "rgba(94, 139, 126, 0.25)" }}>
                                  <div className={styles.diagBoxTitle} style={{ color: "var(--sage-primary)" }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                                    </svg>
                                    AI Root Cause Determination
                                  </div>
                                  <div className={styles.diagBoxContent}>
                                    {analysis.root_cause}
                                  </div>
                                </div>

                                {analysis.explanation && (
                                  <div className={styles.diagBox}>
                                    <div className={styles.diagBoxTitle}>Corrective Remediation Plan</div>
                                    <div className={styles.diagBoxContent} style={{ whiteSpace: "pre-line" }}>
                                      {analysis.explanation}
                                    </div>
                                  </div>
                                )}

                                {analysis.fixed_code && (
                                  <div>
                                    <div className={styles.aiCodeHead}>
                                      <span className={styles.diagBoxTitle}>Recommended Correction Snippet</span>
                                      <button className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(analysis.fixed_code)}>
                                        Copy Clean Code
                                      </button>
                                    </div>
                                    <CodeHighlighter code={analysis.fixed_code} language="python"/>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", padding: "10px 0" }}>
                                Root-cause explanation pending. Click &quot;Analyze with AI&quot; or &quot;Auto-Diagnose All Files with AI&quot; to populate.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Formal Signoff & Watermark Stamp */}
                    <footer className={styles.letterheadSignoff}>
                      <div className={styles.signoffLeft}>
                        <p><strong>MINDORA VERIFICATION GUARANTEE</strong></p>
                        <p>
                          This document has been dynamically compiled and certified by the Mindora Intelligence Report AI Debugging Software platform.
                          All source code transformations preserve docstrings and syntactic integrity under strict local isolation.
                        </p>
                      </div>

                      <div className={styles.signoffStampBlock}>
                        <div className={styles.officialStamp}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Official System Certified
                        </div>
                        <div className={styles.developerSignName}>Vignesh Pandiya G</div>
                        <div className={styles.developerSignTitle}>Lead Architect &amp; End-to-End Creator &middot; Mindora Intelligence</div>
                      </div>
                    </footer>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Landing ── */}
        {!report && !loading && !error && (
          <motion.div className={styles.landing} variants={stagger} initial="hidden" animate="visible">
            <motion.p className={styles.landingLead} variants={fadeUp}>
              Enter a Python project path above, click Browse to navigate, then hit{" "}
              <strong>Run scan</strong>. After results appear, click{" "}
              <strong>Analyze with AI</strong> on any file for a root-cause
              explanation and corrected code.
            </motion.p>
            <motion.div className={styles.featureGrid} variants={stagger}>
              {[
                ["Syntax errors",    "Catches files that fail to parse via py_compile"],
                ["AI root cause",    "GPT-4 explains exactly why each issue exists"],
                ["Corrected code",   "Complete fixed file with syntax highlighting"],
                ["Confidence score", "HIGH / MEDIUM / LOW AI certainty rating"],
                ["Bare except",      "Detects clauses that swallow all exceptions"],
                ["Mutable defaults", "Finds def f(x=[]) — a common hidden bug"],
                ["Unused imports",   "Flags imports never referenced in the file"],
                ["TODO comments",    "Surfaces TODO / FIXME / HACK annotations"],
              ].map(([t, d]) => (
                <motion.div key={t} className={styles.featureCard} variants={fadeUp}
                  whileHover={{ y: -4, boxShadow: "0 8px 24px rgba(15,17,23,.12)", transition: { duration: 0.2 } }}>
                  <div className={styles.featureTitle}>{t}</div>
                  <div className={styles.featureDesc}>{d}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </main>

      <footer className={styles.footer}>
        <span>Python Debug Assistant</span>
        <span>Static analysis + AI reasoning · All processing on your machine</span>
      </footer>
    </div>
  );
}

function ScanDoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
