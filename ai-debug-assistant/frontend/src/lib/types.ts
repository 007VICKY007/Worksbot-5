// src/lib/types.ts

export type SeverityType = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "error" | "warning" | "info";

export interface Issue {
  id?:              string;
  language?:        string;
  file:             string;
  line:             number | null;
  column?:          number | null;
  severity:         SeverityType;
  category:         string;
  rule?:            string;
  message:          string;
  snippet:          string;
  code?:            string;
  root_cause?:      string;
  suggested_fix?:   string;
  confidence?:      number;
}

export interface ReportSummary {
  error:   number;
  warning: number;
  info:    number;
}

export interface FileTestedInfo {
  path: string;
  language: string;
  status: string;
  issues_count?: number;
  issue_count?: number;
  error_count?: number;
  warning_count?: number;
  info_count?: number;
}

export interface Report {
  scanned_directory:   string;
  scan_timestamp:      string;
  total_files:         number;
  total_py_files:      number;
  files_with_issues:   number;
  total_issues:        number;
  summary:             ReportSummary;
  severity_breakdown?: Record<string, number>;
  languages_detected:  Record<string, number>;
  by_category:         Record<string, number>;
  issues:              Issue[];
  files?:              Record<string, FileTestedInfo>;
  ai_analyses?:        Record<string, AIAnalysis>;
}

export interface RAGMemoryItem {
  error_id:             string;
  username:             string;
  project_name?:        string;
  file_path:            string;
  language:             string;
  category:             string;
  severity:             string;
  rule:                 string;
  message:              string;
  snippet:              string;
  line?:                number | null;
  root_cause:           string;
  fixed_code:           string;
  diff?:                string;
  explanation?:         string;
  confidence?:          string;
  validation_status?:   string;
  similarity?:          number;
  similarity_percent?:  number;
  created_at:           string;
  updated_at?:          string;
  occurrence_count?:    number;
}

export interface RAGStats {
  total_vectors:       number;
  distinct_languages:  number;
  distinct_users:      number;
  dimension:           number;
  embedding_model:     string;
  languages:           Record<string, number>;
  categories:          Record<string, number>;
  recent_memories:     RAGMemoryItem[];
}

export interface AIAnalysis {
  language?:            string;
  root_cause:           string;
  fixed_code:           string;
  explanation:          string;
  confidence:           "HIGH" | "MEDIUM" | "LOW";
  validation_status?:   "VERIFIED" | "FAILED";
  validation_attempts?: number;
  diff?:                string;
  validation_details?:  string;
  rag_memories?:        RAGMemoryItem[];
}

export interface ApplyFixResult {
  success:          boolean;
  file:             string;
  backup:           string;
  remaining_issues: Issue[];
  resolved:         boolean;
}

export interface VerifyFixResult {
  status:           "VERIFIED" | "FAILED";
  is_valid:         boolean;
  diff:             string;
  remaining_issues: Issue[];
  new_issues:       Issue[];
  compiler_errors:  string;
  reason:           string;
}

export type UserRole = "developer" | "qa" | "tester" | "admin";

export interface Project {
  id:           string;
  name:         string;
  path:         string;
  root_path?:   string;
  version:      string;
  description:  string;
  environments: string[];
  stack?:       string[];
}

export interface TestPlan {
  id:           string;
  project_id:   string;
  name:         string;
  scope:        string;
  objectives:   string;
  status:       "draft" | "active" | "completed" | "archived" | string;
  target_date?: string;
  created_by:   string;
  created_at:   string;
  updated_at:   string;
}

export interface TestStep {
  step_number:  number;
  action:       string;
  expected:     string;
}

export interface TestCase {
  id:               string;
  test_plan_id:     string;
  title:            string;
  suite:            "smoke" | "regression" | "integration" | "unit" | "security" | string;
  priority:         "critical" | "high" | "medium" | "low" | string;
  type:             "functional" | "non-functional" | "edge-case" | "security" | string;
  preconditions?:   string;
  steps:            TestStep[];
  expected_result:  string;
  actual_result?:   string;
  target_file?:     string;
  status:           "ready" | "in_review" | "deprecated" | string;
  tags?:            string[];
  created_by:       string;
  created_at:       string;
  updated_at:       string;
}

export interface TestRun {
  id:             string;
  project_id:     string;
  test_plan_id?:  string;
  name:           string;
  environment:    string;
  target_commit:  string;
  status:         "queued" | "in_progress" | "passed" | "failed" | "completed" | string;
  created_by:     string;
  created_at:     string;
  updated_at:     string;
  total_tests:    number;
  passed_count:   number;
  failed_count:   number;
  blocked_count:  number;
  skipped_count:  number;
}

