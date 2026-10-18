# backend/server.py
# FastAPI backend — static analysis + AI analysis + auth + directory browser.

import sys
import os
import json
import shutil
import uuid
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple

from fastapi import FastAPI, HTTPException, Depends, Security, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

# ── Make src/ and backend/ importable ────────────────────────────────────────
ROOT = Path(__file__).parent.parent
load_dotenv(Path(__file__).parent / ".env")
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).parent))   # adds backend/ for auth.py

from scanner     import scan_directory, scan_directory_detailed
from report      import build_report
from auth        import verify_credentials, create_token, decode_token, register_user, list_registered_users, get_user_role, authenticate_google_id_token
from ai_analyzer import analyze_file, batch_analyze_all
from fix_validator import validate_code_fix
from universal_analyzer import analyze_source_file
import workflow
from audit_logger import record_scan_event, get_audit_logs, get_scan_detail, get_system_audit_stats, clear_audit_logs
from rag_pipeline import (
    get_rag_stats,
    list_rag_memories,
    retrieve_relevant_memories,
    delete_rag_memory,
    clear_all_rag_memories,
)
from departments import (
    list_projects,
    list_project_files,
    execute_project_file_test,
    import_local_project,
    analyze_project_deep,
    backup_file,
    restore_file_backup,
    apply_code_fix,
    create_ticket,
    list_tickets,
    assign_ticket,
    advance_ticket,
    run_multi_env_qa,
    evaluate_quality_gate,
    github_connect,
    github_list_repos,
    github_push_release,
    trigger_production_deployment,
    run_autonomous_pipeline,
    get_pipeline_status,
    list_test_plans,
    create_test_plan,
    update_test_plan,
    delete_test_plan,
    list_test_cases,
    create_test_case,
    update_test_case,
    delete_test_case,
    generate_ai_test_cases,
    list_test_runs,
    create_test_run,
    list_test_results,
    update_test_result,
    rerun_test_result,
    list_bugs,
    create_bug_from_test_failure,
    assign_bug,
    developer_submit_fix,
    qa_close_bug,
    qa_reopen_bug,
    analyze_bug_with_ai,
    get_qa_report,
    get_tester_report,
    list_audit_events,
    require_db,
    now_iso,
    log_department_action,
)
from mongo import init_mongo

import upload_manager

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Python Debug Assistant API")


@app.on_event("startup")
async def initialize_database_indexes() -> None:
    """Create identity constraints before accepting authentication requests.

    Never raises: an unreachable database or disk hiccup must not abort the
    lifespan startup, because Uvicorn only binds the listening socket after
    startup completes (otherwise Render reports 'No open ports detected').
    """
    try:
        init_mongo()
    except Exception as exc:  # noqa: BLE001 — startup must not crash the server
        print(f"[startup] MongoDB init skipped: {exc}", flush=True)
    try:
        upload_manager.ensure_upload_root()
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] upload root not created: {exc}", flush=True)


@app.exception_handler(PyMongoError)
async def database_error(request, exc):
    return JSONResponse(status_code=503, content={"detail": "Database unavailable. Reload the item before retrying."})


@app.exception_handler(ValueError)
async def invalid_request(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})

def _cors_origins() -> list[str]:
    """Allowed browser origins: local dev defaults plus CORS_ALLOWED_ORIGINS from the environment."""
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ]
    configured = [
        origin.strip()
        for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
    return list(dict.fromkeys(defaults + configured))


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


bearer = HTTPBearer()


# ── Auth dependency ───────────────────────────────────────────────────────────

def get_current_user(creds: HTTPAuthorizationCredentials = Security(bearer)) -> str:
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return workflow.actor(payload["sub"])[0]


def get_current_user_and_role(creds: HTTPAuthorizationCredentials = Security(bearer)) -> tuple[str, str]:
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    username = payload.get("sub", "")
    return workflow.actor(username)


def require_role(*allowed_roles: str):
    def dependency(creds: HTTPAuthorizationCredentials = Security(bearer)) -> tuple[str, str]:
        username, role = get_current_user_and_role(creds)
        if role not in allowed_roles and role != "admin":
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}. Your role is '{role}'."
            )
        return username, role
    return dependency


