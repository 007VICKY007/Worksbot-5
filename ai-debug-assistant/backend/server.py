# backend/server.py
# FastAPI backend — static analysis + AI analysis + auth + directory browser.

import sys
import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# ── Make src/ and backend/ importable ────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).parent))   # adds backend/ for auth.py

from scanner     import scan_directory
from report      import build_report
from auth        import verify_credentials, create_token, decode_token, register_user, list_registered_users
from ai_analyzer import analyze_file, batch_analyze_all
from fix_validator import validate_code_fix
from universal_analyzer import analyze_source_file

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Python Debug Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer = HTTPBearer()


# ── Auth dependency ───────────────────────────────────────────────────────────

def get_current_user(creds: HTTPAuthorizationCredentials = Security(bearer)) -> str:
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return payload["sub"]


# ── Request models ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    role:     Optional[str] = "developer"

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



# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(req: LoginRequest):
    if not verify_credentials(req.username, req.password):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    token = create_token(req.username)
    return {"token": token, "username": req.username}


@app.post("/api/auth/register")
def register(req: RegisterRequest):
    """Register a new user account into the credential store."""
    try:
        user_record = register_user(req.username, req.password, req.role or "developer")
        token = create_token(user_record["username"])
        return {
            "token": token,
            "user": user_record
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
    return {"username": username}


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
    """Scan an entire Python directory for bugs and return a full report."""
    target = Path(req.directory)
    if not target.exists():
        raise HTTPException(status_code=400, detail=f"Directory not found: {req.directory}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {req.directory}")
    try:
        issues = scan_directory(str(target))
        report = build_report(str(target), issues)
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
    source_path = Path(req.scanned_directory) / req.file

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
    issues_dict = {
        f: [i.model_dump() for i in file_issues]
        for f, file_issues in req.files.items()
    }
    try:
        results = batch_analyze_all(req.scanned_directory, issues_dict)
        return {"analyses": results}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch AI analysis failed: {exc}")


@app.post("/api/fix/apply")
def apply_fix(req: ApplyFixRequest, username: str = Depends(get_current_user)):
    """Apply a verified fix directly to disk, creating a .bak backup."""
    target_dir = Path(req.scanned_directory).resolve()
    target_file = (target_dir / req.file).resolve()

    # Prevent directory traversal
    try:
        target_file.relative_to(target_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path traversal forbidden.")

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.file}")

    try:
        # 1. Create .bak backup
        backup_path = target_file.with_suffix(target_file.suffix + ".bak")
        shutil.copy2(target_file, backup_path)

        # 2. Write verified code
        target_file.write_text(req.fixed_code, encoding="utf-8")

        # 3. Re-scan the updated file to verify no issues remain
        remaining_issues = analyze_source_file(target_file, req.file, req.fixed_code)

        return {
            "success": True,
            "file": req.file,
            "backup": str(backup_path.name),
            "remaining_issues": remaining_issues,
            "resolved": len(remaining_issues) == 0,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to apply fix: {exc}")


@app.post("/api/fix/verify")
def verify_fix(req: VerifyFixRequest, username: str = Depends(get_current_user)):
    """Re-validate a fix in an isolated sandbox."""
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


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}
