# backend/audit_logger.py
# Persistent audit trail of all code scan and test activity.
# Records timestamps (date and time), user details, scanned paths, and the complete manifest of files tested.
# Stored in MongoDB (mongodb://localhost:27017/) with local disk backup.

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

try:
    from mongo import (
        mongo_insert_scan,
        mongo_get_scans,
        mongo_get_scan_detail,
        mongo_seed_scans,
        mongo_clear_scans,
    )
except ImportError:
    from backend.mongo import (
        mongo_insert_scan,
        mongo_get_scans,
        mongo_get_scan_detail,
        mongo_seed_scans,
        mongo_clear_scans,
    )

AUDIT_LOG_FILE = Path(__file__).resolve().parent / "audit_logs.json"


def _load_raw_logs() -> List[Dict[str, Any]]:
    """Load audit logs safely from disk."""
    if not AUDIT_LOG_FILE.exists():
        return []
    try:
        content = AUDIT_LOG_FILE.read_text(encoding="utf-8").strip()
        if not content:
            return []
        data = json.loads(content)
        if isinstance(data, list):
            return data
        return []
    except Exception:
        return []


def _save_raw_logs(logs: List[Dict[str, Any]]) -> None:
    """Save audit logs safely to disk."""
    try:
        AUDIT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUDIT_LOG_FILE.write_text(json.dumps(logs, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"[AuditLogger] Error writing audit log: {e}")


# Seed existing disk logs into MongoDB on start
try:
    _existing_disk_scans = _load_raw_logs()
    if _existing_disk_scans:
        mongo_seed_scans(_existing_disk_scans)
except Exception as e:
    print(f"[AuditLogger] Note syncing scans to MongoDB: {e}")


def record_scan_event(
    username: str,
    user_role: str,
    directory: str,
    report: Dict[str, Any],
    all_files_tested: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Record a new scan event with complete details into MongoDB and disk audit log.
    """
    now_utc = datetime.now(timezone.utc)
    scan_id = f"audit_{now_utc.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    
    dir_path = Path(directory)
    project_name = dir_path.name or str(dir_path)

    # Calculate status and manifest breakdown
    files_dict = report.get("files", {})
    total_files_analyzed = len(files_dict) if files_dict else (len(all_files_tested) if all_files_tested else report.get("total_files", 0))
    
    # Language summary
    lang_breakdown = report.get("summary", {}).get("languages", {})
    if not lang_breakdown:
        lang_breakdown = {}
        for finfo in files_dict.values():
            lng = finfo.get("language", "unknown").lower()
            lang_breakdown[lng] = lang_breakdown.get(lng, 0) + 1

    if all_files_tested:
        clean_count = sum(1 for f in all_files_tested if f.get("status") == "PASSED" or f.get("issues_count", 0) == 0)
        defect_count = sum(1 for f in all_files_tested if f.get("status") != "PASSED" and f.get("issues_count", 0) > 0)
    else:
        clean_count = sum(1 for finfo in files_dict.values() if finfo.get("issue_count", 0) == 0)
        defect_count = sum(1 for finfo in files_dict.values() if finfo.get("issue_count", 0) > 0)
    
    overall_status = "DEFECTS_DETECTED" if (defect_count > 0 or report.get("total_issues", 0) > 0) else "PASSED"

    # Tested files manifest
    files_tested_manifest = []
    if all_files_tested:
        files_tested_manifest = all_files_tested
    else:
        for rel_path, finfo in files_dict.items():
            files_tested_manifest.append({
                "path": rel_path,
                "language": finfo.get("language", "plaintext"),
                "status": "clean" if finfo.get("issue_count", 0) == 0 else "defects_found",
                "issues_count": finfo.get("issue_count", 0),
                "error_count": finfo.get("error_count", 0),
                "warning_count": finfo.get("warning_count", 0),
                "info_count": finfo.get("info_count", 0),
            })

    record = {
        "scan_id": scan_id,
        "timestamp": now_utc.isoformat(),
        "date_formatted": now_utc.strftime("%b %d, %Y"),
        "time_formatted": now_utc.strftime("%I:%M:%S %p UTC"),
        "username": username or "anonymous_developer",
        "user_role": user_role or "developer",
        "directory": directory,
        "project_name": project_name,
        "total_files_tested": total_files_analyzed,
        "clean_files_count": clean_count,
        "defect_files_count": defect_count,
        "defective_files_count": defect_count,
        "overall_status": overall_status,
        "total_issues": report.get("total_issues", 0),
        "duration_seconds": round(report.get("duration", 0.0), 3),
        "language_breakdown": lang_breakdown,
        "severity_counts": {
            "errors": report.get("error_count", 0),
            "warnings": report.get("warning_count", 0),
            "info": report.get("info_count", 0),
        },
        "files_tested_count": len(files_tested_manifest),
        "files_tested": files_tested_manifest,
        "issues": report.get("issues", []),
    }

    # 1. Save to MongoDB
    mongo_insert_scan(record)

    # 2. Save to disk backup
    logs = _load_raw_logs()
    logs.insert(0, record)
    if len(logs) > 1000:
        logs = logs[:1000]
    _save_raw_logs(logs)

    return record


def get_audit_logs(
    limit: int = 50,
    offset: int = 0,
    username: Optional[str] = None,
    status: Optional[str] = None,
    language: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieve filtered and paginated audit logs from MongoDB or disk."""
    # Try MongoDB
    mongo_res = mongo_get_scans(
        limit=limit,
        offset=offset,
        username=username,
        status=status,
        language=language,
        search=search,
    )
    if mongo_res is not None:
        return mongo_res

    # Disk fallback
    logs = _load_raw_logs()
    filtered = logs
    if username:
        filtered = [l for l in filtered if l.get("username") == username]
    if status:
        if status == "clean":
            filtered = [l for l in filtered if l.get("defect_files_count", 0) == 0]
        elif status == "defects":
            filtered = [l for l in filtered if l.get("defect_files_count", 0) > 0]
    if language and language != "all":
        filtered = [l for l in filtered if language.lower() in [k.lower() for k in l.get("language_breakdown", {}).keys()]]
    if search:
        s = search.lower()
        filtered = [
            l for l in filtered
            if s in l.get("directory", "").lower()
            or s in l.get("project_name", "").lower()
            or s in l.get("scan_id", "").lower()
            or s in l.get("username", "").lower()
        ]

    total = len(filtered)
    page_items = filtered[offset : offset + limit]

    summaries = []
    for item in page_items:
        summary = dict(item)
        summary.pop("issues", None)
        summaries.append(summary)

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": summaries,
    }


def get_scan_detail(scan_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve full audit detail for a specific scan by ID from MongoDB or disk."""
    detail = mongo_get_scan_detail(scan_id)
    if detail is not None:
        return detail

    logs = _load_raw_logs()
    for item in logs:
        if item.get("scan_id") == scan_id:
            return item
    return None


def get_system_audit_stats() -> Dict[str, Any]:
    """Calculate aggregated platform audit statistics."""
    logs = _load_raw_logs()
    total_scans = len(logs)
    total_files_tested = sum(l.get("total_files_tested", 0) for l in logs)
    total_bugs_detected = sum(l.get("total_issues", 0) for l in logs)
    
    unique_users = set(l.get("username") for l in logs if l.get("username"))
    user_activity: Dict[str, int] = {}
    for l in logs:
        uname = l.get("username", "anonymous")
        user_activity[uname] = user_activity.get(uname, 0) + 1

    language_totals: Dict[str, int] = {}
    for l in logs:
        for lng, count in l.get("language_breakdown", {}).items():
            language_totals[lng] = language_totals.get(lng, 0) + count

    return {
        "total_scans": total_scans,
        "total_files_tested": total_files_tested,
        "total_bugs_detected": total_bugs_detected,
        "total_issues_found": total_bugs_detected,
        "unique_users": list(unique_users),
        "unique_users_count": len(unique_users),
        "user_activity": user_activity,
        "language_totals": language_totals,
        "latest_scan_time": logs[0].get("timestamp") if logs else None,
    }


def clear_audit_logs() -> bool:
    """Clear all stored audit logs in MongoDB and disk."""
    mongo_clear_scans()
    _save_raw_logs([])
    return True
