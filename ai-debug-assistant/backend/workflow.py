"""Canonical ticket workflow. Subprocess checks are NOT a security sandbox.

Only trusted local projects may be executed: children have a restricted environment
and timeout, but retain the server user's filesystem/network permissions.
"""
import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from mongo import get_mongo_db

STATES = ("OPEN", "ASSIGNED", "IN_PROGRESS", "FIXED", "QA_REVIEW", "TESTING", "VERIFIED", "CLOSED", "REOPENED")
ALIASES = {
    "DEVELOPER_IN_PROGRESS": "IN_PROGRESS", "READY_FOR_TEST": "FIXED",
    "READY_FOR_QA": "QA_REVIEW", "QA_IN_PROGRESS": "QA_REVIEW",
    "QA_APPROVED": "VERIFIED", "READY_FOR_RELEASE": "VERIFIED", "RELEASED": "CLOSED",
    "TEST_FAILED": "REOPENED", "QA_FAILED": "REOPENED", "BLOCKED": "REOPENED", "RETEST": "QA_REVIEW",
}
LEGACY = {"IN_PROGRESS": "DEVELOPER_IN_PROGRESS", "FIXED": "READY_FOR_TEST", "QA_REVIEW": "QA_IN_PROGRESS", "VERIFIED": "QA_APPROVED"}


def now():
    return datetime.now(timezone.utc).isoformat()


def database():
    db = get_mongo_db()
    if db is None:
        raise HTTPException(503, "Workflow database unavailable; no change was accepted.")
    return db


def actor(username):
    from auth import list_registered_users, normalize_role
    user = next((u for u in list_registered_users() if u["username"] == username), None)
    if not user or user.get("disabled"):
        raise HTTPException(401, "User is unavailable or disabled.")
    return username, normalize_role(user.get("role"))


def canonical(status):
    value = str(status or "OPEN").upper()
    return ALIASES.get(value, value if value in STATES else "OPEN")


_ROLE_CACHE = {"at": 0.0, "users": []}


def active_users(role):
    """Active registered users of a role (short cache; allowed() runs per listed item)."""
    import time
    from auth import list_registered_users
    if time.monotonic() - _ROLE_CACHE["at"] > 5:
        _ROLE_CACHE.update(at=time.monotonic(), users=list_registered_users())
    return [u["username"] for u in _ROLE_CACHE["users"] if u.get("role") == role and not u.get("disabled")]


def auto_assignee(role):
    """Pick the active user of `role` with the fewest open assigned items (load balancing).

    Used only when a handoff (developer -> QA, QA -> tester) happens and nobody was assigned,
    so the lifecycle never stalls on a missing reviewer. Explicit assignments always win.
    """
    candidates = active_users(role)
    if not candidates:
        return ""
    db = database()
    load_by_user = {name: db.tickets.count_documents({"assigned_" + role: name, "workflow_status": {"$ne": "CLOSED"}})
                    for name in candidates}
    return min(candidates, key=lambda name: (load_by_user[name], name))


def project(project_id):
    from departments import list_projects
    found = next((p for p in list_projects() if p["id"] == project_id), None)
    if not found:
        raise HTTPException(404, "Project not found.")
    root = Path(found["path"]).resolve()
    if not root.is_dir():
        raise HTTPException(404, "Project directory unavailable.")
    return root


def _clean_relative(file_path) -> str:
    """Normalise user/UI supplied paths: trim, Windows separators, leading './'."""
    cleaned = str(file_path or "").strip().strip('"').strip("'").replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    return cleaned


def _discover_in_project(project_id, root: Path, cleaned: str):
    """Fallback: match against the project's discovered files (same index the UI file pickers use).
    Exact project/repo-relative match first, then a unique path-suffix match (e.g. 'ui/Badge.tsx')."""
    from departments import list_project_files
    files = list_project_files(project_id)
    key = cleaned.lstrip("/").lower()
    exact = [f for f in files if key in (f["project_relative_path"].lower(), f["path"].lower())]
    matches = exact or [f for f in files if f["project_relative_path"].lower().endswith("/" + key)]
    if len(matches) == 1:
        return (root / matches[0]["project_relative_path"]).resolve()
    if len(matches) > 1:
        options = ", ".join(sorted(f["project_relative_path"] for f in matches)[:5])
        raise HTTPException(409, f"'{cleaned}' matches several files in this project ({options}). Use the full project-relative path.")
    return None


