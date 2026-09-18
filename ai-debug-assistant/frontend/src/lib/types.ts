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
