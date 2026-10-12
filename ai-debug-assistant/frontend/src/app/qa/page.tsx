"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchProjects,
  fetchTestPlans,
  createTestPlan,
  updateTestPlan,
  deleteTestPlan,
  fetchTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  generateAITestCases,
  fetchQAReport,
  fetchRegisteredUsers,
  fetchProjectFiles,
  runFileTest,
  UserRecord,
  runMultiEnvQA,
  fetchQualityGate,
  connectGitHub,
  fetchGitHubRepos,
  pushGitHubRelease,
  triggerDeployment,
  assignWorkflowItem,
  fetchWorkflowItem,
  transitionWorkflowItem,
} from "@/lib/api";
import type {
  Project,
  TestPlan,
  TestCase,
  Bug,
  QAReport,
  ProjectFile,
  FileTestExecutionResult,
  QAMultiEnvRun,
  QualityGateVerdict,
  GitHubUser,
  GitHubRepo,
} from "@/lib/types";
import { isLoggedIn, getUserRole, getUsername, clearSession, getRoleRoute } from "@/lib/auth";
import { useWorkflow } from "@/lib/useWorkflow";
import { normalizeGeneratedSteps } from "@/lib/workflow";
import WorkflowDetails from "@/components/WorkflowDetails";
import WorkflowUpdates from "@/components/WorkflowUpdates";
import RoleAbilitiesModal from "@/components/RoleAbilitiesModal";
import styles from "./qa.module.css";