def target_path(project_id, file_path):
    """Resolve a target file inside the registered project root.

    Accepted forms (all contained in the project): project-relative ('components/ui/Badge.tsx',
    'src/...', 'backend/...'), repository-relative (legacy clients), prefixed with the project
    folder name, absolute, or a unique suffix of a discovered project file."""
    from departments import ROOT, ALLOWED_CODE_EXTENSIONS, IGNORED_PROJECT_DIRS
    root = project(project_id)
    cleaned = _clean_relative(file_path)
    if not cleaned:
        raise HTTPException(400, "No target file specified.")
    raw = Path(cleaned)
    if ".." in raw.parts:
        raise HTTPException(400, "Path traversal forbidden.")
    candidates = [(root / raw).resolve()]
    if not raw.is_absolute():
        candidates.append((ROOT / raw).resolve())               # repository-relative (legacy clients)
        if len(raw.parts) > 1 and raw.parts[0] == root.name:
            candidates.append((root / Path(*raw.parts[1:])).resolve())  # "<project-folder>/..."
    target = next((c for c in candidates if c.is_file() and c.is_relative_to(root)), candidates[0])
    if not target.is_file() and not raw.is_absolute():
        target = _discover_in_project(project_id, root, cleaned) or target
    if not target.is_file():
        raise HTTPException(404, f"Target file not found: '{cleaned}' does not exist in the selected project ({root}).")
    if not target.is_relative_to(root):
        raise HTTPException(400, "Target must be contained in the registered project.")
    relative = target.relative_to(root)
    if (any(p.startswith(".") or p in IGNORED_PROJECT_DIRS for p in relative.parts)
            or target.suffix.lower() not in ALLOWED_CODE_EXTENSIONS
            or target.name.lower() in {"auth.py", "mongo.py"}):
        raise HTTPException(400, "Only project source files, not credentials or hidden files, are allowed.")
    return root, target


def normalize(doc):
    item = dict(doc)
    item.pop("_id", None)
    item["workflow_status"] = canonical(item.get("workflow_status", item.get("status")))
    item.setdefault("ticket_id", item["id"])
    item.setdefault("version", 0)
    for field in ("comments", "history", "fix_history", "test_results"):
        item.setdefault(field, [])
    for role in ("developer", "qa", "tester"):
        item.setdefault("assigned_" + role, "")
    # Legacy history rows (bug_history mirror / bug creation) may lack "action".
    item["history"] = [{**h, "action": h.get("action") or ("TRANSITION" if h.get("status") else "EVENT")}
                       for h in item["history"] if isinstance(h, dict)]
    return item


def load(item_id):
    db = database()
    doc = db.tickets.find_one({"$or": [{"id": item_id}, {"bug_id": item_id}]})
    if not doc:
        bug = db.bugs.find_one({"id": item_id})
        if not bug:
            raise HTTPException(404, "Workflow item not found.")
        linked = bug.get("ticket_id") or bug["id"]
        doc = db.tickets.find_one({"id": linked})
        if not doc:
            doc = normalize({**bug, "id": linked, "ticket_id": linked, "bug_id": bug["id"],
                             "assigned_developer": bug.get("assigned_to", "")})
            doc["history"] += [{"actor": h.get("changed_by", ""), "status": h.get("new_status"),
                                "notes": h.get("comment", ""), "timestamp": h.get("timestamp", "")}
                               for h in db.bug_history.find({"bug_id": bug["id"]}, {"_id": 0})]
            # Deterministic _id makes concurrent lazy migration idempotent.
            db.tickets.update_one({"_id": "bug:" + bug["id"]}, {"$setOnInsert": doc}, upsert=True)
            doc = db.tickets.find_one({"id": linked})
        db.bugs.update_one({"id": bug["id"]}, {"$set": {"ticket_id": linked}})
    return normalize(doc)


