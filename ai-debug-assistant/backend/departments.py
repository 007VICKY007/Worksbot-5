# backend/departments.py
"""
Mindora AI — Role-Based Department Engine (Developer, QA, Tester, Admin).
Manages Test Plans, Test Cases, AI Test Generation, Test Runs & Results,
Bug Lifecycle Workflow, End-to-End Collaboration Traceability, and QA/Tester Metrics.
Persisted in MongoDB: mindora_debug_assistant
"""

import os
import re
import uuid
import json
import time
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
import sys

ROOT = Path(__file__).parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))
if str(Path(__file__).parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).parent))

from mongo import get_mongo_db
from fastapi import HTTPException
from rag_pipeline import retrieve_relevant_memories, store_error_memory

load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).parent / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.getenv("OPENAI_MODEL", "gpt-4o")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_db():
    db = get_mongo_db()
    if db is None:
        raise HTTPException(503, "Department database unavailable.")
    return db


def result_status(value):
    value = str(value or "pending").lower()
    return {"pass": "passed", "fail": "failed", "not_run": "pending"}.get(value, value)


# ── Audit Event Logger ────────────────────────────────────────────────────────

def log_department_action(
    username: str,
    role: str,
    action: str,
    project_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Log structured department and workflow activities to MongoDB audit_events."""
    db = get_mongo_db()
    if db is None:
        return
    try:
        event = {
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "username": username,
            "role": role,
            "action": action,
            "project_id": project_id or "default",
            "resource_id": resource_id or "",
            "timestamp": now_iso(),
            "metadata": metadata or {},
        }
        db.audit_events.insert_one(event)
    except Exception as e:
        print(f"[Audit] Failed to record event '{action}': {e}")


def list_audit_events(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve the most recent audit activity events from MongoDB."""
    db = get_mongo_db()
    if db is None:
        return []
    try:
        return list(db.audit_events.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit))
    except Exception as e:
        print(f"[Audit] Failed to list audit events: {e}")
        return []


# ── Project Directory / Catalog ───────────────────────────────────────────────

DEFAULT_PROJECTS = [
    {
        "id": "sample_project",
        "name": "Sample Multi-Language System",
        "path": str(ROOT / "sample_project"),
        "version": "1.4.0",
        "description": "Core polyglot microservice suite (Python, JS, TS, Java, C, Go, SQL).",
        "environments": ["Development", "Staging", "Production"]
    },
    {
        "id": "ai_debug_assistant",
        "name": "Mindora AI Engine",
        "path": str(ROOT),
        "version": "2.0.0",
        "description": "FastAPI + Next.js static analysis, sandbox fix verification and RAG memory engine.",
        "environments": ["Development", "Staging", "Production"]
    }
]

def list_projects() -> List[Dict[str, Any]]:
    """Return available projects."""
    db = get_mongo_db()
    if db is not None:
        try:
            custom = list(db.projects.find({}, {"_id": 0}))
            if custom:
                return custom + [p for p in DEFAULT_PROJECTS if p["id"] not in {c["id"] for c in custom}]
        except Exception:
            pass
    return DEFAULT_PROJECTS


IGNORED_PROJECT_DIRS = {
    ".git", "__pycache__", ".pytest_cache", "node_modules", "dist", "build", ".next", ".venv", "venv", ".idea", ".vscode"
}

ALLOWED_CODE_EXTENSIONS = {
    ".py", ".ts", ".js", ".tsx", ".jsx", ".java", ".go", ".c", ".cpp", ".rs", ".sql", ".sh"
}

def list_project_files(project_id: str = "sample_project") -> List[Dict[str, Any]]:
    """Return all source and test files within a project directory."""
    projects = list_projects()
    matched = next((p for p in projects if p["id"] == project_id), None)
    if not matched:
        raise HTTPException(404, "Project not found.")
    base_dir = Path(matched["path"]).resolve()
    if not base_dir.is_dir():
        raise HTTPException(404, "Project directory unavailable.")

    files = []
    try:
        for p in base_dir.rglob("*"):
            if not p.is_file():
                continue
            if any(part in IGNORED_PROJECT_DIRS or part.startswith(".") for part in p.relative_to(base_dir).parts):
                continue
            if not p.resolve().is_relative_to(base_dir):
                continue
            if p.suffix.lower() not in ALLOWED_CODE_EXTENSIONS:
                continue

            rel_to_root = str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p.relative_to(base_dir))
            try:
                rel_to_proj = str(p.relative_to(base_dir))
            except Exception:
                rel_to_proj = p.name

            import project_runner
            is_test = project_runner.is_test_file(rel_to_proj)

            ext = p.suffix.lower()
            lang_map = {
                ".py": "python", ".ts": "typescript", ".tsx": "typescript",
                ".js": "javascript", ".jsx": "javascript", ".java": "java",
                ".go": "go", ".c": "c", ".cpp": "cpp", ".rs": "rust",
                ".sql": "sql", ".sh": "shell"
            }

            files.append({
                "path": rel_to_root,
                "project_relative_path": rel_to_proj,
                "name": p.name,
                "extension": ext,
                "size": p.stat().st_size,
                "language": lang_map.get(ext, "text"),
                "is_test": is_test,
            })
    except Exception as e:
        print(f"[Departments] Error listing project files: {e}")

    # Sort test files first, then alphabetical
    files.sort(key=lambda f: (not f["is_test"], f["name"]))
    return files


