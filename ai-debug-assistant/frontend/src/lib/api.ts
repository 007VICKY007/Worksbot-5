import type {
  Report,
  AIAnalysis,
  Issue,
  ApplyFixResult,
  VerifyFixResult,
  UploadedProjectResult,
  RAGMemoryItem,
  RAGStats,
  Project,
  TestPlan,
  TestCase,
  TestRun,
  TestResult,
  Bug,
  QAReport,
  TesterReport,
  AuditEvent,
  DepartmentOverview,
  ProjectFile,
  FileTestExecutionResult,
  ProjectAnalysis,
  Ticket,
  QAMultiEnvRun,
  QualityGateVerdict,
  GitHubUser,
  GitHubRepo,
  PipelineRunState,
  WorkflowItem,
  WorkflowSummary,
  WorkflowNotification,
  WorkflowStatus,
  QATestCase,
  QATestRun,
  QAIssue,
  QAWorkflowSummary,
  QAWorkflowStatus,
  CreateTestCaseRequest,
  CreateTestRunRequest,
  UpdateIssueStatusRequest,
  AssignDeveloperRequest,
} from "./types";
import { clearSession, getToken } from "./auth";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** API base URL. When both the configured API and the page are on loopback, reuse the page's
 *  hostname so "localhost" (may resolve to IPv6 ::1) never targets a backend bound to 127.0.0.1. */
function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001").replace(/\/+$/, "");
  if (typeof window === "undefined") return configured;
  try {
    const api = new URL(configured);
    if (LOOPBACK_HOSTS.has(api.hostname) && LOOPBACK_HOSTS.has(window.location.hostname)) {
      api.hostname = window.location.hostname;
      return api.toString().replace(/\/+$/, "");
    }
  } catch {
    /* fall through to configured value */
  }
  return configured;
}

const BASE = resolveApiBase();

export function apiMode(): "local" | "live" {
  let api: URL;
  try {
    api = new URL((process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001").replace(/\/+$/, ""));
  } catch {
    return "live";
  }
  return LOOPBACK_HOSTS.has(api.hostname) ? "local" : "live";
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

let redirectingToLogin = false;

function expireSession(): never {
  clearSession();
  if (typeof window !== "undefined" && !redirectingToLogin) {
    redirectingToLogin = true;
    // The admin portal has its own sign-in form and must be remounted.
    window.location.replace(window.location.pathname.startsWith("/admin") ? "/admin" : "/login");
  }
  throw new SessionExpiredError();
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) expireSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response, requiresAuth = true): Promise<T> {
  if (requiresAuth && res.status === 401) expireSession();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Server error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password }),
  });
  return handleResponse(res, false);
}

export async function loginWithGoogle(
  credential: string,
  role?: string,
): Promise<{ token: string; username: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, ...(role ? { role } : {}) }),
  });
  return handleResponse(res, false);
}

export interface UserRecord {
  username: string;
  role: string;
  registered_at?: string;
}

export async function registerUser(
  username: string,
  password: string,
  role = "developer",
): Promise<{ token: string; user: UserRecord; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password, role }),
  });
  return handleResponse(res, false);
}