def current_fix(item):
    if not item.get("fix_revision") or not item.get("fix_hash"):
        return False
    try:
        _, path = target_path(item["project_id"], item["target_file"])
        return hashlib.sha256(path.read_bytes()).hexdigest() == item["fix_hash"]
    except (HTTPException, OSError):
        return False


def evidence_passes(item, role):
    if not current_fix(item):
        return False
    results = [r for r in item["test_results"] if r.get("fix_revision") == item["fix_revision"]
               and r.get("fix_hash") == item["fix_hash"] and r.get("role") == role
               and r.get("actor") == item.get("assigned_" + role)]
    # Most recent outcome for every case must pass; a later failure revokes approval.
    latest = {}
    for result in results:
        latest[result.get("test_case_id") or "manual"] = result
    return bool(latest) and all(r.get("status") == "passed" for r in latest.values())


def allowed(item, user):
    username, role = user
    state = item["workflow_status"]
    if item.get("fix_processing"):
        return []
    if role == "developer":
        if state == "OPEN" and item.get("created_by") == username and not item.get("assigned_developer"):
            return ["ASSIGNED"]
        if item.get("assigned_developer") != username:
            return []
        if state in ("ASSIGNED", "REOPENED"):
            return ["IN_PROGRESS"]
        if state == "IN_PROGRESS":
            return ["FIXED"]  # Requires the /fix operation, never a bare status transition.
        if state == "FIXED" and (item.get("assigned_qa") or active_users("qa")) and current_fix(item):
            return ["QA_REVIEW"]  # A QA reviewer is auto-assigned on handoff when none was chosen.
    if role == "qa" and item.get("assigned_qa") == username and state == "QA_REVIEW":
        return (["TESTING"] if (item.get("assigned_tester") or active_users("tester"))
                and evidence_passes(item, "qa") else []) + ["REOPENED"]
    if role == "tester" and item.get("assigned_tester") == username:
        if state == "TESTING":
            return (["VERIFIED"] if evidence_passes(item, "qa") and evidence_passes(item, "tester") else []) + ["REOPENED"]
        if state == "VERIFIED":
            return (["CLOSED"] if evidence_passes(item, "qa") and evidence_passes(item, "tester") else []) + ["REOPENED"]
    if role in ("qa", "tester", "admin") and state == "OPEN":
        return ["ASSIGNED"]
    if role == "admin" and state not in ("OPEN", "REOPENED"):
        return ["REOPENED"]
    if state == "CLOSED" and role in ("qa", "tester") and item.get("assigned_" + role) == username:
        return ["REOPENED"]
    return []


def present(item, user):
    item = normalize(item)
    actions = allowed(item, user)
    item.pop("fix_processing", None)
    item["allowed_actions"] = actions
    return item


def get(item_id, user):
    return present(load(item_id), user)


def items(user, project_id=None):
    db = database()
    query = {"project_id": project_id} if project_id and project_id != "all" else {}
    for bug in db.bugs.find(query, {"id": 1}):
        load(bug["id"])
    return [present(doc, user) for doc in db.tickets.find(query, {"_id": 0}).sort("created_at", -1)]


def project_bug(item):
    if not item.get("bug_id"):
        return
    database().bugs.update_one({"id": item["bug_id"]}, {"$set": {
        "ticket_id": item["id"], "status": item["workflow_status"].lower(),
        "workflow_status": item["workflow_status"], "assigned_to": item.get("assigned_developer", ""),
        "updated_at": item.get("updated_at"), "version": item["version"],
        "fix_summary": item.get("fix_summary", ""), "developer_fix": item.get("fix_summary", ""),
    }})


