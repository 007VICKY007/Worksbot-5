"""Server-side storage for projects uploaded from the browser.

Files selected in the browser (via the folder picker) are received here,
stored on disk while preserving their folder structure, registered as a
project, and scanned locally by the static engine.
"""

import os
import re
import shutil
import sys
import uuid
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from report import build_report  # noqa: E402
from scanner import scan_directory_detailed  # noqa: E402
from mongo import get_mongo_db  # noqa: E402
from audit_logger import record_scan_event  # noqa: E402
from auth import get_user_role  # noqa: E402

UPLOAD_ROOT = Path(
    os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploaded_projects"))
).expanduser().resolve()
MAX_PROJECT_FILES = 1000
# Keep this under Cloudflare's ~100 MB request-body cap in front of Render so
# oversized uploads are rejected by our app (a clear 400) rather than by the
# edge proxy (an opaque 403/413 that surfaces as "Failed to fetch").
MAX_PROJECT_BYTES = 90 * 1024 * 1024


def ensure_upload_root() -> Path:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    return UPLOAD_ROOT


def _safe_relative_path(value: str) -> Optional[str]:
    relative = PurePosixPath(str(value).replace("\\", "/")).as_posix()
    parts = [part for part in relative.split("/") if part not in ("", ".")]
    if not parts or relative.startswith("/") or ".." in parts:
        return None
    return "/".join(parts)


def _resolve_project_id(name: str, stamp: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", (name or "uploaded").strip().lower())[:40]
    if not slug:
        slug = "uploaded"
    return f"{slug}_{stamp}"


def store_project(
    name: Optional[str],
    deep: bool,
    username: str,
    files: List[Tuple[str, bytes]],
) -> Dict[str, Any]:
    """Store the uploaded files, register the project, scan it, and return the report."""
    ensure_upload_root()
    stamp = uuid.uuid4().hex[:8]
    project_id = _resolve_project_id(name or "", stamp)
    project_dir = UPLOAD_ROOT / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir)
    project_dir.mkdir(parents=True)

    if len(files) > MAX_PROJECT_FILES:
        raise ValueError("Uploaded project contains too many files.")

    total_bytes = 0
    for relative_path, content in files:
        total_bytes += len(content)
        if total_bytes > MAX_PROJECT_BYTES:
            raise ValueError("Uploaded project exceeds the size limit.")
        target = project_dir.joinpath(*relative_path.split("/"))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

    user_role = get_user_role(username)

    project_doc: Dict[str, Any] = {
        "id": project_id,
        "name": name.strip() if name and name.strip() else project_dir.name.replace("_", " ").title(),
        "path": str(project_dir),
        "version": "1.0.0",
        "description": "Uploaded from the browser folder picker.",
        "detected_stack": ["Uploaded Project"],
        "frameworks": [],
        "manifests": [],
        "environments": ["Development", "Testing", "Staging", "Production"],
        "source": "uploaded",
        "imported_at": _now_iso(),
    }
    _register_project(project_doc)

    issues, files_tested = scan_directory_detailed(str(project_dir))
    report = build_report(str(project_dir), issues)
    report["files"] = {
        (entry.get("file") or entry.get("path") or ""): entry
        for entry in files_tested
        if entry.get("file") or entry.get("path")
    }

    audit_entry = record_scan_event(
        username=username,
        user_role=user_role,
        directory=str(project_dir),
        report=report,
        all_files_tested=files_tested,
    )
    report["scan_id"] = audit_entry.get("scan_id")

    if deep:
        _run_deep_analysis(project_dir, report, username)

    return {"project": project_doc, "report": report}


def _register_project(project_doc: Dict[str, Any]) -> None:
    db = get_mongo_db()
    if db is None:
        return
    db.projects.update_one({"id": project_doc["id"]}, {"$set": project_doc}, upsert=True)


def _run_deep_analysis(project_dir: Path, report: Dict[str, Any], username: str) -> None:
    from ai_analyzer import batch_analyze_all

    issues = list(report.get("issues") or [])
    issues_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for issue in issues:
        relative = issue.get("file") or ""
        if relative:
            issues_by_file.setdefault(relative, []).append(issue)
    all_files = [
        entry.get("file") or entry.get("path") or ""
        for entry in (report.get("files") or {}).values()
    ]
    analyses = batch_analyze_all(
        str(project_dir),
        issues_by_file,
        all_files=all_files,
        username=username,
    )
    report["ai_analyses"] = analyses


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