export async function fetchRegisteredUsers(): Promise<{ users: UserRecord[] }> {
  const res = await fetch(`${BASE}/api/auth/public-users`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse(res, false);
}

// ── Directory browser ─────────────────────────────────────────────────────────

export interface BrowseResult {
  current: string;
  parent:  string | null;
  items:   { name: string; path: string }[];
}

export async function browseDirectory(path: string): Promise<BrowseResult> {
  const res = await fetch(
    `${BASE}/api/browse?path=${encodeURIComponent(path)}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}


// ── Scan ──────────────────────────────────────────────────────────────────────


export async function uploadLocalProject(
  files: File[],
  projectName: string,
): Promise<{ directory: string; message?: string }> {
  if (files.length === 0) {
    throw new Error("No project files selected.");
  }

  const token = getToken();

  if (!token) {
    expireSession();
  }

  const formData = new FormData();
  formData.append("project_name", projectName);

  for (const file of files) {
    if (!file.webkitRelativePath) {
      throw new Error(
        `Missing relative path for ${file.name}. Please select the folder again.`,
      );
    }

    formData.append("files", file, file.webkitRelativePath);
  }

  const response = await fetch(`${BASE}/api/projects/upload-local`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return handleResponse(response);
}


export async function scanDirectory(directory: string): Promise<Report> {
  const res = await fetch(`${BASE}/api/scan`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ directory }),
  });
  return handleResponse(res);
}

export async function scanWithAiDeep(directory: string): Promise<Report & { ai_analyses?: Record<string, AIAnalysis> }> {
  const res = await fetch(`${BASE}/api/scan-ai-deep`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({ directory }),
  });
  return handleResponse(res);
}

// ── AI analyze ────────────────────────────────────────────────────────────────

export async function analyzeFile(
  scannedDirectory: string,
  file: string,
  issues: Issue[],
): Promise<AIAnalysis> {
  const res = await fetch(`${BASE}/api/analyze`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({
      scanned_directory: scannedDirectory,
      file,
      issues,
    }),
  });
  return handleResponse(res);
}

export async function analyzeAllFiles(
  scannedDirectory: string,
  files: Record<string, Issue[]>,
  allFiles?: string[],
): Promise<{ analyses: Record<string, AIAnalysis> }> {
  const res = await fetch(`${BASE}/api/analyze-all`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({
      scanned_directory: scannedDirectory,
      files,
      all_files: allFiles,
    }),
  });
  return handleResponse(res);
}

export async function fetchAuthenticatedUsers(): Promise<{ users: UserRecord[] }> {
  const res = await fetch(`${BASE}/api/auth/users`, {
    method: "GET",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Code Fix & Verification ──────────────────────────────────────────────────

export async function applyFix(
  scannedDirectory: string,
  file: string,
  fixedCode: string,
): Promise<ApplyFixResult> {
  const res = await fetch(`${BASE}/api/fix/apply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scanned_directory: scannedDirectory,
      file,
      fixed_code: fixedCode,
    }),
  });
  return handleResponse(res);
}

export async function verifyFix(
  scannedDirectory: string,
  file: string,
  originalCode: string,
  fixedCode: string,
  issues: Issue[] = [],
): Promise<VerifyFixResult> {
  const res = await fetch(`${BASE}/api/fix/verify`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      scanned_directory: scannedDirectory,
      file,
      original_code: originalCode,
      fixed_code: fixedCode,
      issues,
    }),
  });
  return handleResponse(res);
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Admin Monitoring API ──────────────────────────────────────────────────────

export interface AuditFileTested {
  file: string;
  filename: string;
  language: string;
  lines?: number | null;
  issues_count: number;
  status: "PASSED" | "DEFECTS_DETECTED";
  issues?: Issue[];
}

export interface AuditScanSummary {
  scan_id: string;
  timestamp: string;
  date_formatted: string;
  time_formatted: string;
  username: string;
  user_role: string;
  directory: string;
  project_name: string;
  total_files: number;
  clean_files_count: number;
  defective_files_count: number;
  total_issues: number;
  overall_status: "PASSED" | "DEFECTS_DETECTED";
  summary: { error: number; warning: number; info: number };
  severity_breakdown: Record<string, number>;
  by_category: Record<string, number>;
  languages_detected: Record<string, number>;
  files_tested_count: number;
  files_tested_summary: AuditFileTested[];
}

export interface AuditScanDetail extends AuditScanSummary {
  files_tested: AuditFileTested[];
}

export interface AuditStats {
  total_scans: number;
  total_files_tested: number;
  total_issues_found: number;
  clean_scans: number;
  clean_pass_rate: number;
  unique_users_count: number;
  unique_users: string[];
  user_activity: Record<string, number>;
  languages_breakdown: Record<string, number>;
}

export interface AdminUserRecord extends UserRecord {
  total_scans?: number;
}