export interface TestResult {
  id:               string;
  test_run_id:      string;
  test_case_id:     string;
  case_title:       string;
  suite:            string;
  priority:         string;
  target_file:      string;
  steps?:           TestStep[];
  expected_result?: string;
  status:           "pending" | "passed" | "failed" | "blocked" | "skipped" | string;
  actual_result?:   string;
  duration_ms:      number;
  evidence?: {
    screenshot_url?: string;
    logs?:           string;
    environment?:    string;
  };
  tester_id?:       string;
  executed_at?:     string;
  linked_bug_id?:   string;
  created_at:       string;
  updated_at:       string;
}

export interface BugHistoryItem {
  timestamp:  string;
  actor:      string;
  action:     string;
  notes?:     string;
}

export interface Bug {
  id:                 string;
  project_id:         string;
  test_result_id?:    string;
  test_case_id?:      string;
  title:              string;
  description:        string;
  severity:           "critical" | "major" | "minor" | "cosmetic" | string;
  priority:           "blocker" | "high" | "medium" | "low" | string;
  status:             "open" | "assigned" | "fixed" | "retest" | "closed" | "reopened" | string;
  steps_to_reproduce: string;
  environment:        string;
  target_file:        string;
  target_line?:       number;
  assigned_to?:       string;
  reported_by:        string;
  fix_summary?:       string;
  fixed_code?:        string;
  code_diff?:         string;
  logs?:              string;
  history?:           BugHistoryItem[];
  created_at:         string;
  updated_at:         string;
}

export interface QAReport {
  project_id?:          string;
  total_test_plans:     number;
  total_test_cases:     number;
  active_test_runs:     number;
  cases_by_priority:    Record<string, number>;
  cases_by_suite:       Record<string, number>;
  bug_metrics: {
    total_bugs:         number;
    open_bugs:          number;
    assigned_bugs:      number;
    fixed_bugs:         number;
    closed_bugs:        number;
    reopened_bugs:      number;
    by_severity:        Record<string, number>;
    by_priority:        Record<string, number>;
  };
  generated_at:         string;
}

export interface TesterReport {
  tester_id:        string;
  total_assigned:   number;
  total_executed:   number;
  passed:           number;
  failed:           number;
  blocked:          number;
  skipped:          number;
  pass_rate:        number;
  bugs_reported:    number;
  recent_results:   TestResult[];
  generated_at:     string;
}

export interface AuditEvent {
  id:           string;
  username:     string;
  role:         string;
  action:       string;
  project_id:   string;
  resource_id?: string;
  timestamp:    string;
  metadata?:    Record<string, any>;
}

export interface DepartmentOverview {
  qa_metrics:           QAReport;
  recent_audit_events:  AuditEvent[];
  recent_bugs:          Bug[];
}

export interface ProjectFile {
  path:                  string;
  project_relative_path: string;
  name:                  string;
  extension:             string;
  size:                  number;
  language:              string;
  is_test:               boolean;
}

export interface FileTestExecutionResult {
  status:         "PASSED" | "FAILED";
  exit_code:      number;
  duration_ms:    number;
  file_path:      string;
  stdout:         string;
  stderr:         string;
  error_type?:    string;
  error_summary?: string;
  passed:         boolean;
  executed_at:    string;
}

export interface ProjectAnalysis {
  project_id: string;
  name: string;
  path: string;
  root_path?: string;
  total_files: number;
  code_files_count: number;
  test_files_count: number;
  source_files_count?: number;
  languages: Record<string, number>;
  stack?: string[];
  manifest_files?: string[];
  components: {
    frontend: string[];
    backend: string[];
    database: string[];
    tests: string[];
    configuration: string[];
  };
  syntax_issues: Array<{
    file: string;
    line: number;
    message: string;
    severity: string;
  }>;
  health_score: number;
  analyzed_at: string;
}

export interface TicketHistory {
  status?: string;
  action?: string;
  actor: string;
  timestamp: string;
  notes?: string;
}

export interface Ticket {
  id: string;
  ticket_id?: string;
  title: string;
  description?: string;
  summary?: string;
  project_id: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  priority: "blocker" | "high" | "medium" | "low" | string;
  created_by?: string;
  assigned_developer?: string;
  assigned_tester?: string;
  assigned_qa?: string;
  status:
    | "OPEN"
    | "DEVELOPER_IN_PROGRESS"
    | "READY_FOR_TEST"
    | "TESTING"
    | "TEST_FAILED"
    | "READY_FOR_QA"
    | "QA_IN_PROGRESS"
    | "QA_FAILED"
    | "QA_APPROVED"
    | "READY_FOR_RELEASE"
    | "RELEASED"
    | "BLOCKED"
    | "CLOSED"
    | string;
  target_file?: string;
  error_type?: string;
  error_logs?: string;
  root_cause?: string;
  fix_summary?: string;
  history?: TicketHistory[];
  created_at: string;
  updated_at: string;
}

export type WorkflowStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "FIXED" | "QA_REVIEW" | "TESTING" | "VERIFIED" | "CLOSED" | "REOPENED";

