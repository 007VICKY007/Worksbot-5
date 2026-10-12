"""
End-to-end Developer -> QA -> Tester lifecycle test (HTTP level, FastAPI TestClient).

Isolation:
  - Uses a dedicated MongoDB database (MONGO_DB_NAME=mindora_workflow_e2e), dropped before/after.
  - Uses a temporary project directory (fixes are applied to disk; sample_project is never touched).
  - Redirects the users.json disk backup to a temp file.
  - Disables the OpenAI provider so AI features exercise their deterministic local fallbacks.

Run:  python3 backend/test_workflow_lifecycle_e2e.py      (or: pytest backend/test_workflow_lifecycle_e2e.py)
Requires a local MongoDB (mongodb://localhost:27017/).
"""
import os
import sys
import tempfile
import textwrap
from pathlib import Path

os.environ["MONGO_DB_NAME"] = "mindora_workflow_e2e"
os.environ["OPENAI_API_KEY"] = ""  # load_dotenv never overrides an existing variable.

BACKEND = Path(__file__).parent
sys.path.insert(0, str(BACKEND.parent / "src"))
sys.path.insert(0, str(BACKEND))

import auth  # noqa: E402

_tmp_users = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
_tmp_users.close()
os.unlink(_tmp_users.name)
auth.USERS_FILE = Path(_tmp_users.name)

from fastapi.testclient import TestClient  # noqa: E402
from mongo import get_mongo_client  # noqa: E402
import server  # noqa: E402
import workflow  # noqa: E402

BUGGY = textwrap.dedent('''\
    """Calculator under test."""


    def divide(a, b):
        return a / b
''')
FIX_V1 = textwrap.dedent('''\
    """Calculator under test."""


    def divide(a, b):
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b
''')
FIX_V2 = textwrap.dedent('''\
    """Calculator under test."""


    def divide(a, b):
        """Divide a by b, rejecting a zero divisor."""
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b
''')
TESTS = textwrap.dedent('''\
    import pytest
    from calc import divide


    def test_divide():
        assert divide(6, 3) == 2


    def test_divide_by_zero():
        with pytest.raises(ValueError):
            divide(1, 0)
''')

client = TestClient(server.app)
STEP = [0]


def step(msg):
    STEP[0] += 1
    print(f"  [{STEP[0]:02d}] {msg}")


def ok(resp, code=200):
    assert resp.status_code == code, f"expected {code}, got {resp.status_code}: {resp.text[:600]}"
    return resp.json()


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def register(username, role):
    return ok(client.post("/api/auth/register", json={"username": username, "password": "pass1234", "role": role}))["token"]


def item(token, item_id):
    return ok(client.get(f"/api/workflow/items/{item_id}", headers=headers(token)))["item"]


def notifications(token):
    return ok(client.get("/api/notifications", headers=headers(token)))


def test_full_lifecycle():
    mongo = get_mongo_client()
    assert mongo is not None, "MongoDB must be running on localhost:27017"
    mongo.drop_database("mindora_workflow_e2e")
    project_dir = Path(tempfile.mkdtemp(prefix="mindora_e2e_project_"))
    (project_dir / "calc.py").write_text(BUGGY)
    (project_dir / "test_calc.py").write_text(TESTS)
    try:
        _run(project_dir)
    finally:
        mongo.drop_database("mindora_workflow_e2e")
        if auth.USERS_FILE.exists():
            auth.USERS_FILE.unlink()