def side_effects(item, user, action, notes):
    from departments import log_department_action
    project_bug(item)
    log_department_action(user[0], user[1], action, item["project_id"], item["id"],
                          {"notes": notes, "version": item["version"], "status": item["workflow_status"]})
    db = database()
    if item.get("bug_id"):
        db.bug_history.insert_one({"id": uuid.uuid4().hex, "bug_id": item["bug_id"], "changed_by": user[0],
                                   "new_status": item["workflow_status"].lower(), "comment": notes, "timestamp": now()})
    recipients = {item.get("created_by"), *(item.get("assigned_" + r) for r in ("developer", "qa", "tester"))}
    label = f"moved to {item['workflow_status'].replace('_', ' ')}" if action in ("TRANSITION", "FIX_APPLIED") else action.replace("_", " ").lower()
    for recipient in recipients - {None, "", user[0]}:
        db.notifications.insert_one({"id": "nt_" + uuid.uuid4().hex, "recipient": recipient,
                                     "message": f"{item['id']} ({item.get('title', '')[:60]}): {label} by {user[0]}",
                                     "read": False, "created_at": now(), "item_id": item["id"],
                                     "action": action, "status": item["workflow_status"]})


def mutate(item, user, changes, action, notes="", version=None, pushes=None, locked=False):
    if version is not None and version != item["version"]:
        raise HTTPException(409, "Item changed; reload before retrying.")
    query = {"id": item["id"], "version": item["version"]} if item["version"] else {
        "id": item["id"], "$or": [{"version": 0}, {"version": {"$exists": False}}]}
    query["fix_processing"] = True if locked else {"$ne": True}
    event = {"actor": user[0], "role": user[1], "action": action, "status": changes.get("workflow_status", item["workflow_status"]),
             "notes": notes, "timestamp": now()}
    changes = {**changes, "updated_at": now()}
    if "workflow_status" in changes:
        changes["status"] = LEGACY.get(changes["workflow_status"], changes["workflow_status"])
    result = database().tickets.find_one_and_update(query, {"$set": changes, "$inc": {"version": 1},
        "$push": {"history": event, **(pushes or {})}}, return_document=ReturnDocument.AFTER)
    if result is None:
        raise HTTPException(409, "Item changed or a fix is processing; reload before retrying.")
    result = normalize(result)
    side_effects(result, user, action, notes)
    return present(result, user)


def check_assignees(assignments):
    from auth import list_registered_users
    users = {u["username"]: u for u in list_registered_users()}
    for role, name in assignments.items():
        if name and (name not in users or users[name].get("disabled") or users[name].get("role") != role):
            raise HTTPException(400, f"{role} must be an active registered {role} user.")


def create(data, user):
    database()
    project(data.get("project_id") or "sample_project")
    if canonical(data.get("status")) != "OPEN":
        raise HTTPException(400, "New items must be OPEN.")
    assignments = {r: data.get("assigned_" + r) or "" for r in ("developer", "qa", "tester")}
    check_assignees(assignments)
    if user[1] == "developer" and any(assignments.values()):
        if assignments != {"developer": user[0], "qa": "", "tester": ""}:
            raise HTTPException(403, "Developers may only self-assign their own new item.")
    item_id = "MND-" + uuid.uuid4().hex[:12].upper()
    stamp = now()
    doc = {k: data.get(k) or "" for k in ("title", "description", "target_file", "error_type", "error_logs", "root_cause")}
    if not doc["title"].strip():
        raise HTTPException(400, "Title is required.")
    doc.update({"id": item_id, "ticket_id": item_id, "project_id": data.get("project_id") or "sample_project",
                "severity": data.get("severity") or "high", "priority": data.get("priority") or "high",
                "created_by": user[0], "created_at": stamp, "updated_at": stamp, "status": "OPEN",
                "workflow_status": "OPEN", "version": 1, "fix_revision": 0, "fix_summary": "",
                "comments": [], "fix_history": [], "test_results": [],
                "history": [{"actor": user[0], "role": user[1], "action": "CREATED", "status": "OPEN", "timestamp": stamp}],
                **{"assigned_" + r: n for r, n in assignments.items()}})
    if assignments["developer"]:
        doc.update(status="ASSIGNED", workflow_status="ASSIGNED")
    database().tickets.insert_one(dict(doc))
    side_effects(doc, user, "CREATED", "Ticket created")
    return present(doc, user)