export default function QAWorkspacePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [userRole, setUserRole] = useState("qa");

  // Navigation
  const [activeTab, setActiveTab] = useState<"plans" | "cases" | "bugs" | "reports" | "quality_gate">("plans");
  const [loading, setLoading] = useState(true);

  // Multi-Environment QA & Quality Gate & GitHub states
  const [qaMultiEnvRun, setQaMultiEnvRun] = useState<QAMultiEnvRun | null>(null);
  const [multiEnvLoading, setMultiEnvLoading] = useState(false);
  const [qualityGate, setQualityGate] = useState<QualityGateVerdict | null>(null);
  const [qualityGateLoading, setQualityGateLoading] = useState(false);
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [githubToken, setGithubToken] = useState("ghp_mindora_secure_sample_pat_token");
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [releaseCommitMsg, setReleaseCommitMsg] = useState("Production Release: Mindora verified build");
  const [pushingRelease, setPushingRelease] = useState(false);
  const [releaseResult, setReleaseResult] = useState<any | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<any | null>(null);

  // Data states
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [testPlans, setTestPlans] = useState<TestPlan[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const workflow = useWorkflow(authorized && !!selectedProjectId, selectedProjectId);
  const bugs: Bug[] = workflow.items.map(item => ({ ...item, status: item.workflow_status.toLowerCase(), assigned_to: item.assigned_developer, description: item.description || "", reported_by: item.reported_by || item.created_by || "", steps_to_reproduce: item.steps_to_reproduce || "", environment: "", target_file: item.target_file || "", history: undefined }));
  const [qaReport, setQaReport] = useState<QAReport | null>(null);
  const [developers, setDevelopers] = useState<UserRecord[]>([]);

  // Modals
  const [showAbilitiesModal, setShowAbilitiesModal] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [showAIGenModal, setShowAIGenModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<Bug | null>(null);
  const [showCloseModal, setShowCloseModal] = useState<string | null>(null);
  const [showReopenModal, setShowReopenModal] = useState<Bug | null>(null);

  // Form states
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanScope, setNewPlanScope] = useState("");
  const [newPlanObjectives, setNewPlanObjectives] = useState("");
  const [newPlanDate, setNewPlanDate] = useState("");

  const [newCasePlanId, setNewCasePlanId] = useState("");
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [newCaseSuite, setNewCaseSuite] = useState("regression");
  const [newCasePriority, setNewCasePriority] = useState("medium");
  const [newCaseType, setNewCaseType] = useState("functional");
  const [newCaseTargetFile, setNewCaseTargetFile] = useState("");
  const [newCaseExpected, setNewCaseExpected] = useState("");
  const [newCasePreconditions, setNewCasePreconditions] = useState("");

  // AI Gen states
  const [aiGenFile, setAiGenFile] = useState("");
  const aiGenFileProjectRef = useRef<string>("");
  const [aiGenContext, setAiGenContext] = useState("Generate comprehensive functional, boundary, and edge-case unit and regression tests.");
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiGenResult, setAiGenResult] = useState<TestCase[]>([]);
  const [aiSavePlan, setAiSavePlan] = useState("");
  const [aiSaveBusy, setAiSaveBusy] = useState(false);
  const [aiSaveMessage, setAiSaveMessage] = useState("");

  // Bug action inputs
  const [selectedDevToAssign, setSelectedDevToAssign] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  // Filters
  const [bugStatusFilter, setBugStatusFilter] = useState("ALL");
  const [caseSuiteFilter, setCaseSuiteFilter] = useState("ALL");

  // Project files & live execution states
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [fileTestingLoading, setFileTestingLoading] = useState(false);
  const [fileTestResult, setFileTestResult] = useState<FileTestExecutionResult | null>(null);
  const [activeRunResultModal, setActiveRunResultModal] = useState<FileTestExecutionResult | null>(null);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const role = getUserRole();
    const uname = getUsername() || "qa_lead";
    setCurrentUser(uname);
    setUserRole(role);

    if (role !== "qa" && role !== "admin") { router.replace(getRoleRoute(role)); return; }
    setAuthorized(true);
    setAuthReady(true);
  }, [router]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const projRes = await fetchProjects().catch(() => ({ projects: [] }));
      const pList = projRes.projects || [];
      setProjects(pList);

      const activeProjId = selectedProjectId || pList[0]?.id || "";
      if (!selectedProjectId && pList[0]?.id) {
        setSelectedProjectId(pList[0].id);
      }

      const [plansRes, casesRes, reportRes, usersRes, filesRes] = await Promise.all([
        activeProjId ? fetchTestPlans(activeProjId).catch(() => ({ plans: [] })) : Promise.resolve({ plans: [] }),
        fetchTestCases().catch(() => ({ cases: [] })),
        activeProjId ? fetchQAReport(activeProjId).catch(() => null) : Promise.resolve(null),
        fetchRegisteredUsers().catch(() => ({ users: [] })),
        activeProjId ? fetchProjectFiles(activeProjId).catch(() => ({ files: [] })) : Promise.resolve({ files: [] }),
      ]);

      setTestPlans(plansRes.plans);
      setTestCases(casesRes.cases.filter(c => plansRes.plans.some(p => p.id === c.test_plan_id)));
      if (reportRes) setQaReport(reportRes);
      setDevelopers((usersRes.users || []).filter(u => u.role === "developer"));

      const fList = filesRes.files || [];
      setProjectFiles(fList);
      // On project switch, drop a selection that belongs to the previous project (stale path -> "not found").
      const projectChanged = aiGenFileProjectRef.current !== activeProjId;
      aiGenFileProjectRef.current = activeProjId;
      setAiGenFile(prev => {
        const inProject = fList.some(f => f.project_relative_path === prev || f.path === prev);
        if (prev && (inProject || !projectChanged)) return prev;
        return fList.length > 0 ? (fList[0].path || fList[0].project_relative_path) : ""; // matches <option value={f.path}>
      });
    } catch (err) {
      console.error("QA data load error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  async function handleRunTargetFile(targetFile: string) {
    if (!targetFile.trim()) {
      alert("Please select or specify a target file first.");
      return;
    }
    setFileTestingLoading(true);
    try {
      const res = await runFileTest(targetFile, selectedProjectId);
      setFileTestResult(res.result);
    } catch (err: any) {
      alert(err.message || "Failed to execute file test");
    } finally {
      setFileTestingLoading(false);
    }
  }

  async function handleRunCaseTarget(testCase: TestCase) {
    if (!testCase.target_file) {
      alert("No target file specified for this test case.");
      return;
    }
    setRunningCaseId(testCase.id);
    try {
      const res = await runFileTest(testCase.target_file, selectedProjectId, testCase.id);
      setActiveRunResultModal(res.result);
    } catch (err: any) {
      alert(err.message || "Failed to execute test case file");
    } finally {
      setRunningCaseId(null);
    }
  }

  const loadQualityGate = useCallback(async () => {
    // The project is resolved asynchronously by loadData; an empty id would request /api/qa/quality-gate/ (404).
    if (!selectedProjectId) return;
    try {
      setQualityGateLoading(true);
      const res = await fetchQualityGate(selectedProjectId);
      setQualityGate(res.quality_gate);
    } catch (err) {
      console.error("Failed to fetch quality gate:", err);
    } finally {
      setQualityGateLoading(false);
    }
  }, [selectedProjectId]);

  async function handleRunMultiEnv() {
    try {
      setMultiEnvLoading(true);
      const res = await runMultiEnvQA(selectedProjectId);
      setQaMultiEnvRun(res.qa_run);
      await loadQualityGate();
      alert(`Multi-Environment QA Run finished! Overall Status: ${res.qa_run.overall_status}`);
    } catch (err: any) {
      alert(err.message || "Failed to execute multi-environment QA");
    } finally {
      setMultiEnvLoading(false);
    }
  }

  async function handleConnectGitHub(e: React.FormEvent) {
    e.preventDefault();
    if (!githubToken.trim()) return;
    try {
      const res = await connectGitHub(githubToken.trim(), currentUser);
      setGithubUser(res.github);
      const reposRes = await fetchGitHubRepos(githubToken.trim());
      setGithubRepos(reposRes.repositories || []);
      if (reposRes.repositories?.[0]) {
        setSelectedRepo(reposRes.repositories[0].name);
        setSelectedBranch(reposRes.repositories[0].default_branch || "main");
      }
      alert(`GitHub connected as @${res.github.login}! Found ${reposRes.repositories?.length || 0} repositories.`);
    } catch (err: any) {
      alert(err.message || "Failed to connect to GitHub");
    }
  }

  async function handlePushRelease() {
    if (!qualityGate || qualityGate.status !== "APPROVED") {
      alert("Release blocked by Quality Gate! All 5 checklist criteria must pass before release can be pushed to GitHub.");
      return;
    }
    setPushingRelease(true);
    try {
      const res = await pushGitHubRelease({
        project_id: selectedProjectId,
        repository: selectedRepo || "worksbot/mindora-core",
        branch: selectedBranch || "main",
        commit_message: releaseCommitMsg,
        token: githubToken,
      });
      setReleaseResult(res.release);
      alert(`Release successfully pushed to GitHub! Commit: ${res.release.commit_sha}`);
    } catch (err: any) {
      alert(err.message || "Failed to push release to GitHub");
    } finally {
      setPushingRelease(false);
    }
  }

  async function handleTriggerDeployment(releaseId: string) {
    setDeploying(true);
    try {
      const res = await triggerDeployment(selectedProjectId, releaseId);
      setDeploymentResult(res.deployment);
      alert(`Production deployment simulation completed with status: ${(res.deployment.status || "deployed").toUpperCase()}!`);
    } catch (err: any) {
      alert(err.message || "Deployment failed");
    } finally {
      setDeploying(false);
    }
  }

  useEffect(() => {
    if (authorized) {
      loadData();
      loadQualityGate();
    }
  }, [authorized, loadData, loadQualityGate]);

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlanName.trim()) return;
    try {
      await createTestPlan({
        project_id: selectedProjectId,
        name: newPlanName.trim(),
        scope: newPlanScope.trim(),
        objectives: newPlanObjectives.trim(),
        target_date: newPlanDate || undefined,
      });
      setShowCreatePlanModal(false);
      setNewPlanName("");
      setNewPlanScope("");
      setNewPlanObjectives("");
      setNewPlanDate("");
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to create test plan");
    }
  }

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    if (!newCaseTitle.trim()) return;
    const planId = newCasePlanId || testPlans[0]?.id;
    if (!planId) { alert("Create a test plan for this project first."); return; }
    try {
      await createTestCase({
        test_plan_id: planId,
        title: newCaseTitle.trim(),
        suite: newCaseSuite,
        priority: newCasePriority,
        type: newCaseType,
        target_file: newCaseTargetFile.trim() || undefined,
        preconditions: newCasePreconditions.trim() || undefined,
        expected_result: newCaseExpected.trim() || "Test completes without error.",
        steps: [
          { step_number: 1, action: "Execute test routine", expected: newCaseExpected.trim() || "Pass" }
        ],
      });
      setShowCreateCaseModal(false);
      setNewCaseTitle("");
      setNewCaseTargetFile("");
      setNewCaseExpected("");
      setNewCasePreconditions("");
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to create test case");
    }
  }

  async function handleGenerateAITests(e: React.FormEvent) {
    e.preventDefault();
    if (!aiGenFile.trim() || aiSaveBusy) return;
    setAiGenLoading(true);
    setAiGenResult([]);
    setAiSaveMessage("");
    try {
      const res = await generateAITestCases(aiGenFile.trim(), aiGenContext.trim(), selectedProjectId);
      setAiGenResult((res.test_cases || []).map(c => ({ ...c, steps: normalizeGeneratedSteps(c.steps) })));
    } catch (err: any) {
      alert(err.message || "AI test generation failed.");
    } finally {
      setAiGenLoading(false);
    }
  }

  async function handleAssignBug(bugId: string) {
    if (!selectedDevToAssign) return;
    try {
      await assignWorkflowItem(bugId, { developer: selectedDevToAssign });
      void workflow.refresh();
      setShowAssignModal(null);
      setSelectedDevToAssign("");
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to assign bug");
    }
  }

  async function handleSaveGeneratedCases() {
    if (aiSaveBusy || !testPlans.some(p => p.id === aiSavePlan)) return;
    setAiSaveBusy(true);
    setAiSaveMessage("");
    let saved = 0;
    try {
      for (const c of aiGenResult) {
        await createTestCase({ test_plan_id: aiSavePlan, title: c.title, suite: c.suite || "regression", priority: c.priority || "medium", type: c.type || "functional", preconditions: c.preconditions, steps: normalizeGeneratedSteps(c.steps), expected_result: c.expected_result, target_file: c.target_file || aiGenFile });
        saved++;
        setAiGenResult(previous => previous.slice(1));
      }
      setAiSaveMessage(`Saved ${saved} test cases to the selected plan.`);
    } catch (err) {
      setAiSaveMessage(`Saved ${saved} cases. Remaining previews were not saved: ${err instanceof Error ? err.message : "Request failed"}`);
    } finally {
      setAiSaveBusy(false);
      void loadData();
    }
  }

  async function handleReopenBug(bugId: string) {
    if (!reopenReason.trim()) {
      alert("A reason is required to reopen this bug.");
      return;
    }
    try {
      const current = (await fetchWorkflowItem(bugId)).item;
      await transitionWorkflowItem(bugId, "REOPENED", reopenReason.trim(), current.version);
      void workflow.refresh();
      setShowReopenModal(null);
      setReopenReason("");
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to reopen bug");
    }
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm("Are you sure you want to delete this test plan?")) return;
    try {
      await deleteTestPlan(planId);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete test plan");
    }
  }

  async function handleDeleteCase(caseId: string) {
    if (!confirm("Are you sure you want to delete this test case?")) return;
    try {
      await deleteTestCase(caseId);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete test case");
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
            Verifying QA workspace authorization...
          </span>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className={styles.root} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className={styles.glassCard} style={{ maxWidth: "480px", textAlign: "center", margin: "auto" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px", color: "var(--status-warn, #b45309)" }}>
            Access Restricted
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            The QA Workspace is designated for <strong>QA Engineers</strong> and <strong>Administrators</strong>.
            Your active role is <strong>{userRole.toUpperCase()}</strong>.
          </p>
          <button
            className={styles.actionBtn}
            onClick={() => router.replace(userRole === "tester" ? "/testing" : "/")}
          >
            Go to Your Assigned Workspace
          </button>
        </div>
      </div>
    );
  }

  const filteredBugs = bugs.filter(b => {
    if (bugStatusFilter === "ALL") return true;
    return b.status.toLowerCase() === bugStatusFilter.toLowerCase();
  });

  const filteredCases = testCases.filter(c => {
    if (caseSuiteFilter === "ALL") return true;
    return c.suite.toLowerCase() === caseSuiteFilter.toLowerCase();
  });

  return (
    <div className={styles.root}>
      {/* ── Top Bar ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.brandMark}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <div>
              <div className={styles.brandTitle}>
                QA Engineering Workspace
                <span className={styles.qaBadge}>QA Engineer</span>
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

            <div className={styles.userChip} role="button" tabIndex={0} onClick={() => setShowAbilitiesModal(true)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setShowAbilitiesModal(true); }}>
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
        {/* Tab Navigation */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabItem} ${activeTab === "plans" ? styles.tabItemActive : ""}`}
            onClick={() => setActiveTab("plans")}
          >
            Test Plans ({testPlans.length})
          </button>
          <button
            className={`${styles.tabItem} ${activeTab === "cases" ? styles.tabItemActive : ""}`}
            onClick={() => setActiveTab("cases")}
          >
            Test Cases & AI Gen ({testCases.length})
          </button>
          <button
            className={`${styles.tabItem} ${activeTab === "bugs" ? styles.tabItemActive : ""}`}
            onClick={() => setActiveTab("bugs")}
          >
            Bug Triage & Quality Gate ({bugs.length})
          </button>
          <button
            className={`${styles.tabItem} ${activeTab === "reports" ? styles.tabItemActive : ""}`}
            onClick={() => setActiveTab("reports")}
          >
            Quality Metrics
          </button>
          <button
            className={`${styles.tabItem} ${activeTab === "quality_gate" ? styles.tabItemActive : ""}`}
            onClick={() => setActiveTab("quality_gate")}
          >
            Multi-Env & Quality Gate ({qualityGate?.status || "Check"})
          </button>
        </div>

        {/* ── TAB 1: Test Plans ── */}
        {activeTab === "plans" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Project Test Plans</h2>
              <button className={styles.actionBtn} onClick={() => setShowCreatePlanModal(true)}>
                + Create Test Plan
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
              {testPlans.map((plan) => (
                <div key={plan.id} className={styles.glassCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700 }}>{plan.name}</h3>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className={`${styles.badge} ${plan.status === "active" ? styles.badgeSuccess : styles.badgeNeutral}`}>
                        {plan.status}
                      </span>
                      <button
                        title="Delete Test Plan"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-tertiary, #94a3b8)",
                          cursor: "pointer",
                          padding: "2px 4px",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px", minHeight: "36px" }}>
                    {plan.scope || "General system regression and stability verification."}
                  </p>
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)", display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "10px" }}>
                    <span>Target: {plan.target_date || "Continuous"}</span>
                    <span>By: {plan.created_by}</span>
                  </div>
                </div>
              ))}
              {testPlans.length === 0 && !loading && (
                <div className={styles.glassCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No test plans defined yet. Click &quot;Create Test Plan&quot; to begin.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: Test Cases & AI Gen ── */}
        {activeTab === "cases" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Test Cases Repository</h2>
                <select
                  className={styles.formSelect}
                  style={{ width: "160px", padding: "6px 10px", fontSize: "12px" }}
                  value={caseSuiteFilter}
                  onChange={(e) => setCaseSuiteFilter(e.target.value)}
                >
                  <option value="ALL">All Suites</option>
                  <option value="regression">Regression</option>
                  <option value="smoke">Smoke</option>
                  <option value="unit">Unit</option>
                  <option value="integration">Integration</option>
                  <option value="security">Security</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className={styles.actionBtnSecondary}
                  onClick={() => setShowAIGenModal(true)}
                  style={{ background: "rgba(22, 122, 91, 0.12)", color: "#167a5b", borderColor: "rgba(22, 122, 91, 0.3)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  Generate AI Tests
                </button>
                <button className={styles.actionBtn} onClick={() => setShowCreateCaseModal(true)}>
                  + Add Test Case
                </button>
              </div>
            </div>

            <div className={styles.glassCard} style={{ padding: "0", overflow: "hidden" }}>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Suite</th>
                      <th>Priority</th>
                      <th>Target File</th>
                      <th>Expected Result</th>
                      <th>Status</th>
                      <th style={{ width: "110px", textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((tc) => (
                      <tr key={tc.id}>
                        <td style={{ fontWeight: 600 }}>{tc.title}</td>
                        <td><span className={`${styles.badge} styles.badgeInfo`}>{tc.suite}</span></td>
                        <td>
                          <span className={`${styles.badge} ${tc.priority === "critical" ? styles.badgeDanger : tc.priority === "high" ? styles.badgeWarning : styles.badgeNeutral}`}>
                            {tc.priority}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{tc.target_file || "—"}</td>
                        <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tc.expected_result}
                        </td>
                        <td>
                          <span className={`${styles.badge} styles.badgeSuccess`}>{tc.status || "ready"}</span>
                        </td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <button
                            title="Run & Verify Target File"
                            style={{
                              background: "rgba(22, 122, 91, 0.12)",
                              border: "1px solid rgba(22, 122, 91, 0.3)",
                              color: "#167a5b",
                              cursor: "pointer",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              marginRight: "6px",
                            }}
                            disabled={runningCaseId === tc.id}
                            onClick={() => handleRunCaseTarget(tc)}
                          >
                            {runningCaseId === tc.id ? (
                              <div style={{ width: "10px", height: "10px", border: "2px solid rgba(22,122,91,0.3)", borderTopColor: "#167a5b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                              </svg>
                            )}
                            Run
                          </button>
                          <button
                            title="Delete Test Case"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-tertiary, #94a3b8)",
                              cursor: "pointer",
                              padding: "2px",
                              display: "inline-flex",
                              alignItems: "center"
                            }}
                            onClick={() => handleDeleteCase(tc.id)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCases.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-secondary)" }}>
                          No test cases match filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: Bug Triage & Quality Gate ── */}
        {activeTab === "bugs" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Bug Triage & Quality Gate</h2>
                <select
                  className={styles.formSelect}
                  style={{ width: "160px", padding: "6px 10px", fontSize: "12px" }}
                  value={bugStatusFilter}
                  onChange={(e) => setBugStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="fixed">Fixed</option>
                  <option value="retest">Retest</option>
                  <option value="closed">Closed</option>
                  <option value="reopened">Reopened</option>
                  <option value="in_progress">In Progress</option>
                  <option value="qa_review">QA Review</option>
                  <option value="testing">Testing</option>
                  <option value="verified">Verified</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <WorkflowUpdates workflow={workflow} onSelect={setShowCloseModal} buttonClass={styles.actionBtnSecondary} />
              {filteredBugs.map((bug) => (
                <div key={bug.id} className={styles.glassCard} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                          {bug.id}
                        </span>
                        <h3 style={{ fontSize: "16px", fontWeight: 700 }}>{bug.title}</h3>
                        <span className={`${styles.badge} ${bug.severity === "critical" ? styles.badgeDanger : styles.badgeWarning}`}>
                          {bug.severity}
                        </span>
                        <span className={`${styles.badge} ${bug.status === "closed" ? styles.badgeSuccess : bug.status === "fixed" ? styles.badgeInfo : styles.badgeWarning}`}>
                          {bug.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                        Reported by: <strong>{bug.reported_by}</strong> | File: <code style={{ fontSize: "11.5px" }}>{bug.target_file}</code>
                        {bug.assigned_to && (
                          <span> | Assigned to: <strong>{bug.assigned_to}</strong></span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className={styles.actionBtnSecondary}
                        onClick={() => setShowAssignModal(bug)}
                      >
                        {bug.assigned_to ? "Reassign" : "Assign to Dev"}
                      </button>

                      {bug.status !== "closed" && (
                        <button
                          className={styles.actionBtnSecondary}
                          style={{ borderColor: "rgba(22, 122, 91, 0.4)", color: "var(--sage-primary)" }}
                          onClick={() => setShowCloseModal(bug.id)}
                        >
                          Review & Test
                        </button>
                      )}

                      {bug.status === "closed" && (
                        <button
                          className={styles.actionBtnSecondary}
                          style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "#ef4444" }}
                          onClick={() => setShowCloseModal(bug.id)}
                        >
                          View History
                        </button>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "10px" }}>
                    {bug.description}
                  </p>

                  {bug.fix_summary && (
                    <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "10px", padding: "12px", marginTop: "10px", fontSize: "12.5px" }}>
                      <strong>Developer Fix Summary ({bug.assigned_to || "Developer"}):</strong>
                      <p style={{ marginTop: "4px" }}>{bug.fix_summary}</p>
                    </div>
                  )}
                </div>
              ))}
              {filteredBugs.length === 0 && (
                <div className={styles.glassCard} style={{ textAlign: "center", padding: "40px" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No bugs match this filter criteria.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: Quality Metrics ── */}
        {activeTab === "reports" && qaReport && (
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "18px" }}>System Quality Metrics & SLA</h2>
            <div className={styles.statsGrid}>
              <div className={styles.statBox}>
                <div className={styles.statVal}>{qaReport.total_test_plans}</div>
                <div className={styles.statLabel}>Active Test Plans</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statVal}>{qaReport.total_test_cases}</div>
                <div className={styles.statLabel}>Total Test Cases</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statVal}>{workflow.summary?.total_bugs ?? "Unknown"}</div>
                <div className={styles.statLabel}>Total Bugs Logged</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statVal} style={{ color: "#16a34a" }}>{workflow.summary?.by_status.CLOSED ?? "Unknown"}</div>
                <div className={styles.statLabel}>QA Closed / Verified</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className={styles.glassCard}>
                <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>Bugs by Severity</h3>
                {Object.entries(qaReport.bug_metrics.by_severity || {}).map(([sev, count]) => (
                  <div key={sev} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{sev}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>

              <div className={styles.glassCard}>
                <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>Test Cases by Suite</h3>
                {Object.entries(qaReport.cases_by_suite || {}).map(([suite, count]) => (
                  <div key={suite} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{suite}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: Multi-Environment QA, Quality Gate & Release ── */}
        {activeTab === "quality_gate" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            {/* Header / Summary */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "19px", fontWeight: 800 }}>Multi-Environment Validation & Release Quality Gate</h2>
                <p style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                  Evaluate release readiness across Development, Testing, Staging, and Production-like environments.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleRunMultiEnv}
                  disabled={multiEnvLoading}
                  className={styles.actionBtn}
                  style={{
                    background: "linear-gradient(135deg, #167a5b 0%, #115e46 100%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {multiEnvLoading ? "Executing Multi-Env QA…" : "🌐 Run QA Across 4 Environments"}
                </button>
                <button
                  type="button"
                  onClick={loadQualityGate}
                  disabled={qualityGateLoading}
                  className={styles.secondaryBtn}
                >
                  {qualityGateLoading ? "Evaluating…" : "🔄 Refresh Quality Gate"}
                </button>
              </div>
            </div>

            {/* Quality Gate Status Banner */}
            <div
              className={styles.glassCard}
              style={{
                padding: "20px 24px",
                borderLeft: `5px solid ${qualityGate?.status === "APPROVED" ? "#16a34a" : "#dc2626"}`,
                background: qualityGate?.status === "APPROVED" ? "rgba(16, 185, 129, 0.06)" : "rgba(239, 68, 68, 0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "24px" }}>{qualityGate?.status === "APPROVED" ? "✅" : "🛡️"}</span>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 800 }}>
                      Quality Gate Verdict: <span style={{ color: qualityGate?.status === "APPROVED" ? "#15803d" : "#b91c1c" }}>{qualityGate?.status || "PENDING EVALUATION"}</span>
                    </h3>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>
                      {qualityGate?.status === "APPROVED"
                        ? "All release criteria met. Codebase is certified for GitHub Release and production deployment."
                        : "Quality Gate is blocking release. Ensure all checklist conditions below are resolved."}
                    </p>
                  </div>
                </div>

                <span style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  padding: "4px 12px",
                  borderRadius: "9999px",
                  background: qualityGate?.status === "APPROVED" ? "#dcfce7" : "#fee2e2",
                  color: qualityGate?.status === "APPROVED" ? "#166534" : "#991b1b",
                  textTransform: "uppercase",
                }}>
                  {qualityGate?.status === "APPROVED" ? "APPROVED FOR RELEASE" : "RELEASE BLOCKED"}
                </span>
              </div>

              {/* 5-Point Quality Gate Checklist */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginTop: "12px" }}>
                {(qualityGate?.checklist || [
                  { condition: "Developer Fixes Verified", passed: true, detail: "Fixes verified in sandbox (.bak backed up)" },
                  { condition: "Automated Tests Passing", passed: true, detail: "All unit & regression test suites passing" },
                  { condition: "Multi-Environment QA", passed: qaMultiEnvRun?.passed || false, detail: "Validated across Dev, Test, Staging, Prod-like" },
                  { condition: "Zero Blocker Tickets", passed: bugs.filter(b => b.severity === "critical" && b.status !== "closed").length === 0, detail: "No unresolved critical/blocker defects" },
                  { condition: "Secrets Sanitization", passed: true, detail: "Zero API keys or credentials exposed in code" },
                ]).map((item, cIdx) => (
                  <div
                    key={cIdx}
                    style={{
                      background: "rgba(255, 255, 255, 0.8)",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid rgba(0,0,0,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>{item.passed ? "✓" : "✕"}</span>
                      <strong style={{ fontSize: "13px", color: item.passed ? "#15803d" : "#b91c1c" }}>{item.condition}</strong>
                    </div>
                    <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Environment Execution Results */}
            {qaMultiEnvRun && (
              <div className={styles.glassCard} style={{ padding: "20px 24px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                  Multi-Environment Execution Matrix ({qaMultiEnvRun.environments.length} Environments)
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  {qaMultiEnvRun.environments.map((env, eIdx) => (
                    <div
                      key={eIdx}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        background: env.passed ? "rgba(16, 185, 129, 0.06)" : "rgba(239, 68, 68, 0.06)",
                        border: `1px solid ${env.passed ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <strong style={{ fontSize: "14px" }}>{env.environment}</strong>
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: env.passed ? "#dcfce7" : "#fee2e2",
                          color: env.passed ? "#166534" : "#991b1b",
                        }}>
                          {env.passed ? "PASSED" : "FAILED"}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Target: <code>{env.target}</code></div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "4px" }}>Duration: {env.duration_ms}ms | Exit: {env.exit_code}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GitHub Release Push & Deployment */}
            <div className={styles.glassCard} style={{ padding: "22px 26px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Secure GitHub Release Integration</h3>
                  <p style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                    Automate branch synchronization and release tags upon verified Quality Gate approval.
                  </p>
                </div>
                {githubUser && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.04)", padding: "4px 10px", borderRadius: "9999px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
                    <span style={{ fontSize: "12px", fontWeight: 700 }}>@{githubUser.login}</span>
                  </div>
                )}
              </div>

              {!githubUser ? (
                <form onSubmit={handleConnectGitHub} style={{ display: "flex", gap: "10px", alignItems: "center", maxWidth: "600px" }}>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={e => setGithubToken(e.target.value)}
                    placeholder="ghp_ personal access token"
                    style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                    required
                  />
                  <button type="submit" className={styles.actionBtn}>Connect GitHub</button>
                </form>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Repository</label>
                      <select
                        value={selectedRepo}
                        onChange={e => setSelectedRepo(e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                      >
                        {githubRepos.map(r => (
                          <option key={r.name} value={r.name}>{r.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Release Branch</label>
                      <input
                        type="text"
                        value={selectedBranch}
                        onChange={e => setSelectedBranch(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Commit Message</label>
                    <input
                      type="text"
                      value={releaseCommitMsg}
                      onChange={e => setReleaseCommitMsg(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "6px" }}>
                    <button
                      type="button"
                      onClick={handlePushRelease}
                      disabled={pushingRelease || (qualityGate?.status !== "APPROVED")}
                      style={{
                        padding: "10px 22px",
                        borderRadius: "8px",
                        border: "none",
                        background: qualityGate?.status === "APPROVED" ? "linear-gradient(135deg, #167a5b 0%, #115e46 100%)" : "rgba(0,0,0,0.15)",
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: (qualityGate?.status === "APPROVED" && !pushingRelease) ? "pointer" : "not-allowed",
                      }}
                    >
                      {pushingRelease ? "Pushing Release…" : "🚀 Push Release to GitHub"}
                    </button>

                    {qualityGate?.status !== "APPROVED" && (
                      <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>
                        Quality Gate is currently BLOCKED. Cannot release.
                      </span>
                    )}

                    {releaseResult && (
                      <button
                        type="button"
                        onClick={() => handleTriggerDeployment(releaseResult.release_id || "rel-latest")}
                        disabled={deploying}
                        className={styles.secondaryBtn}
                      >
                        {deploying ? "Deploying…" : "⚡ Trigger Production Deployment Simulation"}
                      </button>
                    )}
                  </div>

                  {releaseResult && (
                    <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", fontSize: "12.5px", color: "#065f46" }}>
                      ✓ Release successfully recorded! Commit SHA: <code>{releaseResult.commit_sha}</code> | Branch: <code>{releaseResult.branch}</code>
                    </div>
                  )}

                  {deploymentResult && (
                    <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(22, 122, 91, 0.1)", fontSize: "12.5px", color: "#167a5b" }}>
                      ✓ Production Deployment simulated! Status: <strong>{deploymentResult.status}</strong> | Target: <code>{deploymentResult.target_url || "https://app.mindora.internal"}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL: Create Test Plan ── */}
      <AnimatePresence>
        {showCreatePlanModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>Create New Test Plan</h3>
                <button className={styles.closeBtn} onClick={() => setShowCreatePlanModal(false)}>✕</button>
              </div>
              <form onSubmit={handleCreatePlan}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Plan Title</label>
                  <input className={styles.formInput} placeholder="e.g. Q4 Core Release & Microservice Regression" value={newPlanName} onChange={e => setNewPlanName(e.target.value)} required />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Scope</label>
                  <textarea className={styles.formTextarea} rows={3} placeholder="In-scope microservices, API contracts, boundary scenarios..." value={newPlanScope} onChange={e => setNewPlanScope(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Target Completion Date</label>
                  <input type="date" className={styles.formInput} value={newPlanDate} onChange={e => setNewPlanDate(e.target.value)} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                  <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowCreatePlanModal(false)}>Cancel</button>
                  <button type="submit" className={styles.actionBtn}>Save Plan</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Create Test Case ── */}
      <AnimatePresence>
        {showCreateCaseModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>Define Test Case</h3>
                <button className={styles.closeBtn} onClick={() => setShowCreateCaseModal(false)}>✕</button>
              </div>
              <form onSubmit={handleCreateCase}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Test Plan</label>
                  <select className={styles.formSelect} value={newCasePlanId} onChange={e => setNewCasePlanId(e.target.value)}>
                    {testPlans.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Test Title</label>
                  <input className={styles.formInput} placeholder="e.g. Verify division by zero yields DomainError" value={newCaseTitle} onChange={e => setNewCaseTitle(e.target.value)} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Suite</label>
                    <select className={styles.formSelect} value={newCaseSuite} onChange={e => setNewCaseSuite(e.target.value)}>
                      <option value="regression">Regression</option>
                      <option value="smoke">Smoke</option>
                      <option value="unit">Unit</option>
                      <option value="integration">Integration</option>
                      <option value="security">Security</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Priority</label>
                    <select className={styles.formSelect} value={newCasePriority} onChange={e => setNewCasePriority(e.target.value)}>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className={styles.formLabel} style={{ marginBottom: 0 }}>Target File / Module to Test</label>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      {projectFiles.length} file{projectFiles.length === 1 ? "" : "s"} detected
                    </span>
                  </div>
                  <div className={styles.fileSelectRow}>
                    <select
                      className={styles.formSelect}
                      style={{ flex: 1 }}
                      value={newCaseTargetFile}
                      onChange={(e) => {
                        setNewCaseTargetFile(e.target.value);
                        setFileTestResult(null);
                      }}
                    >
                      <option value="">-- Browse & Select Project File --</option>
                      {projectFiles.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.is_test ? "🧪 " : "📄 "}
                          {f.project_relative_path || f.name} ({f.language})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.actionBtnSecondary}
                      style={{
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        borderColor: fileTestingLoading ? "var(--primary)" : "rgba(22, 122, 91, 0.4)",
                        color: "#167a5b",
                      }}
                      onClick={() => handleRunTargetFile(newCaseTargetFile)}
                      disabled={fileTestingLoading || !newCaseTargetFile}
                    >
                      {fileTestingLoading ? (
                        <>
                          <div style={{ width: "12px", height: "12px", border: "2px solid rgba(22,122,91,0.3)", borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          Testing...
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                          Run & Verify File
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    className={styles.formInput}
                    style={{ marginTop: "6px", fontSize: "12px", fontFamily: "monospace" }}
                    placeholder="Or enter target file path (e.g. src/utils.py)"
                    value={newCaseTargetFile}
                    onChange={(e) => {
                      setNewCaseTargetFile(e.target.value);
                      setFileTestResult(null);
                    }}
                  />

                  {/* Real-time execution console */}
                  {fileTestResult && (
                    <div className={styles.executionConsole}>
                      <div className={styles.consoleHeader}>
                        <div className={styles.consoleTitle}>
                          <span className={fileTestResult.passed ? styles.terminalSuccess : styles.terminalError}>
                            {fileTestResult.passed ? "✓ TEST PASSED" : `✗ TEST FAILED${fileTestResult.error_type ? ` [${fileTestResult.error_type}]` : ""}`}
                          </span>
                          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>
                            Exit code: {fileTestResult.exit_code} | {fileTestResult.duration_ms}ms
                          </span>
                        </div>
                        {!fileTestResult.passed && (
                          <button
                            type="button"
                            onClick={() => {
                              if (fileTestResult.error_summary) {
                                setNewCaseExpected(`Handle ${fileTestResult.error_summary} gracefully`);
                              }
                              if (!newCaseTitle) {
                                setNewCaseTitle(`Verify ${fileTestResult.error_type || 'Execution'} in ${fileTestResult.file_path.split('/').pop()}`);
                              }
                            }}
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              color: "#fca5a5",
                              borderRadius: "6px",
                              fontSize: "11px",
                              padding: "3px 8px",
                              cursor: "pointer",
                            }}
                          >
                            Auto-fill Expected from Error
                          </button>
                        )}
                      </div>
                      {fileTestResult.error_summary && (
                        <div style={{ color: "#f87171", marginBottom: "6px", fontWeight: 600 }}>
                          Error: {fileTestResult.error_summary}
                        </div>
                      )}
                      <div className={styles.terminalOutput}>
                        {fileTestResult.stderr || fileTestResult.stdout || "(No console output produced)"}
                      </div>
                    </div>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Preconditions</label>
                  <input className={styles.formInput} placeholder="State, environment setup..." value={newCasePreconditions} onChange={e => setNewCasePreconditions(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Expected Result</label>
                  <textarea className={styles.formTextarea} rows={2} placeholder="Expected response, HTTP code, or invariant..." value={newCaseExpected} onChange={e => setNewCaseExpected(e.target.value)} required />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                  <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowCreateCaseModal(false)}>Cancel</button>
                  <button type="submit" className={styles.actionBtn}>Create Case</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Generate AI Test Cases ── */}
      <AnimatePresence>
        {showAIGenModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "720px" }}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>AI Intelligent Test Case Generator</h3>
                <button className={styles.closeBtn} onClick={() => setShowAIGenModal(false)}>✕</button>
              </div>
              <form onSubmit={handleGenerateAITests}>
                <div className={styles.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className={styles.formLabel} style={{ marginBottom: 0 }}>Source Code File Path</label>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      {projectFiles.length} file{projectFiles.length === 1 ? "" : "s"} detected
                    </span>
                  </div>
                  <div className={styles.fileSelectRow}>
                    <select
                      className={styles.formSelect}
                      style={{ flex: 1 }}
                      value={aiGenFile}
                      onChange={(e) => setAiGenFile(e.target.value)}
                    >
                      <option value="">-- Browse & Select Project File --</option>
                      {projectFiles.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.is_test ? "🧪 " : "📄 "}
                          {f.project_relative_path || f.name} ({f.language})
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    className={styles.formInput}
                    style={{ marginTop: "6px", fontSize: "12px", fontFamily: "monospace" }}
                    placeholder="Or enter target file path (e.g. src/utils.py)"
                    value={aiGenFile}
                    onChange={e => setAiGenFile(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Context & Test Criteria</label>
                  <textarea className={styles.formTextarea} rows={3} value={aiGenContext} onChange={e => setAiGenContext(e.target.value)} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: "18px" }}>
                  <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowAIGenModal(false)}>Close</button>
                  <button type="submit" className={styles.actionBtn} disabled={aiGenLoading || aiSaveBusy}>
                    {aiGenLoading ? "AI Synthesizing Tests…" : "Generate Tests via GPT-4o"}
                  </button>
                </div>
              </form>

              {aiGenResult.length > 0 && (
                <div style={{ marginTop: "16px", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "14px" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "var(--sage-primary)" }}>
                    {aiGenResult.length} Generated Previews (not saved):
                  </h4>
                  <label className={styles.formLabel}>Save to project test plan
                    <select className={styles.formSelect} value={aiSavePlan} disabled={aiSaveBusy} onChange={e => setAiSavePlan(e.target.value)}>
                      <option value="">Choose a plan</option>
                      {testPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <button type="button" className={styles.actionBtn} disabled={aiSaveBusy || !testPlans.some(p => p.id === aiSavePlan)} onClick={handleSaveGeneratedCases}>{aiSaveBusy ? "Saving..." : "Save preview cases"}</button>
                  <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {aiGenResult.map((tc, idx) => (
                      <div key={idx} style={{ background: "rgba(0,0,0,0.03)", padding: "10px", borderRadius: "8px", fontSize: "12.5px" }}>
                        <div style={{ fontWeight: 600 }}>{tc.title}</div>
                        <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>Expected: {tc.expected_result}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Assign Bug to Developer ── */}
      <AnimatePresence>
        {showAssignModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "480px" }}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>Assign Bug to Developer</h3>
                <button className={styles.closeBtn} onClick={() => setShowAssignModal(null)}>✕</button>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                Select an engineering developer to assign bug: <strong>{showAssignModal.title}</strong>
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Assigned Developer</label>
                <select className={styles.formSelect} value={selectedDevToAssign} onChange={e => setSelectedDevToAssign(e.target.value)}>
                  <option value="">-- Choose Developer --</option>
                  {developers.map(d => (
                    <option key={d.username} value={d.username}>{d.username}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowAssignModal(null)}>Cancel</button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleAssignBug(showAssignModal.id)}
                  disabled={!selectedDevToAssign}
                >
                  Assign Bug
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Validate & Close Bug ── */}
      <AnimatePresence>
        {showCloseModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "480px" }}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>QA Quality Gate Sign-Off</h3>
                <button className={styles.closeBtn} onClick={() => setShowCloseModal(null)}>✕</button>
              </div>
              <WorkflowDetails key={showCloseModal} id={showCloseModal} role={userRole} styles={styles} onChanged={() => void workflow.refresh()} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Reopen Bug ── */}
      <AnimatePresence>
        {showReopenModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "480px" }}>
              <div className={styles.modalHead}>
                <h3 className={styles.modalTitle}>Reopen Defect</h3>
                <button className={styles.closeBtn} onClick={() => setShowReopenModal(null)}>✕</button>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                Reopen bug: <strong>{showReopenModal.title}</strong>
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Reopen Reason</label>
                <textarea
                  className={styles.formTextarea}
                  rows={3}
                  placeholder="Bug reproduced in regression rerun after patch application..."
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className={styles.actionBtnSecondary} onClick={() => setShowReopenModal(null)}>Cancel</button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" }}
                  onClick={() => handleReopenBug(showReopenModal.id)}
                >
                  Reopen Defect
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Real-time File Execution & Sandbox Output ── */}
      <AnimatePresence>
        {activeRunResultModal && (
          <div className={styles.modalBackdrop}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={styles.modalContent} style={{ maxWidth: "760px" }}>
              <div className={styles.modalHead}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 className={styles.modalTitle}>File Execution & Verification Output</h3>
                  <span className={`${styles.badge} ${activeRunResultModal.passed ? styles.badgeSuccess : styles.badgeDanger}`}>
                    {activeRunResultModal.passed ? "PASSED" : "FAILED"}
                  </span>
                </div>
                <button className={styles.closeBtn} onClick={() => setActiveRunResultModal(null)}>✕</button>
              </div>

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
                    Detected Error: {activeRunResultModal.error_type || "Runtime Error"}
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
                  {activeRunResultModal.stderr || activeRunResultModal.stdout || "(No terminal output produced)"}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className={styles.actionBtn} onClick={() => setActiveRunResultModal(null)}>
                  Close Console
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Engineering Roles & Ability Matrix Modal */}
      <RoleAbilitiesModal
        isOpen={showAbilitiesModal}
        onClose={() => setShowAbilitiesModal(false)}
        currentRole={userRole}
      />
    </div>
  );
}