export interface WorkflowItem extends Ticket {
  reported_by?: string;
  steps_to_reproduce?: string;
  logs?: string;
  workflow_status: WorkflowStatus;
  allowed_actions: string[];
  comments: { id: string; actor: string; role: string; text: string; timestamp: string }[];
  history: (TicketHistory & { role?: string })[];
  fix_history: Record<string, unknown>[];
  test_results: Record<string, unknown>[];
  fixed_code?: string;
  fix_explanation?: string;
  version: number;
}

export interface WorkflowSummary {
  total_bugs: number;
  open_bugs: number;
  critical_bugs: number;
  fixed_bugs: number;
  waiting_for_qa: number;
  waiting_for_testing: number;
  passed_tests: number;
  failed_tests: number;
  code_quality_score: number | null;
  security_score: number | null;
  coverage: number | null;
  by_status: Partial<Record<WorkflowStatus, number>>;
  activity?: unknown[];
  project_health?: unknown;
}

export interface WorkflowNotification {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
  item_id: string;
}

export interface QAMultiEnvRun {
  id: string;
  project_id: string;
  executed_by: string;
  overall_status: "QA_APPROVED" | "QA_FAILED";
  environments: Array<{
    environment: string;
    target: string;
    passed: boolean;
    status: string;
    duration_ms: number;
    error_summary?: string;
    exit_code: number;
  }>;
  passed: boolean;
  timestamp: string;
}

export interface QualityGateVerdict {
  project_id: string;
  gate_passed: boolean;
  status: "APPROVED" | "BLOCKED";
  verdict?: "APPROVED" | "BLOCKED" | string;
  checklist: Array<{
    condition: string;
    passed: boolean;
    detail: string;
  }>;
  evaluated_at: string;
}

// ── Simplified QA Workflow Types ──
export type QAWorkflowStatus = "open" | "in_progress" | "fixed" | "retest" | "verified" | "closed" | "reopened";

export interface QATestCase {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  target_file: string;
  test_type: "unit" | "integration" | "e2e" | "manual";
  test_code?: string;
  steps?: string[];
  expected_result?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QATestRun {
  id: string;
  project_id: string;
  test_case_id: string;
  status: "pending" | "running" | "passed" | "failed" | "error";
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  output?: string;
  error_message?: string;
  stack_trace?: string;
  executed_by: string;
  created_at: string;
}

export interface QAIssue {
  id: string;
  project_id: string;
  test_run_id?: string;
  test_case_id?: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  priority: "blocker" | "high" | "medium" | "low";
  status: QAWorkflowStatus;
  steps_to_reproduce: string;
  environment: string;
  target_file: string;
  target_line?: number;
  error_logs?: string;
  stack_trace?: string;
  assigned_developer?: string;
  reported_by: string;
  fix_summary?: string;
  fixed_code?: string;
  code_diff?: string;
  history: QAIssueHistoryItem[];
  created_at: string;
  updated_at: string;
}

export interface QAIssueHistoryItem {
  id: string;
  issue_id: string;
  actor: string;
  action: string;
  from_status?: QAWorkflowStatus;
  to_status?: QAWorkflowStatus;
  notes?: string;
  timestamp: string;
}

export interface QAWorkflowSummary {
  project_id: string;
  total_issues: number;
  open_issues: number;
  in_progress_issues: number;
  fixed_issues: number;
  retest_issues: number;
  verified_issues: number;
  closed_issues: number;
  reopened_issues: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
  by_status: Record<QAWorkflowStatus, number>;
}

export interface CreateTestCaseRequest {
  project_id: string;
  title: string;
  description?: string;
  target_file: string;
  test_type: "unit" | "integration" | "e2e" | "manual";
  test_code?: string;
  steps?: string[];
  expected_result?: string;
}

export interface CreateTestRunRequest {
  project_id: string;
  test_case_id: string;
}

export interface UpdateIssueStatusRequest {
  issue_id: string;
  status: QAWorkflowStatus;
  notes?: string;
  fixed_code?: string;
  fix_summary?: string;
}

export interface AssignDeveloperRequest {
  issue_id: string;
  developer_username: string;
}

export interface GitHubUser {
  connected: boolean;
  login: string;
  name: string;
  avatar_url?: string;
  public_repos?: number;
  simulation?: boolean;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  default_branch: string;
}

export interface PipelineStage {
  stage: string;
  status: string;
  detail: string;
  timestamp: string;
}

export interface PipelineRunState {
  pipeline_id: string;
  project_id: string;
  status?: string;
  stages?: PipelineStage[];
  steps?: Record<string, { status: string; details?: any }>;
  current_stage?: string;
  quality_gate?: QualityGateVerdict;
  gate?: QualityGateVerdict;
  ticket?: Ticket;
  completed_at?: string;
}