def _run(project_dir: Path):
    print("\n=== Developer -> QA -> Tester lifecycle E2E ===")
    # ── Users / RBAC ─────────────────────────────────────────────────────────
    client.get("/api/auth/public-users")  # Seeds default accounts into the isolated DB.
    dev, qa, tester = register("e2e_dev", "developer"), register("e2e_qa", "qa"), register("e2e_tester", "tester")
    admin = ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))["token"]
    assert client.post("/api/auth/register", json={"username": "e2e_evil", "password": "pass1234", "role": "admin"}).status_code == 403
    step("Registered developer/QA/tester; admin self-registration rejected (RBAC intact)")

    project = ok(client.post("/api/projects/import", json={"folder_path": str(project_dir), "name": "E2E Calc"}, headers=headers(qa)))["project"]
    pid = project["id"]
    step(f"Imported temporary project {pid}")

    # ── Tester finds a failure and files a bug with severity/priority ───────
    plan = ok(client.post("/api/qa/plans", json={"name": "E2E plan", "project_id": pid}, headers=headers(qa)))["plan"]
    case = ok(client.post("/api/qa/cases", json={"test_plan_id": plan["id"], "title": "Divide regression",
                                                 "target_file": "test_calc.py", "expected_result": "All pass"}, headers=headers(qa)))["case"]
    run = ok(client.post("/api/testing/runs", json={"name": "Sprint run", "project_id": pid, "test_case_ids": [case["id"]]},
                         headers=headers(tester)))["run"]
    results = ok(client.get(f"/api/testing/results?test_run_id={run['id']}", headers=headers(tester)))["results"]
    assert results[0]["case_title"] == "Divide regression", "test results must expose case_title for the UI"
    executed = ok(client.post("/api/testing/run-file-test", json={"file_path": "test_calc.py", "project_id": pid}, headers=headers(tester)))["result"]
    assert executed["status"] == "FAILED", executed
    ok(client.patch(f"/api/testing/results/{results[0]['id']}", json={"status": "failed", "notes": "ZeroDivisionError raised instead of ValueError",
                                                                     "evidence": {"logs": executed["stdout"][-2000:]}}, headers=headers(tester)))
    step("Tester executed test case -> FAIL recorded")
    bug = ok(client.post("/api/testing/bugs", json={"test_result_id": results[0]["id"], "title": "divide() crashes on zero divisor",
                                                    "severity": "critical", "priority": "blocker",
                                                    "steps_to_reproduce": "1. call divide(1, 0)\n2. observe ZeroDivisionError"},
                         headers=headers(tester)))["bug"]
    bid = bug["id"]
    assert bug["workflow_status"] == "OPEN" and bug["severity"] == "critical" and bug["priority"] == "blocker"
    step(f"Tester created bug {bid} (critical/blocker) -> OPEN")

    # ── QA assigns developer ─────────────────────────────────────────────────
    assert client.patch(f"/api/workflow/items/{bid}/assign", json={"developer": "e2e_dev"}, headers=headers(dev)).status_code == 403
    it = ok(client.patch(f"/api/workflow/items/{bid}/assign", json={"developer": "e2e_dev"}, headers=headers(qa)))["item"]
    assert it["workflow_status"] == "ASSIGNED" and it["assigned_developer"] == "e2e_dev"
    assert any(n["item_id"] == bid for n in notifications(dev)["items"]), "developer must be notified of assignment"
    step("QA assigned developer -> ASSIGNED (developer notified; developer cannot self-assign others' bugs)")

    # ── Developer: view, analyze, generate/verify, apply, submit ─────────────
    mine = [i for i in ok(client.get(f"/api/workflow/items?project_id={pid}", headers=headers(dev)))["items"] if i["assigned_developer"] == "e2e_dev"]
    assert [i["id"] for i in mine] == [bid] and "IN_PROGRESS" in mine[0]["allowed_actions"]
    step("Developer sees assigned bug with allowed action IN_PROGRESS")
    analysis = ok(client.post(f"/api/developer/bugs/{bid}/ai-analyze", headers=headers(dev)))["analysis"]
    assert analysis["root_cause"] and "fix_strategy" in analysis and "rag_memories_found" in analysis
    assert item(dev, bid)["ai_analysis"]["root_cause"] == analysis["root_cause"]
    step(f"AI root-cause analysis persisted: {analysis['root_cause'][:70]}...")
    src = ok(client.get(f"/api/workflow/items/{bid}/source", headers=headers(dev)))
    assert src["code"] == BUGGY, (src["file"], item(dev, bid).get("target_file"), item(dev, bid).get("test_file"))
    assert client.post(f"/api/workflow/items/{bid}/ai/generate-fix", headers=headers(tester)).status_code == 403
    gen = ok(client.post(f"/api/workflow/items/{bid}/ai/generate-fix", headers=headers(dev)))["fix"]
    assert "validation_status" in gen and gen["original_code"] == BUGGY
    step(f"AI fix generation ran (provider={gen['provider']}, changed={gen['changed']}); tester blocked (403)")
    it = ok(client.post(f"/api/workflow/items/{bid}/transition", json={"next_status": "IN_PROGRESS"}, headers=headers(dev)))["item"]
    assert it["workflow_status"] == "IN_PROGRESS"
    bad = ok(client.post(f"/api/workflow/items/{bid}/verify-fix", json={"fixed_code": "def divide(a, b)\n    return a /"}, headers=headers(dev)))["verification"]
    assert bad["status"] == "FAILED"
    wrong = ok(client.post(f"/api/workflow/items/{bid}/verify-fix", json={"fixed_code": BUGGY.replace("a / b", "a / b  # unchanged logic")},
                           headers=headers(dev)))["verification"]
    assert wrong["status"] == "FAILED" and wrong["sandbox_tests"]["executed"], "sandbox tests must catch a non-fix"
    good = ok(client.post(f"/api/workflow/items/{bid}/verify-fix", json={"fixed_code": FIX_V1}, headers=headers(dev)))["verification"]
    assert good["status"] == "VERIFIED" and all(r["passed"] for r in good["sandbox_tests"]["results"]), good
    assert (project_dir / "calc.py").read_text() == BUGGY, "verification must never modify the project"
    step("Sandbox verify: syntax error FAILED, non-fix FAILED by sandbox tests, real fix VERIFIED; project untouched")
    review = ok(client.post(f"/api/workflow/items/{bid}/ai/code-review", json={"fixed_code": FIX_V1}, headers=headers(dev)))["review"]
    assert review["verdict"] in ("APPROVE", "REQUEST_CHANGES") and review["diff"]
    step(f"AI code review of candidate: {review['verdict']} (score {review['score']})")
    it = ok(client.post(f"/api/workflow/items/{bid}/fix", json={"fixed_code": FIX_V1, "fix_explanation": "Guard zero divisor with ValueError",
                                                               "version": it["version"]}, headers=headers(dev)))["item"]
    assert it["workflow_status"] == "FIXED" and (project_dir / "calc.py").read_text() == FIX_V1
    assert "QA_REVIEW" in it["allowed_actions"], "handoff must be available even with no QA assigned"
    it = ok(client.post(f"/api/workflow/items/{bid}/transition", json={"next_status": "QA_REVIEW", "notes": "Ready for QA"}, headers=headers(dev)))["item"]
    assert it["workflow_status"] == "QA_REVIEW" and it["assigned_qa"] == "e2e_qa"
    step("Developer applied fix (backup + hash) -> FIXED -> QA_REVIEW; QA auto-assigned (least loaded)")

    # ── QA: review, AI tests, regression, approve ────────────────────────────
    assert any(n["item_id"] == bid for n in notifications(qa)["items"])
    assert "TESTING" not in item(qa, bid)["allowed_actions"], "QA cannot approve without passing evidence"
    assert client.post(f"/api/workflow/items/{bid}/transition", json={"next_status": "TESTING"}, headers=headers(qa)).status_code == 403
    qreview = ok(client.post(f"/api/workflow/items/{bid}/ai/code-review", json={}, headers=headers(qa)))["review"]
    assert qreview["scope"] == "applied_fix" and "+" in qreview["diff"]
    step(f"QA AI code review of applied fix: {qreview['verdict']}")
    assert client.post(f"/api/workflow/items/{bid}/ai/test-cases", json={"save": True}, headers=headers(dev)).status_code == 403
    gen_tests = ok(client.post(f"/api/workflow/items/{bid}/ai/test-cases", json={"save": True}, headers=headers(qa)))
    assert gen_tests["saved"] and gen_tests["count"] >= 2
    assert all(isinstance(s, dict) and "step_number" in s for c in gen_tests["test_cases"] for s in c["steps"])
    assert any(c["target_file"] == "test_calc.py" for c in gen_tests["test_cases"]), "related test file linked as automated case"
    step(f"AI generated & saved {gen_tests['count']} regression test cases to 'AI Regression Suite'")
    reg = ok(client.post(f"/api/workflow/items/{bid}/regression", json={"auto_advance": True}, headers=headers(qa)))
    assert reg["summary"]["failed"] == 0 and reg["summary"]["passed"] >= 2, reg["summary"]
    it = reg["item"]
    assert it["workflow_status"] == "TESTING" and it["assigned_tester"] == "e2e_tester"
    step(f"QA regression run {reg['summary']} -> auto-approved -> TESTING; tester auto-assigned")

    # ── Tester: retest FAIL -> REOPENED back to developer ───────────────────
    assert client.post(f"/api/workflow/items/{bid}/tests", json={"result": "PASS", "notes": "x" * 25}, headers=headers(qa)).status_code == 403
    assert client.post(f"/api/workflow/items/{bid}/tests", json={"result": "FAIL", "notes": "short"}, headers=headers(tester)).status_code == 400
    resp = ok(client.post(f"/api/workflow/items/{bid}/tests", json={"result": "FAIL", "notes": "Error message is not user friendly in UI flow",
                                                                    "auto_advance": True}, headers=headers(tester)))
    it = resp["item"]
    assert it["workflow_status"] == "REOPENED" and it["reopen_count"] == 1
    assert any("REOPENED" in n["message"] for n in notifications(dev)["items"]), "developer notified of reopen"
    step("Tester FAIL -> REOPENED (sent back to developer, reopen_count=1, developer notified)")

    # ── Developer re-fix -> QA -> Tester ─────────────────────────────────────
    it = ok(client.post(f"/api/workflow/items/{bid}/transition", json={"next_status": "IN_PROGRESS"}, headers=headers(dev)))["item"]
    it = ok(client.post(f"/api/workflow/items/{bid}/fix", json={"fixed_code": FIX_V2, "fix_explanation": "Document zero-divisor behaviour"},
                        headers=headers(dev)))["item"]
    assert it["fix_revision"] == 2
    it = ok(client.post(f"/api/workflow/items/{bid}/transition", json={"next_status": "QA_REVIEW"}, headers=headers(dev)))["item"]
    assert it["assigned_qa"] == "e2e_qa"
    it = ok(client.post(f"/api/workflow/items/{bid}/tests", json={"result": "PASS", "notes": "Reviewed revision 2, docstring and guard OK",
                                                                  "auto_advance": True}, headers=headers(qa)))["item"]
    assert it["workflow_status"] == "TESTING"
    step("REOPENED -> IN_PROGRESS -> FIXED (rev 2) -> QA_REVIEW -> QA PASS -> TESTING")
    it = ok(client.post(f"/api/workflow/items/{bid}/tests", json={"result": "PASS", "notes": "Retested: zero divisor now handled cleanly",
                                                                  "auto_advance": True}, headers=headers(tester)))["item"]
    assert it["workflow_status"] == "VERIFIED"
    it = ok(client.post(f"/api/workflow/items/{bid}/comments", json={"text": "Verified on retest, closing."}, headers=headers(tester)))["item"]
    it = ok(client.post(f"/api/workflow/items/{bid}/transition", json={"next_status": "CLOSED", "notes": "Verified fix"}, headers=headers(tester)))["item"]
    assert it["workflow_status"] == "CLOSED"
    step("Tester retest PASS -> VERIFIED -> CLOSED (with comment)")

    # ── History / comments / bug_history ─────────────────────────────────────
    statuses = [h["status"] for h in it["history"]]
    for s in ("ASSIGNED", "IN_PROGRESS", "FIXED", "QA_REVIEW", "TESTING", "REOPENED", "VERIFIED", "CLOSED"):
        assert s in statuses, f"history missing {s}"
    actions = {h["action"] for h in it["history"]}
    assert {"AI_BUG_ANALYSIS", "FIX_VERIFIED_SANDBOX", "AI_CODE_REVIEW", "AI_TESTS_GENERATED", "TEST_RECORDED", "COMMENT"} <= actions, actions
    assert it["comments"] and it["comments"][-1]["actor"] == "e2e_tester"
    legacy = workflow.database().bug_history.count_documents({"bug_id": bid})
    assert legacy >= 8
    step(f"History has full lifecycle + AI events; {legacy} bug_history rows; comments recorded")

    # ── Admin visibility ─────────────────────────────────────────────────────
    assert client.get("/api/admin/workflow-overview", headers=headers(qa)).status_code == 403
    ov = ok(client.get("/api/admin/workflow-overview", headers=headers(admin)))
    users = {u["username"]: u for u in ov["users"]}
    assert users["e2e_dev"]["fixes_applied"] == 2 and users["e2e_tester"]["tests_recorded"] >= 3 and users["e2e_tester"]["reopens"] == 1
    assert any(b["id"] == bid and b["status"] == "closed" for b in ov["bugs"])
    assert ov["test_totals"]["passed"] >= 3 and ov["test_totals"]["failed"] >= 2
    assert all(ov["role_activity"][r]["total"] > 0 for r in ("developer", "qa", "tester"))
    qa_only = ok(client.get("/api/admin/workflow-overview?role=qa", headers=headers(admin)))["audit"]
    assert qa_only and all(e["role"] == "qa" for e in qa_only)
    admin_users = {u["username"]: u for u in ok(client.get("/api/admin/users", headers=headers(admin)))["users"]}
    assert admin_users["e2e_dev"]["workflow_actions"] > 0
    dept = ok(client.get("/api/department/overview", headers=headers(admin)))
    assert any(b["id"] == bid for b in dept["recent_bugs"])
    step("Admin overview: users/activity, bugs, test results, per-role activity, filtered audit history")

    summary = ok(client.get(f"/api/workflow/summary?project_id={pid}", headers=headers(admin)))
    assert summary["by_status"]["CLOSED"] == 1
    print("=== ALL LIFECYCLE CHECKS PASSED ===")


if __name__ == "__main__":
    test_full_lifecycle()