export async function fetchAdminScans(params?: {
  limit?: number;
  offset?: number;
  username?: string;
  status?: string;
  language?: string;
  search?: string;
}): Promise<{ total: number; limit: number; offset: number; items: AuditScanSummary[] }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.username) query.set("username", params.username);
  if (params?.status) query.set("status", params.status);
  if (params?.language) query.set("language", params.language);
  if (params?.search) query.set("search", params.search);

  const res = await fetch(`${BASE}/api/admin/scans?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchAdminScanDetail(scanId: string): Promise<AuditScanDetail> {
  const res = await fetch(`${BASE}/api/admin/scans/${encodeURIComponent(scanId)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchAdminStats(): Promise<AuditStats> {
  const res = await fetch(`${BASE}/api/admin/stats`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchAdminUsers(): Promise<{ users: AdminUserRecord[] }> {
  const res = await fetch(`${BASE}/api/admin/users`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function clearAdminLogs(): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/api/admin/scans`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── RAG Vector Store & Memory Client ──────────────────────────────────────────

export async function fetchRAGStats(): Promise<RAGStats> {
  const res = await fetch(`${BASE}/api/rag/stats`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchRAGMemories(params?: {
  limit?: number;
  offset?: number;
  username?: string;
  language?: string;
  category?: string;
  search?: string;
}): Promise<{ total: number; limit: number; offset: number; items: RAGMemoryItem[] }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.username) query.set("username", params.username);
  if (params?.language) query.set("language", params.language);
  if (params?.category) query.set("category", params.category);
  if (params?.search) query.set("search", params.search);

  const res = await fetch(`${BASE}/api/rag/memories?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function searchRAGMemories(
  query: string,
  language?: string,
  category?: string,
  top_k = 5,
): Promise<{ results: RAGMemoryItem[]; query: string; count: number }> {
  const res = await fetch(`${BASE}/api/rag/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query, language, category, top_k }),
  });
  return handleResponse(res);
}

export async function deleteRAGMemory(errorId: string): Promise<{ success: boolean; error_id: string }> {
  const res = await fetch(`${BASE}/api/rag/memories/${encodeURIComponent(errorId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function clearAllRAGMemories(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/rag/clear`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<{ projects: Project[] }> {
  const res = await fetch(`${BASE}/api/projects`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchProjectFiles(projectId: string = "default"): Promise<{ files: ProjectFile[]; count: number }> {
  const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}/files`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function runFileTest(filePath: string, projectId: string = "default", testCaseId?: string): Promise<{ result: FileTestExecutionResult }> {
  const res = await fetch(`${BASE}/api/testing/run-file-test`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      file_path: filePath,
      project_id: projectId,
      test_case_id: testCaseId,
    }),
  });
  return handleResponse(res);
}

export async function importLocalProject(folderPath: string, name?: string): Promise<{ project: Project }> {
  const res = await fetch(`${BASE}/api/projects/import`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ folder_path: folderPath, name }),
  });
  return handleResponse(res);
}

export async function uploadProject(
  name: string | null,
  deep: boolean,
  files: File[],
): Promise<UploadedProjectResult> {
  const form = new FormData();
  const manifest = JSON.stringify({
    deep: deep ? "true" : "false",
    files: files.map(file => file.webkitRelativePath || file.name),
  });
  form.append("manifest", manifest);
  for (const file of files) {
    form.append("files", file, file.name);
  }
  const token = getToken();
  if (!token) expireSession();
  const res = await fetch(`${BASE}/api/projects/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return handleResponse(res);
}

export async function analyzeProjectDeep(projectId: string): Promise<{ analysis: ProjectAnalysis }> {
  const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}/analyze`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function applyDeveloperFix(
  filePath: string,
  fixedCode: string,
  ticketId?: string,
  projectId: string = "default"
): Promise<{ success: boolean; change: any; execution_verification: FileTestExecutionResult }> {
  const res = await fetch(`${BASE}/api/developer/apply-fix`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      file_path: filePath,
      fixed_code: fixedCode,
      ticket_id: ticketId,
      project_id: projectId,
    }),
  });
  return handleResponse(res);
}

export async function restoreFileBackup(filePath: string): Promise<{ restored: boolean; file_path: string }> {
  const res = await fetch(`${BASE}/api/developer/backup-restore`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ file_path: filePath }),
  });
  return handleResponse(res);
}

// ── Unified Lifecycle Tickets ────────────────────────────────────────────────

export async function fetchWorkflowItems(projectId?: string): Promise<{ items: WorkflowItem[] }> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return handleResponse(await fetch(`${BASE}/api/workflow/items${query}`, { headers: authHeaders() }));
}

