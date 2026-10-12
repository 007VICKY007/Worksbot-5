"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, animate } from "framer-motion";
import type { Variants, Transition } from "framer-motion";
import {
  SessionExpiredError,
  scanDirectory,
  analyzeFile,
  analyzeAllFiles,
  fetchAuthenticatedUsers,
  applyFix,
  UserRecord,
  fetchRAGStats,
  fetchRAGMemories,
  searchRAGMemories,
  aiAnalyzeBug,
  importLocalProject,
  analyzeProjectDeep,
  createWorkflowItem,
  fetchWorkflowItem,
  fixWorkflowItem,
  transitionWorkflowItem,
  runAutonomousPipeline,
  fetchPipelineStatus,
  fetchProjects,
  restoreFileBackup,
  fetchQATestCases,
  createQATestCase,
  runQATestCase,
  fetchQATestRuns,
  fetchQAIssues,
  fetchQAIssue,
  updateQAIssueStatus,
  assignQAIssueToDeveloper,
  fetchQAWorkflowSummary,
  generateAITestCasesForFile,
  retestQAIssue,
} from "@/lib/api";
import { isLoggedIn, getUsername, clearSession, isAdmin, getUserRole, getRoleRoute } from "@/lib/auth";
import { useWorkflow } from "@/lib/useWorkflow";
import WorkflowDetails from "@/components/WorkflowDetails";
import WorkflowUpdates from "@/components/WorkflowUpdates";
import RoleAbilitiesModal from "@/components/RoleAbilitiesModal";
import type {
  Report,
  Issue,
  AIAnalysis,
  RAGStats,
  RAGMemoryItem,
  Project,
  ProjectAnalysis,
  WorkflowItem,
  PipelineRunState,
  QualityGateVerdict,
  QATestCase,
  QATestRun,
  QAIssue,
  QAWorkflowSummary,
  QAWorkflowStatus,
} from "@/lib/types";
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
  const [userRole, setUserRole]   = useState("developer");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const workflow = useWorkflow(authReady && !!selectedProjectId, selectedProjectId);

  // Department bug workflow
  const assignedBugs = workflow.items.filter(item => item.assigned_developer === username && item.workflow_status !== "CLOSED");
  const [showBugsDrawer, setShowBugsDrawer]       = useState(false);
  const [selectedBugForFix, setSelectedBugForFix] = useState<WorkflowItem | null>(null);
  const [devFixExplanation, setDevFixExplanation] = useState("");
  const [devFixedCode, setDevFixedCode]           = useState("");
  const [aiBugAnalysis, setAiBugAnalysis]         = useState<any | null>(null);
  const [aiBugLoading, setAiBugLoading]           = useState(false);
  const [submittingFix, setSubmittingFix]         = useState(false);

  const loadAssignedBugs = workflow.refresh;

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      const tm = setTimeout(() => {
        if (!isLoggedIn()) {
          window.location.replace("/login");
        }
      }, 250);
      return () => clearTimeout(tm);
    } else {
      const uname = getUsername() ?? "developer";
      setUsername(uname);
      const role = getUserRole();
      const home = getRoleRoute(role);
      // Only redirect to a *different* workspace; redirecting to "/" from "/" would never resolve authReady.
      if (role !== "developer" && role !== "admin" && home !== "/") { router.replace(home); return; }
      setUserRole(role);
      setAuthReady(true);
      if (role === "developer" || role === "admin") {
        loadAssignedBugs();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAssignedBugs]);

  async function handleAIBugAnalyze(bugId: string) {
    setAiBugLoading(true);
    setAiBugAnalysis(null);
    try {
      const res = await aiAnalyzeBug(bugId);
      setAiBugAnalysis(res.analysis);
      if (res.analysis?.suggested_code) {
        setDevFixedCode(res.analysis.suggested_code);
      }
    } catch (err: any) {
      alert(err.message || "Failed to analyze bug with AI");
    } finally {
      setAiBugLoading(false);
    }
  }

  async function handleSubmitBugFix(bugId: string) {
    if (!devFixExplanation.trim()) {
      alert("Please provide an explanation of your fix.");
      return;
    }
    setSubmittingFix(true);
    try {
      const current = (await fetchWorkflowItem(bugId)).item;
      const fixed = await fixWorkflowItem(bugId, devFixedCode, devFixExplanation.trim(), current.version);
      await transitionWorkflowItem(bugId, "QA_REVIEW", devFixExplanation.trim(), fixed.item.version);
      alert("Fix submitted to QA! Bug moved to retest queue.");
      setSelectedBugForFix(null);
      setDevFixExplanation("");
      setDevFixedCode("");
      setAiBugAnalysis(null);
      loadAssignedBugs();
      void workflow.refresh();
    } catch (err: any) {
      alert(err.message || "Failed to submit fix");
    } finally {
      setSubmittingFix(false);
      void workflow.refresh();
    }
  }

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  // Scanner state
  const [dir,                setDir]                = useState("");
  const [loading,            setLoading]            = useState(false);
  const [scanDone,           setScanDone]           = useState(false);
  const [error,              setError]              = useState("");
  const [report,             setReport]             = useState<Report | null>(null);
  const [showBrowser,        setShowBrowser]        = useState(false);
  const [aiIntellectualScan, setAiIntellectualScan] = useState(true);

  // Filters
  const [activeFile,     setActiveFile]     = useState("all");
  const [activeLang,     setActiveLang]     = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSev,      setActiveSev]      = useState<string[]>(["error", "warning", "info"]);
  const [openFiles,      setOpenFiles]      = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [tab,            setTab]            = useState<"issues" | "categories" | "rag_memory" | "letterhead" | "json" | "qa_workflow">("issues");

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

  // ── Project, Pipeline & Ticket States ──
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const ticketsList = workflow.items;
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [pipelineState, setPipelineState] = useState<PipelineRunState | null>(null);
  const [qualityGate, setQualityGate] = useState<QualityGateVerdict | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);

  // Modals & Drawers
  const [showAbilitiesModal, setShowAbilitiesModal] = useState(false);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketDesc, setNewTicketDesc] = useState("");
  const [newTicketSeverity, setNewTicketSeverity] = useState("major");
  const [newTicketPriority, setNewTicketPriority] = useState("high");
  const [newTicketFile, setNewTicketFile] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Registered Users Directory State
  const [registeredUsers, setRegisteredUsers] = useState<UserRecord[]>([]);
  const [selectedUser,    setSelectedUser]    = useState<string>("");

  // RAG Vector Store & Memory State
  const [ragStats,         setRagStats]         = useState<RAGStats | null>(null);
  const [ragMemories,      setRagMemories]      = useState<RAGMemoryItem[]>([]);
  const [ragSearchQuery,   setRagSearchQuery]   = useState("");
  const [ragSearching,     setRagSearching]     = useState(false);
  const [ragSearchResults, setRagSearchResults] = useState<RAGMemoryItem[] | null>(null);

  // ── Simplified QA Workflow State ──
  const [qaTestCases, setQATestCases] = useState<QATestCase[]>([]);
  const [qaTestRuns, setQATestRuns] = useState<QATestRun[]>([]);
  const [qaIssues, setQAIssues] = useState<QAIssue[]>([]);
  const [qaSummary, setQASummary] = useState<QAWorkflowSummary | null>(null);
  const [qaLoading, setQALoading] = useState(false);
  const [qaActiveTab, setQAActiveTab] = useState<"test_cases" | "test_runs" | "issues" | "summary">("test_cases");
  const [showCreateTestCaseModal, setShowCreateTestCaseModal] = useState(false);
  const [newTestCaseTitle, setNewTestCaseTitle] = useState("");
  const [newTestCaseDesc, setNewTestCaseDesc] = useState("");
  const [newTestCaseFile, setNewTestCaseFile] = useState("");
  const [newTestCaseType, setNewTestCaseType] = useState<"unit" | "integration" | "e2e" | "manual">("unit");
  const [newTestCaseCode, setNewTestCaseCode] = useState("");
  const [newTestCaseSteps, setNewTestCaseSteps] = useState("");
  const [newTestCaseExpected, setNewTestCaseExpected] = useState("");
  const [creatingTestCase, setCreatingTestCase] = useState(false);
  const [selectedTestCaseForRun, setSelectedTestCaseForRun] = useState<QATestCase | null>(null);
  const [runningTest, setRunningTest] = useState(false);
  const [selectedIssueForFix, setSelectedIssueForFix] = useState<QAIssue | null>(null);
  const [fixCode, setFixCode] = useState("");
  const [fixSummary, setFixSummary] = useState("");
  const [applyingFixToIssue, setApplyingFixToIssue] = useState(false);
  const [selectedIssueForRetest, setSelectedIssueForRetest] = useState<QAIssue | null>(null);
  const [selectedRetestRun, setSelectedRetestRun] = useState<QATestRun | null>(null);
  const [retesting, setRetesting] = useState(false);

  const loadPipelineAndTickets = useCallback(async (projId?: string) => {
    try {
      setTicketsLoading(true);
      const projRes = await fetchProjects().catch(() => ({ projects: [] }));
      const pList = projRes.projects || [];
      setProjectsList(pList);

      const activeId = projId || selectedProjectId || pList[0]?.id || "default";
      if (!selectedProjectId && pList[0]?.id) {
        setSelectedProjectId(pList[0].id);
      }

      const pipeRes = await fetchPipelineStatus(activeId).catch(() => ({ pipeline_status: { project_id: activeId, latest_run: null, gate: null as any } }));
      if (pipeRes?.pipeline_status) {
        setPipelineState(pipeRes.pipeline_status.latest_run);
        setQualityGate(pipeRes.pipeline_status.gate);
      }
    } catch (err) {
      console.error("Failed to load pipeline or tickets:", err);
    } finally {
      setTicketsLoading(false);
    }
  }, [selectedProjectId]);

  async function handleRunAutonomousPipeline() {
    if (userRole !== "admin") return;
    setPipelineRunning(true);
    try {
      const activeId = selectedProjectId || projectsList[0]?.id || "default";
      const res = await runAutonomousPipeline(activeId);
      setPipelineState(res.pipeline);
      await loadPipelineAndTickets(activeId);
      alert(`Autonomous pipeline finished with status: ${(res.pipeline.status || "completed").toUpperCase()}! Quality Gate: ${res.pipeline.quality_gate?.verdict || "N/A"}`);
    } catch (err: any) {
      alert(err.message || "Pipeline execution error");
    } finally {
      setPipelineRunning(false);
    }
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!newTicketTitle.trim()) return;
    setSubmittingTicket(true);
    try {
      let projectId = selectedProjectId;
      const directory = report?.scanned_directory || dir.trim();
      if (directory) {
        const normalize = (path: string) => path.replace(/[\\/]+$/, "");
        const existing = projectsList.find(p => normalize(p.root_path || p.path) === normalize(directory));
        const project = existing || (await importLocalProject(directory)).project;
        projectId = project.id;
        setSelectedProjectId(project.id);
      }
      if (!projectId) throw new Error("Scan/import a directory or select a registered project before creating a ticket.");
      await createWorkflowItem({
        project_id: projectId,
        title: newTicketTitle.trim(),
        description: newTicketDesc.trim(),
        severity: newTicketSeverity,
        priority: newTicketPriority,
        target_file: newTicketFile.trim() || undefined,
        assigned_developer: username,
        assignees: { developer: username },
      });
      setShowNewTicketModal(false);
      setNewTicketTitle("");
      setNewTicketDesc("");
      setNewTicketFile("");
      await loadPipelineAndTickets(projectId);
      await workflow.refresh();
    } catch (err: any) {
      alert(err.message || "Failed to create ticket");
    } finally {
      setSubmittingTicket(false);
    }
  }

  async function handleRestoreBackup(backupPath: string, file: string) {
    if (!confirm(`Restore original file from backup: ${backupPath}?`)) return;
    try {
      await restoreFileBackup(backupPath);
      alert("Backup successfully restored!");
      setAppliedSuccess(p => {
        const next = { ...p };
        delete next[file];
        return next;
      });
      if (report) {
        const updated = await scanDirectory(report.scanned_directory);
        setReport(updated);
      }
    } catch (err: any) {
      alert(err.message || "Failed to restore backup");
    }
  }

  async function loadRAGData() {
    try {
      const [s, m] = await Promise.all([
        fetchRAGStats(),
        fetchRAGMemories({ limit: 50 }),
      ]);
      setRagStats(s);
      setRagMemories(m.items || []);
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      console.error("Failed to load RAG data:", err);
    }
  }

  async function handleRAGSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!ragSearchQuery.trim()) {
      setRagSearchResults(null);
      return;
    }
    setRagSearching(true);
    try {
      const res = await searchRAGMemories(ragSearchQuery.trim());
      setRagSearchResults(res.results);
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      console.error("RAG search failed:", err);
    } finally {
      setRagSearching(false);
    }
  }

  // ── Simplified QA Workflow Functions ──
  async function loadQATestCases() {
    if (!selectedProjectId) return;
    try {
      const res = await fetchQATestCases(selectedProjectId);
      setQATestCases(res.test_cases || []);
    } catch (err) {
      console.error("Failed to load QA test cases:", err);
    }
  }

  async function loadQATestRuns(testCaseId?: string) {
    if (!selectedProjectId) return;
    try {
      const res = await fetchQATestRuns(selectedProjectId, testCaseId);
      setQATestRuns(res.test_runs || []);
    } catch (err) {
      console.error("Failed to load QA test runs:", err);
    }
  }

  async function loadQAIssues(status?: QAWorkflowStatus) {
    if (!selectedProjectId) return;
    try {
      const res = await fetchQAIssues(selectedProjectId, status);
      setQAIssues(res.issues || []);
    } catch (err) {
      console.error("Failed to load QA issues:", err);
    }
  }

  async function loadQASummary() {
    if (!selectedProjectId) return;
    try {
      const res = await fetchQAWorkflowSummary(selectedProjectId);
      setQASummary(res);
    } catch (err) {
      console.error("Failed to load QA summary:", err);
    }
  }

  async function loadAllQAData() {
    setQALoading(true);
    try {
      await Promise.all([
        loadQATestCases(),
        loadQATestRuns(),
        loadQAIssues(),
        loadQASummary(),
      ]);
    } finally {
      setQALoading(false);
    }
  }

  async function handleCreateTestCase(e: React.FormEvent) {
    e.preventDefault();
    if (!newTestCaseTitle.trim() || !newTestCaseFile.trim()) return;
    if (!selectedProjectId) return;
    setCreatingTestCase(true);
    try {
      await createQATestCase({
        project_id: selectedProjectId,
        title: newTestCaseTitle.trim(),
        description: newTestCaseDesc.trim(),
        target_file: newTestCaseFile.trim(),
        test_type: newTestCaseType,
        test_code: newTestCaseCode.trim() || undefined,
        steps: newTestCaseSteps.trim() ? newTestCaseSteps.trim().split("\n").map(s => s.trim()).filter(Boolean) : undefined,
        expected_result: newTestCaseExpected.trim() || undefined,
      });
      setShowCreateTestCaseModal(false);
      setNewTestCaseTitle("");
      setNewTestCaseDesc("");
      setNewTestCaseFile("");
      setNewTestCaseCode("");
      setNewTestCaseSteps("");
      setNewTestCaseExpected("");
      await loadQATestCases();
    } catch (err: any) {
      alert(err.message || "Failed to create test case");
    } finally {
      setCreatingTestCase(false);
    }
  }

  async function handleGenerateAITestCases() {
    if (!newTestCaseFile.trim() || !selectedProjectId) {
      alert("Please select a target file first.");
      return;
    }
    setCreatingTestCase(true);
    try {
      const res = await generateAITestCasesForFile(newTestCaseFile.trim(), selectedProjectId);
      // Auto-create the generated test cases
      for (const tc of res.test_cases) {
        await createQATestCase({
          project_id: selectedProjectId,
          title: tc.title,
          description: tc.description,
          target_file: tc.target_file,
          test_type: tc.test_type,
          test_code: tc.test_code,
          steps: tc.steps,
          expected_result: tc.expected_result,
        });
      }
      await loadQATestCases();
      alert(`Generated and saved ${res.test_cases.length} AI test case(s)!`);
    } catch (err: any) {
      alert(err.message || "Failed to generate AI test cases");
    } finally {
      setCreatingTestCase(false);
    }
  }

  async function handleRunTestCase(testCase: QATestCase) {
    if (!selectedProjectId) return;
    setRunningTest(true);
    try {
      const res = await runQATestCase(selectedProjectId, testCase.id);
      await loadQATestRuns(testCase.id);
      await loadQAIssues();
      await loadQASummary();
      if (res.test_run.status === "failed") {
        alert(`Test run completed: FAILED. Issue auto-created.`);
      } else {
        alert(`Test run completed: ${res.test_run.status.toUpperCase()}`);
      }
    } catch (err: any) {
      alert(err.message || "Failed to run test case");
    } finally {
      setRunningTest(false);
    }
  }

  async function handleUpdateIssueStatus(issue: QAIssue, newStatus: QAWorkflowStatus, notes?: string, fixedCode?: string, fixSummary?: string) {
    try {
      await updateQAIssueStatus({
        issue_id: issue.id,
        status: newStatus,
        notes,
        fixed_code: fixedCode,
        fix_summary: fixSummary,
      });
      await loadQAIssues();
      await loadQASummary();
      alert(`Issue status updated to ${newStatus.toUpperCase()}`);
    } catch (err: any) {
      alert(err.message || "Failed to update issue status");
    }
  }

  async function handleAssignIssueToDeveloper(issue: QAIssue, developerUsername: string) {
    try {
      await assignQAIssueToDeveloper({
        issue_id: issue.id,
        developer_username: developerUsername,
      });
      await loadQAIssues();
      await loadQASummary();
      alert(`Issue assigned to ${developerUsername}`);
    } catch (err: any) {
      alert(err.message || "Failed to assign issue");
    }
  }

  async function handleRetestIssue(issue: QAIssue, testRunId: string) {
    setRetesting(true);
    try {
      const res = await retestQAIssue(issue.id, testRunId);
      await loadQATestRuns();
      await loadQAIssues();
      await loadQASummary();
      alert(`Retest completed: ${res.issue.status.toUpperCase()}`);
    } catch (err: any) {
      alert(err.message || "Failed to retest issue");
    } finally {
      setRetesting(false);
    }
  }

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
      loadRAGData();
      loadPipelineAndTickets();
    }
  }, [authReady, username, loadPipelineAndTickets]);


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
      const registered = projectsList.find(p => (p.root_path || p.path).replace(/\/$/, "") === r.scanned_directory.replace(/\/$/, ""));
      const project = registered || (await importLocalProject(r.scanned_directory)).project;
      setSelectedProjectId(project.id);
      await loadPipelineAndTickets(project.id);
      const allFiles = Object.keys(r.files || {});
      setOpenFiles(new Set(allFiles.length > 0 ? allFiles : r.issues.map(i => i.file)));
      if (r.by_category) {
        setOpenCategories(new Set(Object.keys(r.by_category).map(c => c.toUpperCase())));
      }
      setScanDone(true);
      setLoading(false);

      // If AI Intellectual mode is enabled, immediately run AI comprehension on ALL files!
      if (aiIntellectualScan) {
        setBatchAnalyzing(true);
        const allFilesMap: Record<string, Issue[]> = {};
        for (const iss of r.issues) {
          (allFilesMap[iss.file] = allFilesMap[iss.file] ?? []).push(iss);
        }
        for (const f of allFiles) {
          if (!allFilesMap[f]) allFilesMap[f] = [];
        }
        analyzeAllFiles(r.scanned_directory, allFilesMap, allFiles)
          .then(res => {
            setAiData(res.analyses);
            const newOpen: Record<string, boolean> = {};
            for (const k of Object.keys(res.analyses)) newOpen[k] = true;
            setAiOpen(newOpen);
          })
          .catch(err => {
            console.error("AI Intellectual analysis error:", err);
          })
          .finally(() => {
            setBatchAnalyzing(false);
          });
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Unknown error";
      if (m.includes("401") || m.includes("expired")) { clearSession(); router.replace("/login"); }
      else setError(m);
      setLoading(false);
    }
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
      const allFilesList = Object.keys(report.files || {});
      for (const f of allFilesList) {
        if (!allFilesMap[f]) allFilesMap[f] = [];
      }
      const res = await analyzeAllFiles(report.scanned_directory, allFilesMap, allFilesList);
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

  const allReportFiles = report ? Object.keys(report.files || {}) : [];
  const fileList = report
    ? [...new Set([...report.issues.map(i => i.file), ...allReportFiles])].sort()
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

  // If no category filter is limiting issues, display tested clean files so AI can audit everything
  if (report && activeCategory === "all") {
    for (const f of allReportFiles) {
      if (activeFile === "all" || f === activeFile) {
        const finfo = report.files?.[f];
        const flang = finfo?.language || "Universal";
        if (activeLang === "all" || flang.toLowerCase() === activeLang.toLowerCase()) {
          if (!byFile[f]) {
            byFile[f] = [];
          }
        }
      }
    }
  }

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
          <span style={{ fontSize: "13px", fontWeight: 500 }}>Connecting to workspace…</span>
          <button
            onClick={() => { window.location.replace("/login"); }}
            style={{
              marginTop: "4px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--blue)",
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Go to Sign In
          </button>
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
            {/* MND Ticket Drawer Pill */}
            <button
              type="button"
              onClick={() => setShowTicketsModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "9999px",
                background: "rgba(22, 122, 91, 0.1)",
                border: "1px solid rgba(22, 122, 91, 0.25)",
                color: "var(--sage-primary)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <span>📋</span>
              <span>{ticketsList.length} MND Tickets</span>
            </button>

            {assignedBugs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBugsDrawer(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 12px",
                  borderRadius: "9999px",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#dc2626",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#dc2626" }} />
                {assignedBugs.length} QA Assigned {assignedBugs.length === 1 ? "Bug" : "Bugs"}
              </button>
            )}

            {userRole === "admin" && (
              <button
                type="button"
                className={styles.signOut}
                onClick={() => router.push("/admin")}
                style={{ background: "rgba(22, 122, 91, 0.1)", color: "var(--sage-primary)", borderColor: "rgba(22, 122, 91, 0.25)" }}
              >
                Supervision
              </button>
            )}

            <div className={styles.userChip}>
              <span className={styles.avatar}>{username.charAt(0).toUpperCase()}</span>
              <span className={styles.uname}>{username}</span>
              <span style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: "4px",
                background: "rgba(0,0,0,0.06)",
                color: "var(--text-secondary)",
                letterSpacing: "0.04em",
              }}>
                {userRole}
              </span>
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
        {/* ── Developer Discipline Capabilities Strip ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "16px",
          padding: "10px 18px",
          background: "rgba(255, 255, 255, 0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: "14px",
          border: "1px solid rgba(22, 122, 91, 0.2)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "12.5px" }}>
            <span style={{
              fontWeight: 800,
              color: "#fff",
              background: "linear-gradient(135deg, #167a5b 0%, #10b981 100%)",
              padding: "2px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              letterSpacing: "0.5px",
            }}>
              DEVELOPER ABILITIES
            </span>
            <span style={{ color: "var(--text-secondary)" }}>• Multi-Language AST Analysis</span>
            <span style={{ color: "var(--text-secondary)" }}>• AI Root-Cause Reasoning</span>
            <span style={{ color: "var(--text-secondary)" }}>• Sandboxed Patch &amp; .bak Rollback</span>
            <span style={{ color: "var(--text-secondary)" }}>• Local Unit Sandbox Runner</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAbilitiesModal(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--sage-primary)",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>Compare Role Abilities</span>
            <span>➔</span>
          </button>
        </div>
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
                <motion.button
                  type="button"
                  onClick={handleRunAutonomousPipeline}
                  disabled={pipelineRunning || loading}
                  className={styles.clearBtn}
                  style={{
                    background: "rgba(22, 122, 91, 0.08)",
                    border: "1px solid rgba(22, 122, 91, 0.25)",
                    color: "var(--sage-primary)",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  title="Run automated tests, multi-environment QA, and quality gate"
                >
                  {pipelineRunning ? (
                    <>
                      <span className={styles.btnSpinner} style={{ borderColor: "var(--sage-primary)", borderTopColor: "transparent" }} />
                      Pipeline…
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      Run Pipeline
                    </>
                  )}
                </motion.button>
                {report && (
                  <motion.button type="button" className={styles.clearBtn} onClick={reset}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                    Clear
                  </motion.button>
                )}
              </div>
            </div>

            <div className={styles.scanOptionsRow} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <label className={styles.aiToggleLabel}>
                <input
                  type="checkbox"
                  checked={aiIntellectualScan}
                  onChange={(e) => setAiIntellectualScan(e.target.checked)}
                  style={{ accentColor: "var(--sage-primary)", width: "16px", height: "16px", cursor: "pointer" }}
                />
                <span className={styles.aiToggleBadge}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                    <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8l-.8.8v2.4h-4v-2.4l-.8-.8A4 4 0 0 1 12 2z"/>
                    <path d="M9 18h6"/><path d="M10 22h4"/>
                  </svg>
                  AI Deep Analysis & Auto-Fix Generation
                </span>
              </label>

              {pipelineState && (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontWeight: 700,
                    fontSize: "11px",
                    background: pipelineState.status === "completed" ? "rgba(16, 185, 129, 0.12)" : pipelineState.status === "failed" ? "rgba(239, 68, 68, 0.12)" : "rgba(2, 132, 199, 0.12)",
                    color: pipelineState.status === "completed" ? "#065f46" : pipelineState.status === "failed" ? "#991b1b" : "#0369a1",
                    textTransform: "uppercase",
                  }}>
                    Pipeline: {pipelineState.status}
                  </span>
                  {qualityGate?.verdict && (
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontWeight: 700,
                      fontSize: "11px",
                      background: qualityGate.verdict === "APPROVED" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                      color: qualityGate.verdict === "APPROVED" ? "#065f46" : "#991b1b",
                    }}>
                      Gate: {qualityGate.verdict}
                    </span>
                  )}
                </div>
              )}
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

              {batchAnalyzing && (
                <div className={styles.aiIntellectualActiveBanner}>
                  <div className={styles.aiBtnSpin} />
                  <span>
                    <strong>AI Intellectual Engine Active:</strong> Comprehending every code file in your codebase, determining root causes, and validating repairs in sandbox…
                  </span>
                </div>
              )}

              {/* Tab bar */}
              <motion.div className={styles.tabStrip} variants={fadeUp}>
                {(["issues","categories","rag_memory","letterhead","json","qa_workflow"] as const).map(t => (
                  <button
                    key={t}
                    className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ""}`}
                    onClick={() => {
                      setTab(t);
                      if (t === "rag_memory") loadRAGData();
                      if (t === "qa_workflow") loadAllQAData();
                    }}
                  >
                    {t === "issues" ? "Issues" : t === "categories" ? "Type of Errors & AI Fixes" : t === "rag_memory" ? "RAG Vector Memory" : t === "letterhead" ? "Report" : t === "json" ? "JSON export" : "QA Workflow"}
                    {t === "issues" && <span className={styles.tabBadge}>{report.total_issues}</span>}
                    {t === "categories" && <span className={styles.tabBadge} style={{ background: "rgba(22, 122, 91, 0.45)" }}>{Object.keys(report.by_category).length} Types</span>}
                    {t === "rag_memory" && <span className={styles.tabBadge} style={{ background: "rgba(124, 58, 237, 0.45)" }}>{ragStats?.total_vectors ?? 0} Vectors</span>}
                    {t === "letterhead" && <span className={styles.tabBadge} style={{ background: "rgba(235, 174, 183, 0.4)" }}>Certified</span>}
                    {t === "qa_workflow" && <span className={styles.tabBadge} style={{ background: "rgba(59, 130, 246, 0.45)" }}>{qaSummary?.total_issues ?? 0} Issues</span>}
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
                            const fileLang = issues[0]?.language || report.files?.[file]?.language || "Universal";
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
                                  <span className={issues.length === 0 ? styles.fileCountClean : styles.fileCount}>
                                    {issues.length === 0 ? "Clean Code" : issues.length}
                                  </span>
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
                                    {issues.length === 0 ? (
                                      <div style={{ padding: "12px 18px", fontSize: "12.5px", color: "var(--sage-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                        Zero compiler/syntax defects detected by static scan. AI Intellectual analysis evaluates deep runtime flow.
                                      </div>
                                    ) : (
                                      <>
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
                                              {SEV[issue.severity] ?? issue.severity}
                                            </span>
                                            <span className={styles.iCat}>{issue.category}</span>
                                            <span className={styles.iMsg}>
                                              {issue.message}
                                              {issue.snippet && <code className={styles.iSnippet}>{issue.snippet}</code>}
                                            </span>
                                          </motion.div>
                                        ))}
                                        </>
                                      )}
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

                                      {/* RAG Vector Store Institutional Memory */}
                                      {aiData[file].rag_memories && aiData[file].rag_memories.length > 0 && (
                                        <div className={styles.ragMemorySection}>
                                          <div className={styles.ragMemoryHead}>
                                            <div className={styles.ragMemoryTitle}>
                                              <span className={styles.ragPulseDot} />
                                              Mindora RAG Institutional Memory ({aiData[file].rag_memories.length} matches retrieved from MongoDB)
                                            </div>
                                            <span className={styles.ragSimBadge}>
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <circle cx="12" cy="12" r="10" />
                                                <path d="m9 12 2 2 4-4" />
                                              </svg>
                                              {aiData[file].rag_memories[0]?.similarity_percent ?? 90}% Vector Match
                                            </span>
                                          </div>
                                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                                            The AI Engine recalled proven fixes from previously tested files by engineers to formulate this solution:
                                          </div>
                                          {aiData[file].rag_memories.map((mem, mIdx) => (
                                            <div key={mem.error_id || mIdx} className={styles.ragItemCard}>
                                              <div className={styles.ragItemMeta}>
                                                <span className={styles.ragUserTag}>@{mem.username}</span>
                                                <span>{mem.created_at ? new Date(mem.created_at).toLocaleString() : "Previous Test"}</span>
                                                <span>&middot;</span>
                                                <span style={{ fontWeight: 600 }}>{mem.language}</span>
                                                <span>&middot;</span>
                                                <span style={{ color: "var(--sage-primary)", fontWeight: 600 }}>[{mem.rule}]</span>
                                                {mem.similarity_percent && (
                                                  <span style={{ marginLeft: "auto", color: "var(--sage-primary)", fontWeight: 700 }}>
                                                    {mem.similarity_percent}% Match
                                                  </span>
                                                )}
                                              </div>
                                              <div style={{ fontSize: "12.5px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {mem.message}
                                              </div>
                                              {mem.snippet && (
                                                <div className={styles.ragCodeExcerpt}>
                                                  {mem.snippet}
                                                </div>
                                              )}
                                              {mem.fixed_code && (
                                                <div className={styles.ragFixExcerpt}>
                                                  <strong>Proven Verified Fix:</strong><br />
                                                  {mem.fixed_code.slice(0, 250)}{mem.fixed_code.length > 250 ? "..." : ""}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}

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
                                            <div className={styles.appliedSuccessBanner} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                                <span>Fix applied directly to file! Backup: <code>{appliedSuccess[file].backup}</code> ({appliedSuccess[file].remaining} remaining).</span>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => handleRestoreBackup(appliedSuccess[file].backup, file)}
                                                style={{
                                                  padding: "3px 8px",
                                                  borderRadius: "6px",
                                                  border: "1px solid #f87171",
                                                  background: "#fef2f2",
                                                  color: "#b91c1c",
                                                  fontSize: "11px",
                                                  fontWeight: 700,
                                                  cursor: "pointer",
                                                }}
                                              >
                                                ↺ Restore Backup
                                              </button>
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

                {/* ── RAG VECTOR MEMORY ── */}
                {tab === "rag_memory" && (
                  <motion.div key="rag_memory" className={styles.ragExplorerRoot} variants={slideUp} initial="hidden" animate="visible" exit="exit">
                    {/* RAG Vector Store Stats */}
                    <div className={styles.ragStatGrid}>
                      <div className={styles.ragStatCard}>
                        <div className={styles.ragStatVal} style={{ color: "var(--sage-primary)" }}>
                          {ragStats?.total_vectors ?? 0}
                        </div>
                        <div className={styles.ragStatLbl}>Stored Error Vectors in MongoDB</div>
                      </div>
                      <div className={styles.ragStatCard}>
                        <div className={styles.ragStatVal} style={{ color: "#059669" }}>
                          {ragStats?.dimension ?? 1536}-dim
                        </div>
                        <div className={styles.ragStatLbl}>Vector Embedding Dimension</div>
                      </div>
                      <div className={styles.ragStatCard}>
                        <div className={styles.ragStatVal} style={{ color: "#2563eb" }}>
                          {ragStats?.distinct_languages ?? 0}
                        </div>
                        <div className={styles.ragStatLbl}>Monitored Languages</div>
                      </div>
                      <div className={styles.ragStatCard}>
                        <div className={styles.ragStatVal} style={{ color: "#d97706" }}>
                          {ragStats?.distinct_users ?? 0}
                        </div>
                        <div className={styles.ragStatLbl}>Contributing Engineers</div>
                      </div>
                    </div>

                    {/* Semantic Vector Search Bar */}
                    <form onSubmit={handleRAGSearch} className={styles.ragSearchWrap}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sage-primary)" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <input
                        type="text"
                        className={styles.ragSearchInput}
                        placeholder="Search MongoDB Vector Store by error message, code snippet, bug symptom, or proven fix..."
                        value={ragSearchQuery}
                        onChange={e => setRagSearchQuery(e.target.value)}
                      />
                      <button type="submit" className={styles.ragSearchBtn} disabled={ragSearching}>
                        {ragSearching ? "Searching Vectors..." : "Semantic Search"}
                      </button>
                      {ragSearchResults && (
                        <button
                          type="button"
                          className={styles.codeToggleBtn}
                          onClick={() => { setRagSearchResults(null); setRagSearchQuery(""); }}
                        >
                          Clear
                        </button>
                      )}
                    </form>

                    {/* List of Remembered Error Memories */}
                    <div className={styles.ragMemoryList}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {ragSearchResults ? `Semantic Search Results (${ragSearchResults.length} matches)` : "Recent Tested Error Memories (MongoDB Vector Store)"}
                        </h3>
                        <button className={styles.inlineAiBtn} onClick={loadRAGData}>
                          Refresh Vector Store
                        </button>
                      </div>

                      {(ragSearchResults ?? ragMemories).length === 0 ? (
                        <div className={styles.emptyCard}>
                          <p>No error vectors found matching your search. Test code files in the scanner to build vector memory.</p>
                        </div>
                      ) : (
                        (ragSearchResults ?? ragMemories).map((item) => (
                          <div key={item.error_id} className={styles.ragFullCard}>
                            <div className={styles.ragFullCardHead}>
                              <div className={styles.ragFullTitle}>
                                <span className={styles.ragPulseDot} />
                                <span>{item.file_path}</span>
                                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                                  ({item.language})
                                </span>
                                <span className={`${styles.badge} ${styles[`sev_${item.severity.toLowerCase()}`] || styles.sev_error}`}>
                                  {item.severity}
                                </span>
                                <span style={{ fontSize: "12px", color: "var(--sage-primary)", fontWeight: 600 }}>
                                  [{item.rule}]
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                {item.similarity_percent && (
                                  <span className={styles.ragSimBadge}>
                                    {item.similarity_percent}% Semantic Similarity
                                  </span>
                                )}
                                {item.occurrence_count && item.occurrence_count > 1 && (
                                  <span className={styles.ragOccurrences}>
                                    {item.occurrence_count} Occurrences
                                  </span>
                                )}
                                <span className={styles.ragUserTag}>@{item.username}</span>
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                                </span>
                              </div>
                            </div>

                            <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {item.message}
                            </div>

                            {item.snippet && (
                              <div>
                                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                                  Problematic Code Excerpt
                                </span>
                                <pre className={styles.ragCodeExcerpt}>{item.snippet}</pre>
                              </div>
                            )}

                            {item.root_cause && (
                              <div>
                                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                                  Learned Root Cause Diagnosis
                                </span>
                                <p style={{ fontSize: "12.5px", color: "var(--text-primary)", marginTop: "4px", lineHeight: 1.5 }}>
                                  {item.root_cause}
                                </p>
                              </div>
                            )}

                            {item.fixed_code && (
                              <div>
                                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#065f46" }}>
                                  Proven Verified Solution
                                </span>
                                <pre className={styles.ragFixExcerpt}>{item.fixed_code}</pre>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
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
                              <span className={issues.length === 0 ? styles.fileCountClean : styles.fileCount}>
                                {issues.length === 0 ? "Clean Code" : `${issues.length} Issues`}
                              </span>
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
                            {/* Issues Table or Clean Banner */}
                            {issues.length > 0 ? (
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
                            ) : (
                              <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", fontSize: "12.5px", color: "#047857", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Deterministic AST Verification: Zero compiler or syntax defects detected. Full AI intellectual code comprehension active.
                              </div>
                            )}

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

                {/* ── QA WORKFLOW ── */}
                {tab === "qa_workflow" && (
                  <motion.div key="qa_workflow" className={styles.card} variants={slideUp} initial="hidden" animate="visible" exit="exit">
                    <div className={styles.cardHead}>
                      <h2 className={styles.cardTitle}>QA Workflow: Project → Create Tests → Run Tests → Fix Issues</h2>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button className={styles.batchAiBtn} onClick={loadAllQAData} disabled={qaLoading}>
                          {qaLoading ? (
                            <><span className={styles.aiBtnSpin}/> Loading…</>
                          ) : (
                            <>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                              </svg>
                              Refresh
                            </>
                          )}
                        </button>
                        <button className={styles.printBtn} onClick={() => setShowCreateTestCaseModal(true)}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          + Create Test Case
                        </button>
                      </div>
                    </div>

                    {/* QA Sub-tabs */}
                    <div className={styles.tabStrip} style={{ marginBottom: "16px" }}>
                      {(["test_cases", "test_runs", "issues", "summary"] as const).map(t => (
                        <button
                          key={t}
                          className={`${styles.tabBtn} ${qaActiveTab === t ? styles.tabActive : ""}`}
                          onClick={() => setQAActiveTab(t)}
                        >
                          {t === "test_cases" && "🧪 Test Cases"}
                          {t === "test_runs" && "▶️ Test Runs"}
                          {t === "issues" && "🐛 Issues"}
                          {t === "summary" && "📊 Summary"}
                          {t === "test_cases" && <span className={styles.tabBadge}>{qaTestCases.length}</span>}
                          {t === "test_runs" && <span className={styles.tabBadge}>{qaTestRuns.length}</span>}
                          {t === "issues" && <span className={styles.tabBadge} style={{ background: "rgba(239, 68, 68, 0.45)" }}>{qaIssues.length}</span>}
                          {t === "summary" && <span className={styles.tabBadge} style={{ background: "rgba(59, 130, 246, 0.45)" }}>{qaSummary?.total_issues ?? 0}</span>}
                        </button>
                      ))}
                    </div>

                    {/* Test Cases Tab */}
                    {qaActiveTab === "test_cases" && (
                      <div className={styles.qaTabContent}>
                        {qaTestCases.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "12px", opacity: 0.4 }}>
                              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/>
                            </svg>
                            <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>No test cases created yet</p>
                            <p style={{ fontSize: "13px", marginBottom: "16px" }}>Create your first test case to start the QA workflow</p>
                            <button className={styles.printBtn} onClick={() => setShowCreateTestCaseModal(true)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                              </svg>
                              Create Test Case
                            </button>
                          </div>
                        ) : (
                          <div className={styles.qaList}>
                            {qaTestCases.map(tc => (
                              <div key={tc.id} className={styles.qaItem}>
                                <div className={styles.qaItemHeader}>
                                  <div>
                                    <span className={styles.qaItemId}>{tc.id}</span>
                                    <h4 className={styles.qaItemTitle}>{tc.title}</h4>
                                  </div>
                                  <span className={`${styles.qaTypeBadge} ${styles[`qaType_${tc.test_type}`]}`}>
                                    {tc.test_type.toUpperCase()}
                                  </span>
                                </div>
                                <div className={styles.qaItemMeta}>
                                  <span>📁 {tc.target_file}</span>
                                  <span>👤 {tc.created_by}</span>
                                  <span>📅 {new Date(tc.created_at).toLocaleDateString()}</span>
                                </div>
                                {tc.description && <p className={styles.qaItemDesc}>{tc.description}</p>}
                                <div className={styles.qaItemActions}>
                                  <button
                                    className={styles.qaActionBtn}
                                    onClick={() => handleRunTestCase(tc)}
                                    disabled={runningTest}
                                  >
                                    {runningTest ? "Running…" : "▶️ Run Test"}
                                  </button>
                                  {tc.steps && tc.steps.length > 0 && (
                                    <details style={{ fontSize: "12px" }}>
                                      <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>View Steps</summary>
                                      <pre style={{ marginTop: "8px", fontFamily: "inherit", whiteSpace: "pre-wrap" }}>
                                        {tc.steps.map((s, i) => `${i+1}. ${s}`).join("\n")}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Test Runs Tab */}
                    {qaActiveTab === "test_runs" && (
                      <div className={styles.qaTabContent}>
                        {qaTestRuns.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                            <p style={{ fontSize: "14px" }}>No test runs yet. Run a test case to see results here.</p>
                          </div>
                        ) : (
                          <div className={styles.qaList}>
                            {qaTestRuns.map(tr => (
                              <div key={tr.id} className={styles.qaItem}>
                                <div className={styles.qaItemHeader}>
                                  <div>
                                    <span className={styles.qaItemId}>{tr.id}</span>
                                    <h4 className={styles.qaItemTitle}>
                                      <span className={`${styles.qaStatusBadge} ${styles[`qaStatus_${tr.status}`]}`}>
                                        {tr.status.toUpperCase()}
                                      </span>
                                      Test Run
                                    </h4>
                                  </div>
                                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                    {tr.duration_ms}ms
                                  </span>
                                </div>
                                <div className={styles.qaItemMeta}>
                                  <span>📋 Test Case: {tr.test_case_id}</span>
                                  <span>👤 {tr.executed_by}</span>
                                  <span>📅 {new Date(tr.created_at).toLocaleString()}</span>
                                </div>
                                {tr.error_message && (
                                  <div className={styles.qaItemError}>
                                    <strong>Error:</strong> {tr.error_message}
                                  </div>
                                )}
                                {tr.output && (
                                  <details style={{ fontSize: "11px" }}>
                                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>View Output</summary>
                                    <pre style={{ marginTop: "8px", background: "rgba(0,0,0,0.03)", padding: "8px", borderRadius: "6px", overflowX: "auto" }}>
                                      {tr.output}
                                    </pre>
                                  </details>
                                )}
                                {tr.stack_trace && (
                                  <details style={{ fontSize: "11px" }}>
                                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>View Stack Trace</summary>
                                    <pre style={{ marginTop: "8px", background: "rgba(0,0,0,0.03)", padding: "8px", borderRadius: "6px", overflowX: "auto" }}>
                                      {tr.stack_trace}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Issues Tab */}
                    {qaActiveTab === "issues" && (
                      <div className={styles.qaTabContent}>
                        {qaIssues.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                            <p style={{ fontSize: "14px" }}>No issues found. Run tests to auto-create issues from failures.</p>
                          </div>
                        ) : (
                          <div className={styles.qaList}>
                            {qaIssues.map(issue => (
                              <div key={issue.id} className={styles.qaItem}>
                                <div className={styles.qaItemHeader}>
                                  <div>
                                    <span className={styles.qaItemId}>{issue.id}</span>
                                    <h4 className={styles.qaItemTitle}>{issue.title}</h4>
                                  </div>
                                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <span className={`${styles.qaSeverityBadge} ${styles[`qaSev_${issue.severity}`]}`}>
                                      {issue.severity.toUpperCase()}
                                    </span>
                                    <span className={`${styles.qaStatusBadge} ${styles[`qaStatus_${issue.status}`]}`}>
                                      {issue.status.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                <div className={styles.qaItemMeta}>
                                  <span>📁 {issue.target_file}</span>
                                  {issue.target_line && <span>📍 Line: {issue.target_line}</span>}
                                  <span>👤 Reported by: {issue.reported_by}</span>
                                  {issue.assigned_developer && <span>👨‍💻 Assigned: {issue.assigned_developer}</span>}
                                  <span>📅 {new Date(issue.created_at).toLocaleString()}</span>
                                </div>
                                <p className={styles.qaItemDesc}>{issue.description}</p>
                                {issue.steps_to_reproduce && (
                                  <details style={{ fontSize: "12px" }}>
                                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>Reproduction Steps</summary>
                                    <pre style={{ marginTop: "8px", fontFamily: "inherit", whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>
                                      {issue.steps_to_reproduce}
                                    </pre>
                                  </details>
                                )}
                                {issue.error_logs && (
                                  <details style={{ fontSize: "11px" }}>
                                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>Error Logs</summary>
                                    <pre style={{ marginTop: "8px", background: "rgba(239, 68, 68, 0.05)", padding: "8px", borderRadius: "6px", overflowX: "auto" }}>
                                      {issue.error_logs}
                                    </pre>
                                  </details>
                                )}
                                <div className={styles.qaItemActions}>
                                  {issue.status === "open" && registeredUsers.filter(u => u.role === "developer").map(dev => (
                                    <button
                                      key={dev.username}
                                      className={styles.qaActionBtn}
                                      onClick={() => handleAssignIssueToDeveloper(issue, dev.username)}
                                    >
                                      Assign to {dev.username}
                                    </button>
                                  ))}
                                  {issue.status === "open" && issue.assigned_developer && (
                                    <button
                                      className={styles.qaActionBtn}
                                      onClick={() => handleUpdateIssueStatus(issue, "in_progress", "Developer started working on the fix")}
                                    >
                                      Start Fix (In Progress)
                                    </button>
                                  )}
                                  {issue.status === "in_progress" && (
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      <textarea
                                        value={fixCode}
                                        onChange={e => setFixCode(e.target.value)}
                                        placeholder="Paste fixed code here..."
                                        style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid rgba(0,0,0,0.1)", fontFamily: "monospace", fontSize: "12px", minHeight: "80px" }}
                                      />
                                      <input
                                        value={fixSummary}
                                        onChange={e => setFixSummary(e.target.value)}
                                        placeholder="Fix summary (required)"
                                        style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(0,0,0,0.1)", fontSize: "12px" }}
                                      />
                                      <button
                                        className={styles.qaActionBtn}
                                        style={{ background: "linear-gradient(135deg, #167a5b 0%, #0d5e45 100%)" }}
                                        onClick={() => handleUpdateIssueStatus(issue, "fixed", fixSummary, fixCode, fixSummary)}
                                        disabled={applyingFixToIssue || !fixSummary.trim()}
                                      >
                                        {applyingFixToIssue ? "Applying Fix…" : "✅ Submit Fix"}
                                      </button>
                                    </div>
                                  )}
                                  {issue.status === "fixed" && (
                                    <button
                                      className={styles.qaActionBtn}
                                      style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
                                      onClick={() => handleUpdateIssueStatus(issue, "retest", "Moving to retest after fix applied")}
                                    >
                                      🔄 Start Retest
                                    </button>
                                  )}
                                  {issue.status === "retest" && (
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      <select
                                        value={selectedRetestRun?.id || ""}
                                        onChange={e => setSelectedRetestRun(qaTestRuns.find(r => r.id === e.target.value) || null)}
                                        style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(0,0,0,0.1)", fontSize: "12px" }}
                                      >
                                        <option value="">Select test run to retest with</option>
                                        {qaTestRuns.filter(r => r.test_case_id === issue.test_case_id).map(r => (
                                          <option key={r.id} value={r.id}>{r.id} ({r.status})</option>
                                        ))}
                                      </select>
                                      <button
                                        className={styles.qaActionBtn}
                                        style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
                                        onClick={() => selectedRetestRun && handleRetestIssue(issue, selectedRetestRun.id)}
                                        disabled={retesting || !selectedRetestRun}
                                      >
                                        {retesting ? "Retesting…" : "▶️ Run Retest"}
                                      </button>
                                    </div>
                                  )}
                                  {issue.status === "verified" && (
                                    <button
                                      className={styles.qaActionBtn}
                                      style={{ background: "linear-gradient(135deg, #167a5b 0%, #0d5e45 100%)" }}
                                      onClick={() => handleUpdateIssueStatus(issue, "closed", "QA verified - closing issue")}
                                    >
                                      ✅ Close Issue
                                    </button>
                                  )}
                                  {issue.status === "closed" && (
                                    <button
                                      className={styles.qaActionBtn}
                                      style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" }}
                                      onClick={() => handleUpdateIssueStatus(issue, "reopened", "Reopening - issue still exists")}
                                    >
                                      🔄 Reopen Issue
                                    </button>
                                  )}
                                  {issue.status === "reopened" && (
                                    <button
                                      className={styles.qaActionBtn}
                                      onClick={() => handleUpdateIssueStatus(issue, "in_progress", "Reopening - developer to investigate")}
                                    >
                                      🔧 Back to In Progress
                                    </button>
                                  )}
                                </div>

                                {/* History */}
                                {issue.history && issue.history.length > 0 && (
                                  <details style={{ marginTop: "12px", fontSize: "11px" }}>
                                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontWeight: 600 }}>History</summary>
                                    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                                      {issue.history.slice().reverse().map(h => (
                                        <div key={h.id} style={{ padding: "8px", background: "rgba(0,0,0,0.02)", borderRadius: "6px", fontSize: "11px" }}>
                                          <span style={{ fontWeight: 700, color: "var(--sage-primary)" }}>{h.action}</span>
                                          {h.from_status && <span style={{ margin: "0 8px" }}>{h.from_status} → {h.to_status}</span>}
                                          <span style={{ color: "var(--text-secondary)" }}>{h.actor} • {new Date(h.timestamp).toLocaleString()}</span>
                                          {h.notes && <div style={{ marginTop: "4px", color: "var(--text-secondary)" }}>{h.notes}</div>}
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Summary Tab */}
                    {qaActiveTab === "summary" && qaSummary && (
                      <div className={styles.qaTabContent}>
                        <div className={styles.metrics} style={{ marginBottom: "24px" }}>
                          {[
                            { label: "Total Issues", val: qaSummary.total_issues, accent: "neutral" },
                            { label: "Open", val: qaSummary.open_issues, accent: "blue" },
                            { label: "In Progress", val: qaSummary.in_progress_issues, accent: "orange" },
                            { label: "Fixed", val: qaSummary.fixed_issues, accent: "sage" },
                            { label: "Retest", val: qaSummary.retest_issues, accent: "blue" },
                            { label: "Verified", val: qaSummary.verified_issues, accent: "sage" },
                            { label: "Closed", val: qaSummary.closed_issues, accent: "neutral" },
                            { label: "Reopened", val: qaSummary.reopened_issues, accent: "red" },
                          ].map(({ label, val, accent }) => (
                            <div key={label} className={`${styles.metricCard} ${styles[`m_${accent}`]}`}>
                              <span className={styles.metricVal}><Counter to={val}/></span>
                              <span className={styles.metricLabel}>{label}</span>
                              <div className={`${styles.metricBar} ${styles[`mb_${accent}`]}`}/>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                          <div className={styles.card} style={{ padding: "16px" }}>
                            <h4 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>By Severity</h4>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {["critical", "high", "medium", "low"].map(s => {
                                  const key = `${s}_issues` as keyof QAWorkflowSummary;
                                  const val = qaSummary[key];
                                  return (
                                    <div key={s} style={{ display: "flex", justifyContent: "space-between" }}>
                                      <span className={`${styles.qaSeverityBadge} ${styles[`qaSev_${s}`]}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
                                        {s.toUpperCase()}
                                      </span>
                                      <strong>{typeof val === "number" ? val : 0}</strong>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>

                          <div className={styles.card} style={{ padding: "16px" }}>
                            <h4 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>Status Flow</h4>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", fontSize: "11px" }}>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_open}`}>Open</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_in_progress}`}>In Progress</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_fixed}`}>Fixed</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_retest}`}>Retest</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_verified}`}>Verified</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_closed}`}>Closed</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              <span className={`${styles.qaStatusBadge} ${styles.qaStatus_reopened}`}>Reopened</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
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
              Select or browse your project directory above, then click{" "}
              <strong>Run scan</strong>. Mindora analyzes source files across all supported languages, detects syntax and runtime defects, and synthesizes verified AI fixes.
            </motion.p>
            <motion.div className={styles.featureGrid} variants={stagger}>
              {[
                ["Multi-Language Static Analysis", "Deterministic syntax and defect analysis across Python, JS, TS, Java, Go, Rust, C/C++, and SQL"],
                ["AI Root Cause Reasoning", "Deep contextual failure analysis powered by LLM reasoning with file retrieval"],
                ["Verified Sandbox Fixes",  "Automated patch generation with syntax validation and rollback protection (.bak)"],
                ["Quality Gate & Testing",  "Integrated test runner, multi-environment QA validation, and release gatekeeping"],
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

      {/* ── Assigned Bugs Drawer for Developers ── */}
      <AnimatePresence>
        {showBugsDrawer && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 99,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              style={{
                width: "100%",
                maxWidth: "600px",
                height: "100%",
                background: "linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)",
                boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.15)",
                display: "flex",
                flexDirection: "column",
                padding: "28px",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700 }}>Assigned Bugs from QA</h3>
                  <p style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                    {assignedBugs.length} defect(s) assigned to you for investigation and fix.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowBugsDrawer(false); setSelectedBugForFix(null); }}
                  style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "var(--text-secondary)" }}
                >
                  ✕
                </button>
              </div>

              {!selectedBugForFix ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {assignedBugs.map(bug => (
                    <div
                      key={bug.id}
                      style={{
                        padding: "16px",
                        borderRadius: "14px",
                        background: "rgba(255, 255, 255, 0.8)",
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "monospace", color: "#dc2626" }}>
                            {bug.id}
                          </span>
                          <h4 style={{ fontSize: "15px", fontWeight: 700 }}>{bug.title}</h4>
                        </div>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: bug.severity === "critical" ? "#fee2e2" : "#fef3c7",
                          color: bug.severity === "critical" ? "#b91c1c" : "#b45309",
                        }}>
                          {bug.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "10px" }}>
                        File: <code>{bug.target_file}</code> | Reported by: {bug.reported_by}
                      </div>
                      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                        {bug.description}
                      </p>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBugForFix(bug);
                            handleAIBugAnalyze(bug.id);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "8px",
                            background: "linear-gradient(135deg, #167a5b 0%, #0d5e45 100%)",
                            color: "#fff",
                            border: "none",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Resolve & Submit Fix
                        </button>
                      </div>
                    </div>
                  ))}
                  {assignedBugs.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                      No open bugs assigned to your queue!
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedBugForFix(null); setAiBugAnalysis(null); }}
                    style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--sage-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  >
                    ← Back to Bug List
                  </button>

                  <div style={{ background: "rgba(0, 0, 0, 0.03)", padding: "14px", borderRadius: "10px" }}>
                    <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>{selectedBugForFix.title}</h4>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                      Target: <code>{selectedBugForFix.target_file}</code>
                    </div>
                    <div style={{ fontSize: "12.5px", marginBottom: "6px" }}>
                      <strong>Reproduction Steps:</strong>
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {selectedBugForFix.steps_to_reproduce}
                      </pre>
                    </div>
                    {selectedBugForFix.logs && (
                      <div style={{ fontSize: "12px" }}>
                        <strong>Error Logs:</strong>
                        <pre style={{ background: "rgba(0,0,0,0.05)", padding: "6px 10px", borderRadius: "6px", fontFamily: "monospace", overflowX: "auto" }}>
                          {selectedBugForFix.logs}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* AI Root-Cause Assistance */}
                  <div style={{ background: "rgba(22, 122, 91, 0.06)", border: "1px solid rgba(22, 122, 91, 0.2)", borderRadius: "12px", padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--sage-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        AI & RAG Root-Cause Assistance
                      </span>
                      {aiBugLoading && <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Analyzing codebase & memory…</span>}
                    </div>
                    {aiBugAnalysis && (
                      <div style={{ fontSize: "12.5px" }}>
                        <p><strong>Root Cause:</strong> {aiBugAnalysis.root_cause}</p>
                        <p style={{ marginTop: "6px" }}><strong>Fix Strategy:</strong> {aiBugAnalysis.fix_strategy}</p>
                        {aiBugAnalysis.rag_memories_found > 0 && (
                          <div style={{ marginTop: "8px", padding: "6px 10px", background: "rgba(16, 185, 129, 0.1)", borderRadius: "6px", fontSize: "11.5px", color: "#065f46" }}>
                            Retrieved {aiBugAnalysis.rag_memories_found} matching historical fix pattern(s) from MongoDB Vector Store.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Fix Submission Form */}
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "6px" }}>
                      Fix Explanation (Sent to QA for validation)
                    </label>
                    <textarea
                      rows={3}
                      value={devFixExplanation}
                      onChange={e => setDevFixExplanation(e.target.value)}
                      placeholder="Identified boundary condition zero-divisor edge case and inserted guard check..."
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: "13px",
                        fontFamily: "inherit",
                        marginBottom: "12px",
                      }}
                      required
                    />

                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "6px" }}>
                      Complete Replacement File (Required, not a diff or snippet)
                    </label>
                    <textarea
                      rows={6}
                      value={devFixedCode}
                      onChange={e => setDevFixedCode(e.target.value)}
                      placeholder="def calculate(...):"
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: "12px",
                        fontFamily: "monospace",
                        marginBottom: "16px",
                      }}
                    />

                    <button
                      type="button"
                      disabled={submittingFix || !devFixExplanation.trim() || !devFixedCode.trim() || !workflow.items.find(i => i.id === selectedBugForFix.id)?.allowed_actions.includes("FIXED")}
                      onClick={() => handleSubmitBugFix(selectedBugForFix.id)}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "10px",
                        background: "linear-gradient(135deg, #167a5b 0%, #0d5e45 100%)",
                        color: "#fff",
                        border: "none",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {submittingFix ? "Submitting Fix to QA…" : "Submit Fix to QA Quality Gate"}
                    </button>
                  </div>
                  <WorkflowDetails key={selectedBugForFix.id} id={selectedBugForFix.id} role={userRole} styles={styles} onChanged={() => void workflow.refresh()} showFixEditor={false} />
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* ── MND Tickets Drawer (Developer / Cross-Department) ── */}
      <AnimatePresence>
        {showTicketsModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 99,
              display: "flex",
              justifyContent: "flex-end",
            }}
            onClick={() => setShowTicketsModal(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "680px",
                height: "100%",
                background: "linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)",
                boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.15)",
                display: "flex",
                flexDirection: "column",
                padding: "28px",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <div>
                  <h3 style={{ fontSize: "19px", fontWeight: 800 }}>Mindora Ticket System (MND-XXXX)</h3>
                  <p style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                    Enterprise lifecycle tracking: Dev Fix → Automated Test → QA Multi-Env → Release
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setShowNewTicketModal(true)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      background: "var(--sage-primary)",
                      color: "#fff",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + New Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTicketsModal(false)}
                    style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-secondary)" }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <WorkflowUpdates workflow={workflow} onSelect={setSelectedWorkflowId} />
              {selectedWorkflowId && <div>
                <button type="button" onClick={() => setSelectedWorkflowId(null)}>Back to tickets</button>
                <WorkflowDetails key={selectedWorkflowId} id={selectedWorkflowId} role={userRole} styles={styles} onChanged={() => void workflow.refresh()} />
              </div>}
              {ticketsLoading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>Loading tickets…</div>
              ) : ticketsList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                  No active MND tickets found for this project. Click <strong>+ New Ticket</strong> to file a tracked issue!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {ticketsList.map(t => {
                    const statusColorMap: Record<string, { bg: string; text: string }> = {
                      OPEN: { bg: "rgba(239, 68, 68, 0.1)", text: "#b91c1c" },
                      DEVELOPER_IN_PROGRESS: { bg: "rgba(245, 158, 11, 0.12)", text: "#b45309" },
                      READY_FOR_TEST: { bg: "rgba(59, 130, 246, 0.12)", text: "#1d4ed8" },
                      TESTING: { bg: "rgba(124, 58, 237, 0.12)", text: "#6d28d9" },
                      READY_FOR_QA: { bg: "rgba(14, 165, 233, 0.12)", text: "#0369a1" },
                      QA_APPROVED: { bg: "rgba(16, 185, 129, 0.15)", text: "#065f46" },
                      RELEASED: { bg: "rgba(16, 185, 129, 0.25)", text: "#064e3b" },
                      TEST_FAILED: { bg: "rgba(239, 68, 68, 0.15)", text: "#991b1b" },
                      QA_REJECTED: { bg: "rgba(239, 68, 68, 0.15)", text: "#991b1b" },
                    };
                    const sc = statusColorMap[t.status] || { bg: "rgba(0,0,0,0.06)", text: "#374151" };

                    return (
                      <div
                        key={t.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.9)",
                          border: "1px solid rgba(0, 0, 0, 0.08)",
                          borderRadius: "14px",
                          padding: "16px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <span style={{ fontSize: "11px", fontWeight: 800, fontFamily: "monospace", color: "var(--sage-primary)" }}>
                              {t.id}
                            </span>
                            <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "2px 0 4px 0" }}>{t.title}</h4>
                          </div>
                          <span style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: sc.bg,
                            color: sc.text,
                            textTransform: "uppercase",
                          }}>
                            {t.workflow_status.replace(/_/g, " ")}
                          </span>
                        </div>

                        <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                          {t.description}
                        </p>

                        {t.target_file && (
                          <div style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                            Target: <code>{t.target_file}</code>
                          </div>
                        )}

                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: "10px",
                          borderTop: "1px solid rgba(0,0,0,0.06)",
                          flexWrap: "wrap",
                          gap: "8px",
                          fontSize: "11.5px",
                        }}>
                          <div style={{ display: "flex", gap: "10px", color: "var(--text-secondary)" }}>
                            <span>Dev: <strong>{t.assigned_developer || "Unassigned"}</strong></span>
                            <span>Tester: <strong>{t.assigned_tester || "Unassigned"}</strong></span>
                            <span>QA: <strong>{t.assigned_qa || "Unassigned"}</strong></span>
                          </div>

                          <div style={{ display: "flex", gap: "6px" }}>
                            <button type="button" onClick={() => setSelectedWorkflowId(t.id)} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#dbeafe", color: "#1d4ed8", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>View details & actions</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Create Ticket Modal ── */}
      <AnimatePresence>
        {showNewTicketModal && (
          <div className={styles.modalBackdrop} onClick={() => setShowNewTicketModal(false)}>
            <motion.div
              className={styles.modalBox}
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className={styles.modalHead}>
                <div className={styles.modalTitle}>File New Enterprise Ticket (MND-XXXX)</div>
                <button type="button" className={styles.closeX} onClick={() => setShowNewTicketModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateTicket} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Ticket Title
                  </label>
                  <input
                    type="text"
                    value={newTicketTitle}
                    onChange={e => setNewTicketTitle(e.target.value)}
                    placeholder="e.g. ZeroDivisionError in math utility function"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Description & Observations
                  </label>
                  <textarea
                    rows={3}
                    value={newTicketDesc}
                    onChange={e => setNewTicketDesc(e.target.value)}
                    placeholder="Provide root-cause observations, stack traces or behavior..."
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px", fontFamily: "inherit" }}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Severity</label>
                    <select
                      value={newTicketSeverity}
                      onChange={e => setNewTicketSeverity(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12.5px" }}
                    >
                      <option value="critical">Critical (Release blocker)</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                      <option value="trivial">Trivial</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Priority</label>
                    <select
                      value={newTicketPriority}
                      onChange={e => setNewTicketPriority(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12.5px" }}
                    >
                      <option value="critical">P0 - Critical</option>
                      <option value="high">P1 - High</option>
                      <option value="medium">P2 - Medium</option>
                      <option value="low">P3 - Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Target File (Optional)</label>
                  <input
                    type="text"
                    value={newTicketFile}
                    onChange={e => setNewTicketFile(e.target.value)}
                    placeholder="calc.py or src/index.ts"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12.5px", fontFamily: "monospace" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowNewTicketModal(false)}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", background: "transparent", cursor: "pointer", fontSize: "13px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingTicket || !newTicketTitle.trim()}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: "var(--sage-primary)",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: submittingTicket ? "not-allowed" : "pointer",
                    }}
                  >
                    {submittingTicket ? "Creating…" : "Create MND Ticket"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Create Test Case Modal ── */}
      <AnimatePresence>
        {showCreateTestCaseModal && (
          <div className={styles.modalBackdrop} onClick={() => setShowCreateTestCaseModal(false)}>
            <motion.div
              className={styles.modalBox}
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className={styles.modalHead}>
                <div className={styles.modalTitle}>Create QA Test Case</div>
                <button type="button" className={styles.closeX} onClick={() => setShowCreateTestCaseModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateTestCase} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Test Case Title
                  </label>
                  <input
                    type="text"
                    value={newTestCaseTitle}
                    onChange={e => setNewTestCaseTitle(e.target.value)}
                    placeholder="e.g. Test division by zero handling"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={newTestCaseDesc}
                    onChange={e => setNewTestCaseDesc(e.target.value)}
                    placeholder="What does this test verify?"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px", fontFamily: "inherit" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Target File
                  </label>
                  <input
                    type="text"
                    value={newTestCaseFile}
                    onChange={e => setNewTestCaseFile(e.target.value)}
                    placeholder="calc.py or src/index.ts"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12.5px", fontFamily: "monospace" }}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Test Type</label>
                    <select
                      value={newTestCaseType}
                      onChange={e => setNewTestCaseType(e.target.value as any)}
                      style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12.5px" }}
                    >
                      <option value="unit">Unit Test</option>
                      <option value="integration">Integration Test</option>
                      <option value="e2e">E2E Test</option>
                      <option value="manual">Manual Test</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                      <button
                        type="button"
                        onClick={handleGenerateAITestCases}
                        disabled={creatingTestCase || !newTestCaseFile.trim() || !selectedProjectId}
                        style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid var(--sage-primary)", background: "rgba(22, 122, 91, 0.1)", color: "var(--sage-primary)", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ verticalAlign: "middle", marginRight: "4px" }}>
                          <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8l-.8.8v2.4h-4v-2.4l-.8-.8A4 4 0 0 1 12 2z"/>
                          <path d="M9 18h6"/><path d="M10 22h4"/>
                        </svg>
                        Generate with AI
                      </button>
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Test Code (Optional - for automated tests)
                  </label>
                  <textarea
                    rows={4}
                    value={newTestCaseCode}
                    onChange={e => setNewTestCaseCode(e.target.value)}
                    placeholder="Enter test code here (pytest, jest, etc.)"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12px", fontFamily: "monospace" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Steps (one per line - for manual tests)
                  </label>
                  <textarea
                    rows={3}
                    value={newTestCaseSteps}
                    onChange={e => setNewTestCaseSteps(e.target.value)}
                    placeholder="1. Navigate to login page
2. Enter invalid credentials
3. Click login
4. Verify error message appears"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "12px", fontFamily: "monospace" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Expected Result
                  </label>
                  <input
                    type="text"
                    value={newTestCaseExpected}
                    onChange={e => setNewTestCaseExpected(e.target.value)}
                    placeholder="Error message 'Invalid credentials' should be displayed"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateTestCaseModal(false)}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", background: "transparent", cursor: "pointer", fontSize: "13px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingTestCase || !newTestCaseTitle.trim() || !newTestCaseFile.trim()}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: "var(--sage-primary)",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: creatingTestCase ? "not-allowed" : "pointer",
                    }}
                  >
                    {creatingTestCase ? "Creating…" : "Create Test Case"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Engineering Roles & Abilities Modal ── */}
      <RoleAbilitiesModal
        isOpen={showAbilitiesModal}
        onClose={() => setShowAbilitiesModal(false)}
        currentRole={userRole}
      />

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