def require_admin_user(creds: HTTPAuthorizationCredentials = Security(bearer)) -> str:
    """Enforce administrator role for privileged admin endpoints."""
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    username = payload.get("sub", "")
    username, role = workflow.actor(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Administrator privileges required.")
    return username


# ── Request models ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    role:     Optional[str] = "developer"

class GoogleAuthRequest(BaseModel):
    credential: str
    role: Optional[str] = None

class ScanRequest(BaseModel):
    directory: str

class IssueItem(BaseModel):
    id:            Optional[str] = None
    language:      Optional[str] = None
    file:          str
    line:          Optional[int] = None
    column:        Optional[int] = None
    severity:      str
    category:      str
    rule:          Optional[str] = None
    message:       str
    snippet:       str = ""
    code:          Optional[str] = ""
    root_cause:    Optional[str] = ""
    suggested_fix: Optional[str] = ""
    confidence:    Optional[float] = 1.0

class AnalyzeRequest(BaseModel):
    """Ask AI to analyze a single file's issues and return a validated fix."""
    scanned_directory: str   # the root that was scanned
    file:              str   # relative file path (from scan report)
    issues:            List[IssueItem]

class BatchAnalyzeRequest(BaseModel):
    """Ask AI to analyze multiple files' issues and return root causes and validated fixes."""
    scanned_directory: str
    files:             dict[str, List[IssueItem]]
    all_files:         Optional[List[str]] = None

class ApplyFixRequest(BaseModel):
    """Apply a verified fix directly to disk with backup."""
    scanned_directory: str
    file:              str
    fixed_code:        str

class VerifyFixRequest(BaseModel):
    """Re-verify a code fix in an isolated sandbox."""
    scanned_directory: str
    file:              str
    original_code:     str
    fixed_code:        str
    issues:            List[IssueItem] = []

class RAGSearchRequest(BaseModel):
    query:             str
    language:          Optional[str] = None
    category:          Optional[str] = None
    top_k:             Optional[int] = 5

class CreateTestPlanRequest(BaseModel):
    name: str
    project_id: Optional[str] = "sample_project"
    scope: Optional[str] = ""
    objectives: Optional[str] = ""
    target_date: Optional[str] = ""

class UpdateTestPlanRequest(BaseModel):
    name: Optional[str] = None
    scope: Optional[str] = None
    objectives: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None

class CreateTestCaseRequest(BaseModel):
    test_plan_id: str
    title: str
    suite: Optional[str] = "regression"
    priority: Optional[str] = "medium"
    type: Optional[str] = "functional"
    preconditions: Optional[str] = ""
    steps: Optional[List[Dict[str, Any]]] = None
    expected_result: Optional[str] = ""
    target_file: Optional[str] = ""
    tags: Optional[List[str]] = None

class UpdateTestCaseRequest(BaseModel):
    title: Optional[str] = None
    suite: Optional[str] = None
    priority: Optional[str] = None
    type: Optional[str] = None
    preconditions: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    expected_result: Optional[str] = None
    target_file: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None

class GenerateAITestsRequest(BaseModel):
    file_path: str
    context: Optional[str] = ""
    project_id: Optional[str] = "sample_project"
    test_plan_id: Optional[str] = None

class CreateTestRunRequest(BaseModel):
    name: str
    project_id: Optional[str] = "sample_project"
    test_plan_id: Optional[str] = None
    environment: Optional[str] = "Development"
    target_commit: Optional[str] = "HEAD"
    test_case_ids: Optional[List[str]] = None

class UpdateTestResultRequest(BaseModel):
    status: str
    notes: Optional[str] = ""
    duration_ms: Optional[int] = 0
    evidence: Optional[Dict[str, Any]] = None

class RunFileTestRequest(BaseModel):
    file_path: str
    project_id: Optional[str] = "sample_project"
    test_case_id: Optional[str] = None

class CreateBugFromTestRequest(BaseModel):
    test_result_id: str
    title: Optional[str] = ""
    description: Optional[str] = ""
    severity: Optional[str] = "major"
    priority: Optional[str] = "high"
    steps_to_reproduce: Optional[str] = ""
    logs: Optional[str] = ""

class AssignBugRequest(BaseModel):
    assigned_to: str

class DeveloperSubmitFixRequest(BaseModel):
    fix_explanation: str
    fixed_code: Optional[str] = ""

class QACloseBugRequest(BaseModel):
    validation_notes: str

class QAReopenBugRequest(BaseModel):
    reason: str

class ImportProjectRequest(BaseModel):
    folder_path: str
    name: Optional[str] = None

class ApplyCodeFixRequest(BaseModel):
    file_path: str
    fixed_code: str
    ticket_id: Optional[str] = None
    project_id: Optional[str] = "sample_project"

class RestoreBackupRequest(BaseModel):
    file_path: str

class CreateTicketRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    project_id: Optional[str] = "sample_project"
    severity: Optional[str] = "high"
    priority: Optional[str] = "high"
    target_file: Optional[str] = ""
    error_type: Optional[str] = ""
    error_logs: Optional[str] = ""
    root_cause: Optional[str] = ""
    assigned_developer: Optional[str] = None
    assigned_tester: Optional[str] = None
    assigned_qa: Optional[str] = None
    status: Optional[str] = "OPEN"

class AssignTicketRequest(BaseModel):
    developer: Optional[str] = None
    tester: Optional[str] = None
    qa: Optional[str] = None

class AdvanceTicketRequest(BaseModel):
    next_status: str
    notes: Optional[str] = ""
    version: Optional[int] = None


class WorkflowCommentRequest(BaseModel):
    text: str


class WorkflowFixRequest(BaseModel):
    fixed_code: str
    fix_explanation: str
    version: Optional[int] = None


class WorkflowTestRequest(BaseModel):
    test_case_id: Optional[str] = None
    result: Optional[str] = None
    notes: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    # When true: FAIL -> REOPENED (back to developer), PASS -> next stage if all evidence passes.
    auto_advance: Optional[bool] = False


class WorkflowRegressionRequest(BaseModel):
    auto_advance: Optional[bool] = False


class WorkflowCodeRequest(BaseModel):
    fixed_code: Optional[str] = None


class WorkflowGenerateTestsRequest(BaseModel):
    save: Optional[bool] = True


class AdminUserUpdateRequest(BaseModel):
    role: Optional[str] = None
    disabled: Optional[bool] = None

class GitHubConnectRequest(BaseModel):
    token: str
    username: Optional[str] = None

class GitHubPushRequest(BaseModel):
    project_id: str
    repository: str
    branch: str
    commit_message: Optional[str] = ""

# ── Simplified QA Workflow Request Models ──────────────────────────────────────

class SimpleQATestCaseRequest(BaseModel):
    project_id: str
    title: str
    description: Optional[str] = ""
    target_file: str
    test_type: str = "unit"
    test_code: Optional[str] = ""
    steps: Optional[List[str]] = None
    expected_result: Optional[str] = ""

class SimpleQATestRunRequest(BaseModel):
    project_id: str
    test_case_id: str

class SimpleQAIssueUpdateRequest(BaseModel):
    status: str
    notes: Optional[str] = ""
    fixed_code: Optional[str] = ""
    fix_summary: Optional[str] = ""

class SimpleQAIssueAssignRequest(BaseModel):
    developer_username: str

class SimpleQARetestRequest(BaseModel):
    test_run_id: str

class SimpleQAGenerateTestsRequest(BaseModel):
    file_path: str
    project_id: str
    token: str

class TriggerDeploymentRequest(BaseModel):
    project_id: str
    release_id: str




# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(req: LoginRequest):
    if not verify_credentials(req.username, req.password):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    role = get_user_role(req.username)
    token = create_token(req.username, role=role)
    return {"token": token, "username": req.username, "role": role}


@app.post("/api/auth/google")
def google_login(req: GoogleAuthRequest):
    """Exchange a verified Google ID token for this application's JWT."""
    try:
        user = authenticate_google_id_token(req.credential, req.role)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    token = create_token(user["username"], role=user["role"])
    return {"token": token, "username": user["username"], "role": user["role"]}


@app.post("/api/auth/register")
def register(req: RegisterRequest):
    """Register a new user account into the credential store."""
    try:
        user_role = req.role or "developer"
        if user_role.lower() == "admin":
            raise HTTPException(status_code=403, detail="Administrator role cannot be self-assigned.")
        user_record = register_user(req.username, req.password, user_role)
        user_role = user_record.get("role") or user_role.strip().lower()
        token = create_token(user_record["username"], role=user_role)
        return {
            "token": token,
            "user": user_record,
            "role": user_role,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/auth/users")
def get_users(username: str = Depends(get_current_user)):
    """Return all registered user credentials/profiles stored on the server."""
    return {"users": list_registered_users()}


@app.get("/api/auth/public-users")
def get_public_users():
    """Return registered users list for the showcase/admin directory view."""
    return {"users": list_registered_users()}


@app.get("/api/auth/me")
def me(username: str = Depends(get_current_user)):
    role = get_user_role(username)
    return {"username": username, "role": role}


# ── Directory browser ─────────────────────────────────────────────────────────

_HIDDEN = frozenset([
    "__pycache__", ".git", ".svn", ".hg",
    "node_modules", ".next", ".venv", "venv", ".tox",
    ".mypy_cache", ".pytest_cache", "dist", "build",
])

@app.get("/api/browse")
def browse(path: str = "/", username: str = Depends(get_current_user)):
    target = Path(path).resolve()
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    items = []
    try:
        for child in sorted(target.iterdir()):
            if not child.is_dir():
                continue
            if child.name.startswith(".") or child.name in _HIDDEN:
                continue
            items.append({"name": child.name, "path": str(child)})
    except PermissionError:
        pass

    parent = str(target.parent) if target != target.parent else None
    return {"current": str(target), "parent": parent, "items": items}


# ── Scan endpoint ─────────────────────────────────────────────────────────────

@app.post("/api/scan")
def scan(req: ScanRequest, username: str = Depends(get_current_user)):
    """Scan an entire project directory for bugs, record persistent audit trail, and return report."""
    target = Path(req.directory)
    if not target.exists():
        raise HTTPException(status_code=400, detail=f"Directory not found: {req.directory}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {req.directory}")
    try:
        issues, files_tested = scan_directory_detailed(str(target))
        report = build_report(str(target), issues)
        user_role = get_user_role(username)

        # Record persistent audit trail with date, time, user details, and tested files manifest
        audit_entry = record_scan_event(
            username=username,
            user_role=user_role,
            directory=str(target),
            report=report,
            all_files_tested=files_tested,
        )
        report["files"] = {
            (f.get("file") or f.get("path") or ""): f
            for f in files_tested
            if (f.get("file") or f.get("path"))
        }
        report["scan_id"] = audit_entry.get("scan_id")
        return report
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── AI analysis endpoint ──────────────────────────────────────────────────────

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest, username: str = Depends(get_current_user)):
    """
    Read the source file, send it + its issues to OpenAI,
    and return root cause + corrected code + explanation.
    """
    # Resolve the full path to the source file
    source_path = registered_source(req.scanned_directory, req.file)

    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")

    try:
        source_code = source_path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read file: {exc}")

    try:
        result = analyze_file(
            file_path=req.file,
            source_code=source_code,
            issues=[i.model_dump() for i in req.issues],
            scanned_directory=req.scanned_directory,
            username=username,
        )
        return result
    except ValueError as exc:
        # Missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {exc}")


@app.post("/api/analyze-all")
def analyze_all(req: BatchAnalyzeRequest, username: str = Depends(get_current_user)):
    """
    Analyze all supplied files in batch and return file -> {root_cause, fixed_code, explanation, confidence, validation_status, diff}.
    """
    for filename in set(req.files) | set(req.all_files or []):
        registered_source(req.scanned_directory, filename)
    issues_dict = {
        f: [i.model_dump() for i in file_issues]
        for f, file_issues in req.files.items()
    }
    all_files_list = req.all_files or list(req.files.keys())
    try:
        results = batch_analyze_all(req.scanned_directory, issues_dict, all_files=all_files_list, username=username)
        return {"analyses": results}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch AI analysis failed: {exc}")


@app.post("/api/scan-ai-deep")
def scan_ai_deep(req: ScanRequest, username: str = Depends(get_current_user)):
    """
    Comprehensive AI Intellectual Scan:
    1. Scans entire project directory across all programming languages.
    2. Runs deep AI Intellectual code comprehension across every file in the codebase.
    3. Returns full static report + all AI root causes, validated code fixes, and diffs.
    """
    target = Path(req.directory)
    if not target.exists():
        raise HTTPException(status_code=400, detail=f"Directory not found: {req.directory}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {req.directory}")
    try:
        issues, files_tested = scan_directory_detailed(str(target))
        report = build_report(str(target), issues)
        user_role = get_user_role(username)

        audit_entry = record_scan_event(
            username=username,
            user_role=user_role,
            directory=str(target),
            report=report,
            all_files_tested=files_tested,
        )
        report["scan_id"] = audit_entry.get("scan_id")
        report["files"] = {
            (f.get("file") or f.get("path") or ""): f
            for f in files_tested
            if (f.get("file") or f.get("path"))
        }

        # Map issues by file
        issues_dict: dict[str, list] = {}
        for iss in issues:
            f = iss.get("file", "")
            if f:
                issues_dict.setdefault(f, []).append(iss)

        all_file_paths = [(f.get("file") or f.get("path")) for f in files_tested if (f.get("file") or f.get("path"))]
        ai_analyses = batch_analyze_all(str(target), issues_dict, all_files=all_file_paths, username=username)
        report["ai_analyses"] = ai_analyses

        return report
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/fix/apply")
def apply_fix(
    req: ApplyFixRequest,
    user_and_role: tuple = Depends(require_role("developer", "admin")),
    username: Optional[str] = None,
):
    """Legacy path adapter: identify the caller's assigned in-progress ticket."""
    target = registered_source(req.scanned_directory, req.file)
    candidates = []
    for item in workflow.items(user_and_role):
        if item.get("assigned_developer") == user_and_role[0] and item["workflow_status"] == "IN_PROGRESS":
            try:
                if workflow.target_path(item["project_id"], item["target_file"])[1] == target:
                    candidates.append(item)
            except HTTPException:
                continue
    if len(candidates) != 1:
        raise HTTPException(409, "Use the workflow fix endpoint with an assigned, in-progress ticket ID.")
    item = workflow.fix(candidates[0]["id"], req.fixed_code, "Fix submitted using legacy apply endpoint", user_and_role)
    attempt = item["fix_history"][-1]
    return {"success": True, "file": req.file, "backup": attempt["backup_path"], "item": item,
            "remaining_issues": attempt["validation"].get("remaining_issues", []), "resolved": False}


@app.post("/api/fix/verify")
def verify_fix(req: VerifyFixRequest, username: str = Depends(get_current_user)):
    """Re-validate a fix in an isolated sandbox."""
    registered_source(req.scanned_directory, req.file)
    try:
        res = validate_code_fix(
            file_path=req.file,
            original_code=req.original_code,
            fixed_code=req.fixed_code,
            target_issues=[i.model_dump() for i in req.issues],
            project_root=req.scanned_directory,
        )
        return res
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Verification failed: {exc}")


# ── Admin Monitoring Endpoints ────────────────────────────────────────────────

@app.get("/api/admin/scans")
def admin_get_scans(
    limit: int = 50,
    offset: int = 0,
    username: Optional[str] = None,
    status: Optional[str] = None,
    language: Optional[str] = None,
    search: Optional[str] = None,
    admin_user: str = Depends(require_admin_user),
):
    """Retrieve filtered and paginated test scan audit events with user details and files tested."""
    return get_audit_logs(
        limit=limit,
        offset=offset,
        username=username,
        status=status,
        language=language,
        search=search,
    )


@app.get("/api/admin/scans/{scan_id}")
def admin_get_scan_detail(
    scan_id: str,
    admin_user: str = Depends(require_admin_user),
):
    """Retrieve full file-by-file audit detail of a specific scan."""
    detail = get_scan_detail(scan_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Scan audit record not found.")
    return detail


@app.get("/api/admin/stats")
def admin_get_stats(admin_user: str = Depends(require_admin_user)):
    """Retrieve aggregated platform testing metrics."""
    return get_system_audit_stats()


@app.get("/api/admin/users")
def admin_get_users(admin_user: str = Depends(require_admin_user)):
    """Retrieve registered users list enriched with test activity count."""
    users = list_registered_users()
    stats = get_system_audit_stats()
    activity = stats.get("user_activity", {})
    db = workflow.get_mongo_db()
    workflow_counts = {}
    if db is not None:
        workflow_counts = {row["_id"]: row["count"] for row in db.audit_events.aggregate(
            [{"$group": {"_id": "$username", "count": {"$sum": 1}}}])}
    for u in users:
        u["total_scans"] = activity.get(u.get("username", ""), 0)
        u["workflow_actions"] = workflow_counts.get(u.get("username", ""), 0)
    return {"users": users}


@app.get("/api/admin/workflow-overview")
def admin_workflow_overview(
    role: Optional[str] = None,
    username: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 200,
    admin_user: str = Depends(require_admin_user),
):
    """Admin visibility: users & activity, bugs, test results, Developer/QA/Tester activity, audit history."""
    from departments import get_admin_workflow_overview
    return get_admin_workflow_overview(role=role, username=username, action=action, limit=max(1, min(limit, 1000)))


@app.patch("/api/admin/users/{username}")
def admin_update_user(username: str, req: AdminUserUpdateRequest, admin_user: str = Depends(require_admin_user)):
    from auth import update_registered_user
    return {"user": update_registered_user(username, req.model_dump(exclude_none=True), admin_user)}


@app.delete("/api/admin/scans")
def admin_clear_scans(admin_user: str = Depends(require_admin_user)):
    """Clear all test audit records (admin only)."""
    clear_audit_logs()
    return {"message": "Audit logs cleared successfully."}


# ── RAG Vector Store & Memory Endpoints ──────────────────────────────────────

@app.get("/api/rag/stats")
def rag_stats(username: str = Depends(get_current_user)):
    """Retrieve aggregate statistics about the MongoDB Vector Store and remembered errors."""
    return get_rag_stats()


@app.get("/api/rag/memories")
def rag_memories(
    limit: int = 50,
    offset: int = 0,
    username: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    """Retrieve indexed errors and proven fixes from MongoDB Vector Store."""
    return list_rag_memories(
        limit=limit,
        offset=offset,
        username=username,
        language=language,
        category=category,
        search=search,
    )


@app.post("/api/rag/search")
def rag_search(req: RAGSearchRequest, current_user: str = Depends(get_current_user)):
    """Perform semantic vector similarity search across all stored error memories."""
    results = retrieve_relevant_memories(
        query_text=req.query,
        language=req.language,
        category=req.category,
        top_k=req.top_k or 5,
        min_similarity=0.35,
    )
    return {"results": results, "query": req.query, "count": len(results)}


@app.delete("/api/rag/memories/{error_id}")
def rag_delete_memory(error_id: str, admin_user: str = Depends(require_admin_user)):
    """Delete a specific error memory from the vector collection (admin only)."""
    success = delete_rag_memory(error_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory record not found.")
    return {"success": True, "error_id": error_id}


@app.post("/api/rag/clear")
def rag_clear_all(admin_user: str = Depends(require_admin_user)):
    """Clear all stored vector memories from MongoDB (admin only)."""
    clear_all_rag_memories()
    return {"success": True, "message": "All vector memories cleared from MongoDB."}


# ── Projects Directory ────────────────────────────────────────────────────────

@app.get("/api/projects")
def get_projects(current_user: str = Depends(get_current_user)):
    return {"projects": list_projects()}


@app.get("/api/projects/{project_id}/files")
def get_project_files(project_id: str, current_user: str = Depends(get_current_user)):
    files = list_project_files(project_id)
    return {"project_id": project_id, "files": files, "count": len(files)}


@app.post("/api/testing/run-file-test")
def run_file_test(req: RunFileTestRequest, current_user: str = Depends(get_current_user)):
    result = execute_project_file_test(file_path=req.file_path, project_id=req.project_id)
    return {"result": result}


# ── Project Import & Deep Analysis Endpoints ─────────────────────────────────

@app.post("/api/projects/import")
def project_import_local(req: ImportProjectRequest, current_user: str = Depends(get_current_user)):
    try:
        proj = import_local_project(req.folder_path, req.name)
        return {"project": proj}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _upload_safe_relative(relative: str) -> str:
    parts = [part for part in relative.replace("\\", "/").split("/") if part not in ("", ".")]
    if not parts or relative.startswith("/") or ".." in parts:
        raise HTTPException(status_code=400, detail="Invalid path inside the uploaded project.")
    return "/".join(parts)


def _upload_relative_paths(manifest: Optional[str]) -> List[str]:
    if not manifest:
        return []
    try:
        document = json.loads(manifest)
    except ValueError:
        return []
    paths = document.get("files") if isinstance(document, dict) else None
    if not isinstance(paths, list):
        return []
    return [str(path) for path in paths if isinstance(path, str)]


@app.post("/api/projects/upload")
async def upload_project(
    name: Optional[str] = Form(None),
    deep: Optional[str] = Form("false"),
    manifest: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    current_user: str = Depends(get_current_user),
):
    """Store project files selected in the browser, then scan the uploaded copy."""
    deep_enabled = str(deep or "false").strip().lower() in ("true", "1", "on")
    relative_paths = _upload_relative_paths(manifest)
    stored: List[Tuple[str, bytes]] = []
    for index, upload in enumerate(files):
        if index < len(relative_paths):
            relative = relative_paths[index]
        else:
            relative = upload.filename or f"file{index}"
        stored.append(
            (
                _upload_safe_relative(relative),
                await upload.read(),
            )
        )
    result = upload_manager.store_project(
        name=name,
        deep=deep_enabled,
        username=current_user,
        files=stored,
    )
    return result


@app.post("/api/projects/{project_id}/analyze")
def project_analyze(project_id: str, current_user: str = Depends(get_current_user)):
    try:
        summary = analyze_project_deep(project_id)
        return {"analysis": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Developer Safe Fix & Backup Restore Endpoints ────────────────────────────

@app.post("/api/developer/apply-fix")
def dev_apply_fix(req: ApplyCodeFixRequest, user_and_role: tuple = Depends(require_role("developer", "admin"))):
    username, role = user_and_role
    try:
        res = apply_code_fix(
            file_path=req.file_path,
            fixed_code=req.fixed_code,
            ticket_id=req.ticket_id,
            username=username,
            project_id=req.project_id
        )
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/developer/backup-restore")
def dev_backup_restore(req: RestoreBackupRequest, user_and_role: tuple = Depends(require_role("developer", "admin"))):
    raise HTTPException(409, "Reopen the ticket and submit backup contents as a new validated fix; direct restore would invalidate review evidence.")


# ── Unified Lifecycle Ticket Endpoints (MND-XXXX) ────────────────────────────

@app.get("/api/tickets")
def tickets_list(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_user: Optional[str] = None,
    current_user: str = Depends(get_current_user)
):
    tickets = workflow.items(workflow.actor(current_user), project_id)
    if status and status.lower() != "all":
        tickets = [t for t in tickets if t["workflow_status"] == workflow.canonical(status)]
    if assigned_user:
        tickets = [t for t in tickets if assigned_user in [t.get("assigned_" + r) for r in ("developer", "qa", "tester")]]
    return {"tickets": tickets, "count": len(tickets)}


@app.post("/api/tickets")
def tickets_create(req: CreateTicketRequest, current_user: str = Depends(get_current_user)):
    ticket = create_ticket(req.model_dump(), username=current_user)
    return {"ticket": ticket}


@app.patch("/api/tickets/{ticket_id}/assign")
def tickets_assign(ticket_id: str, req: AssignTicketRequest, user_and_role: tuple = Depends(require_role("developer", "qa", "tester", "admin"))):
    username, role = user_and_role
    ticket = assign_ticket(ticket_id, developer=req.developer, tester=req.tester, qa=req.qa, actor=username)
    return {"ticket": ticket}


@app.post("/api/tickets/{ticket_id}/advance")
def tickets_advance(ticket_id: str, req: AdvanceTicketRequest, current_user: str = Depends(get_current_user)):
    ticket = workflow.transition(ticket_id, req.next_status, workflow.actor(current_user), req.notes or "", req.version)
    return {"ticket": ticket}


# ── QA Multi-Environment & Quality Gate Endpoints ────────────────────────────

@app.post("/api/qa/run-environments")
def qa_run_environments(
    project_id: str = "sample_project",
    user_and_role: tuple = Depends(require_role("qa", "admin"))
):
    username, role = user_and_role
    run_res = run_multi_env_qa(project_id, actor=username)
    return {"qa_run": run_res}


@app.get("/api/qa/quality-gate/{project_id}")
def qa_get_quality_gate(project_id: str, current_user: str = Depends(get_current_user)):
    gate = evaluate_quality_gate(project_id)
    return {"quality_gate": gate}


# ── GitHub & Production Release Endpoints ─────────────────────────────────────

@app.post("/api/github/connect")
def github_auth(req: GitHubConnectRequest, current_user: str = Depends(get_current_user)):
    try:
        info = github_connect(req.token, username=req.username or current_user)
        return {"github": info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/github/repositories")
def github_repos(token: str, current_user: str = Depends(get_current_user)):
    repos = github_list_repos(token)
    return {"repositories": repos}


@app.post("/api/github/push-release")
def github_push(req: GitHubPushRequest, user_and_role: tuple = Depends(require_role("qa", "admin"))):
    username, role = user_and_role
    try:
        rel = github_push_release(
            project_id=req.project_id,
            repository=req.repository,
            branch=req.branch,
            commit_message=req.commit_message or "",
            token=req.token,
            username=username
        )
        return {"release": rel}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/deployments/trigger")
def deployment_trigger(req: TriggerDeploymentRequest, user_and_role: tuple = Depends(require_role("admin"))):
    username, role = user_and_role
    dep = trigger_production_deployment(req.project_id, req.release_id, actor=username)
    return {"deployment": dep}


# ── Autonomous Pipeline Endpoints ────────────────────────────────────────────

@app.post("/api/pipeline/run-autonomous")
def pipeline_run_autonomous(
    project_id: str = "sample_project",
    user_and_role: tuple = Depends(require_role("developer", "qa", "tester", "admin")),
):
    """Automated Developer -> QA -> Tester workflow on the selected project (real executions)."""
    import auto_pipeline
    username, role = user_and_role
    res = auto_pipeline.run_auto_workflow(project_id=project_id, username=username, user_role=role)
    return {"pipeline": res}


@app.get("/api/projects/{project_id}/test-config")
def project_test_config(project_id: str, current_user: str = Depends(get_current_user)):
    """Detected language, package manager, test framework and commands for the project's own root."""
    import project_runner
    root = workflow.project(project_id)
    cfg = project_runner.detect_config(root)
    cfg["test_command"] = cfg.pop("test_command_display", None)  # never expose absolute tool paths
    cfg.pop("typecheck_command", None)
    return {"test_config": cfg}


@app.get("/api/pipeline/status/{project_id}")
def pipeline_status(project_id: str, current_user: str = Depends(get_current_user)):
    status = get_pipeline_status(project_id)
    return {"pipeline_status": status}



# ── QA Department Endpoints ───────────────────────────────────────────────────

@app.get("/api/qa/plans")
def qa_get_plans(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    return {"plans": list_test_plans(project_id=project_id, status=status)}


@app.post("/api/qa/plans")
def qa_create_plan(
    req: CreateTestPlanRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    plan = create_test_plan(req.model_dump(), created_by=username)
    return {"plan": plan}


@app.patch("/api/qa/plans/{plan_id}")
def qa_update_plan(
    plan_id: str,
    req: UpdateTestPlanRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_test_plan(plan_id, updates, user=username)
    if not updated:
        raise HTTPException(status_code=404, detail="Test plan not found.")
    return {"plan": updated}


@app.delete("/api/qa/plans/{plan_id}")
def qa_delete_plan(
    plan_id: str,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    deleted = delete_test_plan(plan_id, user=username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test plan not found.")
    return {"status": "deleted", "plan_id": plan_id}


@app.get("/api/qa/cases")
def qa_get_cases(
    plan_id: Optional[str] = None,
    suite: Optional[str] = None,
    priority: Optional[str] = None,
    user_and_role: tuple = Depends(require_role("qa", "tester", "developer", "admin")),
):
    return {"cases": list_test_cases(test_plan_id=plan_id, suite=suite, priority=priority)}


@app.post("/api/qa/cases")
def qa_create_case(
    req: CreateTestCaseRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    case = create_test_case(req.model_dump(), created_by=username)
    return {"case": case}


@app.patch("/api/qa/cases/{case_id}")
def qa_update_case(
    case_id: str,
    req: UpdateTestCaseRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_test_case(case_id, updates, user=username)
    if not updated:
        raise HTTPException(status_code=404, detail="Test case not found.")
    return {"case": updated}


@app.delete("/api/qa/cases/{case_id}")
def qa_delete_case(
    case_id: str,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    deleted = delete_test_case(case_id, user=username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test case not found.")
    return {"status": "deleted", "case_id": case_id}


@app.post("/api/qa/cases/generate-ai")
def qa_generate_ai_cases(
    req: GenerateAITestsRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    req.project_id = req.project_id or "sample_project"
    # Shared resolver: validates the file exists inside the selected project before any AI call.
    project_root, target_path = workflow.target_path(req.project_id, req.file_path)
    req.file_path = target_path.relative_to(project_root).as_posix()  # canonical project-relative path
    source_code = target_path.read_text(encoding="utf-8", errors="replace")
    generated = generate_ai_test_cases(
        source_code=source_code,
        file_path=str(req.file_path),
        context=req.context or "",
        created_by=username,
        project_id=req.project_id,
        test_plan_id=req.test_plan_id or "",
    )
    for case in generated:
        case.update(project_id=req.project_id, test_plan_id=req.test_plan_id or "", target_file=req.file_path)
    return {"test_cases": generated, "count": len(generated), "preview": True}


@app.get("/api/qa/bugs")
def qa_get_bugs(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    severity: Optional[str] = None,
    user_and_role: tuple = Depends(require_role("qa", "tester", "developer", "admin")),
):
    bugs = list_bugs(status=status, priority=priority, assigned_to=assigned_to, severity=severity)
    return {"bugs": bugs}


@app.post("/api/qa/bugs/{bug_id}/assign")
def qa_assign_bug(
    bug_id: str,
    req: AssignBugRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    updated = assign_bug(bug_id=bug_id, assigned_to=req.assigned_to, assigned_by=username)
    if not updated:
        raise HTTPException(status_code=404, detail="Bug not found.")
    return {"bug": updated}


@app.post("/api/qa/bugs/{bug_id}/close")
def qa_close_bug_endpoint(
    bug_id: str,
    req: QACloseBugRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    updated = qa_close_bug(bug_id=bug_id, closed_by=username, validation_notes=req.validation_notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Bug not found.")
    return {"bug": updated}


@app.post("/api/qa/bugs/{bug_id}/reopen")
def qa_reopen_bug_endpoint(
    bug_id: str,
    req: QAReopenBugRequest,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    username, role = user_and_role
    updated = qa_reopen_bug(bug_id=bug_id, reopened_by=username, reason=req.reason)
    if not updated:
        raise HTTPException(status_code=404, detail="Bug not found.")
    return {"bug": updated}


@app.get("/api/qa/report")
def qa_get_report(
    project_id: Optional[str] = None,
    user_and_role: tuple = Depends(require_role("qa", "admin")),
):
    return get_qa_report(project_id=project_id)


# ── Simplified QA Workflow Endpoints ─────────────────────────────────────────────

@app.get("/api/qa/simple/test-cases")
def simple_qa_get_test_cases(
    project_id: str = "sample_project",
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    cases = list(db.qa_test_cases.find({"project_id": project_id, "is_archived": {"$ne": True}}, {"_id": 0}))
    return {"test_cases": cases}


@app.post("/api/qa/simple/test-cases")
def simple_qa_create_test_case(
    req: SimpleQATestCaseRequest,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    case_id = f"tc_{uuid.uuid4().hex[:10]}"
    now = now_iso()
    case = {
        "id": case_id,
        "project_id": req.project_id,
        "title": req.title,
        "description": req.description,
        "target_file": req.target_file,
        "test_type": req.test_type,
        "test_code": req.test_code,
        "steps": req.steps or [],
        "expected_result": req.expected_result,
        "created_by": current_user,
        "created_at": now,
        "updated_at": now,
        "is_archived": False,
    }
    db.qa_test_cases.insert_one(case)
    log_department_action(current_user, "qa", "CREATE_TEST_CASE", req.project_id, case_id)
    case.pop("_id", None)
    return {"test_case": case}


@app.post("/api/qa/simple/test-cases/generate-ai")
def simple_qa_generate_test_cases(
    req: SimpleQAGenerateTestsRequest,
    current_user: str = Depends(get_current_user),
):
    # Use existing AI test generation
    from departments import generate_ai_test_cases, list_project_files
    from workflow import target_path
    
    project_root, target = target_path(req.project_id, req.file_path)
    source_code = target.read_text(encoding="utf-8", errors="replace")
    rel_path = target.relative_to(project_root).as_posix()
    
    generated = generate_ai_test_cases(
        source_code=source_code,
        file_path=rel_path,
        context="",
        created_by=current_user,
        project_id=req.project_id,
        test_plan_id="",
    )
    
    # Convert to simple QA test case format
    cases = []
    for case in generated:
        case_id = f"tc_{uuid.uuid4().hex[:10]}"
        now = now_iso()
        simple_case = {
            "id": case_id,
            "project_id": req.project_id,
            "title": case.get("title", "AI Generated Test"),
            "description": case.get("description", ""),
            "target_file": req.file_path,
            "test_type": "unit",
            "test_code": "",
            "steps": [s.get("action", "") for s in case.get("steps", [])],
            "expected_result": case.get("expected_result", "All tests pass"),
            "created_by": current_user,
            "created_at": now,
            "updated_at": now,
            "is_archived": False,
        }
        db.qa_test_cases.insert_one(simple_case)
        cases.append(simple_case)
        log_department_action(current_user, "qa", "GENERATE_AI_TEST_CASE", req.project_id, case_id)
    
    return {"test_cases": cases, "count": len(cases)}


@app.post("/api/qa/simple/test-runs")
def simple_qa_run_test_case(
    req: SimpleQATestRunRequest,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    from departments import execute_project_file_test
    
    # Get test case
    test_case = db.qa_test_cases.find_one({"id": req.test_case_id})
    if not test_case:
        raise HTTPException(404, "Test case not found.")
    
    run_id = f"tr_{uuid.uuid4().hex[:10]}"
    now = now_iso()
    
    # Execute the test
    execution = execute_project_file_test(test_case["target_file"], req.project_id)
    
    run = {
        "id": run_id,
        "project_id": req.project_id,
        "test_case_id": req.test_case_id,
        "status": "passed" if execution["passed"] else "failed",
        "started_at": now,
        "completed_at": now_iso(),
        "duration_ms": execution.get("duration_ms", 0),
        "output": execution.get("stdout", ""),
        "error_message": execution.get("error_summary", ""),
        "stack_trace": execution.get("stderr", ""),
        "executed_by": current_user,
        "created_at": now,
    }
    
    db.qa_test_runs.insert_one(run)
    log_department_action(current_user, "qa", "RUN_TEST_CASE", req.project_id, run_id, {
        "test_case_id": req.test_case_id,
        "status": run["status"]
    })
    
    # If test failed, auto-create an issue
    if not execution["passed"]:
        issue_id = f"issue_{uuid.uuid4().hex[:10]}"
        issue = {
            "id": issue_id,
            "project_id": req.project_id,
            "test_run_id": run_id,
            "test_case_id": req.test_case_id,
            "title": f"Test Failed: {test_case['title']}",
            "description": f"Test case '{test_case['title']}' failed with error: {execution.get('error_summary', 'Unknown error')}",
            "severity": "high",
            "priority": "high",
            "status": "open",
            "steps_to_reproduce": f"Run test case: {test_case['title']}\nTarget file: {test_case['target_file']}\nTest type: {test_case['test_type']}",
            "environment": "Development",
            "target_file": test_case["target_file"],
            "target_line": None,
            "error_logs": execution.get("stderr", ""),
            "stack_trace": execution.get("stdout", "") + "\n" + execution.get("stderr", ""),
            "assigned_developer": "",
            "reported_by": current_user,
            "fix_summary": "",
            "fixed_code": "",
            "code_diff": "",
            "history": [{
                "id": f"hist_{uuid.uuid4().hex[:10]}",
                "issue_id": issue_id,
                "actor": current_user,
                "action": "CREATED",
                "from_status": None,
                "to_status": "open",
                "notes": "Auto-created from test failure",
                "timestamp": now,
            }],
            "created_at": now,
            "updated_at": now,
        }
        db.qa_issues.insert_one(issue)
        log_department_action(current_user, "qa", "AUTO_CREATE_ISSUE", req.project_id, issue_id, {
            "test_run_id": run_id,
            "test_case_id": req.test_case_id,
        })
    
    run.pop("_id", None)
    return {"test_run": run}


@app.get("/api/qa/simple/test-runs")
def simple_qa_get_test_runs(
    project_id: str,
    test_case_id: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    query = {"project_id": project_id}
    if test_case_id:
        query["test_case_id"] = test_case_id
    runs = list(db.qa_test_runs.find(query, {"_id": 0}).sort("created_at", -1).limit(100))
    return {"test_runs": runs}


@app.get("/api/qa/simple/issues")
def simple_qa_get_issues(
    project_id: str,
    status: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    query = {"project_id": project_id}
    if status:
        query["status"] = status
    issues = list(db.qa_issues.find(query, {"_id": 0}).sort("created_at", -1))
    return {"issues": issues}


@app.get("/api/qa/simple/issues/{issue_id}")
def simple_qa_get_issue(
    issue_id: str,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    issue = db.qa_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(404, "Issue not found.")
    return {"issue": issue}


@app.patch("/api/qa/simple/issues/{issue_id}/status")
def simple_qa_update_issue_status(
    issue_id: str,
    req: SimpleQAIssueUpdateRequest,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    issue = db.qa_issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(404, "Issue not found.")
    
    valid_statuses = ["open", "in_progress", "fixed", "retest", "verified", "closed", "reopened"]
    if req.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    
    # Validate transitions
    current_status = issue["status"]
    allowed_transitions = {
        "open": ["in_progress"],
        "in_progress": ["fixed", "open"],
        "fixed": ["retest", "open"],
        "retest": ["verified", "reopened", "fixed"],
        "verified": ["closed", "retest"],
        "closed": ["reopened"],
        "reopened": ["in_progress", "open"],
    }
    
    if req.status not in allowed_transitions.get(current_status, []):
        raise HTTPException(400, f"Invalid transition from {current_status} to {req.status}")
    
    now = now_iso()
    history_entry = {
        "id": f"hist_{uuid.uuid4().hex[:10]}",
        "issue_id": issue_id,
        "actor": current_user,
        "action": "STATUS_CHANGE",
        "from_status": current_status,
        "to_status": req.status,
        "notes": req.notes,
        "timestamp": now,
    }
    
    updates = {
        "status": req.status,
        "updated_at": now,
    }
    
    if req.fixed_code:
        updates["fixed_code"] = req.fixed_code
    if req.fix_summary:
        updates["fix_summary"] = req.fix_summary
    
    if req.status == "fixed" and req.fixed_code:
        # Apply the fix to the file
        from workflow import target_path
        from fix_validator import validate_code_fix
        
        project_root, target = target_path(issue["project_id"], issue["target_file"])
        original = target.read_text(encoding="utf-8", errors="replace")
        
        validation = validate_code_fix(
            str(target.relative_to(project_root)), 
            original, 
            req.fixed_code,
            project_root=str(project_root)
        )
        
        if not validation.get("is_valid"):
            raise HTTPException(422, {"message": "Fix validation failed", "validation": validation})
        
        # Create backup and apply fix
        import hashlib
        backup = target.with_name(target.name + f".{issue_id}.v{issue.get('fix_revision', 0)+1}.{uuid.uuid4().hex[:8]}.bak")
        with backup.open("xb") as f:
            f.write(original.encode())
        
        target.write_text(req.fixed_code, encoding="utf-8")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        
        updates["fix_revision"] = issue.get("fix_revision", 0) + 1
        updates["fix_hash"] = digest
        updates["code_diff"] = validation.get("diff", "")
    
    db.qa_issues.update_one(
        {"id": issue_id},
        {
            "$set": updates,
            "$push": {"history": history_entry},
        }
    )
    log_department_action(current_user, "qa", "UPDATE_ISSUE_STATUS", issue["project_id"], issue_id, {
        "from_status": current_status,
        "to_status": req.status,
        "notes": req.notes,
    })
    
    updated = db.qa_issues.find_one({"id": issue_id}, {"_id": 0})
    return {"issue": updated}


@app.post("/api/qa/simple/issues/{issue_id}/assign")
def simple_qa_assign_issue(
    issue_id: str,
    req: SimpleQAIssueAssignRequest,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    issue = db.qa_issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(404, "Issue not found.")
    
    # Verify developer exists and is active
    from auth import list_registered_users
    users = {u["username"]: u for u in list_registered_users()}
    if req.developer_username not in users:
        raise HTTPException(404, "Developer not found.")
    if users[req.developer_username].get("role") != "developer":
        raise HTTPException(400, "User is not a developer.")
    if users[req.developer_username].get("disabled"):
        raise HTTPException(400, "Developer account is disabled.")
    
    now = now_iso()
    history_entry = {
        "id": f"hist_{uuid.uuid4().hex[:10]}",
        "issue_id": issue_id,
        "actor": current_user,
        "action": "ASSIGNED",
        "from_status": issue["status"],
        "to_status": issue["status"],
        "notes": f"Assigned to developer: {req.developer_username}",
        "timestamp": now,
    }
    
    if issue["status"] == "open":
        history_entry["to_status"] = "in_progress"
        history_entry["action"] = "ASSIGNED_AND_STARTED"
    
    try:
        db.qa_issues.update_one(
            {"id": issue_id},
            {
                "$set": {
                    "assigned_developer": req.developer_username,
                    "updated_at": now,
                    **({"status": "in_progress"} if issue["status"] == "open" else {}),
                },
                "$push": {"history": history_entry},
            }
        )
        log_department_action(current_user, "qa", "ASSIGN_ISSUE", issue["project_id"], issue_id, {
            "developer": req.developer_username,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise
    
    updated = db.qa_issues.find_one({"id": issue_id}, {"_id": 0})
    return {"issue": updated}


@app.get("/api/qa/simple/summary")
def simple_qa_get_summary(
    project_id: str,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    issues = list(db.qa_issues.find({"project_id": project_id}, {"_id": 0}))
    
    statuses = ["open", "in_progress", "fixed", "retest", "verified", "closed", "reopened"]
    by_status = {s: sum(1 for i in issues if i.get("status") == s) for s in statuses}
    
    severities = ["critical", "high", "medium", "low"]
    by_severity = {s: sum(1 for i in issues if i.get("severity") == s) for s in severities}
    
    return {
        "project_id": project_id,
        "total_issues": len(issues),
        "open_issues": by_status["open"],
        "in_progress_issues": by_status["in_progress"],
        "fixed_issues": by_status["fixed"],
        "retest_issues": by_status["retest"],
        "verified_issues": by_status["verified"],
        "closed_issues": by_status["closed"],
        "reopened_issues": by_status["reopened"],
        "critical_issues": by_severity["critical"],
        "high_issues": by_severity["high"],
        "medium_issues": by_severity["medium"],
        "low_issues": by_severity["low"],
        "by_status": by_status,
    }


@app.post("/api/qa/simple/issues/{issue_id}/retest")
def simple_qa_retest_issue(
    issue_id: str,
    req: SimpleQARetestRequest,
    current_user: str = Depends(get_current_user),
):
    db = require_db()
    issue = db.qa_issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(404, "Issue not found.")
    
    if issue["status"] not in ["fixed", "reopened"]:
        raise HTTPException(400, "Issue must be in 'fixed' or 'reopened' status to retest.")
    
    test_run = db.qa_test_runs.find_one({"id": req.test_run_id})
    if not test_run:
        raise HTTPException(404, "Test run not found.")
    
    # Execute the test again
    from departments import execute_project_file_test
    execution = execute_project_file_test(issue["target_file"], issue["project_id"])
    
    now = now_iso()
    new_run_id = f"tr_{uuid.uuid4().hex[:10]}"
    new_run = {
        "id": new_run_id,
        "project_id": issue["project_id"],
        "test_case_id": test_run["test_case_id"],
        "status": "passed" if execution["passed"] else "failed",
        "started_at": now,
        "completed_at": now_iso(),
        "duration_ms": execution.get("duration_ms", 0),
        "output": execution.get("stdout", ""),
        "error_message": execution.get("error_summary", ""),
        "stack_trace": execution.get("stderr", ""),
        "executed_by": current_user,
        "created_at": now,
    }
    
    db.qa_test_runs.insert_one(new_run)
    
    # Update issue status based on test result
    if execution["passed"]:
        new_status = "verified"
    else:
        new_status = "reopened"
    
    history_entry = {
        "id": f"hist_{uuid.uuid4().hex[:10]}",
        "issue_id": issue_id,
        "actor": current_user,
        "action": "RETEST",
        "from_status": issue["status"],
        "to_status": new_status,
        "notes": f"Retest {'passed' if execution['passed'] else 'failed'}: {execution.get('error_summary', 'All tests passed')}",
        "timestamp": now,
    }
    
    db.qa_issues.update_one(
        {"id": issue_id},
        {"$set": {"status": new_status, "updated_at": now}, "$push": {"history": history_entry}}
    )
    
    log_department_action(current_user, "qa", "RETEST_ISSUE", issue["project_id"], issue_id, {
        "test_run_id": new_run_id,
        "result": new_status,
    })
    
    updated_issue = db.qa_issues.find_one({"id": issue_id}, {"_id": 0})
    new_run.pop("_id", None)
    return {"test_run": new_run, "issue": updated_issue}


# ── Testing Department Endpoints ──────────────────────────────────────────────

@app.get("/api/testing/runs")
def testing_get_runs(
    project_id: Optional[str] = None,
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    return {"runs": list_test_runs(project_id=project_id)}


@app.post("/api/testing/runs")
def testing_create_run(
    req: CreateTestRunRequest,
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    username, role = user_and_role
    run = create_test_run(
        name=req.name,
        created_by=username,
        project_id=req.project_id or "sample_project",
        test_plan_id=req.test_plan_id,
        environment=req.environment or "Development",
        target_commit=req.target_commit or "HEAD",
        test_case_ids=req.test_case_ids,
    )
    return {"run": run}


@app.get("/api/testing/results")
def testing_get_results(
    test_run_id: Optional[str] = None,
    tester_id: Optional[str] = None,
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    results = list_test_results(test_run_id=test_run_id, tester_id=tester_id)
    return {"results": results}


@app.patch("/api/testing/results/{result_id}")
def testing_update_result(
    result_id: str,
    req: UpdateTestResultRequest,
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    username, role = user_and_role
    updated = update_test_result(
        result_id=result_id,
        status=req.status,
        actual_result=req.notes or "",
        duration_ms=req.duration_ms or 0,
        evidence=req.evidence,
        tester_id=username,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Test result not found.")
    return {"result": updated}


@app.post("/api/testing/results/{result_id}/rerun")
def testing_rerun_result(
    result_id: str,
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    username, role = user_and_role
    rerun = rerun_test_result(result_id=result_id, tester_id=username)
    if not rerun:
        raise HTTPException(status_code=404, detail="Test result not found.")
    return {"result": rerun}


@app.post("/api/testing/bugs")
def testing_create_bug(
    req: CreateBugFromTestRequest,
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    username, role = user_and_role
    bug = create_bug_from_test_failure(
        test_result_id=req.test_result_id,
        reporter=username,
        title_override=req.title,
        description_override=req.description,
        severity_override=req.severity,
        priority_override=req.priority,
        steps_to_reproduce=req.steps_to_reproduce or "",
        logs=req.logs or "",
    )
    if not bug:
        raise HTTPException(status_code=400, detail="Could not create bug from test result.")
    return {"bug": bug}


@app.get("/api/testing/report")
def testing_get_report(
    user_and_role: tuple = Depends(require_role("tester", "qa", "admin")),
):
    username, role = user_and_role
    return get_tester_report(tester_id=username)


# ── Developer Department Endpoints ────────────────────────────────────────────

@app.get("/api/developer/bugs")
def developer_get_bugs(
    user_and_role: tuple = Depends(require_role("developer", "admin")),
):
    username, role = user_and_role
    bugs = list_bugs(assigned_to=username)
    return {"bugs": bugs}


@app.post("/api/developer/bugs/{bug_id}/submit-fix")
def developer_submit_bug_fix(
    bug_id: str,
    req: DeveloperSubmitFixRequest,
    user_and_role: tuple = Depends(require_role("developer", "admin")),
):
    username, role = user_and_role
    updated = developer_submit_fix(
        bug_id=bug_id,
        developer_id=username,
        fix_explanation=req.fix_explanation,
        fixed_code=req.fixed_code or "",
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Bug not found.")
    return {"bug": updated}


@app.post("/api/developer/bugs/{bug_id}/ai-analyze")
def developer_analyze_bug(
    bug_id: str,
    user_and_role: tuple = Depends(require_role("developer", "qa", "admin")),
):
    import ai_workflow
    analysis = ai_workflow.bug_analysis(bug_id, user_and_role)
    if not analysis:
        raise HTTPException(status_code=404, detail="Bug not found.")
    return {"analysis": analysis}


# ── Department Oversight & Collaboration ──────────────────────────────────────

@app.get("/api/department/overview")
def department_overview(
    user_and_role: tuple = Depends(require_role("admin", "qa", "tester", "developer")),
):
    from departments import ticket_as_bug
    username, role = user_and_role
    qa_report = get_qa_report()
    recent_events = list_audit_events(limit=25)
    # Canonical workflow items (includes tickets created directly, not only legacy bugs).
    recent_bugs = [ticket_as_bug(t) for t in workflow.items(user_and_role)[:25]]
    return {
        "qa_metrics": qa_report,
        "recent_audit_events": recent_events,
        "recent_bugs": recent_bugs,
    }


@app.get("/api/department/audit-events")
def department_audit_events(
    limit: int = 50,
    admin_user: str = Depends(require_admin_user),
):
    return {"events": list_audit_events(limit=limit)}


# ── Health ────────────────────────────────────────────────────────────────────

def registered_source(directory: str, filename: str) -> Path:
    root = Path(directory).resolve()
    selected = next((p for p in list_projects() if Path(p["path"]).resolve() == root), None)
    if not selected:
        raise HTTPException(400, "Import the project before accessing source files.")
    return workflow.target_path(selected["id"], filename)[1]


@app.get("/api/workflow/items")
def workflow_items(project_id: Optional[str] = None, user: tuple = Depends(get_current_user_and_role)):
    return {"items": workflow.items(user, project_id)}


@app.get("/api/workflow/items/{item_id}")
def workflow_item(item_id: str, user: tuple = Depends(get_current_user_and_role)):
    return {"item": workflow.get(item_id, user)}


@app.post("/api/workflow/items")
def workflow_create(req: CreateTicketRequest, user: tuple = Depends(get_current_user_and_role)):
    return {"item": workflow.create(req.model_dump(), user)}


@app.patch("/api/workflow/items/{item_id}/assign")
def workflow_assign(item_id: str, req: AssignTicketRequest, user: tuple = Depends(get_current_user_and_role)):
    return {"item": workflow.assign(item_id, req.model_dump(exclude_none=True), user)}


@app.post("/api/workflow/items/{item_id}/transition")
def workflow_transition(item_id: str, req: AdvanceTicketRequest, user: tuple = Depends(get_current_user_and_role)):
    return {"item": workflow.transition(item_id, req.next_status, user, req.notes or "", req.version)}


@app.post("/api/workflow/items/{item_id}/comments")
def workflow_comment(item_id: str, req: WorkflowCommentRequest, user: tuple = Depends(get_current_user_and_role)):
    return {"item": workflow.comment(item_id, req.text, user)}


@app.post("/api/workflow/items/{item_id}/fix")
def workflow_fix(item_id: str, req: WorkflowFixRequest, user: tuple = Depends(get_current_user_and_role)):
    return {"item": workflow.fix(item_id, req.fixed_code, req.fix_explanation, user, req.version)}


@app.post("/api/workflow/items/{item_id}/tests")
def workflow_tests(item_id: str, req: WorkflowTestRequest, user: tuple = Depends(get_current_user_and_role)):
    return workflow.tests(item_id, req.model_dump(), user)


@app.post("/api/workflow/items/{item_id}/regression")
def workflow_regression(item_id: str, req: WorkflowRegressionRequest, user: tuple = Depends(get_current_user_and_role)):
    """QA/Tester: run all automated project test cases against the current fix and record evidence."""
    return workflow.regression(item_id, user, bool(req.auto_advance))


@app.get("/api/workflow/items/{item_id}/source")
def workflow_source(item_id: str, user: tuple = Depends(require_role("developer", "qa", "admin"))):
    """Current contents of the item's registered target file (for editing a full replacement)."""
    import ai_workflow
    _, _, rel, code = ai_workflow.item_source(workflow.load(item_id))
    return {"file": rel, "code": code}


@app.post("/api/workflow/items/{item_id}/ai/analyze")
def workflow_ai_analyze(item_id: str, user: tuple = Depends(require_role("developer", "qa", "tester", "admin"))):
    import ai_workflow
    return {"analysis": ai_workflow.bug_analysis(item_id, user)}


@app.post("/api/workflow/items/{item_id}/ai/generate-fix")
def workflow_ai_generate_fix(item_id: str, user: tuple = Depends(require_role("developer", "admin"))):
    import ai_workflow
    return {"fix": ai_workflow.generate_fix(item_id, user)}


@app.post("/api/workflow/items/{item_id}/verify-fix")
def workflow_verify_fix(item_id: str, req: WorkflowCodeRequest, user: tuple = Depends(require_role("developer", "admin"))):
    import ai_workflow
    return {"verification": ai_workflow.verify_fix(item_id, user, req.fixed_code or "")}


@app.post("/api/workflow/items/{item_id}/ai/code-review")
def workflow_ai_code_review(item_id: str, req: WorkflowCodeRequest, user: tuple = Depends(require_role("developer", "qa", "admin"))):
    import ai_workflow
    return {"review": ai_workflow.code_review(item_id, user, req.fixed_code or None)}


@app.post("/api/workflow/items/{item_id}/ai/test-cases")
def workflow_ai_test_cases(item_id: str, req: WorkflowGenerateTestsRequest, user: tuple = Depends(require_role("qa", "admin"))):
    import ai_workflow
    return ai_workflow.generate_tests(item_id, user, bool(req.save))


@app.get("/api/workflow/summary")
def workflow_summary(project_id: Optional[str] = None, user: tuple = Depends(get_current_user_and_role)):
    return workflow.summary(user, project_id)


@app.get("/api/notifications")
def workflow_notifications(user: tuple = Depends(get_current_user_and_role)):
    return workflow.notifications(user)


@app.post("/api/notifications/{notification_id}/read")
def workflow_notification_read(notification_id: str, user: tuple = Depends(get_current_user_and_role)):
    return workflow.read_notification(notification_id, user)

@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8001")),
    )