export async function fetchWorkflowItem(id: string): Promise<{ item: WorkflowItem }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items/${encodeURIComponent(id)}`, { headers: authHeaders() }));
}

export async function createWorkflowItem(data: Partial<Ticket> & { assignees?: { developer?: string; qa?: string; tester?: string } }): Promise<{ item: WorkflowItem }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items`, { method: "POST", headers: authHeaders(), body: JSON.stringify(data) }));
}

export async function assignWorkflowItem(id: string, assignees: { developer?: string; qa?: string; tester?: string }): Promise<{ item: WorkflowItem }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items/${encodeURIComponent(id)}/assign`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(assignees) }));
}

export async function transitionWorkflowItem(id: string, next_status: WorkflowStatus, notes?: string, version?: number): Promise<{ item: WorkflowItem }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items/${encodeURIComponent(id)}/transition`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ next_status, notes, version }) }));
}

export async function commentWorkflowItem(id: string, text: string): Promise<{ item: WorkflowItem }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items/${encodeURIComponent(id)}/comments`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ text }) }));
}

export async function fixWorkflowItem(id: string, fixed_code: string, fix_explanation: string, version?: number): Promise<{ item: WorkflowItem }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items/${encodeURIComponent(id)}/fix`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ fixed_code, fix_explanation, version }) }));
}

export async function testWorkflowItem(id: string, data: { test_case_id?: string; result?: "PASS" | "FAIL" | "BLOCKED"; notes?: string; evidence?: { logs?: string; screenshot_url?: string } }): Promise<{ item: WorkflowItem; result: Record<string, unknown> }> {
  return handleResponse(await fetch(`${BASE}/api/workflow/items/${encodeURIComponent(id)}/tests`, { method: "POST", headers: authHeaders(), body: JSON.stringify(data) }));
}

export async function fetchWorkflowSummary(projectId?: string): Promise<WorkflowSummary> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return handleResponse(await fetch(`${BASE}/api/workflow/summary${query}`, { headers: authHeaders() }));
}

export async function fetchNotifications(): Promise<{ items: WorkflowNotification[]; unread: number }> {
  return handleResponse(await fetch(`${BASE}/api/notifications`, { headers: authHeaders() }));
}