def assign(item_id, data, user):
    item = load(item_id)
    assignments = {r: n for r, n in data.items() if r in ("developer", "qa", "tester") and n is not None}
    if not assignments:
        raise HTTPException(400, "Provide at least one assignment.")
    if user[1] == "developer":
        if not (item["workflow_status"] == "OPEN" and item["created_by"] == user[0]
                and assignments == {"developer": user[0]} and not item.get("assigned_developer")):
            raise HTTPException(403, "Developers may only self-assign their own open item.")
    elif user[1] not in ("qa", "tester", "admin"):
        raise HTTPException(403, "Assignment is not permitted.")
    check_assignees(assignments)
    if item["workflow_status"] in ("VERIFIED", "CLOSED"):
        raise HTTPException(409, "Reopen the item before changing assignments.")
    changes = {"assigned_" + r: n for r, n in assignments.items()}
    if assignments.get("developer") and item["workflow_status"] == "OPEN":
        changes["workflow_status"] = "ASSIGNED"
    return mutate(item, user, changes, "ASSIGNED", str(assignments))


def transition(item_id, next_status, user, notes="", version=None):
    item = load(item_id)
    raw = str(next_status).upper()
    if raw not in STATES and raw not in ALIASES:
        raise HTTPException(400, "Unknown workflow status.")
    state = canonical(raw)
    if state == "FIXED":
        raise HTTPException(409, "Submit a validated applied fix using the fix endpoint.")
    if state not in allowed(item, user):
        raise HTTPException(403, "Transition not permitted for this assignment, state, or current evidence.")
    if state == "ASSIGNED":
        if not item.get("assigned_developer"):
            if user[1] == "developer":
                return assign(item_id, {"developer": user[0]}, user)
            raise HTTPException(400, "Assign a registered developer first.")
    if state == "REOPENED" and len(notes.strip()) < 10:
        raise HTTPException(400, "Explain the rejection/reopening (at least 10 characters).")
    changes = {"workflow_status": state}
    if state == "REOPENED":
        changes.update(fix_hash=None)  # All previous evidence becomes ineligible.
        changes["reopen_count"] = int(item.get("reopen_count") or 0) + 1
    # Handoffs never stall on a missing reviewer: auto-assign the least-loaded active user.
    for handoff, reviewer in (("QA_REVIEW", "qa"), ("TESTING", "tester")):
        if state == handoff and not item.get("assigned_" + reviewer):
            picked = auto_assignee(reviewer)
            if not picked:
                raise HTTPException(409, f"No active {reviewer} user is available for this handoff.")
            changes["assigned_" + reviewer] = picked
            notes = (notes + "\n" if notes else "") + f"Auto-assigned {reviewer}: {picked}"
    result = mutate(item, user, changes, "TRANSITION", notes, version)
    if state == "CLOSED":
        # RAG stores only a fix that has completed both human review gates.
        from rag_pipeline import store_error_memory
        try:
            store_error_memory(username=user[0], directory=str(project(item["project_id"])), file_path=item.get("target_file", ""),
                               language=Path(item.get("target_file", "")).suffix.lstrip("."),
                               category="WORKFLOW", severity=item.get("severity", "high"), rule=item.get("error_type") or "workflow",
                               message=item.get("title", ""), snippet="", root_cause=item.get("root_cause", ""),
                               fixed_code=item.get("fixed_code", ""), explanation=item.get("fix_summary", ""))
        except Exception:
            pass  # Institutional memory is secondary to the committed workflow.
    return result


def comment(item_id, text, user):
    if not text or not text.strip() or len(text) > 20000:
        raise HTTPException(400, "Comment must contain 1-20000 characters.")
    entry = {"id": "comment_" + uuid.uuid4().hex, "actor": user[0], "role": user[1], "text": text.strip(), "timestamp": now()}
    return mutate(load(item_id), user, {}, "COMMENT", text.strip(), pushes={"comments": entry})


