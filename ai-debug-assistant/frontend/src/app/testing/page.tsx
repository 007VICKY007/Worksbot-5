"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchProjects,
  fetchTestRuns,
  createTestRun,
  fetchTestResults,
  updateTestResult,
  rerunTestResult,
  createBugFromTestFailure,
  fetchTesterReport,
  fetchTestCases,
  fetchTestPlans,
  runFileTest,
} from "@/lib/api";
import type {
  Project,
  TestRun,
  TestResult,
  TesterReport,
  FileTestExecutionResult,
} from "@/lib/types";
import { isLoggedIn, getUserRole, getUsername, clearSession, getRoleRoute } from "@/lib/auth";
import { useWorkflow } from "@/lib/useWorkflow";
import WorkflowDetails from "@/components/WorkflowDetails";
import WorkflowUpdates from "@/components/WorkflowUpdates";
import styles from "./testing.module.css";

export default function TestingWorkspacePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [userRole, setUserRole] = useState("tester");

  // Data states
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [report, setReport] = useState<TesterReport | null>(null);
  const [loading, setLoading] = useState(true);
  const workflow = useWorkflow(authorized && !!selectedProjectId, selectedProjectId);
  const mndTickets = workflow.items;
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  // Live execution runner state
  const [activeRunResultModal, setActiveRunResultModal] = useState<FileTestExecutionResult | null>(null);
  const [runningResultId, setRunningResultId] = useState<string | null>(null);
  const [modalResultId, setModalResultId] = useState<string | null>(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [showCreateRunModal, setShowCreateRunModal] = useState(false);
  const [showReportBugModal, setShowReportBugModal] = useState<TestResult | null>(null);

  // Create Run Form
  const [newRunName, setNewRunName] = useState("");
  const [newRunEnv, setNewRunEnv] = useState("Development");
  const [newRunCommit, setNewRunCommit] = useState("HEAD");

  // Report Bug Form
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [bugSeverity, setBugSeverity] = useState("major");
  const [bugPriority, setBugPriority] = useState("high");
  const [bugSteps, setBugSteps] = useState("");
  const [bugLogs, setBugLogs] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const role = getUserRole();
    if (role !== "tester" && role !== "admin") { router.replace(getRoleRoute(role)); return; }
    const uname = getUsername() || "tester";
    setCurrentUser(uname);
    setUserRole(role);

    setAuthorized(true);
    setAuthReady(true);
  }, [router]);

  const loadRunsAndResults = useCallback(async (runIdToSelect?: string) => {
    try {
      setLoading(true);
      const [projRes, runsRes, repRes] = await Promise.all([
        fetchProjects().catch(() => ({ projects: [] })),
        fetchTestRuns(selectedProjectId || undefined).catch(() => ({ runs: [] })),
        fetchTesterReport().catch(() => null),
      ]);

      const pList = projRes.projects || [];
      setProjects(pList);
      setTestRuns(runsRes.runs);
      if (repRes) setReport(repRes);

      const activeProjId = selectedProjectId || pList[0]?.id || "";
      if (!selectedProjectId && pList[0]?.id) {
        setSelectedProjectId(pList[0].id);
      }

      const projectRuns = runsRes.runs.filter(r => r.project_id === activeProjId);
      setTestRuns(projectRuns);
      const requestedRun = runIdToSelect || selectedRunId;
      const targetRunId = projectRuns.find(r => r.id === requestedRun)?.id || projectRuns[0]?.id || "";
      setSelectedRunId(targetRunId);

      if (targetRunId) {
        const resultsRes = await fetchTestResults({ test_run_id: targetRunId });
        setTestResults(resultsRes.results);
      } else {
        setTestResults([]);
      }

    } catch (err) {
      console.error("Failed to load testing data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedRunId, selectedProjectId]);

  useEffect(() => {
    if (authorized) {
      loadRunsAndResults();
    }
  }, [authorized, loadRunsAndResults]);

  async function handleSelectRun(runId: string) {
    setSelectedRunId(runId);
    try {
      setLoading(true);
      const res = await fetchTestResults({ test_run_id: runId });
      setTestResults(res.results);
    } catch (err) {
      console.error("Failed to fetch results for run:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRun(e: React.FormEvent) {
    e.preventDefault();
    if (!newRunName.trim()) return;
    try {
      // Fetch available test cases to populate run
      if (!selectedProjectId) throw new Error("Select a project first.");
      const plans = await fetchTestPlans(selectedProjectId);
      const groups = await Promise.all(plans.plans.map(p => fetchTestCases({ plan_id: p.id })));
      const caseIds = groups.flatMap(g => g.cases.map(c => c.id));
      if (!caseIds.length) throw new Error("Save QA test cases to this project's plans before creating a run.");

      const created = await createTestRun({
        name: newRunName.trim(),
        project_id: selectedProjectId || (projects[0]?.id ?? "default"),
        environment: newRunEnv,
        target_commit: newRunCommit.trim() || "HEAD",
        test_case_ids: caseIds,
      });

      setShowCreateRunModal(false);
      setNewRunName("");
      loadRunsAndResults(created.run.id);
    } catch (err: any) {
      alert(err.message || "Failed to create test run.");
    }
  }

  async function handleUpdateStatus(resultId: string, newStatus: string) {
    const notes = window.prompt("Describe the observed result (required). Existing evidence and measured duration will be preserved.");
    if (!notes?.trim()) return;
    try {
      const updated = await updateTestResult(resultId, {
        status: newStatus,
        notes: notes.trim(),
      });

      setTestResults(prev => prev.map(r => r.id === resultId ? updated.result : r));

      // Refresh stats & runs
      fetchTestRuns().then(res => setTestRuns(res.runs));
      fetchTesterReport().then(res => { if (res) setReport(res); });

      // If marked FAILED, automatically prompt 1-click bug report
      if (newStatus === "failed") {
        openBugModal(updated.result);
      }
    } catch (err: any) {
      alert(err.message || "Failed to update test result.");
    }
  }

  async function handleLiveRunTarget(tr: TestResult) {
    if (!tr.target_file) {
      alert("No target file specified for this test.");
      return;
    }
    setRunningResultId(tr.id);
    try {
      const res = await runFileTest(tr.target_file, selectedProjectId, tr.test_case_id);
      const nextStatus = res.result.passed ? "passed" : "failed";
      setActiveRunResultModal(res.result);
      setModalResultId(tr.id);
      const updated = await updateTestResult(tr.id, {
        status: nextStatus,
        notes: res.result.error_summary || "Live sandbox test executed",
        duration_ms: res.result.duration_ms,
        evidence: {
          logs: [res.result.stdout, res.result.stderr].filter(Boolean).join("\n"),
        }
      });
      setTestResults(prev => prev.map(r => r.id === tr.id ? updated.result : r));
      fetchTestRuns().then(r => setTestRuns(r.runs));
      fetchTesterReport().then(res => { if (res) setReport(res); });
      if (!res.result.passed) {
        setBugTitle(`[Defect] ${res.result.error_type || "RuntimeError"} in ${tr.target_file.split('/').pop()}`);
        setBugDesc(`Subprocess test execution returned exit code ${res.result.exit_code} with error:\n${res.result.error_summary || 'Error'}`);
        setBugLogs(`=== Process Output ===\n${res.result.stderr || res.result.stdout}`);
      }
    } catch (err: any) {
      alert(err.message || "Failed to execute live test");
    } finally {
      setRunningResultId(null);
    }
  }

  async function handleRerun(resultId: string) {
    try {
      const res = await rerunTestResult(resultId);
      setTestResults(prev => prev.map(r => r.id === resultId ? res.result : r));
      fetchTestRuns().then(r => setTestRuns(r.runs));
    } catch (err: any) {
      alert(err.message || "Failed to rerun test.");
    }
  }

  function openBugModal(tr: TestResult) {
    setBugTitle(`[Defect] ${tr.case_title} Failed Execution`);
    setBugDesc(tr.actual_result || `Execution failed in ${tr.target_file || "system module"}.`);
    setBugSteps(tr.steps?.map(s => `${s.step_number}. ${s.action} -> Expected: ${s.expected}`).join("\n") || "1. Execute test suite\n2. Observe discrepancy");
    setBugSeverity(tr.priority === "critical" ? "critical" : "major");
    setBugPriority(tr.priority === "critical" ? "blocker" : "high");
    setBugLogs(tr.evidence?.logs || tr.actual_result || "");
    setShowReportBugModal(tr);
  }

  async function handleReportBugSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!showReportBugModal) return;
    try {
      const createdBug = await createBugFromTestFailure({
        test_result_id: showReportBugModal.id,
        title: bugTitle.trim(),
        description: bugDesc.trim(),
        severity: bugSeverity,
        priority: bugPriority,
        steps_to_reproduce: bugSteps.trim(),
        logs: bugLogs.trim(),
      });

      alert(`Bug logged successfully: ${createdBug.bug.id} (${createdBug.bug.title}). Assigned to QA triage queue.`);
      setShowReportBugModal(null);
      void workflow.refresh();
      if (selectedRunId) {
        handleSelectRun(selectedRunId);
      }
    } catch (err: any) {
      alert(err.message || "Failed to log bug.");
    }
  }

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (!authReady) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg, #090d16)",
        fontFamily: "var(--font)"
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px"
        }}>
          <div style={{
            width: "32px",
            height: "32px",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "var(--sage-primary, #167a5b)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite"
          }} />
          <span style={{ fontSize: "13px", color: "var(--text-secondary, #94a3b8)" }}>
            Verifying testing workspace authorization...
          </span>
        </div>
      </div>
    );
  }

  const activeRun = testRuns.find(r => r.id === selectedRunId);

  const filteredResults = testResults.filter(r => {
    if (statusFilter === "ALL") return true;
    return r.status.toLowerCase() === statusFilter.toLowerCase();
  });

  return (
    <div className={styles.root}>
      {/* ── Top Bar ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.brandMark}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <div className={styles.brandTitle}>
                Software Testing Workspace
                <span className={styles.testerBadge}>Tester</span>
              </div>
            </div>
          </div>

          <div className={styles.navActions}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0, 0, 0, 0.04)",
              padding: "5px 12px",
              borderRadius: "10px",
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>
                Project
              </span>
              <select
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  fontWeight: 600,
                  outline: "none",
                  cursor: "pointer",
                }}
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {projects.length === 0 && <option value="">No active projects</option>}
              </select>
            </div>

            {userRole === "admin" && (
              <button className={styles.navBtn} onClick={() => router.push("/admin")}>
                Supervision
              </button>
            )}

            <div className={styles.userChip}>
              <span className={styles.avatar}>{currentUser.charAt(0).toUpperCase()}</span>
              <span>{currentUser}</span>
            </div>

            <button className={styles.navBtn} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Area ── */}
      <main className={styles.main}>
        {/* Metric Stats Banner */}
        {report && (
          <div className={styles.statsGrid}>
            <div className={styles.statBox}>
              <div className={styles.statVal}>{report.total_assigned}</div>
              <div className={styles.statLabel}>Tests in Active Runs</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.statVal} style={{ color: "#16a34a" }}>{workflow.summary?.passed_tests ?? "Unknown"}</div>
              <div className={styles.statLabel}>Passed</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.statVal} style={{ color: "#dc2626" }}>{workflow.summary?.failed_tests ?? "Unknown"}</div>
              <div className={styles.statLabel}>Failed</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.statVal} style={{ color: "var(--sage-primary, #167a5b)" }}>{report.pass_rate}%</div>
              <div className={styles.statLabel}>Pass Rate</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.statVal}>{workflow.summary?.total_bugs ?? "Unknown"}</div>
              <div className={styles.statLabel}>Bugs Reported</div>
            </div>
          </div>
        )}

        {/* ── MND Tickets Ready for Testing ── */}
        {authorized && (
          <div className={styles.glassCard} style={{ padding: "18px 22px", marginBottom: "20px", borderLeft: "4px solid var(--sage-primary, #167a5b)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>📋</span>
                <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Developer Fixes Awaiting Verification ({mndTickets.filter(t => ["TESTING", "VERIFIED"].includes(t.workflow_status)).length})</h3>
              </div>
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(22, 122, 91, 0.12)", color: "#167a5b" }}>
                MND TICKETS QUEUE
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <WorkflowUpdates workflow={workflow} onSelect={setSelectedWorkflowId} buttonClass={styles.actionBtnSecondary} />
              {mndTickets.filter(t => ["TESTING", "VERIFIED"].includes(t.workflow_status)).map(ticket => (
                <div key={ticket.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255, 255, 255, 0.7)", padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.06)", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "12px", color: "var(--sage-primary)" }}>{ticket.id}</span>
                      <strong style={{ fontSize: "14px" }}>{ticket.title}</strong>
                      <span style={{ fontSize: "10.5px", padding: "1px 6px", borderRadius: "4px", background: ticket.status === "TESTING" ? "rgba(22, 122, 91, 0.12)" : "#dbeafe", color: ticket.status === "TESTING" ? "#167a5b" : "#1d4ed8", fontWeight: 700 }}>
                        {ticket.workflow_status}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Target: <code>{ticket.target_file || "Codebase"}</code> | Dev: {ticket.assigned_developer || "Developer"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedWorkflowId(ticket.id)}
                      style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                    >
                      Verify & Record Evidence
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedWorkflowId(ticket.id)}
                      style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "#ef4444", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                    >
                      Review / Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Test Run Selector Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Execution Run:</h2>
            <select
              className={styles.formSelect}
              style={{ width: "260px", padding: "8px 12px" }}
              value={selectedRunId}
              onChange={e => handleSelectRun(e.target.value)}
            >
              {testRuns.map(run => (
                <option key={run.id} value={run.id}>
                  {run.name} ({run.environment})
                </option>
              ))}
              {testRuns.length === 0 && <option value="">No test runs yet</option>}
            </select>

            <select
              className={styles.formSelect}
              style={{ width: "140px", padding: "8px 12px" }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="pending">Pending</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>

          <button className={styles.actionBtn} onClick={() => setShowCreateRunModal(true)}>
            + New Test Run
          </button>
        </div>

        {/* Active Run Status Card */}
        {activeRun && (
          <div className={styles.glassCard} style={{ padding: "16px 20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>
                {activeRun.name} &bull; <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Env: {activeRun.environment} | Target: {activeRun.target_commit}</span>
              </div>
              <span className={`${styles.badge} ${activeRun.status === "passed" ? styles.badgePassed : activeRun.status === "failed" ? styles.badgeFailed : styles.badgePending}`}>
                {activeRun.status}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ width: "100%", height: "8px", background: "rgba(0,0,0,0.06)", borderRadius: "9999px", overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${activeRun.total_tests > 0 ? (activeRun.passed_count / activeRun.total_tests) * 100 : 0}%`, background: "#16a34a" }} />
              <div style={{ width: `${activeRun.total_tests > 0 ? (activeRun.failed_count / activeRun.total_tests) * 100 : 0}%`, background: "#dc2626" }} />
              <div style={{ width: `${activeRun.total_tests > 0 ? (activeRun.blocked_count / activeRun.total_tests) * 100 : 0}%`, background: "#d97706" }} />
            </div>
            <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
              <span>Total: {activeRun.total_tests}</span>
              <span>Passed: {activeRun.passed_count}</span>
              <span>Failed: {activeRun.failed_count}</span>
              <span>Blocked: {activeRun.blocked_count}</span>
            </div>
          </div>
        )}

        {/* ── Test Execution Results List ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {filteredResults.map(tr => (
            <div key={tr.id} className={styles.glassCard} style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <h3 style={{ fontSize: "15.5px", fontWeight: 700 }}>{tr.case_title}</h3>
                    <span className={`${styles.badge} ${
                      tr.status === "passed" ? styles.badgePassed :
                      tr.status === "failed" ? styles.badgeFailed :
                      tr.status === "blocked" ? styles.badgeBlocked :
                      tr.status === "skipped" ? styles.badgeSkipped :
                      styles.badgePending
                    }`}>
                      {tr.status}
                    </span>
                    <span className={`${styles.badge} ${tr.priority === "critical" ? styles.badgeFailed : styles.badgeBlocked}`}>
                      {tr.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                    Target: <code style={{ fontSize: "11.5px" }}>{tr.target_file || "Module"}</code> | Suite: {tr.suite}
                    {tr.duration_ms > 0 && <span> | Duration: {tr.duration_ms}ms</span>}
                  </div>
                </div>

                {/* Quick Execution Status Actions */}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className={styles.actionBtnSecondary}
                    style={{
                      padding: "5px 10px",
                      fontSize: "11px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      color: "#167a5b",
                      borderColor: "rgba(22, 122, 91, 0.35)",
                      fontWeight: 600,
                    }}
                    disabled={runningResultId === tr.id}
                    onClick={() => handleLiveRunTarget(tr)}
                    title="Execute test target in live runner"
                  >
                    {runningResultId === tr.id ? (
                      <div style={{ width: "10px", height: "10px", border: "2px solid rgba(22,122,91,0.3)", borderTopColor: "#167a5b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    )}
                    Run File
                  </button>
                  <button className={styles.btnPass} onClick={() => handleUpdateStatus(tr.id, "passed")}>
                    PASS
                  </button>
                  <button className={styles.btnFail} onClick={() => handleUpdateStatus(tr.id, "failed")}>
                    FAIL
                  </button>
                  <button className={styles.btnBlocked} onClick={() => handleUpdateStatus(tr.id, "blocked")}>
                    BLOCKED
                  </button>
                  <button className={styles.btnSkip} onClick={() => handleUpdateStatus(tr.id, "skipped")}>
                    SKIP
                  </button>
                </div>
              </div>

              {/* Steps & Expected Results */}
              <div style={{ background: "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", marginBottom: "10px" }}>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                  Expected: <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>{tr.expected_result || "Standard behavior invariant verified."}</span>
                </div>
                {tr.steps && tr.steps.length > 0 && (
                  <div style={{ color: "var(--text-tertiary)" }}>
                    Steps: {tr.steps.map(s => `${s.step_number}. ${s.action}`).join(" | ")}
                  </div>
                )}
              </div>

              {/* Linked Bug or Bug Reporting Action */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "10px" }}>
                <div>
                  {tr.linked_bug_id ? (
                    <span style={{ fontSize: "12px", color: "var(--status-warn, #b45309)", fontWeight: 600 }}>
                      Linked Defect: {tr.linked_bug_id} (Under Developer Resolution)
                    </span>
                  ) : tr.status === "failed" ? (
                    <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>
                      Test Failed &bull; Defect logged or ready to report
                    </span>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                      {tr.actual_result || "Ready for execution"}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {tr.linked_bug_id && (
                    <button className={styles.actionBtnSecondary} onClick={() => handleRerun(tr.id)}>
                      Rerun Test
                    </button>
                  )}
                  {tr.status === "failed" && !tr.linked_bug_id && (
                    <button
                      className={styles.actionBtnSecondary}
                      style={{ color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.3)" }}
                      onClick={() => openBugModal(tr)}
                    >
                      1-Click Report Bug
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredResults.length === 0 && !loading && (
            <div className={styles.glassCard} style={{ textAlign: "center", padding: "40px" }}>
              <p style={{ color: "var(--text-secondary)" }}>
                {testRuns.length === 0
                  ? "No test runs defined. Click \"+ New Test Run\" to launch execution."
                  : "No test results match the current status filter."}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL: Create Test Run ── */}
      <AnimatePresence>
        {showCreateRunModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>Initiate Test Execution Run</h3>
                <button className={styles.closeBtn} onClick={() => setShowCreateRunModal(false)}>✕</button>
              </div>
              <form onSubmit={handleCreateRun}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Run Title</label>
                  <input
                    className={styles.formInput}
                    placeholder="e.g. Build 1.4.2 Regression & Sanity Sweep"
                    value={newRunName}
                    onChange={e => setNewRunName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Target Environment</label>
                    <select className={styles.formSelect} value={newRunEnv} onChange={e => setNewRunEnv(e.target.value)}>
                      <option value="Development">Development</option>
                      <option value="Staging">Staging</option>
                      <option value="Production">Production</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Git Commit / Tag</label>
                    <input className={styles.formInput} value={newRunCommit} onChange={e => setNewRunCommit(e.target.value)} />
                  </div>
                </div>
                <p style={{ fontSize: "12.5px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                  All active test cases in the project repository will be linked to this execution cycle.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                  <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowCreateRunModal(false)}>Cancel</button>
                  <button type="submit" className={styles.actionBtn}>Create Execution Run</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: 1-Click Bug Creation on Test Failure ── */}
      <AnimatePresence>
        {showReportBugModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "680px" }}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle} style={{ color: "#dc2626" }}>Report Defect from Test Failure</h3>
                <button className={styles.closeBtn} onClick={() => setShowReportBugModal(null)}>✕</button>
              </div>
              <form onSubmit={handleReportBugSubmit}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Bug Title</label>
                  <input className={styles.formInput} value={bugTitle} onChange={e => setBugTitle(e.target.value)} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Severity</label>
                    <select className={styles.formSelect} value={bugSeverity} onChange={e => setBugSeverity(e.target.value)}>
                      <option value="critical">Critical</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                      <option value="cosmetic">Cosmetic</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Priority</label>
                    <select className={styles.formSelect} value={bugPriority} onChange={e => setBugPriority(e.target.value)}>
                      <option value="blocker">Blocker</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Steps to Reproduce</label>
                  <textarea className={styles.formTextarea} rows={3} value={bugSteps} onChange={e => setBugSteps(e.target.value)} required />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Execution Logs & Discrepancy Evidence</label>
                  <textarea className={styles.formTextarea} rows={3} value={bugLogs} onChange={e => setBugLogs(e.target.value)} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                  <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowReportBugModal(null)}>Cancel</button>
                  <button
                    type="submit"
                    className={styles.actionBtn}
                    style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}
                  >
                    Submit Defect to QA
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Real-time File Execution & Sandbox Output ── */}
      <AnimatePresence>
        {(activeRunResultModal || selectedWorkflowId) && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "760px" }}>
              <div className={styles.modalHead}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 className={styles.modalTitle}>{selectedWorkflowId ? "Workflow Verification" : "File Execution & Sandbox Verification"}</h3>
                  {activeRunResultModal && !selectedWorkflowId && <span className={`${styles.badge} ${activeRunResultModal.passed ? styles.badgePassed : styles.badgeFailed}`}>
                    {activeRunResultModal.passed ? "PASSED" : "FAILED"}
                  </span>}
                </div>
                <button className={styles.closeBtn} onClick={() => { setActiveRunResultModal(null); setSelectedWorkflowId(null); }}>✕</button>
              </div>

              {selectedWorkflowId ? <WorkflowDetails key={selectedWorkflowId} id={selectedWorkflowId} role={userRole} styles={styles} onChanged={() => void workflow.refresh()} /> : activeRunResultModal && <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "14px", background: "rgba(0,0,0,0.03)", padding: "10px 14px", borderRadius: "8px" }}>
                <div>
                  Target File: <code style={{ fontSize: "12px", fontWeight: 600 }}>{activeRunResultModal.file_path}</code>
                </div>
                <div style={{ display: "flex", gap: "14px" }}>
                  <span>Exit Code: <strong>{activeRunResultModal.exit_code}</strong></span>
                  <span>Duration: <strong>{activeRunResultModal.duration_ms}ms</strong></span>
                </div>
              </div>

              {activeRunResultModal.error_summary && (
                <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#dc2626", marginBottom: "4px" }}>
                    Captured Exception: {activeRunResultModal.error_type || "Runtime Error"}
                  </div>
                  <div style={{ fontSize: "13px", color: "#b91c1c", fontFamily: "monospace" }}>
                    {activeRunResultModal.error_summary}
                  </div>
                </div>
              )}

              <div className={styles.executionConsole} style={{ marginTop: 0, maxHeight: "320px", display: "flex", flexDirection: "column" }}>
                <div className={styles.consoleHeader}>
                  <div className={styles.consoleTitle}>
                    <span style={{ color: "#94a3b8", fontSize: "11.5px" }}>Process Terminal Output (stdout & stderr)</span>
                  </div>
                </div>
                <div className={styles.terminalOutput} style={{ maxHeight: "260px" }}>
                  {[activeRunResultModal.stdout, activeRunResultModal.stderr].filter(Boolean).join("\n") || "(No terminal output produced)"}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className={styles.actionBtnSecondary} onClick={() => setActiveRunResultModal(null)}>
                  Close
                </button>
                {!activeRunResultModal.passed && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}
                    onClick={() => {
                      const activeRes = testResults.find(r => r.id === modalResultId);
                      setActiveRunResultModal(null);
                      if (activeRes) {
                        openBugModal(activeRes);
                      }
                    }}
                  >
                    1-Click Report Bug
                  </button>
                )}
              </div>
              </>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
