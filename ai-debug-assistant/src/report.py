# src/report.py
# Universal Multi-Language Diagnostic Report Builder.

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

SRC_DIR = str(Path(__file__).resolve().parent)
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from scanner import get_project_files_summary


def build_report(scanned_directory: str, issues: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build the full report dict from a list of universal issues.
    Preserves all existing Python-specific keys while adding universal
    multi-language statistics.
    """
    root_path = Path(scanned_directory).resolve()
    project_stats = get_project_files_summary(str(root_path))

    # Count unique files with at least one issue
    files_with_issues = len({i["file"] for i in issues if "file" in i})

    # Languages breakdown across detected issues
    languages_detected: Dict[str, int] = {}
    for issue in issues:
        lang = issue.get("language", "Unknown")
        languages_detected[lang] = languages_detected.get(lang, 0) + 1

    # Merge with files scanned per language
    for lang, count in project_stats["languages"].items():
        if lang not in languages_detected:
            languages_detected[lang] = 0

    # Severity summary (backward compatible format)
    summary = {"error": 0, "warning": 0, "info": 0}
    severity_breakdown = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}

    for issue in issues:
        sev = str(issue.get("severity", "LOW")).upper()
        severity_breakdown[sev] = severity_breakdown.get(sev, 0) + 1

        # Map to legacy summary
        if sev in ("CRITICAL", "HIGH"):
            summary["error"] += 1
        elif sev == "MEDIUM":
            summary["warning"] += 1
        else:
            summary["info"] += 1

    # Category breakdown (SYNTAX, LOGIC, RUNTIME, SECURITY, PERFORMANCE, etc.)
    by_category: Dict[str, int] = {}
    for issue in issues:
        cat = issue.get("category", "QUALITY")
        by_category[cat] = by_category.get(cat, 0) + 1

    # Sort category descending
    by_category = dict(sorted(by_category.items(), key=lambda x: x[1], reverse=True))

    total_files = project_stats["total_files"]
    total_py_files = project_stats["languages"].get("Python", 0)

    return {
        "scanned_directory": str(root_path),
        "scan_timestamp": datetime.now().isoformat(timespec="seconds"),
        "total_files": total_files,
        "total_py_files": total_py_files,   # Backward-compatibility alias
        "files_with_issues": files_with_issues,
        "total_issues": len(issues),
        "summary": summary,
        "severity_breakdown": severity_breakdown,
        "languages_detected": languages_detected,
        "by_category": by_category,
        "issues": issues,
    }


def save_report_json(report: Dict[str, Any], output_path: str) -> str:
    """Serialise the report dict to a JSON file."""
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    return str(out.resolve())