def fix(item_id, fixed_code, explanation, user, version=None):
    from fix_validator import validate_code_fix
    item = load(item_id)
    if user[1] != "developer" or item.get("assigned_developer") != user[0] or item["workflow_status"] != "IN_PROGRESS":
        raise HTTPException(403, "Only the assigned developer may submit an in-progress fix.")
    if not explanation or len(explanation.strip()) < 10:
        raise HTTPException(400, "Explain the fix (at least 10 characters).")
    if version is not None and item["version"] != version:
        raise HTTPException(409, "Stale item version.")
    root, target = target_path(item["project_id"], item.get("target_file"))
    db = database()
    lock_id = "workflow-lock:" + hashlib.sha256(str(target).encode()).hexdigest()
    try:
        db.code_changes.insert_one({"_id": lock_id, "item_id": item["id"], "timestamp": now()})
    except DuplicateKeyError:
        raise HTTPException(409, "Another fix is processing this file; abandoned locks require administrator inspection.")
    locked = False
    original = None
    applied = False
    attempt = {"id": "fix_" + uuid.uuid4().hex, "actor": user[0], "role": user[1], "timestamp": now(),
               "fixed_code": fixed_code, "fix_explanation": explanation, "applied": False}
    try:
        query = {"id": item["id"], "version": item["version"], "fix_processing": {"$ne": True}}
        # Legacy documents acquire a version through the preceding start transition.
        locked = bool(db.tickets.update_one(query, {"$set": {"fix_processing": True}}).matched_count)
        if not locked:
            raise HTTPException(409, "Item changed or a fix is processing.")
        original = target.read_bytes()
        validation = validate_code_fix(str(target.relative_to(root)), original.decode("utf-8"), fixed_code,
                                       target_issues=item.get("issues"), project_root=str(root))
        attempt["validation"] = validation
        if not validation.get("is_valid"):
            mutate(item, user, {"fix_processing": False}, "FIX_REJECTED", explanation, pushes={"fix_history": attempt}, locked=True)
            raise HTTPException(422, {"message": "Fix validation failed; target unchanged.", "validation": validation})
        if target.read_bytes() != original:
            raise HTTPException(409, "Target changed during validation; retry against current source.")
        revision = item.get("fix_revision", 0) + 1
        backup = target.with_name(target.name + f".{item['id']}.v{revision}.{uuid.uuid4().hex[:8]}.bak")
        with backup.open("xb") as stream:
            stream.write(original)
        attempt.update(backup_path=str(backup), fix_revision=revision, applied=True)
        db.code_backups.insert_one({"id": attempt["id"], "ticket_id": item["id"], "project_id": item["project_id"],
                                   "file_path": str(target), "backup_path": str(backup), "timestamp": now()})
        target.write_text(fixed_code, encoding="utf-8")
        applied = True
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        attempt["fix_hash"] = digest
        result = mutate(item, user, {"workflow_status": "FIXED", "fix_processing": False, "fix_revision": revision,
                                    "fix_hash": digest, "fixed_code": fixed_code, "fix_summary": explanation},
                        "FIX_APPLIED", explanation, pushes={"fix_history": attempt}, locked=True)
        applied = False  # Durable canonical state now owns the applied code.
        return result
    finally:
        if applied and original is not None:
            # Do not roll back if the canonical CAS succeeded but a secondary projection failed.
            saved = db.tickets.find_one({"id": item["id"]})
            if saved and saved.get("version", 0) == item["version"]:
                target.write_bytes(original)
        if locked:
            db.tickets.update_one({"id": item["id"], "version": item["version"]}, {"$unset": {"fix_processing": ""}})
        db.code_changes.delete_one({"_id": lock_id})


