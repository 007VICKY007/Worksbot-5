"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  login,
  fetchAdminScans,
  fetchAdminScanDetail,
  fetchAdminStats,
  fetchAdminUsers,
  clearAdminLogs,
  fetchRAGStats,
  fetchRAGMemories,
  deleteRAGMemory,
  clearAllRAGMemories,
  fetchDepartmentOverview,
  fetchPipelineStatus,
  fetchProjects,
  AuditScanSummary,
  AuditScanDetail,
  AuditStats,
  AdminUserRecord,
} from "@/lib/api";
import type {
  RAGStats,
  RAGMemoryItem,
  DepartmentOverview,
  QualityGateVerdict,
  PipelineRunState,
} from "@/lib/types";
import { isLoggedIn, isAdmin, getUsername, saveSession, clearSession } from "@/lib/auth";
import { useWorkflow } from "@/lib/useWorkflow";
import WorkflowDetails from "@/components/WorkflowDetails";
import WorkflowUpdates from "@/components/WorkflowUpdates";
import styles from "./admin.module.css";

export default function AdminPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");

  // Admin login states (shown directly on /admin when unauthenticated)
  const [adminLoginUser, setAdminLoginUser] = useState("admin");
  const [adminLoginPass, setAdminLoginPass] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState("");

  // Data states
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [scans, setScans] = useState<AuditScanSummary[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"scans" | "users" | "rag_vectors" | "departments">("scans");
  const [deptOverview, setDeptOverview] = useState<DepartmentOverview | null>(null);
  const workflow = useWorkflow(isAuthorized);
  const mndTickets = workflow.items;
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [pipelineOverview, setPipelineOverview] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // RAG Vector Store States
  const [ragStats, setRagStats] = useState<RAGStats | null>(null);
  const [ragMemories, setRagMemories] = useState<RAGMemoryItem[]>([]);
  const [ragSearch, setRagSearch] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [languageFilter, setLanguageFilter] = useState("ALL");
  const [userFilter, setUserFilter] = useState("ALL");

  // Inspect modal
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [scanDetail, setScanDetail] = useState<AuditScanDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Check if currently authenticated as admin on mount
  useEffect(() => {
    if (isLoggedIn() && isAdmin()) {
      setIsAuthorized(true);
      setCurrentUsername(getUsername() || "admin");
    } else {
      setIsAuthorized(false);
    }
  }, []);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminLoginUser.trim() || !adminLoginPass.trim()) {
      setAdminLoginError("Administrator username and password are required.");
      return;
    }
    setAdminLoginLoading(true);
    setAdminLoginError("");
    try {
      const res = await login(adminLoginUser.trim(), adminLoginPass);
      const role = res.role;
      if (role !== "admin") {
        setAdminLoginError("Access denied. The account does not possess administrator privileges.");
        return;
      }
      saveSession(res.token, res.username, "admin");
      setCurrentUsername(res.username);
      setIsAuthorized(true);
      setAdminLoginPass("");
    } catch (err: unknown) {
      setAdminLoginError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAdminLoginLoading(false);
    }
  }

  // Load audit data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, scansRes, usersRes, rStats, rMems, deptRes] = await Promise.all([
        fetchAdminStats(),
        fetchAdminScans({
          search: search.trim() || undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          language: languageFilter !== "ALL" ? languageFilter : undefined,
          username: userFilter !== "ALL" ? userFilter : undefined,
        }),
        fetchAdminUsers(),
        fetchRAGStats().catch(() => null),
        fetchRAGMemories({ search: ragSearch.trim() || undefined }).catch(() => ({ items: [] })),
        fetchDepartmentOverview().catch(() => null),
      ]);

      setStats(statsRes);
      setScans(scansRes.items || []);
      setUsers(usersRes.users || []);
      if (rStats) setRagStats(rStats);
      if (rMems) setRagMemories(rMems.items || []);
      if (deptRes) setDeptOverview(deptRes);

      fetchProjects().then(pRes => {
        const pid = pRes.projects[0]?.id;
        if (pid) {
          fetchPipelineStatus(pid).then(p => setPipelineOverview(p.pipeline_status)).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to load admin logs:", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, languageFilter, userFilter, ragSearch]);

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized, loadData]);

  async function handleDeleteMemory(errorId: string) {
    if (!confirm("Are you sure you want to remove this error vector memory from MongoDB?")) return;
    try {
      await deleteRAGMemory(errorId);
      setRagMemories(prev => prev.filter(m => m.error_id !== errorId));
      if (ragStats) setRagStats({ ...ragStats, total_vectors: Math.max(0, ragStats.total_vectors - 1) });
    } catch (err) {
      alert("Failed to delete vector memory: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleClearAllVectors() {
    if (!confirm("CAUTION: This will delete ALL stored error vectors and institutional memories in MongoDB! Proceed?")) return;
    try {
      await clearAllRAGMemories();
      setRagMemories([]);
      if (ragStats) setRagStats({ ...ragStats, total_vectors: 0 });
    } catch (err) {
      alert("Failed to clear vector memories: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Open file inspection modal
  async function handleInspect(scanId: string) {
    setSelectedScanId(scanId);
    setInspectLoading(true);
    try {
      const detail = await fetchAdminScanDetail(scanId);
      setScanDetail(detail);
    } catch (err) {
      console.error("Failed to load scan detail:", err);
    } finally {
      setInspectLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setIsAuthorized(false);
    setAdminLoginPass("");
    setAdminLoginError("");
  }

  async function handleClearLogs() {
    if (!window.confirm("Are you sure you want to clear all historical scan audit logs?")) {
      return;
    }
    try {
      await clearAdminLogs();
      await loadData();
    } catch (err) {
      alert("Failed to clear logs: " + err);
    }
  }

  function handleExportJson() {
    const dataStr = JSON.stringify({ stats, scans }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mindora_audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // If not authenticated as administrator, render the Admin Login Screen directly at /admin
  if (!isAuthorized) {
    return (
      <div className={styles.loginRoot}>
        {/* Subtle decorative orb */}
        <div style={{
          position: "absolute",
          width: "420px",
          height: "420px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(22, 122, 91, 0.12) 0%, rgba(22, 122, 91, 0) 70%)",
          filter: "blur(40px)",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }} />

        <motion.div
          className={styles.loginCard}
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.loginHeader}>
            <div className={styles.loginLogoWrap}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h1 className={styles.loginTitle}>Administrator Login</h1>
            <p className={styles.loginSubtitle}>
              Restricted supervisory access. Enter administrator credentials to inspect tested files, execution timestamps, and user activity.
            </p>
          </div>

          <form className={styles.loginForm} onSubmit={handleAdminLogin}>
            <div className={styles.loginField}>
              <label className={styles.loginLabel} htmlFor="adminUser">Administrator Username</label>
              <input
                id="adminUser"
                className={styles.loginInput}
                type="text"
                value={adminLoginUser}
                onChange={(e) => setAdminLoginUser(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
                disabled={adminLoginLoading}
              />
            </div>

            <div className={styles.loginField}>
              <label className={styles.loginLabel} htmlFor="adminPass">Administrator Password</label>
              <input
                id="adminPass"
                className={styles.loginInput}
                type="password"
                value={adminLoginPass}
                onChange={(e) => setAdminLoginPass(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={adminLoginLoading}
              />
            </div>

            {adminLoginError && (
              <div className={styles.loginError}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{adminLoginError}</span>
              </div>
            )}

            <button
              type="submit"
              className={styles.loginSubmitBtn}
              disabled={adminLoginLoading}
            >
              {adminLoginLoading ? (
                "Authenticating…"
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Sign In to Admin Console
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const distinctLanguages = Array.from(
    new Set(
      scans.flatMap(s => Object.keys(s.languages_detected || {}))
    )
  ).sort();

  return (
    <div className={styles.root}>
      {/* ── Top Header Navigation ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.brandMark}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className={styles.brandTitle}>
                Mindora Debug <span className={styles.adminBadge}>Admin Supervision</span>
              </div>
            </div>
          </div>

          <div className={styles.navActions}>
            <a href="/" className={styles.scannerLinkBtn}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Developer Workspace
            </a>
            <a href="/qa" className={styles.scannerLinkBtn}>
              QA Workspace
            </a>
            <a href="/testing" className={styles.scannerLinkBtn}>
              Testing Workspace
            </a>

            <div className={styles.adminUserChip}>
              <span className={styles.adminAvatar}>{currentUsername.charAt(0).toUpperCase()}</span>
              <span className={styles.adminUname}>{currentUsername}</span>
            </div>

            <button className={styles.signOutBtn} onClick={handleLogout}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className={styles.main}>
        {/* Title Section */}
        <div className={styles.titleSection}>
          <h1 className={styles.pageHeading}>Tested Files &amp; Audit Supervision Center</h1>
          <p className={styles.pageSubtitle}>
            Real-time monitoring of all code scan operations, test execution timestamps, user identity details, and tested files manifests.
          </p>
        </div>

        {/* ── Platform KPI Metrics ── */}
        <div className={styles.metricsGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span className={styles.kpiLabel}>Total Tests Run</span>
              <div className={styles.kpiIconWrap}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
            </div>
            <div className={styles.kpiValue}>{stats?.total_scans ?? 0}</div>
            <div className={styles.kpiSub}>Historical test sessions</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span className={styles.kpiLabel}>Files Tested</span>
              <div className={styles.kpiIconWrap}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
            </div>
            <div className={styles.kpiValue}>{stats?.total_files_tested ?? 0}</div>
            <div className={styles.kpiSub}>Source modules inspected</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span className={styles.kpiLabel}>Clean Pass Rate</span>
              <div className={styles.kpiIconWrap} style={{ background: "rgba(16, 185, 129, 0.12)", color: "#059669" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
            </div>
            <div className={styles.kpiValue} style={{ color: "#059669" }}>
              {stats?.clean_pass_rate ?? 100}%
            </div>
            <div className={styles.kpiSub}>{stats?.clean_scans ?? 0} clean sessions</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span className={styles.kpiLabel}>Defects Detected</span>
              <div className={styles.kpiIconWrap} style={{ background: "rgba(239, 68, 68, 0.12)", color: "#dc2626" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
            </div>
            <div className={styles.kpiValue} style={{ color: "#dc2626" }}>
              {stats?.total_issues_found ?? 0}
            </div>
            <div className={styles.kpiSub}>Bugs across all tests</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHead}>
              <span className={styles.kpiLabel}>Active Testers</span>
              <div className={styles.kpiIconWrap}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
            </div>
            <div className={styles.kpiValue}>{stats?.unique_users_count ?? 0}</div>
            <div className={styles.kpiSub}>{users.length} registered accounts</div>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className={styles.tabsStrip}>
          <button
            className={`${styles.tabBtn} ${activeTab === "scans" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("scans")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Tested Sessions Feed ({scans.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "users" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("users")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Registered Users ({users.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "rag_vectors" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("rag_vectors")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            RAG Vector Store & Learned Memories ({ragStats?.total_vectors ?? 0})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "departments" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("departments")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Department Workflow Oversight
          </button>
        </div>

        {/* ── Tab 1: Scans & Tested Files Feed ── */}
        {activeTab === "scans" && (
          <div>
            {/* Filter Toolbar */}
            <div className={styles.toolbarCard}>
              <div className={styles.searchBox}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search by user name, scanned folder, or tested file…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className={styles.filterControls}>
                <select
                  className={styles.filterSelect}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PASSED">Passed (Clean)</option>
                  <option value="DEFECTS_DETECTED">Defects Detected</option>
                </select>

                <select
                  className={styles.filterSelect}
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                >
                  <option value="ALL">All Languages</option>
                  {distinctLanguages.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>

                <select
                  className={styles.filterSelect}
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                >
                  <option value="ALL">All Users</option>
                  {users.map(u => (
                    <option key={u.username} value={u.username}>{u.username} ({u.role})</option>
                  ))}
                </select>

                <button className={styles.actionBtn} onClick={loadData} title="Refresh Logs">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  Refresh
                </button>

                <button className={styles.actionBtn} onClick={handleExportJson} title="Export Audit Records">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export JSON
                </button>

                <button
                  className={styles.actionBtn}
                  onClick={handleClearLogs}
                  style={{ color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.3)" }}
                >
                  Clear Logs
                </button>
              </div>
            </div>

            {/* Audit Table */}
            <div className={styles.tableCard}>
              <div className={styles.tableHeadRow}>
                <div>Date &amp; Time</div>
                <div>User Details</div>
                <div>Tested Directory / Project</div>
                <div>Files Tested</div>
                <div>Result Status</div>
                <div style={{ textAlign: "right" }}>Inspect</div>
              </div>

              {loading ? (
                <div className={styles.emptyState}>Loading audit records…</div>
              ) : scans.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <h3>No Test Scans Found</h3>
                  <p>When users scan code directories, the tested files and timestamps will appear here automatically.</p>
                </div>
              ) : (
                scans.map((scan) => {
                  const isClean = scan.overall_status === "PASSED";
                  const langs = Object.keys(scan.languages_detected || {});

                  return (
                    <div key={scan.scan_id} className={styles.tableRow}>
                      {/* When: Date & Time */}
                      <div className={styles.colDateTime}>
                        <span className={styles.dateText}>{scan.date_formatted}</span>
                        <span className={styles.timeText}>{scan.time_formatted}</span>
                      </div>

                      {/* User Details */}
                      <div className={styles.colUser}>
                        <div className={styles.userAvatarSmall}>
                          {scan.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.userMeta}>
                          <span className={styles.userNameText}>{scan.username}</span>
                          <span className={styles.userRoleBadge}>{scan.user_role}</span>
                        </div>
                      </div>

                      {/* Project & Scanned Path */}
                      <div className={styles.colProject}>
                        <span className={styles.projectName}>{scan.project_name}</span>
                        <span className={styles.projectPath} title={scan.directory}>
                          {scan.directory}
                        </span>
                      </div>

                      {/* Files Tested Manifest Summary */}
                      <div className={styles.colFilesTested}>
                        <div className={styles.fileCountBadge}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          {scan.files_tested_count} files tested
                        </div>
                        <div className={styles.langPillsWrap}>
                          {langs.slice(0, 3).map((l) => (
                            <span key={l} className={styles.langPill}>{l}</span>
                          ))}
                          {langs.length > 3 && (
                            <span className={styles.langPill}>+{langs.length - 3}</span>
                          )}
                        </div>
                      </div>

                      {/* Result Status */}
                      <div className={styles.colStatus}>
                        {isClean ? (
                          <span className={styles.statusPassed}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            PASSED (Clean)
                          </span>
                        ) : (
                          <div>
                            <span className={styles.statusFailing}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                              </svg>
                              {scan.total_issues} defects
                            </span>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                              {scan.defective_files_count} files failing
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Inspect Action */}
                      <div className={styles.colAction}>
                        <button
                          className={styles.inspectBtn}
                          onClick={() => handleInspect(scan.scan_id)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          Inspect Files
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: Registered Users Panel ── */}
        {activeTab === "users" && (
          <div className={styles.tableCard}>
            <div className={styles.tableHeadRow} style={{ gridTemplateColumns: "220px 180px 200px 1fr" }}>
              <div>User Name</div>
              <div>Assigned Role</div>
              <div>Tests Executed</div>
              <div>Registered Date</div>
            </div>

            {users.map((u) => (
              <div key={u.username} className={styles.tableRow} style={{ gridTemplateColumns: "220px 180px 200px 1fr" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className={styles.userAvatarSmall}>{u.username.charAt(0).toUpperCase()}</div>
                  <span style={{ fontWeight: 700, fontSize: "14px" }}>{u.username}</span>
                </div>
                <div>
                  <span className={styles.adminBadge} style={{ textTransform: "capitalize" }}>
                    {u.role}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: "var(--sage-dark)" }}>
                  {u.total_scans ?? 0} scans completed
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {u.registered_at ? new Date(u.registered_at).toLocaleDateString() : "Default Account"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab 3: RAG Vector Store & Learned Error Memories ── */}
        {activeTab === "rag_vectors" && (
          <div>
            {/* RAG Toolbar */}
            <div className={styles.toolbarCard}>
              <div className={styles.searchBox}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Filter vector memories by rule, message, or file path…"
                  value={ragSearch}
                  onChange={(e) => setRagSearch(e.target.value)}
                />
                {ragSearch && (
                  <button
                    onClick={() => setRagSearch("")}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  MongoDB Collection: <strong style={{ color: "var(--sage-primary)" }}>error_memory_vectors</strong> (1536-dim)
                </div>
                <button className={styles.clearAllRAGBtn} onClick={handleClearAllVectors}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Clear All Vector Memories
                </button>
              </div>
            </div>

            {/* Error Vector Memories Table */}
            <div className={styles.tableCard}>
              <div className={styles.tableHeadRow} style={{ gridTemplateColumns: "160px 140px 160px 1fr 1fr 110px" }}>
                <div>Tested File & Lang</div>
                <div>Tester & Time</div>
                <div>Category & Rule</div>
                <div>Error Message & Code</div>
                <div>Learned Diagnosis & Proven Fix</div>
                <div>Actions</div>
              </div>

              {ragMemories.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                  No error vectors currently indexed in MongoDB. Run tests in the scanner to populate institutional memory.
                </div>
              ) : (
                ragMemories.map((mem) => (
                  <div key={mem.error_id} className={styles.tableRow} style={{ gridTemplateColumns: "160px 140px 160px 1fr 1fr 110px", alignItems: "start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px", wordBreak: "break-all" }}>{mem.file_path}</div>
                      <span className={styles.adminBadge} style={{ fontSize: "10px", marginTop: "4px" }}>
                        {mem.language}
                      </span>
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div className={styles.userAvatarSmall} style={{ width: "20px", height: "20px", fontSize: "10px" }}>
                          {mem.username.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: "12px" }}>@{mem.username}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {mem.created_at ? new Date(mem.created_at).toLocaleString() : ""}
                      </div>
                      {mem.occurrence_count && mem.occurrence_count > 1 && (
                        <div style={{ fontSize: "10.5px", color: "#065f46", fontWeight: 700, marginTop: "2px" }}>
                          {mem.occurrence_count} occurrences
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: "12px", color: "#dc2626" }}>
                        {mem.category}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--sage-primary)", fontWeight: 600, marginTop: "2px" }}>
                        [{mem.rule}]
                      </div>
                      <div style={{ fontSize: "10.5px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Status: <strong style={{ color: mem.validation_status === "VERIFIED" ? "#16a34a" : "#dc2626" }}>{mem.validation_status}</strong>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {mem.message}
                      </div>
                      {mem.snippet && (
                        <pre className={styles.ragCodeSnippet}>{mem.snippet}</pre>
                      )}
                    </div>

                    <div>
                      {mem.root_cause && (
                        <div style={{ fontSize: "11.5px", color: "var(--text-primary)", lineHeight: 1.4 }}>
                          {mem.root_cause.slice(0, 150)}{mem.root_cause.length > 150 ? "…" : ""}
                        </div>
                      )}
                      {mem.fixed_code && (
                        <pre className={styles.ragFixBox}>{mem.fixed_code.slice(0, 200)}</pre>
                      )}
                    </div>

                    <div>
                      <button
                        className={styles.deleteMemoryBtn}
                        onClick={() => handleDeleteMemory(mem.error_id)}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Tab 4: Department Workflow Oversight ── */}
        {activeTab === "departments" && (
          <div>
            {/* Quick launch ribbon */}
            <div className={styles.toolbarCard} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Cross-Department Collaboration Ecosystem
                </h3>
                <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Real-time synchronization between QA Test Planning, Software Tester Execution, and Developer Debug/Fix Workspaces.
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <a href="/qa" className={styles.scannerLinkBtn}>
                  Open QA Workspace
                </a>
                <a href="/testing" className={styles.scannerLinkBtn}>
                  Open Testing Workspace
                </a>
                <a href="/" className={styles.scannerLinkBtn}>
                  Open Developer Scanner
                </a>
              </div>
            </div>

            {/* Department KPIs */}
            <div className={styles.kpiGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "20px" }}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHead}>
                  <span className={styles.kpiLabel}>Test Plans</span>
                </div>
                <div className={styles.kpiValue}>{deptOverview?.qa_metrics?.total_test_plans ?? 0}</div>
                <div className={styles.kpiSub}>Active test plans</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHead}>
                  <span className={styles.kpiLabel}>Total Test Cases</span>
                </div>
                <div className={styles.kpiValue}>{deptOverview?.qa_metrics?.total_test_cases ?? 0}</div>
                <div className={styles.kpiSub}>Coverage: {workflow.summary?.coverage == null ? "Unknown" : `${workflow.summary.coverage}%`}</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHead}>
                  <span className={styles.kpiLabel}>Active Test Runs</span>
                </div>
                <div className={styles.kpiValue} style={{ color: "var(--sage-primary)" }}>
                  {deptOverview?.qa_metrics?.active_test_runs ?? 0}
                </div>
                <div className={styles.kpiSub}>Execution cycles</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHead}>
                  <span className={styles.kpiLabel}>Open Defect Queue</span>
                </div>
                <div className={styles.kpiValue} style={{ color: "#dc2626" }}>
                  {workflow.summary?.open_bugs ?? "Unknown"}
                </div>
                <div className={styles.kpiSub}>Awaiting dev resolution</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHead}>
                  <span className={styles.kpiLabel}>QA Closed / Verified</span>
                </div>
                <div className={styles.kpiValue} style={{ color: "#059669" }}>
                  {workflow.summary?.by_status.CLOSED ?? "Unknown"}
                </div>
                <div className={styles.kpiSub}>Verified quality gate</div>
              </div>
            </div>

            {/* Recent Cross-Department Audit Trail */}
            <div className={styles.scansCard} style={{ marginBottom: "24px" }}>
              <div className={styles.scansCardHead}>
                <div className={styles.scansCardTitle}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Cross-Department Audit &amp; Traceability Trail
                </div>
                <span className={styles.totalBadge}>
                  {deptOverview?.recent_audit_events?.length ?? 0} recent actions
                </span>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Department Role</th>
                      <th>Action</th>
                      <th>Resource / Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deptOverview?.recent_audit_events || []).map((evt) => (
                      <tr key={evt.id}>
                        <td style={{ color: "var(--text-tertiary)", fontSize: "11.5px", fontFamily: "monospace" }}>
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : "—"}
                        </td>
                        <td style={{ fontWeight: 600 }}>{evt.username}</td>
                        <td>
                          <span style={{
                            fontSize: "10.5px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: evt.role === "qa" ? "#e0f2fe" : evt.role === "tester" ? "#ede9fe" : evt.role === "admin" ? "#dcfce7" : "#f1f5f9",
                            color: evt.role === "qa" ? "#0369a1" : evt.role === "tester" ? "#6d28d9" : evt.role === "admin" ? "#15803d" : "#475569",
                          }}>
                            {evt.role}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{evt.action}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "11.5px" }}>
                          {evt.resource_id || evt.project_id || "system"}
                        </td>
                      </tr>
                    ))}
                    {(!deptOverview?.recent_audit_events || deptOverview.recent_audit_events.length === 0) && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "var(--text-secondary)" }}>
                          No cross-department audit events logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Department Active Defect Oversight */}
            <div className={styles.scansCard}>
              <div className={styles.scansCardHead}>
                <div className={styles.scansCardTitle}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Cross-Department Defect Lifecycle Monitor
                </div>
                <span className={styles.totalBadge}>
                  {deptOverview?.recent_bugs?.length ?? 0} active defects
                </span>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bug ID</th>
                      <th>Title</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Reported By (Tester)</th>
                      <th>Assigned Dev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deptOverview?.recent_bugs || []).map((bug) => (
                      <tr key={bug.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "11.5px", fontWeight: 700, color: "#dc2626" }}>
                          {bug.id}
                        </td>
                        <td style={{ fontWeight: 600 }}>{bug.title}</td>
                        <td>
                          <span style={{
                            fontSize: "10.5px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: bug.severity === "critical" ? "#fee2e2" : "#fef3c7",
                            color: bug.severity === "critical" ? "#b91c1c" : "#b45309",
                          }}>
                            {bug.severity}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: "10.5px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: bug.status === "closed" ? "#dcfce7" : bug.status === "fixed" ? "#e0f2fe" : "#fef3c7",
                            color: bug.status === "closed" ? "#15803d" : bug.status === "fixed" ? "#0369a1" : "#b45309",
                          }}>
                            {bug.status}
                          </span>
                        </td>
                        <td>{bug.reported_by}</td>
                        <td style={{ fontWeight: 600 }}>{bug.assigned_to || "Unassigned"}</td>
                      </tr>
                    ))}
                    {(!deptOverview?.recent_bugs || deptOverview.recent_bugs.length === 0) && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--text-secondary)" }}>
                          No defects logged in the system.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mindora Enterprise Tickets & Pipeline Lifecycle Monitor */}
            <div className={styles.scansCard} style={{ marginTop: "24px" }}>
              <div className={styles.scansCardHead}>
                <div className={styles.scansCardTitle}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Mindora Tracked Tickets (MND-XXXX) &amp; Pipeline Status
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span className={styles.totalBadge}>
                    Gate: {pipelineOverview?.gate?.status || "Unknown"}
                  </span>
                  <span className={styles.totalBadge}>
                    {mndTickets.length} Enterprise Tickets
                  </span>
                </div>
              </div>

              <WorkflowUpdates workflow={workflow} onSelect={setSelectedWorkflowId} buttonClass={styles.inspectBtn} />
              <p>Lifecycle: {Object.entries(workflow.summary?.by_status || {}).map(([status, count]) => `${status}: ${count}`).join(" | ")}</p>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Severity</th>
                      <th>Priority</th>
                      <th>Target File</th>
                      <th>Assigned Dev</th>
                      <th>Assigned Tester</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mndTickets.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "var(--sage-primary)" }}>
                          <button type="button" className={styles.inspectBtn} onClick={() => setSelectedWorkflowId(t.id)}>{t.id}</button>
                        </td>
                        <td style={{ fontWeight: 600 }}>{t.title}</td>
                        <td>
                          <span style={{
                            fontSize: "10.5px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: t.status === "QA_APPROVED" || t.status === "RELEASED" ? "#dcfce7" : t.status === "OPEN" ? "#fee2e2" : "#fef3c7",
                            color: t.status === "QA_APPROVED" || t.status === "RELEASED" ? "#15803d" : t.status === "OPEN" ? "#b91c1c" : "#b45309",
                            textTransform: "uppercase",
                          }}>
                            {t.workflow_status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ textTransform: "capitalize", fontSize: "12px" }}>{t.severity}</td>
                        <td style={{ textTransform: "capitalize", fontSize: "12px" }}>{t.priority}</td>
                        <td><code style={{ fontSize: "11px" }}>{t.target_file || "Codebase"}</code></td>
                        <td style={{ fontWeight: 600 }}>{t.assigned_developer || "Unassigned"}</td>
                        <td>{t.assigned_tester || "Unassigned"}</td>
                      </tr>
                    ))}
                    {mndTickets.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "var(--text-secondary)" }}>
                          No enterprise tickets currently registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── File-by-File Tested Manifest Inspection Modal ── */}
      <AnimatePresence>
        {(selectedScanId || selectedWorkflowId) && (
          <div className={styles.modalBackdrop} onClick={() => { setSelectedScanId(null); setSelectedWorkflowId(null); }}>
            <motion.div
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.modalHead}>
                <div className={styles.modalHeadTitle}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span>{selectedWorkflowId ? "Workflow Lifecycle Inspection" : "Tested Files Manifest Inspection"}</span>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => { setSelectedScanId(null); setSelectedWorkflowId(null); }}>
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                {selectedWorkflowId ? <WorkflowDetails key={selectedWorkflowId} id={selectedWorkflowId} role="admin" styles={styles} onChanged={() => void workflow.refresh()} /> : inspectLoading || !scanDetail ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                    Loading file-by-file test manifest…
                  </div>
                ) : (
                  <div>
                    {/* Session summary ribbon */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                      padding: "12px 18px",
                      background: "rgba(22, 122, 91, 0.08)",
                      border: "1px solid rgba(22, 122, 91, 0.2)",
                      borderRadius: "12px",
                      marginBottom: "20px",
                    }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                          User: <span style={{ color: "var(--sage-dark)" }}>{scanDetail.username}</span> ({scanDetail.user_role})
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                          Tested: {scanDetail.date_formatted} at {scanDetail.time_formatted}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <span className={styles.statusPassed}>
                          {scanDetail.clean_files_count} Clean Files
                        </span>
                        {scanDetail.defective_files_count > 0 && (
                          <span className={styles.statusFailing}>
                            {scanDetail.defective_files_count} Failing Files
                          </span>
                        )}
                      </div>
                    </div>

                    <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                      All Files Tested in this Run ({scanDetail.files_tested.length})
                    </h4>

                    {/* Files list */}
                    {scanDetail.files_tested.map((f, idx) => {
                      const filePassed = f.status === "PASSED" || f.issues_count === 0;

                      return (
                        <div key={idx} className={styles.testedFileItem}>
                          <div className={styles.testedFileHead}>
                            <div className={styles.testedFilePath}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              <span>{f.file}</span>
                              <span className={styles.langPill}>{f.language}</span>
                              {f.lines && <span style={{ fontSize: "11px", color: "#6b7280" }}>{f.lines} lines</span>}
                            </div>

                            <div>
                              {filePassed ? (
                                <span className={styles.statusPassed}>
                                  ✓ PASSED (0 defects)
                                </span>
                              ) : (
                                <span className={styles.statusFailing}>
                                  ✕ {f.issues_count} {f.issues_count === 1 ? "defect" : "defects"}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Issue list for this file if defects detected */}
                          {f.issues && f.issues.length > 0 && (
                            <div className={styles.testedFileIssuesList}>
                              {f.issues.map((iss, iIdx) => (
                                <div key={iIdx} className={styles.testedFileIssueRow}>
                                  <span style={{ fontWeight: 700, color: "#dc2626", minWidth: "50px" }}>
                                    L{iss.line ?? "—"}
                                  </span>
                                  <span style={{
                                    fontSize: "11px",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "rgba(0,0,0,0.06)",
                                    fontWeight: 700,
                                    textTransform: "uppercase"
                                  }}>
                                    {iss.severity}
                                  </span>
                                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                    {iss.rule ? `[${iss.rule}] ` : ""}{iss.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