def execute_project_file_test(file_path: str, project_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Safely execute a project file or test scenario in a subprocess.
    Captures stdout, stderr, exceptions, exit code, and execution time.
    """
    from workflow import target_path
    import project_runner
    root, target = target_path(project_id or "sample_project", file_path)
    return project_runner.run_target(root, target.relative_to(root).as_posix())


def _source_under_test(project_id: str, test_file: str) -> str:
    """For a failing test file (test_calc.py / calc_test.py / calc.test.js) return the sibling
    source module it exercises, so the developer fixes code rather than the test. Falls back to test_file."""
    from workflow import target_path
    if not test_file:
        return ""
    try:
        root, target = target_path(project_id or "sample_project", test_file)
    except Exception:
        return test_file
    name = target.name
    candidates = []
    if name.startswith("test_"):
        candidates.append(name[5:])
    for marker in ("_test.", ".test.", ".spec."):
        if marker in name:
            stem, ext = name.split(marker, 1)
            candidates.append(f"{stem}.{ext}")
    for cand in candidates:
        for folder in (target.parent, target.parent.parent, root):
            path = folder / cand
            if path.is_file() and root.resolve() in path.resolve().parents:
                return str(path.resolve().relative_to(root.resolve()))
    return test_file


def run_file_in_root(root: Path, target: Path, file_path: str = "") -> Dict[str, Any]:
    """Execute an already-validated file under `root` (project dir or a sandbox copy of it),
    using the project's own detected test framework."""
    import project_runner
    rel = file_path or target.relative_to(root).as_posix()
    return project_runner.run_target(root, rel)


def _legacy_run_file_in_root(root: Path, target: Path, file_path: str = "") -> Dict[str, Any]:
    """(retired) naive single-interpreter runner, kept for reference only."""
    start_t = time.perf_counter()
    ext = target.suffix.lower()
    is_test_file = target.name.startswith("test_") or target.name.endswith(("_test.py", ".spec.ts", ".test.js", ".test.ts", ".spec.js"))

    cmd = []
    if ext == ".py":
        if is_test_file:
            cmd = [sys.executable, "-m", "pytest", str(target), "-v", "--no-header"]
        else:
            cmd = [sys.executable, str(target)]
    elif ext in [".js", ".mjs"]:
        cmd = ["node", str(target)]
    elif ext in [".sh"]:
        cmd = ["bash", str(target)]
    else:
        return {"status": "BLOCKED", "passed": False, "exit_code": None, "duration_ms": 0,
                "file_path": file_path, "stdout": "", "stderr": "No configured runner for this language.",
                "error_summary": "Unsupported test runner", "executed_at": now_iso()}

    stdout, stderr = "", ""
    exit_code = 0
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=12,
            env={"PATH": os.defpath, "LANG": "C.UTF-8", "PYTHONPATH": str(root),
                 "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "PYTHONDONTWRITEBYTECODE": "1"}
        )
        stdout = proc.stdout
        stderr = proc.stderr
        exit_code = proc.returncode
    except subprocess.TimeoutExpired:
        exit_code = 124
        stderr = "Execution timed out after 12 seconds."
    except Exception as e:
        exit_code = 1
        stderr = str(e)

    duration_ms = int((time.perf_counter() - start_t) * 1000)
    no_tests = is_test_file and ext == ".py" and not re.search(r"\b[1-9]\d* passed\b", stdout)
    passed = exit_code == 0 and not no_tests
    blocked = exit_code in (5, 124) or no_tests

    # Extract error type and error summary
    error_type = ""
    error_summary = ""
    combined_err = (stderr + "\n" + (stdout if exit_code != 0 else "")).strip()

    if not passed:
        for line in reversed(combined_err.splitlines()):
            line_str = line.strip()
            if "Error:" in line_str or "Exception:" in line_str or "FAILED" in line_str:
                error_summary = line_str
                parts = line_str.split(":", 1)
                error_type = parts[0].strip().split()[-1]
                break
        if not error_summary and combined_err:
            error_summary = combined_err.splitlines()[-1]
            error_type = "RuntimeError"
    else:
        error_summary = "Execution succeeded without unhandled errors."

    return {
        "status": "PASSED" if passed else ("BLOCKED" if blocked else "FAILED"),
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "file_path": str(target.relative_to(root)),
        "stdout": stdout.strip()[-50000:],
        "stderr": stderr.strip()[-50000:],
        "error_type": error_type,
        "error_summary": error_summary,
        "passed": passed,
        "executed_at": now_iso()
    }


# ── QA: Test Plans ────────────────────────────────────────────────────────────

def list_test_plans(project_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """List test plans with optional filtering."""
    db = get_mongo_db()
    if db is None:
        return []
    query: Dict[str, Any] = {}
    if project_id and project_id != "all":
        query["project_id"] = project_id
    if status and status != "all":
        query["status"] = status.upper()
    return list(db.test_plans.find(query, {"_id": 0}).sort("created_at", -1))


def create_test_plan(data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    """Create a new test plan."""
    db = require_db()
    plan_id = f"tp_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": plan_id,
        "project_id": data.get("project_id", "sample_project"),
        "name": data.get("name", "Regression Test Plan"),
        "description": data.get("description", ""),
        "scope": data.get("scope") or "",
        "objectives": data.get("objectives") or "",
        "target_date": data.get("target_date") or "",
        "version": data.get("version", "1.0.0"),
        "environment": data.get("environment", "Staging"),
        "status": data.get("status", "DRAFT").upper(),
        "created_by": created_by,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if db is not None:
        db.test_plans.insert_one(doc)
    doc.pop("_id", None)
    log_department_action(created_by, "qa", "TEST_PLAN_CREATED", doc["project_id"], plan_id, {"name": doc["name"]})
    return doc


def delete_test_plan(plan_id: str, user: str = "qa") -> bool:
    """Delete a test plan."""
    db = get_mongo_db()
    if db is None:
        return False
    plan = db.test_plans.find_one({"id": plan_id})
    res = db.test_plans.delete_one({"id": plan_id})
    if res.deleted_count > 0:
        log_department_action(user, "qa", "TEST_PLAN_DELETED", plan.get("project_id") if plan else "sample_project", plan_id, {})
        return True
    return False


def update_test_plan(plan_id: str, updates: Dict[str, Any], user: str = "qa") -> Optional[Dict[str, Any]]:
    """Update test plan details or status."""
    db = get_mongo_db()
    if db is None:
        return None
    updates["updated_at"] = now_iso()
    db.test_plans.update_one({"id": plan_id}, {"$set": updates})
    doc = db.test_plans.find_one({"id": plan_id}, {"_id": 0})
    if doc:
        log_department_action(user, "qa", "TEST_PLAN_UPDATED", doc.get("project_id"), plan_id, updates)
    return doc


# ── QA: Test Cases ────────────────────────────────────────────────────────────

def list_test_cases(
    project_id: Optional[str] = None,
    test_plan_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    suite: Optional[str] = None,
    priority: Optional[str] = None,
    **kwargs: Any,
) -> List[Dict[str, Any]]:
    """List test cases."""
    db = get_mongo_db()
    if db is None:
        return []
    query: Dict[str, Any] = {"is_archived": {"$ne": True}}
    if project_id and project_id != "all":
        query["project_id"] = project_id
    if test_plan_id and test_plan_id != "all":
        query["test_plan_id"] = test_plan_id
    if assigned_to and assigned_to != "all":
        query["assigned_to"] = assigned_to
    if suite and suite != "all":
        query["suite"] = {"$regex": f"^{re.escape(suite)}$", "$options": "i"}
    if priority and priority != "all":
        query["priority"] = {"$regex": f"^{re.escape(priority)}$", "$options": "i"}
    return list(db.test_cases.find(query, {"_id": 0}).sort("created_at", -1))


def create_test_case(data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    """Create a new test case."""
    db = require_db()
    plan = db.test_plans.find_one({"id": data.get("test_plan_id")})
    if data.get("test_plan_id") and not plan:
        raise HTTPException(404, "Test plan not found.")
    case_id = f"tc_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": case_id,
        "project_id": plan["project_id"] if plan else data.get("project_id", "sample_project"),
        "test_plan_id": data.get("test_plan_id", ""),
        "title": data.get("title", "Untitled Test Case"),
        "suite": data.get("suite") or "regression",
        "target_file": data.get("target_file") or "",
        "tags": data.get("tags") or [],
        "description": data.get("description", ""),
        "preconditions": data.get("preconditions", []),
        "steps": data.get("steps", []),
        "expected_result": data.get("expected_result", ""),
        "priority": data.get("priority", "HIGH").upper(),
        "type": data.get("type", "FUNCTIONAL").upper(),
        "created_by": created_by,
        "assigned_to": data.get("assigned_to", "tester"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "is_archived": False,
    }
    if db is not None:
        db.test_cases.insert_one(doc)
    doc.pop("_id", None)
    log_department_action(created_by, "qa", "TEST_CASE_CREATED", doc["project_id"], case_id, {"title": doc["title"]})
    return doc


def delete_test_case(case_id: str, user: str = "qa") -> bool:
    """Delete a test case."""
    db = get_mongo_db()
    if db is None:
        return False
    tc = db.test_cases.find_one({"id": case_id})
    res = db.test_cases.delete_one({"id": case_id})
    if res.deleted_count > 0:
        log_department_action(user, "qa", "TEST_CASE_DELETED", tc.get("project_id") if tc else "sample_project", case_id, {})
        return True
    return False


def update_test_case(case_id: str, updates: Dict[str, Any], user: str = "qa") -> Optional[Dict[str, Any]]:
    """Update test case details or tester assignment."""
    db = get_mongo_db()
    if db is None:
        return None
    updates["updated_at"] = now_iso()
    db.test_cases.update_one({"id": case_id}, {"$set": updates})
    doc = db.test_cases.find_one({"id": case_id}, {"_id": 0})
    if doc:
        log_department_action(user, "qa", "TEST_CASE_UPDATED", doc.get("project_id"), case_id, updates)
    return doc


def generate_ai_test_cases(
    requirements: Optional[str] = None,
    source_code: Optional[str] = None,
    file_path: Optional[str] = None,
    context: Optional[str] = None,
    project_id: str = "sample_project",
    test_plan_id: str = "",
    test_type: str = "FUNCTIONAL",
    created_by: str = "qa",
    **kwargs: Any,
) -> List[Dict[str, Any]]:
    """
    Generate structured test cases using GPT-4o from requirements, user stories, or code definitions.
    Returns preview objects for QA acceptance.
    """
    spec = (requirements or "").strip()
    if not spec:
        spec = f"Target File: {file_path or 'Source Code'}\nContext: {context or 'Generate test cases'}\nSource Code Snippet:\n{source_code or ''}"
    requirements = spec
    # Short human label for fallback titles (never the raw prompt / source code).
    subject = file_path or (spec.splitlines()[0] if spec else "target module")
    subject = subject[:80]

    if not OPENAI_API_KEY:
        # Fallback generated test cases
        return [
            {
                "title": f"Verify {subject} - Standard Success Flow",
                "type": test_type.upper(),
                "priority": "HIGH",
                "preconditions": ["System is active and accessible", "Test credentials provisioned"],
                "steps": ["Initialize target module", "Provide valid input payload", "Submit operation"],
                "expected_result": "Operation succeeds with HTTP 200 / valid state.",
            },
            {
                "title": f"Verify {subject} - Negative & Boundary Handling",
                "type": "NEGATIVE",
                "priority": "CRITICAL",
                "preconditions": ["Target module initialized"],
                "steps": ["Inject null, empty, or overflow payload", "Observe defensive handling"],
                "expected_result": "Application rejects input safely without unhandled exception or crash.",
            }
        ]

    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    if "MINDORA RAG INSTITUTIONAL MEMORY" not in requirements:
        try:
            from rag_pipeline import format_rag_prompt_context
            memories = retrieve_relevant_memories(query_text=requirements[:2000], top_k=3, min_similarity=0.45)
            requirements = requirements + "\n\n" + format_rag_prompt_context(memories) if memories else requirements
        except Exception as exc:
            print(f"[AI QA] RAG context unavailable: {exc}")

    system_prompt = """You are Mindora's elite QA Test Engineering AI.
Generate comprehensive, robust, and rigorous test cases for software verification.
Your test cases must include:
1. title: Clear, concise test objective
2. type: FUNCTIONAL, REGRESSION, INTEGRATION, API, UI, SECURITY, PERFORMANCE, NEGATIVE, or BOUNDARY
3. priority: CRITICAL, HIGH, MEDIUM, or LOW
4. preconditions: List of required setup steps/states
5. steps: Numbered/ordered array of clear execution steps
6. expected_result: Precise, verifiable outcome

Respond strictly in valid JSON format:
{
  "test_cases": [
    {
      "title": "string",
      "type": "FUNCTIONAL|NEGATIVE|BOUNDARY|REGRESSION|SECURITY",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "preconditions": ["string"],
      "steps": ["string"],
      "expected_result": "string"
    }
  ]
}"""

    user_prompt = f"""Generate 4 to 6 detailed {test_type} test cases based on these requirements and context:
{requirements}

Project ID: {project_id}
Test Plan ID: {test_plan_id}"""

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        content = json.loads(resp.choices[0].message.content or "{}")
        cases = content.get("test_cases", [])
        return cases
    except Exception as e:
        print(f"[AI QA] Error generating test cases: {e}")
        return [
            {
                "title": f"Validate {subject} (AI unavailable: fallback case)",
                "type": test_type.upper(),
                "priority": "HIGH",
                "preconditions": ["System is online"],
                "steps": ["Execute standard scenario", "Verify return code"],
                "expected_result": "Matches expected specification.",
            }
        ]


# ── Testing: Test Runs & Test Execution ───────────────────────────────────────

def list_test_runs(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """List execution test runs."""
    db = get_mongo_db()
    if db is None:
        return []
    query: Dict[str, Any] = {}
    if project_id and project_id != "all":
        query["project_id"] = project_id
    return list(db.test_runs.find(query, {"_id": 0}).sort("started_at", -1))


def create_test_run(
    project_id: str = "sample_project",
    test_plan_id: Optional[str] = None,
    environment: str = "Staging",
    started_by: str = "tester",
    name: Optional[str] = None,
    target_commit: str = "HEAD",
    test_case_ids: Optional[List[str]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Start a new test execution run and initialize test results for all plan test cases."""
    db = require_db()
    started_by = kwargs.get("created_by") or started_by
    if test_plan_id:
        plan = db.test_plans.find_one({"id": test_plan_id})
        if not plan:
            raise HTTPException(404, "Test plan not found.")
        if plan["project_id"] != project_id:
            raise HTTPException(400, "Test plan belongs to another project.")
    run_id = f"tr_{uuid.uuid4().hex[:10]}"
    
    # Retrieve test cases for this plan or project
    plan_cases = []
    if db is not None:
        if test_case_ids is not None:
            plan_cases = list(db.test_cases.find({"id": {"$in": test_case_ids}, "project_id": project_id,
                                                  "is_archived": {"$ne": True}}, {"_id": 0}))
            if {c["id"] for c in plan_cases} != set(test_case_ids):
                raise HTTPException(404, "Some test case IDs are missing, archived, or belong to another project.")
            if test_plan_id and any(c.get("test_plan_id") != test_plan_id for c in plan_cases):
                raise HTTPException(400, "Some test cases belong to another plan.")
        elif test_plan_id:
            plan_cases = list(db.test_cases.find({"test_plan_id": test_plan_id, "is_archived": {"$ne": True}}, {"_id": 0}))
        elif project_id:
            plan_cases = list(db.test_cases.find({"project_id": project_id, "is_archived": {"$ne": True}}, {"_id": 0}))

    if not plan_cases:
        raise HTTPException(400, "A test run requires at least one active test case.")
    run_doc = {
        "id": run_id,
        "name": name or f"Execution Run {run_id}",
        "project_id": project_id,
        "test_plan_id": test_plan_id or "",
        "environment": environment,
        "target_commit": target_commit,
        "started_by": started_by,
        "created_by": started_by,
        "started_at": now_iso(),
        "completed_at": None,
        "status": "RUNNING",
        "total_tests": len(plan_cases),
        "passed": 0,
        "failed": 0,
        "blocked": 0,
        "skipped": 0,
        "passed_count": 0,
        "failed_count": 0,
        "blocked_count": 0,
        "skipped_count": 0,
    }

    if db is not None:
        db.test_runs.insert_one(run_doc)
        run_doc.pop("_id", None)
        # Seed initial NOT_RUN result items for each case
        for tc in plan_cases:
            res_id = f"res_{uuid.uuid4().hex[:10]}"
            res_doc = {
                "id": res_id,
                "test_run_id": run_id,
                "project_id": project_id,
                "target_file": tc.get("target_file", ""),
                "test_case_id": tc["id"],
                "test_case_title": tc.get("title", ""),
                "test_case_type": tc.get("type", "FUNCTIONAL"),
                "priority": tc.get("priority", "HIGH"),
                "tester_id": started_by,
                "status": "pending",
                "actual_result": "",
                "expected_result": tc.get("expected_result", ""),
                "execution_log": "",
                "screenshots": [],
                "error_message": "",
                "started_at": now_iso(),
                "completed_at": None,
            }
            db.test_results.insert_one(res_doc)

    log_department_action(started_by, "tester", "TEST_RUN_STARTED", project_id, run_id, {"cases": len(plan_cases)})
    return run_doc


def list_test_results(test_run_id: Optional[str] = None, tester_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """List test results."""
    db = get_mongo_db()
    if db is None:
        return []
    query: Dict[str, Any] = {}
    if test_run_id:
        query["test_run_id"] = test_run_id
    if tester_id and tester_id != "all":
        query["tester_id"] = tester_id
    results = list(db.test_results.find(query, {"_id": 0}).sort("started_at", -1))
    case_ids = list({r.get("test_case_id") for r in results if r.get("test_case_id")})
    cases = {c["id"]: c for c in db.test_cases.find({"id": {"$in": case_ids}}, {"_id": 0})} if case_ids else {}
    for result in results:
        result["status"] = result_status(result.get("status"))
        case = cases.get(result.get("test_case_id"), {})
        # The UI reads case_title/suite/steps; runs store test_case_title.
        result.setdefault("case_title", result.get("test_case_title") or case.get("title", ""))
        result.setdefault("suite", case.get("suite", ""))
        result.setdefault("steps", case.get("steps", []) if isinstance(case.get("steps"), list) else [])
        result.setdefault("duration_ms", 0)
    return results


def update_test_result(
    result_id: str,
    status: str,
    actual_result: str = "",
    execution_log: str = "",
    error_message: str = "",
    screenshots: Optional[List[str]] = None,
    tester_id: str = "tester",
    duration_ms: int = 0,
    evidence: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
) -> Optional[Dict[str, Any]]:
    """
    Record execution outcome for a test case (passed, failed, blocked, skipped).
    Updates aggregate counters on the parent test run.
    """
    db = require_db()
    existing = db.test_results.find_one({"id": result_id})
    if not existing:
        return None
    if existing.get("item_id"):
        raise HTTPException(409, "Workflow evidence is immutable; record a new test through the workflow endpoint.")
    if existing.get("tester_id") != tester_id:
        raise HTTPException(403, "Only the assigned tester may update this result.")
    status_clean = result_status(status)
    if status_clean not in {"passed", "failed", "blocked", "skipped", "pending"}:
        raise HTTPException(400, "Invalid result status.")
    if status_clean != "pending" and len(actual_result.strip()) < 20:
        raise HTTPException(400, "Manual execution requires substantive notes (at least 20 characters).")
    updates = {
        "status": status_clean,
        "mode": "manual",
        "actual_result": actual_result,
        "execution_log": execution_log or (evidence.get("logs", "") if evidence else ""),
        "error_message": error_message,
        "duration_ms": duration_ms,
        "evidence": evidence or {},
        "completed_at": now_iso() if status_clean != "pending" else None,
        "tester_id": tester_id,
    }
    if screenshots:
        updates["screenshots"] = screenshots

    db.test_results.update_one({"id": result_id}, {"$set": updates})
    doc = db.test_results.find_one({"id": result_id}, {"_id": 0})
    if not doc:
        return None

    # Recalculate test run counters
    run_id = doc.get("test_run_id")
    if run_id:
        all_results = list(db.test_results.find({"test_run_id": run_id}))
        passed = sum(result_status(r.get("status")) == "passed" for r in all_results)
        failed = sum(result_status(r.get("status")) == "failed" for r in all_results)
        blocked = sum(result_status(r.get("status")) == "blocked" for r in all_results)
        skipped = sum(result_status(r.get("status")) == "skipped" for r in all_results)
        all_done = bool(all_results) and all(result_status(r.get("status")) != "pending" for r in all_results)

        run_updates = {
            "passed": passed,
            "failed": failed,
            "blocked": blocked,
            "skipped": skipped,
            "passed_count": passed, "failed_count": failed, "blocked_count": blocked, "skipped_count": skipped,
            "status": "COMPLETED" if all_done else "RUNNING",
            "completed_at": now_iso() if all_done else None,
        }
        if all_done:
            run_updates["status"] = "COMPLETED"
            run_updates["completed_at"] = now_iso()
        db.test_runs.update_one({"id": run_id}, {"$set": run_updates})

    log_department_action(tester_id, "tester", "TEST_EXECUTED", doc.get("test_case_id"), result_id, {"status": status_clean})
    return doc


def rerun_test_result(result_id: str, tester_id: str = "tester") -> Optional[Dict[str, Any]]:
    """Reset a test result for regression rerun."""
    return update_test_result(result_id, "pending", tester_id=tester_id)


# ── Bug Lifecycle & Cross-Department Collaboration ────────────────────────────

def list_bugs(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    created_by: Optional[str] = None,
    priority: Optional[str] = None,
    severity: Optional[str] = None,
    **kwargs: Any,
) -> List[Dict[str, Any]]:
    """List bugs with filtering."""
    db = get_mongo_db()
    if db is None:
        return []
    query: Dict[str, Any] = {}
    if project_id and project_id != "all":
        query["project_id"] = project_id
    if status and status != "all":
        query["status"] = {"$regex": f"^{re.escape(status)}$", "$options": "i"}
    if assigned_to and assigned_to != "all":
        query["assigned_to"] = assigned_to
    if created_by and created_by != "all":
        query["created_by"] = created_by
    if priority and priority != "all":
        query["priority"] = {"$regex": f"^{re.escape(priority)}$", "$options": "i"}
    if severity and severity != "all":
        query["severity"] = {"$regex": f"^{re.escape(severity)}$", "$options": "i"}
    cursor = db.bugs.find(query, {"_id": 0}).sort("created_at", -1)
    if kwargs.get("limit"):
        cursor = cursor.limit(int(kwargs["limit"]))
    return list(cursor)


def create_bug_from_test_failure(
    result_id: Optional[str] = None,
    test_result_id: Optional[str] = None,
    custom_title: Optional[str] = None,
    title_override: Optional[str] = None,
    description_override: Optional[str] = None,
    severity: str = "major",
    severity_override: Optional[str] = None,
    priority: str = "high",
    priority_override: Optional[str] = None,
    created_by: str = "tester",
    reporter: Optional[str] = None,
    steps_to_reproduce: str = "",
    logs: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    1-Click Bug Creation: Auto-inherits project, test case, test run, environment,
    failure message, logs, and screenshots directly from test result.
    Triggers AI root cause analysis using GPT-4o & RAG Institutional Memory.
    """
    db = require_db()
    actual_res_id = result_id or test_result_id or ""
    actual_title = title_override or custom_title
    actual_severity = (severity_override or severity or "major").lower()
    actual_priority = (priority_override or priority or "high").lower()
    actual_reporter = reporter or created_by or "tester"

    test_res = db.test_results.find_one({"id": actual_res_id}, {"_id": 0}) if db is not None else None
    if not test_res:
        raise HTTPException(404, "Test result not found.")
    if result_status(test_res.get("status")) not in ("failed", "blocked"):
        raise HTTPException(400, "A bug requires a failed or blocked test result.")
    test_run = None
    if test_res and db is not None:
        test_run = db.test_runs.find_one({"id": test_res.get("test_run_id")}, {"_id": 0})

    project_id = test_res.get("project_id") or (test_run.get("project_id", "sample_project") if test_run else "sample_project")
    env = test_run.get("environment", "Staging") if test_run else "Staging"
    case_title = test_res.get("case_title") or test_res.get("test_case_title", "Failed Test Case") if test_res else "Test Failure"
    err_msg = test_res.get("error_message") or (test_res.get("actual_result") if test_res else "Assertion Failure")
    res_logs = logs or (test_res.get("execution_log", "") if test_res else "")
    screenshots = test_res.get("screenshots", []) if test_res else []
    case = db.test_cases.find_one({"id": test_res.get("test_case_id")}) or {}
    test_file = test_res.get("target_file") or case.get("target_file", "")
    target_file = _source_under_test(project_id, test_file)

    bug_id = f"bug_{uuid.uuid4().hex[:10]}"
    title = actual_title or f"Test Failure in {case_title}: {err_msg[:60]}"
    description = description_override or (
        f"Automated defect filed from failed test execution:\n\n"
        f"- Test Case: {case_title} ({test_res.get('test_case_id') if test_res else 'N/A'})\n"
        f"- Environment: {env}\n"
        f"- Error Message: {err_msg}\n"
        f"- Expected Result: {test_res.get('expected_result') if test_res else 'Pass'}\n"
        f"- Actual Result: {test_res.get('actual_result') if test_res else 'Fail'}\n"
        f"- Execution Log:\n{res_logs}\n"
    )

    # Trigger AI Bug Analysis with RAG Memory lookup
    ai_diag = analyze_bug_with_ai(
        error_message=err_msg,
        logs=res_logs,
        project_id=project_id,
        test_case_title=case_title
    )

    doc = {
        "id": bug_id,
        "project_id": project_id,
        "test_case_id": test_res.get("test_case_id") if test_res else "",
        "test_run_id": test_res.get("test_run_id") if test_res else "",
        "test_result_id": actual_res_id,
        "target_file": target_file,
        "test_file": test_file,
        "title": title,
        "description": description,
        "steps_to_reproduce": steps_to_reproduce or (f"1. Run test suite '{case_title}'\n2. Observe assertion failure"),
        "logs": res_logs,
        "severity": actual_severity,
        "priority": actual_priority,
        "status": "open",
        "environment": env,
        "reported_by": actual_reporter,
        "created_by": actual_reporter,
        "assigned_to": "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "root_cause": ai_diag.get("root_cause") or ai_diag.get("probable_root_cause", ""),
        "developer_fix": "",
        "qa_validation": "",
        "screenshots": screenshots,
        "ai_analysis": ai_diag,
    }

    if db is not None:
        db.bugs.insert_one(doc)
        doc.pop("_id", None)
        if actual_res_id:
            db.test_results.update_one({"id": actual_res_id}, {"$set": {"linked_bug_id": bug_id}})
        # Log bug history
        db.bug_history.insert_one({
            "id": f"hist_{uuid.uuid4().hex[:8]}",
            "bug_id": bug_id,
            "changed_by": actual_reporter,
            "previous_status": "NONE",
            "new_status": "open",
            "comment": f"Bug opened from failed test result '{actual_res_id}'.",
            "timestamp": now_iso()
        })

    log_department_action(actual_reporter, "tester", "BUG_CREATED", project_id, bug_id, {"title": title})
    from workflow import load
    item = load(bug_id)
    doc["ticket_id"] = item["id"]
    doc["workflow_status"] = item["workflow_status"]
    return doc


def _legacy_status(item: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Legacy callers read the lowercase `status` of the bug; mirror the canonical workflow state."""
    if item and item.get("workflow_status"):
        item["status"] = item["workflow_status"].lower()
        item["assigned_to"] = item.get("assigned_developer") or item.get("assigned_to", "")
    return item


def assign_bug(bug_id: str, assigned_to: str, assigned_by: str) -> Optional[Dict[str, Any]]:
    """QA assigns bug to a specific developer."""
    from workflow import assign, actor
    return _legacy_status(assign(bug_id, {"developer": assigned_to}, actor(assigned_by)))


def developer_submit_fix(bug_id: str, developer_id: str, fix_explanation: str, fixed_code: str = "") -> Optional[Dict[str, Any]]:
    """Developer submits a verified fix for QA validation."""
    from workflow import fix, actor
    return _legacy_status(fix(bug_id, fixed_code, fix_explanation, actor(developer_id)))


def qa_close_bug(bug_id: str, closed_by: str, validation_notes: str) -> Optional[Dict[str, Any]]:
    """QA validates regression and officially closes bug."""
    from workflow import transition, actor
    return _legacy_status(transition(bug_id, "CLOSED", actor(closed_by), validation_notes))


def qa_reopen_bug(bug_id: str, reopened_by: str, reason: str) -> Optional[Dict[str, Any]]:
    """QA reopens bug if regression test failed."""
    from workflow import transition, actor
    return _legacy_status(transition(bug_id, "REOPENED", actor(reopened_by), reason))


# ── AI Bug Analysis (with RAG Memory) ─────────────────────────────────────────

def _normalize_bug_analysis(result: Dict[str, Any]) -> Dict[str, Any]:
    """Expose both the analyzer's keys and the keys the existing UIs read."""
    memories = result.get("related_historical_bugs") or []
    result.setdefault("root_cause", result.get("probable_root_cause", ""))
    result.setdefault("fix_strategy", result.get("suggested_fix", ""))
    result["rag_memories_found"] = len(memories)
    result.setdefault("analyzed_at", now_iso())
    return result


def analyze_bug_with_ai(
    error_message: str,
    logs: str = "",
    project_id: str = "sample_project",
    test_case_title: str = "",
    source_code: str = "",
    file_path: str = "",
    description: str = "",
) -> Dict[str, Any]:
    """
    Analyze bug using GPT-4o and RAG Institutional Memory.
    Produces probable root cause, affected components, reproduction steps, technical explanation,
    suggested fix, and references related historical bugs.
    """
    return _normalize_bug_analysis(_analyze_bug_with_ai(error_message, logs, project_id, test_case_title,
                                                        source_code, file_path, description))


def _local_bug_diagnosis(error_message: str, logs: str, source_code: str, file_path: str) -> Dict[str, Any]:
    """Deterministic diagnosis used when no AI provider is configured: static analysis + log parsing."""
    findings: List[Dict[str, Any]] = []
    if source_code and file_path:
        try:
            from universal_analyzer import analyze_source_file
            findings = analyze_source_file(Path(file_path), file_path, source_code)
        except Exception:
            findings = []
    text = f"{error_message}\n{logs}"
    exc = re.findall(r"\b([A-Z][A-Za-z]+(?:Error|Exception))\b", text)
    line_refs = re.findall(r"line (\d+)", logs or "")
    top = sorted(findings, key=lambda f: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}.get(str(f.get("severity")), 3))[:3]
    root = (f"{exc[-1]} raised" if exc else "Failure") + (f" near line {line_refs[-1]}" if line_refs else "")
    if top:
        root += ". Static analysis: " + "; ".join(f"L{f.get('line') or '?'} {f.get('rule', '')}: {f.get('message', '')}" for f in top)
    return {
        "probable_root_cause": root + ".",
        "affected_component": Path(file_path).stem if file_path else "Unknown",
        "affected_file": file_path or "Unknown",
        "affected_function": "",
        "severity_suggestion": "HIGH" if any(f.get("severity") in ("CRITICAL", "HIGH") for f in findings) or exc else "MEDIUM",
        "reproduction_steps": ["Execute the failing scenario", "Observe the logged exception"],
        "technical_explanation": "Local deterministic diagnosis (no AI provider configured): combines static analysis findings with exception names parsed from logs.",
        "suggested_fix": (top[0].get("suggested_fix") or f"Guard the condition that triggers {exc[-1] if exc else 'the failure'} and add a regression test.") if top
                         else f"Guard the condition that triggers {exc[-1] if exc else 'the failure'} and add a regression test.",
        "static_findings": top,
        "provider": "local",
    }


def _analyze_bug_with_ai(error_message, logs, project_id, test_case_title, source_code="", file_path="", description=""):
    # 1. Retrieve RAG memories for similar previous failures
    query_text = f"Error: {error_message}\nLogs: {logs[:400]}\nTitle: {test_case_title}"
    historical_memories = retrieve_relevant_memories(query_text=query_text, top_k=2, min_similarity=0.45)

    rag_context = ""
    if historical_memories:
        rag_context = "\n".join(
            f"- Past Fix ({m.get('language')}) by @{m.get('username')}: [{m.get('rule')}] {m.get('root_cause', '')[:200]}"
            for m in historical_memories
        )

    if not OPENAI_API_KEY:
        local = _local_bug_diagnosis(error_message, logs, source_code, file_path)
        local["related_historical_bugs"] = historical_memories
        return local

    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    prompt = f"""You are Mindora's elite Senior Debug Architect.
Analyze this defect failure and provide an intellectual diagnosis.

ERROR MESSAGE:
{error_message}

BUG DESCRIPTION:
{description or "(none)"}

EXECUTION LOGS:
{logs}

TEST CASE CONTEXT:
{test_case_title}

{f"TARGET SOURCE FILE ({file_path}):\n{source_code[:8000]}" if source_code else ""}

{f"SIMILAR HISTORICAL DEFECTS (FROM RAG MEMORY):\n{rag_context}" if rag_context else ""}

Respond strictly in valid JSON format:
{{
  "probable_root_cause": "Clear root cause statement",
  "affected_component": "Component or subsystem name",
  "affected_file": "Likely file path",
  "affected_function": "Likely function or method",
  "severity_suggestion": "CRITICAL|HIGH|MEDIUM|LOW",
  "reproduction_steps": ["Step 1", "Step 2"],
  "technical_explanation": "Technical deep dive into the failure mechanics",
  "suggested_fix": "Concrete remediation guidance"
}}"""

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        content = json.loads(resp.choices[0].message.content or "{}")
        content["related_historical_bugs"] = historical_memories
        return content
    except Exception as e:
        print(f"[AI Bug Analysis] Error: {e}")
        local = _local_bug_diagnosis(error_message, logs, source_code, file_path)
        local["related_historical_bugs"] = historical_memories
        local["provider_error"] = f"AI provider unavailable: {type(e).__name__}"
        return local


# ── QA Reports ────────────────────────────────────────────────────────────────

def get_qa_report(project_id: Optional[str] = None) -> Dict[str, Any]:
    """Compile aggregated QA quality report."""
    db = get_mongo_db()
    if db is None:
        return {}

    q: Dict[str, Any] = {}
    if project_id and project_id != "all":
        q["project_id"] = project_id

    total_plans = db.test_plans.count_documents(q)
    total_cases = db.test_cases.count_documents({**q, "is_archived": {"$ne": True}})
    total_runs = db.test_runs.count_documents(q)
    active_runs = db.test_runs.count_documents({**q, "status": {"$in": ["RUNNING", "IN_PROGRESS", "in_progress", "ACTIVE", "active"]}})

    # Breakdown by Priority & Suite
    cases = list(db.test_cases.find({**q, "is_archived": {"$ne": True}}))
    cases_by_priority: Dict[str, int] = {}
    cases_by_suite: Dict[str, int] = {}
    for c in cases:
        p = (c.get("priority") or "P2").upper()
        cases_by_priority[p] = cases_by_priority.get(p, 0) + 1
        s = c.get("suite") or "General"
        cases_by_suite[s] = cases_by_suite.get(s, 0) + 1

    # Test Results aggregation
    run_ids = [r["id"] for r in db.test_runs.find(q, {"id": 1})]
    results = list(db.test_results.find({"$or": [q, {"test_run_id": {"$in": run_ids}}]} if q else {}))
    passed = sum(result_status(r.get("status")) == "passed" for r in results)
    failed = sum(result_status(r.get("status")) == "failed" for r in results)
    blocked = sum(result_status(r.get("status")) == "blocked" for r in results)
    skipped = sum(result_status(r.get("status")) == "skipped" for r in results)
    executed = passed + failed + blocked + skipped
    pass_rate = round((passed / executed * 100), 1) if executed > 0 else 0.0
    fail_rate = round((failed / executed * 100), 1) if executed > 0 else 0.0

    # Bugs aggregation
    bugs = list(db.bugs.find(q))
    open_count = sum(1 for b in bugs if str(b.get("status", "")).lower() in ["open"])
    assigned_count = sum(1 for b in bugs if str(b.get("status", "")).lower() == "assigned")
    fixed_count = sum(1 for b in bugs if str(b.get("status", "")).lower() in ["fixed", "retest"])
    closed_count = sum(1 for b in bugs if str(b.get("status", "")).lower() == "closed")
    reopened_count = sum(1 for b in bugs if str(b.get("status", "")).lower() == "reopened")
    critical_bugs = sum(1 for b in bugs if str(b.get("severity", "")).upper() == "CRITICAL" and str(b.get("status", "")).lower() != "closed")

    by_severity: Dict[str, int] = {}
    by_priority: Dict[str, int] = {}
    for b in bugs:
        sev = str(b.get("severity", "MEDIUM")).upper()
        pri = str(b.get("priority", "P2")).upper()
        by_severity[sev] = by_severity.get(sev, 0) + 1
        by_priority[pri] = by_priority.get(pri, 0) + 1

    bug_metrics = {
        "total_bugs": len(bugs),
        "open_bugs": open_count,
        "assigned_bugs": assigned_count,
        "fixed_bugs": fixed_count,
        "closed_bugs": closed_count,
        "reopened_bugs": reopened_count,
        "by_severity": by_severity,
        "by_priority": by_priority,
    }

    return {
        "project_id": project_id or "all",
        "total_test_plans": total_plans,
        "total_test_cases": total_cases,
        "total_test_runs": total_runs,
        "active_test_runs": active_runs,
        "cases_by_priority": cases_by_priority,
        "cases_by_suite": cases_by_suite,
        "executed_tests": executed,
        "passed": passed,
        "failed": failed,
        "blocked": blocked,
        "skipped": skipped,
        "pass_rate_percent": pass_rate,
        "fail_rate_percent": fail_rate,
        "open_bugs": open_count + assigned_count + reopened_count,
        "closed_bugs": closed_count,
        "critical_bugs": critical_bugs,
        "regression_failures": reopened_count,
        "test_coverage_percent": None,
        "bug_metrics": bug_metrics,
        "generated_at": now_iso(),
    }


WORKFLOW_ROLES = ("developer", "qa", "tester", "admin")


def ticket_as_bug(t: Dict[str, Any]) -> Dict[str, Any]:
    """Project a canonical workflow item onto the legacy Bug shape used by existing tables."""
    return {"id": t["id"], "project_id": t.get("project_id", ""), "title": t.get("title", ""),
            "description": t.get("description", ""), "severity": t.get("severity", ""), "priority": t.get("priority", ""),
            "status": str(t.get("workflow_status", "OPEN")).lower(), "workflow_status": t.get("workflow_status", "OPEN"),
            "reported_by": t.get("reported_by") or t.get("created_by", ""), "assigned_to": t.get("assigned_developer", ""),
            "assigned_qa": t.get("assigned_qa", ""), "assigned_tester": t.get("assigned_tester", ""),
            "target_file": t.get("target_file", ""), "environment": t.get("environment", ""),
            "steps_to_reproduce": t.get("steps_to_reproduce", ""), "reopen_count": t.get("reopen_count", 0),
            "fix_revision": t.get("fix_revision", 0), "created_at": t.get("created_at", ""), "updated_at": t.get("updated_at", "")}


def get_admin_workflow_overview(role: Optional[str] = None, username: Optional[str] = None,
                                action: Optional[str] = None, limit: int = 200) -> Dict[str, Any]:
    """Admin visibility: users + activity, bugs, test results, per-role activity, and audit history."""
    from auth import list_registered_users
    from workflow import items
    db = require_db()
    tickets = items(("", ""), None)  # Read-only listing; also lazily migrates legacy bugs.
    events = list(db.audit_events.find({}, {"_id": 0}).sort("timestamp", -1).limit(5000))

    # Per-user activity
    users = list_registered_users()
    by_user: Dict[str, Dict[str, Any]] = {}
    for u in users:
        name = u["username"]
        mine = [e for e in events if e.get("username") == name]
        by_user[name] = {
            **u,
            "workflow_actions": len(mine),
            "last_active": mine[0]["timestamp"] if mine else "",
            "fixes_applied": sum(e.get("action") == "FIX_APPLIED" for e in mine),
            "tests_recorded": sum(e.get("action") in ("TEST_RECORDED", "TEST_EXECUTED") for e in mine),
            "bugs_created": sum(e.get("action") in ("CREATED", "BUG_CREATED") for e in mine),
            "reopens": sum(e.get("action") == "TRANSITION" and (e.get("metadata") or {}).get("status") == "REOPENED"
                           for e in mine),
            "open_assigned": sum(any(t.get("assigned_" + r) == name for r in ("developer", "qa", "tester"))
                                 and t["workflow_status"] != "CLOSED" for t in tickets),
        }

    # Per-role activity (action counts)
    role_activity: Dict[str, Dict[str, Any]] = {}
    for r in WORKFLOW_ROLES:
        role_events = [e for e in events if e.get("role") == r]
        counts: Dict[str, int] = {}
        for e in role_events:
            counts[e.get("action", "UNKNOWN")] = counts.get(e.get("action", "UNKNOWN"), 0) + 1
        role_activity[r] = {"total": len(role_events), "actions": counts,
                            "active_users": len({e.get("username") for e in role_events}),
                            "last_event": role_events[0] if role_events else None}

    # Test results (workflow evidence + test-run executions)
    results = list(db.test_results.find({"status": {"$nin": ["pending", None]}}, {"_id": 0, "evidence": 0, "execution": 0})
                   .sort("completed_at", -1).limit(limit))
    for res in results:
        res["status"] = result_status(res.get("status"))
    totals = {s: db.test_results.count_documents({"status": {"$in": variants}})
              for s, variants in (("passed", ["passed", "pass", "PASSED"]), ("failed", ["failed", "fail", "FAILED"]),
                                  ("blocked", ["blocked", "BLOCKED"]))}

    audit = [e for e in events
             if (not role or role == "all" or e.get("role") == role)
             and (not username or username == "all" or e.get("username") == username)
             and (not action or action == "all" or e.get("action") == action)][:limit]

    by_status: Dict[str, int] = {}
    for t in tickets:
        by_status[t["workflow_status"]] = by_status.get(t["workflow_status"], 0) + 1
    return {
        "users": list(by_user.values()),
        "bugs": [ticket_as_bug(t) for t in tickets],
        "bug_status": by_status,
        "test_results": results,
        "test_totals": totals,
        "role_activity": role_activity,
        "audit": audit,
        "audit_actions": sorted({e.get("action", "") for e in events}),
        "generated_at": now_iso(),
    }


def get_tester_report(tester_id: str) -> Dict[str, Any]:
    """Compile tester-specific execution statistics."""
    db = get_mongo_db()
    if db is None:
        return {}

    assigned_cases = db.test_cases.count_documents({"assigned_to": tester_id, "is_archived": {"$ne": True}})
    results = list(db.test_results.find({"tester_id": tester_id}))
    passed = sum(result_status(r.get("status")) == "passed" for r in results)
    failed = sum(result_status(r.get("status")) == "failed" for r in results)
    blocked = sum(result_status(r.get("status")) == "blocked" for r in results)
    skipped = sum(result_status(r.get("status")) == "skipped" for r in results)
    completed = passed + failed + blocked + skipped

    my_bugs = db.bugs.count_documents({"created_by": tester_id})
    reopened = db.bugs.count_documents({"created_by": tester_id, "status": {"$in": ["reopened", "REOPENED"]}})

    return {
        "tester_id": tester_id,
        "assigned_tests": assigned_cases,
        "total_assigned": assigned_cases,
        "completed_tests": completed,
        "total_executed": completed,
        "passed": passed,
        "failed": failed,
        "blocked": blocked,
        "skipped": skipped,
        "pass_rate": round((passed / completed * 100), 1) if completed > 0 else 0.0,
        "open_bugs_reported": my_bugs,
        "bugs_reported": my_bugs,
        "reopened_bugs": reopened,
        "generated_at": now_iso(),
    }


# ── Local Project Import & Deep Analysis ─────────────────────────────────────

def import_local_project(folder_path: str, name: Optional[str] = None) -> Dict[str, Any]:
    """Import and inspect an existing project from local computer path."""
    require_db()
    raw_p = Path(folder_path).expanduser()
    if not raw_p.is_absolute():
        p = (ROOT / raw_p).resolve()
    else:
        p = raw_p.resolve()

    if not p.exists() or not p.is_dir():
        raise ValueError(f"Project directory '{folder_path}' does not exist on disk.")

    import hashlib
    proj_id = (re.sub(r'[^a-zA-Z0-9_-]', '_', p.name.lower()) or "project") + "_" + hashlib.sha256(str(p).encode()).hexdigest()[:8]
    proj_name = name.strip() if name and name.strip() else p.name.replace("_", " ").replace("-", " ").title()

    detected_stack = []
    frameworks = []
    manifests = []
    if (p / "package.json").exists():
        manifests.append("package.json")
        try:
            pkg = json.loads((p / "package.json").read_text(encoding="utf-8"))
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            if "next" in deps: frameworks.append("Next.js")
            if "react" in deps: frameworks.append("React")
            if "express" in deps: frameworks.append("Express")
            detected_stack.append("Node.js / TypeScript")
        except Exception:
            detected_stack.append("Node.js")
    if (p / "requirements.txt").exists() or (p / "pyproject.toml").exists() or any(p.glob("*.py")):
        manifests.append("requirements.txt" if (p / "requirements.txt").exists() else "pyproject.toml")
        detected_stack.append("Python")
        for pyf in list(p.glob("*.py"))[:10]:
            try:
                txt = pyf.read_text(encoding="utf-8", errors="ignore")
                if "fastapi" in txt.lower(): frameworks.append("FastAPI")
                if "flask" in txt.lower(): frameworks.append("Flask")
                if "django" in txt.lower(): frameworks.append("Django")
            except Exception:
                pass
    if (p / "pom.xml").exists() or (p / "build.gradle").exists():
        manifests.append("pom.xml" if (p / "pom.xml").exists() else "build.gradle")
        detected_stack.append("Java")
        frameworks.append("Spring Boot")
    if (p / "Cargo.toml").exists():
        manifests.append("Cargo.toml")
        detected_stack.append("Rust")
    if (p / "go.mod").exists():
        manifests.append("go.mod")
        detected_stack.append("Go")
    if (p / "Dockerfile").exists():
        manifests.append("Dockerfile")
        frameworks.append("Docker")

    if not detected_stack:
        detected_stack.append("Polyglot / Generic Source")

    frameworks = list(dict.fromkeys(frameworks))

    proj_doc = {
        "id": proj_id,
        "name": proj_name,
        "path": str(p),
        "version": "1.0.0",
        "description": f"{', '.join(detected_stack)} application ({', '.join(frameworks) if frameworks else 'Standard'})",
        "detected_stack": detected_stack,
        "frameworks": frameworks,
        "manifests": manifests,
        "environments": ["Development", "Testing", "Staging", "Production"],
        "imported_at": now_iso(),
    }

    db = get_mongo_db()
    if db is not None:
        db.projects.update_one({"id": proj_id}, {"$set": proj_doc}, upsert=True)
    return proj_doc


def analyze_project_deep(project_id: str) -> Dict[str, Any]:
    """Deep analysis of project structure, components, dependencies and tests."""
    projects = list_projects()
    proj = next((p for p in projects if p["id"] == project_id), None)
    if not proj:
        base_dir = ROOT / "sample_project"
        proj = {"id": project_id, "name": project_id, "path": str(base_dir)}
    else:
        base_dir = Path(proj["path"])

    files = list_project_files(project_id)
    total_files = len(files)
    test_files = [f for f in files if f.get("is_test")]
    code_files = [f for f in files if not f.get("is_test")]

    lang_counts: Dict[str, int] = {}
    for f in files:
        l = f.get("language", "other")
        lang_counts[l] = lang_counts.get(l, 0) + 1

    components = {
        "frontend": [f["project_relative_path"] for f in files if any(x in f["project_relative_path"].lower() for x in ["ui", "front", "components", "pages", "client", ".tsx", ".jsx"])],
        "backend": [f["project_relative_path"] for f in files if any(x in f["project_relative_path"].lower() for x in ["server", "api", "backend", "service", "controller", "route"])],
        "database": [f["project_relative_path"] for f in files if any(x in f["project_relative_path"].lower() for x in ["db", "model", "mongo", "sql", "migration"])],
        "tests": [f["project_relative_path"] for f in test_files],
        "configuration": [f["project_relative_path"] for f in files if f["name"] in ["package.json", "requirements.txt", "pom.xml", "Cargo.toml", "Dockerfile", "tsconfig.json"]],
    }

    syntax_issues = []
    for f in code_files[:15]:
        full_p = (base_dir / f["project_relative_path"]).resolve()
        if full_p.exists() and full_p.suffix == ".py":
            try:
                import ast
                ast.parse(full_p.read_text(encoding="utf-8", errors="ignore"))
            except SyntaxError as se:
                syntax_issues.append({
                    "file": f["project_relative_path"],
                    "line": se.lineno,
                    "message": se.msg,
                    "severity": "CRITICAL"
                })

    summary = {
        "project_id": project_id,
        "name": proj.get("name", project_id),
        "path": str(base_dir),
        "total_files": total_files,
        "code_files_count": len(code_files),
        "test_files_count": len(test_files),
        "languages": lang_counts,
        "components": components,
        "syntax_issues": syntax_issues,
        "health_score": None,
        "analyzed_at": now_iso()
    }
    return summary


# ── File Backup Manager ───────────────────────────────────────────────────────

def backup_file(file_path: str) -> Dict[str, Any]:
    """Create timestamped .bak backup of a file before modification."""
    from workflow import target_path
    _, target = target_path("sample_project", file_path)
    bak_path = target.with_suffix(target.suffix + f".{uuid.uuid4().hex}.bak")
    original_content = target.read_text(encoding="utf-8", errors="ignore")
    bak_path.write_text(original_content, encoding="utf-8")

    backup_record = {
        "id": f"bak_{uuid.uuid4().hex[:10]}",
        "file_path": str(target.relative_to(ROOT)),
        "backup_path": str(bak_path.relative_to(ROOT)),
        "timestamp": now_iso(),
        "size": len(original_content)
    }
    db = get_mongo_db()
    if db is not None:
        db.code_backups.insert_one({**backup_record})
        backup_record.pop("_id", None)
    return backup_record


def restore_file_backup(file_path: str) -> Dict[str, Any]:
    raise HTTPException(409, "Restore must be submitted as a new validated workflow fix after reopening.")


def apply_code_fix(
    file_path: str,
    fixed_code: str,
    ticket_id: Optional[str] = None,
    username: str = "developer",
    project_id: str = "sample_project"
) -> Dict[str, Any]:
    """Legacy adapter; untracked file writes are deliberately disallowed."""
    from workflow import load, fix, actor, target_path
    if not ticket_id:
        raise HTTPException(409, "An assigned in-progress ticket is required to apply a fix.")
    item = load(ticket_id)
    if item["project_id"] != project_id or target_path(project_id, file_path)[1] != target_path(project_id, item["target_file"])[1]:
        raise HTTPException(400, "Requested target differs from the ticket target.")
    item = fix(ticket_id, fixed_code, "Fix submitted through legacy developer endpoint", actor(username))
    attempt = item["fix_history"][-1]
    return {"success": True, "item": item, "change": attempt,
            "execution_verification": {"status": "NOT_RUN", "passed": False,
                                       "validation": attempt["validation"], "reason": "QA and tester evidence still required."}}


# ── Unified Lifecycle Ticket System (MND-XXXX) ───────────────────────────────

TICKET_STATUSES = [
    "OPEN",
    "DEVELOPER_IN_PROGRESS",
    "READY_FOR_TEST",
    "TESTING",
    "TEST_FAILED",
    "READY_FOR_QA",
    "QA_IN_PROGRESS",
    "QA_FAILED",
    "QA_APPROVED",
    "READY_FOR_RELEASE",
    "RELEASED",
    "BLOCKED",
    "CLOSED"
]

def create_ticket(data: Dict[str, Any], username: str = "system") -> Dict[str, Any]:
    """Create a unified lifecycle ticket (MND-XXXX)."""
    from workflow import create, actor
    return create(data, actor(username))


def list_tickets(project_id: Optional[str] = None, status: Optional[str] = None, assigned_user: Optional[str] = None) -> List[Dict[str, Any]]:
    """List tickets with optional filtering."""
    from workflow import items, canonical
    records = items(("", ""), project_id)
    return [t for t in records if (not status or status.lower() == "all" or t["workflow_status"] == canonical(status))
            and (not assigned_user or assigned_user in [t.get("assigned_" + r) for r in ("developer", "qa", "tester")])]


def assign_ticket(ticket_id: str, developer: Optional[str] = None, tester: Optional[str] = None, qa: Optional[str] = None, actor: str = "admin") -> Dict[str, Any]:
    """Assign developer, tester, or QA to ticket."""
    from workflow import assign, actor as current_actor
    return assign(ticket_id, {"developer": developer, "tester": tester, "qa": qa}, current_actor(actor))


def advance_ticket(ticket_id: str, next_status: str, notes: str = "", actor: str = "system") -> Dict[str, Any]:
    """Transition ticket along the pipeline state machine."""
    from workflow import transition, actor as current_actor
    return transition(ticket_id, next_status, current_actor(actor), notes)


# ── QA Multi-Environment Validation ──────────────────────────────────────────

def run_multi_env_qa(project_id: str = "sample_project", actor: str = "qa_lead") -> Dict[str, Any]:
    """Run actual local tests; no remote environments are configured."""
    db = require_db()
    files = list_project_files(project_id)
    test_files = [f for f in files if f.get("is_test")]
    env_results = []
    all_passed = bool(test_files)
    for file in test_files:
        start_t = time.perf_counter()
        res = execute_project_file_test(file["project_relative_path"], project_id)
        dur = int((time.perf_counter() - start_t) * 1000)
        env_passed = res["passed"]
        if not env_passed:
            all_passed = False
        env_results.append({
            "environment": "Local",
            "target": file["project_relative_path"],
            "passed": env_passed,
            "status": "PASS" if env_passed else res["status"],
            "duration_ms": dur,
            "error_summary": res.get("error_summary", ""),
            "exit_code": res["exit_code"]
        })

    qa_run_doc = {
        "id": f"qam_{uuid.uuid4().hex[:10]}",
        "project_id": project_id,
        "executed_by": actor,
        "overall_status": "LOCAL_TESTS_PASSED" if all_passed else ("QA_FAILED" if test_files else "BLOCKED"),
        "environments": env_results,
        "passed": all_passed,
        "limitation": "Local execution only, not isolated environments or workflow QA sign-off.",
        "timestamp": now_iso()
    }
    db = get_mongo_db()
    if db is not None:
        db.qa_runs.insert_one({**qa_run_doc})
        qa_run_doc.pop("_id", None)

    log_department_action(actor, "qa", "QA_MULTI_ENV_RUN", project_id, metadata={"overall_status": qa_run_doc["overall_status"]})
    return qa_run_doc


# ── Quality Gate Evaluator ────────────────────────────────────────────────────

def evaluate_quality_gate(project_id: str = "sample_project") -> Dict[str, Any]:
    """Check all release conditions required before GitHub push and production release."""
    from workflow import items, evidence_passes, current_fix
    require_db()
    records = items(("", ""), project_id)
    unfinished = sum(t["workflow_status"] != "CLOSED" for t in records)
    checklist = [
        {"condition": "Developer Verification Completed", "passed": bool(records) and all(current_fix(t) for t in records),
         "detail": "Every item requires a validated fix matching the current source."},
        {"condition": "Software Tester Tests Passed", "passed": bool(records) and all(evidence_passes(t, "tester") for t in records),
         "detail": "Assigned tester passing evidence is required for each current fix."},
        {"condition": "QA Sign-Off", "passed": bool(records) and all(evidence_passes(t, "qa") for t in records),
         "detail": "Assigned QA passing evidence is required for each current fix."},
        {"condition": "No Blocking Tickets", "passed": bool(records) and unfinished == 0,
         "detail": f"{unfinished} unfinished items; an empty workflow cannot establish readiness."},
    ]

    all_pass = all(item["passed"] for item in checklist)

    return {
        "project_id": project_id,
        "gate_passed": all_pass,
        "status": "APPROVED" if all_pass else "BLOCKED",
        "checklist": checklist,
        "evaluated_at": now_iso()
        , "security_score": None, "coverage": None,
        "scope": "Local workflow readiness only; not deployment or security certification."
    }


# ── GitHub Integration & Production Deployment ────────────────────────────────

def github_connect(token: str, username: Optional[str] = None) -> Dict[str, Any]:
    """Securely test and validate a GitHub Personal Access Token."""
    import urllib.request
    req = urllib.request.Request("https://api.github.com/user")
    req.add_header("Authorization", f"Bearer {token.strip()}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("User-Agent", "Mindora-AI-Debugger")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            user_data = json.loads(response.read().decode("utf-8"))
            return {
                "connected": True,
                "login": user_data.get("login"),
                "name": user_data.get("name") or user_data.get("login"),
                "avatar_url": user_data.get("avatar_url"),
                "public_repos": user_data.get("public_repos", 0),
                "connected_at": now_iso()
            }
    except Exception:
        raise HTTPException(502, "GitHub authentication failed or GitHub is unavailable.")


def github_list_repos(token: str) -> List[Dict[str, Any]]:
    """List repositories for connected GitHub account."""
    import urllib.request
    req = urllib.request.Request("https://api.github.com/user/repos?sort=updated&per_page=15")
    req.add_header("Authorization", f"Bearer {token.strip()}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("User-Agent", "Mindora-AI-Debugger")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            repos = json.loads(response.read().decode("utf-8"))
            return [{"name": r["name"], "full_name": r["full_name"], "default_branch": r.get("default_branch", "main")} for r in repos]
    except Exception:
        raise HTTPException(502, "Could not retrieve repositories from GitHub.")


def github_push_release(
    project_id: str,
    repository: str,
    branch: str,
    commit_message: str,
    token: str,
    username: str = "developer"
) -> Dict[str, Any]:
    raise HTTPException(501, "Git push is not configured. Local workflow is available; no commit or push was performed.")


def trigger_production_deployment(project_id: str, release_id: str, actor: str = "admin") -> Dict[str, Any]:
    raise HTTPException(501, "No production deployment provider is configured; nothing was deployed.")


# ── Autonomous Pipeline Engine ────────────────────────────────────────────────

def run_autonomous_pipeline(project_id: str = "sample_project", username: str = "system") -> Dict[str, Any]:
    """
    Run full end-to-end lifecycle autonomously:
    1. Deep Project Analysis
    2. Test & Error Detection
    3. Auto-fix / Verification
    4. Tester Suite Execution
    5. QA Multi-Environment Validation
    6. Quality Gate Evaluation
    """
    raise HTTPException(501, "Autonomous approval is unsupported. Use the assigned developer, QA and tester workflow.")
    pipeline_id = f"pipe_{uuid.uuid4().hex[:10]}"
    stages = []

    analysis = analyze_project_deep(project_id)
    stages.append({
        "stage": "DEVELOPER_ANALYSIS",
        "status": "COMPLETED",
        "detail": f"{analysis['total_files']} files, {len(analysis['syntax_issues'])} syntax errors detected",
        "timestamp": now_iso()
    })

    exec_res = execute_project_file_test("sample_project/calc.py", project_id)
    stages.append({
        "stage": "DEVELOPER_ERROR_DETECTION",
        "status": "ERROR_DETECTED" if not exec_res["passed"] else "CLEAN",
        "detail": exec_res.get("error_summary", "No errors"),
        "timestamp": now_iso()
    })

    ticket = None
    if not exec_res["passed"]:
        ticket = create_ticket({
            "title": f"Fix {exec_res.get('error_type', 'Error')} in calc.py",
            "project_id": project_id,
            "target_file": "sample_project/calc.py",
            "error_type": exec_res.get("error_type", ""),
            "error_logs": exec_res.get("stderr", ""),
            "severity": "high"
        }, username=username)
        stages.append({
            "stage": "TICKET_CREATION",
            "status": "COMPLETED",
            "detail": f"Created ticket {ticket['id']}",
            "timestamp": now_iso()
        })

    t_report = get_tester_report("tester")
    stages.append({
        "stage": "TESTER_EXECUTION",
        "status": "COMPLETED",
        "detail": f"{t_report.get('total_executed', 0)} tests verified, pass rate {t_report.get('pass_rate', 100)}%",
        "timestamp": now_iso()
    })

    qa_res = run_multi_env_qa(project_id, actor=username)
    stages.append({
        "stage": "QA_MULTI_ENVIRONMENT",
        "status": qa_res["overall_status"],
        "detail": "4/4 Environments verified" if qa_res["passed"] else "Environment failure captured",
        "timestamp": now_iso()
    })

    gate = evaluate_quality_gate(project_id)
    stages.append({
        "stage": "PRODUCTION_GATE",
        "status": gate["status"],
        "detail": "All release conditions validated" if gate["gate_passed"] else "Release blocked pending ticket resolution",
        "timestamp": now_iso()
    })

    result = {
        "pipeline_id": pipeline_id,
        "project_id": project_id,
        "stages": stages,
        "current_stage": "READY_FOR_RELEASE" if gate["gate_passed"] else "DEVELOPER_FIX_REQUIRED",
        "gate": gate,
        "ticket": ticket,
        "completed_at": now_iso()
    }

    db = get_mongo_db()
    if db is not None:
        db.pipeline_runs.insert_one({**result})
        result.pop("_id", None)

    return result


def get_pipeline_status(project_id: str = "sample_project") -> Dict[str, Any]:
    """Retrieve current pipeline state, latest stages, and gate verdict."""
    db = get_mongo_db()
    latest_run = None
    if db is not None:
        latest_run = db.pipeline_runs.find_one({"project_id": project_id}, sort=[("completed_at", -1)], projection={"_id": 0})
    gate = evaluate_quality_gate(project_id)
    return {
        "project_id": project_id,
        "latest_run": latest_run,
        "gate": gate,
        "timestamp": now_iso()
    }