def tests(item_id, data, user):
    from departments import execute_project_file_test
    item = load(item_id)
    role = user[1]
    required = {"qa": "QA_REVIEW", "tester": "TESTING"}
    if role not in required or item.get("assigned_" + role) != user[0] or item["workflow_status"] != required[role]:
        raise HTTPException(403, "Only the assigned reviewer may test at this workflow stage.")
    if not current_fix(item):
        raise HTTPException(409, "No current applied fix; source changed or item was reopened.")
    result = {"id": "res_" + uuid.uuid4().hex, "item_id": item["id"], "project_id": item["project_id"],
              "actor": user[0], "tester_id": user[0], "role": role, "fix_revision": item["fix_revision"],
              "fix_hash": item["fix_hash"], "test_case_id": data.get("test_case_id"), "timestamp": now(),
              "started_at": now(), "notes": data.get("notes") or "", "evidence": data.get("evidence") or {}}
    case = None
    if data.get("test_case_id"):
        case = database().test_cases.find_one({"id": data["test_case_id"], "is_archived": {"$ne": True}})
        if not case:
            raise HTTPException(404, "Test case not found.")
        if case.get("project_id") != item["project_id"]:
            raise HTTPException(400, "Test case belongs to a different project.")
    if case and case.get("target_file"):
        execution = execute_project_file_test(case["target_file"], item["project_id"])
        result.update(mode="automated", status=execution["status"].lower(), execution=execution)
        result["evidence"] = {"logs": execution.get("stdout", "") + "\n" + execution.get("stderr", "")}
        result["target_file"] = case["target_file"]
    else:
        status = str(data.get("result") or "").upper()
        if status not in ("PASS", "FAIL", "BLOCKED") or len(result["notes"].strip()) < 20:
            raise HTTPException(400, "Manual tests require PASS/FAIL/BLOCKED and substantive notes (at least 20 characters).")
        result.update(mode="manual", status={"PASS": "passed", "FAIL": "failed", "BLOCKED": "blocked"}[status])
    if not current_fix(item):
        raise HTTPException(409, "Source changed while testing; result cannot approve this fix.")
    result["result"] = {"passed": "PASS", "failed": "FAIL", "blocked": "BLOCKED"}.get(result["status"], "BLOCKED")
    result["completed_at"] = now()
    if case:
        result["test_case_title"] = case.get("title", "")
    updated = mutate(item, user, {}, "TEST_RECORDED", result["notes"], pushes={"test_results": result})
    database().test_results.insert_one(dict(result))
    if data.get("auto_advance"):
        updated = advance_after_tests(updated["id"], user, [result])
    return {"item": updated, "result": result}


# Next lifecycle stage once a reviewer's evidence passes.
NEXT_STAGE = {"qa": {"QA_REVIEW": "TESTING"}, "tester": {"TESTING": "VERIFIED"}}


def advance_after_tests(item_id, user, results):
    """Apply the documented test outcome rules after evidence is recorded.

    FAIL    -> REOPENED (sent back to the assigned developer with the failure details).
    PASS    -> next stage (QA_REVIEW -> TESTING, TESTING -> VERIFIED) once every recorded case passes.
    BLOCKED -> stays in the current review stage.
    """
    item = load(item_id)
    failed = [r for r in results if r.get("status") == "failed"]
    if failed:
        detail = "; ".join(f"{r.get('test_case_title') or r.get('test_case_id') or 'manual'}: "
                           f"{(r.get('execution') or {}).get('error_summary') or r.get('notes') or 'failed'}"[:300]
                           for r in failed)
        note = f"{user[1].upper()} test failure - returned to developer. {detail}"
        if "REOPENED" in allowed(item, user):
            return transition(item_id, "REOPENED", user, note)
        return present(item, user)
    if any(r.get("status") == "blocked" for r in results):
        return present(item, user)
    target = NEXT_STAGE.get(user[1], {}).get(item["workflow_status"])
    if target and target in allowed(item, user):
        return transition(item_id, target, user, f"All {user[1].upper()} evidence passed for fix revision {item.get('fix_revision')}.")
    return present(item, user)