export async function readNotification(id: string): Promise<{ success: true }> {
  return handleResponse(await fetch(`${BASE}/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST", headers: authHeaders() }));
}

export async function fetchTickets(params?: {
  project_id?: string;
  status?: string;
  assigned_user?: string;
}): Promise<{ tickets: Ticket[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.project_id) query.set("project_id", params.project_id);
  if (params?.status) query.set("status", params.status);
  if (params?.assigned_user) query.set("assigned_user", params.assigned_user);
  const res = await fetch(`${BASE}/api/tickets?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createTicket(data: Partial<Ticket>): Promise<{ ticket: Ticket }> {
  const res = await fetch(`${BASE}/api/tickets`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function assignTicket(
  ticketId: string,
  assignees: { developer?: string; tester?: string; qa?: string }
): Promise<{ ticket: Ticket }> {
  const res = await fetch(`${BASE}/api/tickets/${encodeURIComponent(ticketId)}/assign`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(assignees),
  });
  return handleResponse(res);
}

export async function advanceTicket(
  ticketId: string,
  nextStatus: string,
  notes?: string
): Promise<{ ticket: Ticket }> {
  const res = await fetch(`${BASE}/api/tickets/${encodeURIComponent(ticketId)}/advance`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ next_status: nextStatus, notes }),
  });
  return handleResponse(res);
}

// ── QA Multi-Environment & Quality Gate ──────────────────────────────────────

export async function runMultiEnvQA(projectId: string = "default"): Promise<{ qa_run: QAMultiEnvRun }> {
  const res = await fetch(`${BASE}/api/qa/run-environments?project_id=${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchQualityGate(projectId: string = "default"): Promise<{ quality_gate: QualityGateVerdict }> {
  const res = await fetch(`${BASE}/api/qa/quality-gate/${encodeURIComponent(projectId)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── GitHub & Production Pipeline ─────────────────────────────────────────────

export async function connectGitHub(token: string, username?: string): Promise<{ github: GitHubUser }> {
  const res = await fetch(`${BASE}/api/github/connect`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ token, username }),
  });
  return handleResponse(res);
}

export async function fetchGitHubRepos(token: string): Promise<{ repositories: GitHubRepo[] }> {
  const res = await fetch(`${BASE}/api/github/repositories?token=${encodeURIComponent(token)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function pushGitHubRelease(data: {
  project_id: string;
  repository: string;
  branch: string;
  commit_message?: string;
  token: string;
}): Promise<{ release: any }> {
  const res = await fetch(`${BASE}/api/github/push-release`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function triggerDeployment(projectId: string, releaseId: string): Promise<{ deployment: any }> {
  const res = await fetch(`${BASE}/api/deployments/trigger`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ project_id: projectId, release_id: releaseId }),
  });
  return handleResponse(res);
}

// ── Autonomous Pipeline Engine ───────────────────────────────────────────────

export async function runAutonomousPipeline(projectId: string = "default"): Promise<{ pipeline: PipelineRunState }> {
  const res = await fetch(`${BASE}/api/pipeline/run-autonomous?project_id=${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchPipelineStatus(projectId: string = "default"): Promise<{
  pipeline_status: { project_id: string; latest_run: PipelineRunState | null; gate: QualityGateVerdict };
}> {
  const res = await fetch(`${BASE}/api/pipeline/status/${encodeURIComponent(projectId)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}


// ── QA Department ─────────────────────────────────────────────────────────────

export async function fetchTestPlans(projectId?: string, status?: string): Promise<{ plans: TestPlan[] }> {
  const query = new URLSearchParams();
  if (projectId) query.set("project_id", projectId);
  if (status) query.set("status", status);
  const res = await fetch(`${BASE}/api/qa/plans?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createTestPlan(data: Partial<TestPlan>): Promise<{ plan: TestPlan }> {
  const res = await fetch(`${BASE}/api/qa/plans`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateTestPlan(planId: string, updates: Partial<TestPlan>): Promise<{ plan: TestPlan }> {
  const res = await fetch(`${BASE}/api/qa/plans/${encodeURIComponent(planId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

export async function deleteTestPlan(planId: string): Promise<{ status: string; plan_id: string }> {
  const res = await fetch(`${BASE}/api/qa/plans/${encodeURIComponent(planId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchTestCases(params?: {
  plan_id?: string;
  suite?: string;
  priority?: string;
}): Promise<{ cases: TestCase[] }> {
  const query = new URLSearchParams();
  if (params?.plan_id) query.set("plan_id", params.plan_id);
  if (params?.suite) query.set("suite", params.suite);
  if (params?.priority) query.set("priority", params.priority);
  const res = await fetch(`${BASE}/api/qa/cases?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createTestCase(data: Partial<TestCase>): Promise<{ case: TestCase }> {
  const res = await fetch(`${BASE}/api/qa/cases`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateTestCase(caseId: string, updates: Partial<TestCase>): Promise<{ case: TestCase }> {
  const res = await fetch(`${BASE}/api/qa/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

export async function deleteTestCase(caseId: string): Promise<{ status: string; case_id: string }> {
  const res = await fetch(`${BASE}/api/qa/cases/${encodeURIComponent(caseId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function generateAITestCases(filePath: string, context?: string, projectId?: string): Promise<{ test_cases: TestCase[]; count: number }> {
  const res = await fetch(`${BASE}/api/qa/cases/generate-ai`, {
    method: "POST",
    headers: authHeaders(),
    // project_id is required for correct path resolution; without it the backend falls back to sample_project.
    body: JSON.stringify({ file_path: filePath, context: context ?? "", ...(projectId ? { project_id: projectId } : {}) }),
  });
  return handleResponse(res);
}

export async function fetchQABugs(params?: {
  status?: string;
  priority?: string;
  assigned_to?: string;
  severity?: string;
}): Promise<{ bugs: Bug[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.assigned_to) query.set("assigned_to", params.assigned_to);
  if (params?.severity) query.set("severity", params.severity);
  const res = await fetch(`${BASE}/api/qa/bugs?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function assignBug(bugId: string, assignedTo: string): Promise<{ bug: Bug }> {
  const res = await fetch(`${BASE}/api/qa/bugs/${encodeURIComponent(bugId)}/assign`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ assigned_to: assignedTo }),
  });
  return handleResponse(res);
}

export async function qaCloseBug(bugId: string, validationNotes: string): Promise<{ bug: Bug }> {
  const res = await fetch(`${BASE}/api/qa/bugs/${encodeURIComponent(bugId)}/close`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ validation_notes: validationNotes }),
  });
  return handleResponse(res);
}

export async function qaReopenBug(bugId: string, reason: string): Promise<{ bug: Bug }> {
  const res = await fetch(`${BASE}/api/qa/bugs/${encodeURIComponent(bugId)}/reopen`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function fetchQAReport(projectId?: string): Promise<QAReport> {
  const query = new URLSearchParams();
  if (projectId) query.set("project_id", projectId);
  const res = await fetch(`${BASE}/api/qa/report?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Testing Department ────────────────────────────────────────────────────────

export async function fetchTestRuns(projectId?: string): Promise<{ runs: TestRun[] }> {
  const query = new URLSearchParams();
  if (projectId) query.set("project_id", projectId);
  const res = await fetch(`${BASE}/api/testing/runs?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createTestRun(data: {
  name: string;
  project_id?: string;
  test_plan_id?: string;
  environment?: string;
  target_commit?: string;
  test_case_ids?: string[];
}): Promise<{ run: TestRun }> {
  const res = await fetch(`${BASE}/api/testing/runs`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchTestResults(params?: {
  test_run_id?: string;
  tester_id?: string;
}): Promise<{ results: TestResult[] }> {
  const query = new URLSearchParams();
  if (params?.test_run_id) query.set("test_run_id", params.test_run_id);
  if (params?.tester_id) query.set("tester_id", params.tester_id);
  const res = await fetch(`${BASE}/api/testing/results?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function updateTestResult(
  resultId: string,
  data: {
    status: string;
    notes?: string;
    duration_ms?: number;
    evidence?: {
      screenshot_url?: string;
      logs?: string;
      environment?: string;
    };
  }
): Promise<{ result: TestResult }> {
  const res = await fetch(`${BASE}/api/testing/results/${encodeURIComponent(resultId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function rerunTestResult(resultId: string): Promise<{ result: TestResult }> {
  const res = await fetch(`${BASE}/api/testing/results/${encodeURIComponent(resultId)}/rerun`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createBugFromTestFailure(data: {
  test_result_id: string;
  title?: string;
  description?: string;
  severity?: string;
  priority?: string;
  steps_to_reproduce?: string;
  logs?: string;
}): Promise<{ bug: Bug }> {
  const res = await fetch(`${BASE}/api/testing/bugs`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchTesterReport(): Promise<TesterReport> {
  const res = await fetch(`${BASE}/api/testing/report`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Developer Department ──────────────────────────────────────────────────────

export async function fetchDeveloperBugs(): Promise<{ bugs: Bug[] }> {
  const res = await fetch(`${BASE}/api/developer/bugs`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function submitBugFix(
  bugId: string,
  fixExplanation: string,
  fixedCode?: string
): Promise<{ bug: Bug }> {
  const res = await fetch(`${BASE}/api/developer/bugs/${encodeURIComponent(bugId)}/submit-fix`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ fix_explanation: fixExplanation, fixed_code: fixedCode ?? "" }),
  });
  return handleResponse(res);
}

export async function aiAnalyzeBug(bugId: string): Promise<{ analysis: any }> {
  const res = await fetch(`${BASE}/api/developer/bugs/${encodeURIComponent(bugId)}/ai-analyze`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Department Oversight & Admin ──────────────────────────────────────────────

export async function fetchDepartmentOverview(): Promise<DepartmentOverview> {
  const res = await fetch(`${BASE}/api/department/overview`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchAuditEvents(limit = 50): Promise<{ events: AuditEvent[] }> {
  const res = await fetch(`${BASE}/api/department/audit-events?limit=${limit}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Simplified QA Workflow API ────────────────────────────────────────────────

export async function fetchQATestCases(projectId: string): Promise<{ test_cases: QATestCase[] }> {
  const res = await fetch(`${BASE}/api/qa/simple/test-cases?project_id=${encodeURIComponent(projectId)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createQATestCase(data: CreateTestCaseRequest): Promise<{ test_case: QATestCase }> {
  const res = await fetch(`${BASE}/api/qa/simple/test-cases`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function runQATestCase(projectId: string, testCaseId: string): Promise<{ test_run: QATestRun }> {
  const res = await fetch(`${BASE}/api/qa/simple/test-runs`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ project_id: projectId, test_case_id: testCaseId }),
  });
  return handleResponse(res);
}

export async function fetchQATestRuns(projectId: string, testCaseId?: string): Promise<{ test_runs: QATestRun[] }> {
  const query = new URLSearchParams();
  query.set("project_id", projectId);
  if (testCaseId) query.set("test_case_id", testCaseId);
  const res = await fetch(`${BASE}/api/qa/simple/test-runs?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchQAIssues(projectId: string, status?: QAWorkflowStatus): Promise<{ issues: QAIssue[] }> {
  const query = new URLSearchParams();
  query.set("project_id", projectId);
  if (status) query.set("status", status);
  const res = await fetch(`${BASE}/api/qa/simple/issues?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchQAIssue(issueId: string): Promise<{ issue: QAIssue }> {
  const res = await fetch(`${BASE}/api/qa/simple/issues/${encodeURIComponent(issueId)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function updateQAIssueStatus(data: UpdateIssueStatusRequest): Promise<{ issue: QAIssue }> {
  const res = await fetch(`${BASE}/api/qa/simple/issues/${encodeURIComponent(data.issue_id)}/status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({
      status: data.status,
      notes: data.notes,
      fixed_code: data.fixed_code,
      fix_summary: data.fix_summary,
    }),
  });
  return handleResponse(res);
}

export async function assignQAIssueToDeveloper(data: AssignDeveloperRequest): Promise<{ issue: QAIssue }> {
  const res = await fetch(`${BASE}/api/qa/simple/issues/${encodeURIComponent(data.issue_id)}/assign`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ developer_username: data.developer_username }),
  });
  return handleResponse(res);
}

export async function fetchQAWorkflowSummary(projectId: string): Promise<QAWorkflowSummary> {
  const res = await fetch(`${BASE}/api/qa/simple/summary?project_id=${encodeURIComponent(projectId)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function generateAITestCasesForFile(filePath: string, projectId: string): Promise<{ test_cases: QATestCase[] }> {
  const res = await fetch(`${BASE}/api/qa/simple/test-cases/generate-ai`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ file_path: filePath, project_id: projectId }),
  });
  return handleResponse(res);
}

export async function retestQAIssue(issueId: string, testRunId: string): Promise<{ test_run: QATestRun; issue: QAIssue }> {
  const res = await fetch(`${BASE}/api/qa/simple/issues/${encodeURIComponent(issueId)}/retest`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ test_run_id: testRunId }),
  });
  return handleResponse(res);
}