def regression(item_id, user, auto_advance=False):
    """Run every automated test case of the project against the current applied fix.

    Each execution is recorded as reviewer evidence through tests(), so the existing
    evidence/approval gates apply unchanged. Projects without saved automated cases get
    one regression case per discovered test file (saved in the project's regression plan).
    """
    from departments import list_project_files
    item = load(item_id)
    db = database()
    cases = list(db.test_cases.find({"project_id": item["project_id"], "is_archived": {"$ne": True},
                                     "target_file": {"$nin": ["", None]}}, {"_id": 0}))
    if not cases:
        plan_id = regression_plan(item["project_id"], user)
        for f in [f for f in list_project_files(item["project_id"]) if f.get("is_test")][:10]:
            case = {"id": f"tc_{uuid.uuid4().hex[:10]}", "project_id": item["project_id"], "test_plan_id": plan_id,
                    "title": f"Regression: {f['project_relative_path']}", "suite": "regression",
                    "target_file": f["project_relative_path"], "tags": ["regression", "auto"], "description": "",
                    "preconditions": [], "steps": [{"step_number": 1, "action": f"Execute {f['project_relative_path']}",
                                                    "expected": "All tests pass"}],
                    "expected_result": "All tests pass", "priority": "HIGH", "type": "REGRESSION",
                    "created_by": user[0], "assigned_to": item.get("assigned_tester") or "", "created_at": now(),
                    "updated_at": now(), "is_archived": False}
            db.test_cases.insert_one(dict(case))
            cases.append(case)
    if not cases:
        raise HTTPException(400, "No automated test cases or test files exist for this project.")
    results = []
    updated = None
    for case in cases:
        response = tests(item_id, {"test_case_id": case["id"], "notes": f"Regression run: {case.get('title', '')}"}, user)
        results.append(response["result"])
        updated = response["item"]
    if auto_advance:
        updated = advance_after_tests(item_id, user, results)
    summary_counts = {s: sum(r["status"] == s for r in results) for s in ("passed", "failed", "blocked")}
    return {"item": updated, "results": results, "summary": {**summary_counts, "total": len(results)}}


def regression_plan(project_id, user):
    """Find or create the per-project plan that holds AI/regression generated cases."""
    db = database()
    plan = db.test_plans.find_one({"project_id": project_id, "name": "AI Regression Suite"})
    if plan:
        return plan["id"]
    plan_id = f"tp_{uuid.uuid4().hex[:10]}"
    db.test_plans.insert_one({"id": plan_id, "project_id": project_id, "name": "AI Regression Suite",
                              "description": "Regression and AI-generated cases linked to workflow bugs.",
                              "scope": "Bug fix regression verification", "objectives": "Prevent fixed defects from returning.",
                              "target_date": "", "version": "1.0.0", "environment": "Development", "status": "ACTIVE",
                              "created_by": user[0], "created_at": now(), "updated_at": now()})
    return plan_id


def annotate(item_id, user, field, value, action, notes=""):
    """Persist AI output on the item and record it in history/audit without bumping the
    optimistic-lock version (AI output does not change workflow state or evidence)."""
    from departments import log_department_action
    item = load(item_id)
    event = {"actor": user[0], "role": user[1], "action": action, "status": item["workflow_status"],
             "notes": notes, "timestamp": now()}
    database().tickets.update_one({"id": item["id"]}, {"$set": {field: value}, "$push": {"history": event}})
    log_department_action(user[0], user[1], action, item["project_id"], item["id"], {"notes": notes})


def summary(user, project_id=None):
    records = items(user, project_id)
    counts = {state: sum(i["workflow_status"] == state for i in records) for state in STATES}
    results = [r for i in records for r in i["test_results"]]
    return {"total_bugs": len(records), "open_bugs": sum(i["workflow_status"] != "CLOSED" for i in records),
            "critical_bugs": sum(str(i.get("severity", "")).lower() == "critical" and i["workflow_status"] != "CLOSED" for i in records),
            "fixed_bugs": sum(counts[s] for s in ("FIXED", "QA_REVIEW", "TESTING", "VERIFIED", "CLOSED")),
            "waiting_for_qa": counts["FIXED"] + counts["QA_REVIEW"], "waiting_for_testing": counts["TESTING"],
            "passed_tests": sum(r.get("status") == "passed" for r in results), "failed_tests": sum(r.get("status") == "failed" for r in results),
            "code_quality_score": None, "security_score": None, "coverage": None, "by_status": counts,
            "activity": sorted([h for i in records for h in i["history"]], key=lambda h: h.get("timestamp", ""), reverse=True)[:25]}


def notifications(user):
    db = database()
    query = {"recipient": user[0]}
    return {"items": list(db.notifications.find(query, {"_id": 0, "recipient": 0}).sort("created_at", -1).limit(100)),
            "unread": db.notifications.count_documents({**query, "read": False})}


def read_notification(notification_id, user):
    result = database().notifications.update_one({"id": notification_id, "recipient": user[0]}, {"$set": {"read": True}})
    if not result.matched_count:
        raise HTTPException(404, "Notification not found.")
    return {"success": True}
