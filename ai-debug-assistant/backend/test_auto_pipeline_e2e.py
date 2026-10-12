"""
End-to-end automated Developer -> QA -> Tester pipeline test (HTTP level).

Projects exercised (nothing hardcoded in the implementation; fixtures chosen per path):
  1. calcjs       temp Vitest/TypeScript project  -> SUCCESS path (real vitest run)
  2. sample copy  temp copy of sample_project     -> FAILURE path (real pytest failure -> bug ->
                                                     developer fix -> QA -> tester -> CLOSED)
  3. NumberRush   real imported project           -> detection + NO TEST AVAILABLE + real tsc typecheck

Isolation: dedicated Mongo DB (dropped), temp users.json, OPENAI key disabled, fixtures in temp dirs.
Run: python3 backend/test_auto_pipeline_e2e.py
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

os.environ["MONGO_DB_NAME"] = "mindora_auto_pipeline_e2e"
os.environ["OPENAI_API_KEY"] = ""

BACKEND = Path(__file__).parent
sys.path.insert(0, str(BACKEND.parent / "src"))
sys.path.insert(0, str(BACKEND))

import auth  # noqa: E402

_tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
_tmp.close()
os.unlink(_tmp.name)
auth.USERS_FILE = Path(_tmp.name)

from fastapi.testclient import TestClient  # noqa: E402
from mongo import get_mongo_client  # noqa: E402
import server  # noqa: E402

CALCJS = Path("/var/folders/t8/94r6ykp95td1tkxlw65_m4140000gn/T/opencode/calcjs")
NUMBERRUSH = Path("/Volumes/Personal/NumberRush")
client = TestClient(server.app)
STEP = [0]


def step(msg):
    STEP[0] += 1
    print(f"  [{STEP[0]:02d}] {msg}")


def ok(resp, code=200):
    assert resp.status_code == code, f"expected {code}, got {resp.status_code}: {resp.text[:800]}"
    return resp.json()


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def register(u, r):
    return ok(client.post("/api/auth/register", json={"username": u, "password": "pass1234", "role": r}))["token"]


def pipeline(tok, pid):
    return ok(client.post(f"/api/pipeline/run-autonomous?project_id={pid}", headers=hdr(tok)))["pipeline"]


def stage(p, name):
    return next(s for s in p["stages"] if s["stage"] == name)


def test_auto_pipeline():
    mongo = get_mongo_client()
    assert mongo is not None, "MongoDB required"
    mongo.drop_database("mindora_auto_pipeline_e2e")
    sample_copy = Path(tempfile.mkdtemp(prefix="mindora_sample_copy_"))
    for f in ("inventory.py", "test_inventory.py", "calc.py", "test_calc.py"):
        src = BACKEND.parent / "sample_project" / f
        if src.exists():
            shutil.copy2(src, sample_copy / f)
    try:
        run(sample_copy)
    finally:
        mongo.drop_database("mindora_auto_pipeline_e2e")
        shutil.rmtree(sample_copy, ignore_errors=True)
        if auth.USERS_FILE.exists():
            auth.USERS_FILE.unlink()


def run(sample_copy: Path):
    print("\n=== AUTOMATED DEV -> QA -> TESTER PIPELINE E2E ===")
    client.get("/api/auth/public-users")
    dev, qa, tester = register("auto_dev", "developer"), register("auto_qa", "qa"), register("auto_tester", "tester")
    admin = ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))["token"]
    pid_js = ok(client.post("/api/projects/import", json={"folder_path": str(CALCJS), "name": "CalcJS"}, headers=hdr(qa)))["project"]["id"]
    pid_py = ok(client.post("/api/projects/import", json={"folder_path": str(sample_copy), "name": "SampleCopy"}, headers=hdr(qa)))["project"]["id"]
    pid_nr = ok(client.post("/api/projects/import", json={"folder_path": str(NUMBERRUSH), "name": "NumberRushE2E"}, headers=hdr(qa)))["project"]["id"]
    step(f"Users seeded; imported projects js={pid_js} py={pid_py} nr={pid_nr}")

    # ── Config detection endpoint ────────────────────────────────────────────
    cfg_js = ok(client.get(f"/api/projects/{pid_js}/test-config", headers=hdr(dev)))["test_config"]
    cfg_py = ok(client.get(f"/api/projects/{pid_py}/test-config", headers=hdr(dev)))["test_config"]
    cfg_nr = ok(client.get(f"/api/projects/{pid_nr}/test-config", headers=hdr(dev)))["test_config"]
    assert (cfg_js["test_framework"], cfg_js["language"]) == ("vitest", "typescript") and cfg_js["runner_available"]
    assert (cfg_py["test_framework"], cfg_py["package_manager"]) == ("pytest", "pip")
    assert cfg_nr["language"] == "typescript" and cfg_nr["test_framework"] is None and not cfg_nr["runner_available"]
    step(f"Config detection: calcjs=vitest/npm, sample=pytest/pip, NumberRush=typescript w/o framework ({cfg_nr['notes']})")

    # ── 1. SUCCESS PATH: vitest project ──────────────────────────────────────
    p1 = pipeline(tester, pid_js)
    assert Path(p1["project_root"]).resolve() == CALCJS.resolve()
    dv = stage(p1, "DEVELOPER_VERIFICATION")
    assert dv["status"] == "PASSED" and dv["verification"]["test_suite"]["tests"]["passed"] == 3
    assert dv["verification"]["test_suite"]["command"][0] == "vitest"
    assert {p1["actors"]["developer"], p1["actors"]["qa"], p1["actors"]["tester"]} >= {"auto_dev", "auto_qa", "auto_tester"} or True
    assert p1["actors"] == {"developer": "auto_dev", "qa": "auto_qa", "tester": "auto_tester"}
    step(f"CalcJS developer verification: vitest suite PASSED (3/3) by {p1['actors']['developer']}")
    qa_stage = stage(p1, "QA_PLAN_AND_CASES")
    assert qa_stage["created_case_ids"], "default QA cases must be created"
    run_doc = ok(client.get(f"/api/testing/runs?project_id={pid_js}", headers=hdr(tester)))["runs"][0]
    assert run_doc["status"] == "COMPLETED" and run_doc["failed"] == 0 and run_doc["passed"] >= 2
    results = ok(client.get(f"/api/testing/results?test_run_id={p1['test_run_id']}", headers=hdr(tester)))["results"]
    assert results and all(r["status"] == "passed" for r in results)
    auto = [r for r in results if r.get("mode") == "automated"]
    assert auto and all(r["execution"]["tests"]["total"] >= 1 and r["execution"]["exit_code"] == 0 for r in auto)
    assert p1["bugs"] == [] and p1["current_stage"] == "READY_FOR_RELEASE"
    step(f"CalcJS tester run {run_doc['id']}: {run_doc['passed']} passed / {run_doc['total_tests']} cases; stage={p1['current_stage']}")
    # Idempotency: second run must not duplicate plan or cases.
    p1b = pipeline(tester, pid_js)
    db = get_mongo_client()["mindora_auto_pipeline_e2e"]
    assert db.test_plans.count_documents({"project_id": pid_js, "name": "Automated QA Plan"}) == 1
    assert not stage(p1b, "QA_PLAN_AND_CASES")["created_case_ids"], "re-run must not duplicate cases"
    step("CalcJS pipeline re-run: same plan reused, 0 duplicate cases, fresh real execution")

    # ── 2. FAILURE PATH: pytest project with a real failing test ─────────────
    p2 = pipeline(admin, pid_py)
    assert stage(p2, "DEVELOPER_VERIFICATION")["status"] == "FAILED"
    assert p2["bugs"], "failing tests must file bugs"
    assert p2["current_stage"] == "DEVELOPER_FIX_REQUIRED"
    failed_results = [r for r in p2["results"] if r["status"] == "failed"]
    assert failed_results and all(r["tests"]["failed"] >= 1 for r in failed_results)
    bug_id = p2["bugs"][0]["bug_id"]
    bug = ok(client.get(f"/api/workflow/items/{bug_id}", headers=hdr(dev)))["item"]
    assert bug["workflow_status"] == "ASSIGNED" and bug["assigned_developer"] == "auto_dev"
    assert bug["project_id"] == pid_py and bug["test_case_id"] and bug["test_result_id"]
    assert "KeyError" in (bug.get("logs") or "") or "cost" in (bug.get("logs") or "")
    assert bug["severity"] and bug["priority"] and bug["created_by"] == "auto_tester"
    assert bug["target_file"] == "inventory.py", f"bug must target the source under test, got {bug['target_file']}"
    step(f"SampleCopy: real pytest failure -> bug {bug_id} (severity={bug['severity']}) assigned to auto_dev, target=inventory.py")
    # Re-run: no duplicate bug, existing one gets a retest comment.
    p2b = pipeline(admin, pid_py)
    assert all(b["action"] == "updated-existing" for b in p2b["bugs"]) and any(b["bug_id"] == bug_id for b in p2b["bugs"])
    assert db.tickets.count_documents({"project_id": pid_py, "workflow_status": {"$ne": "CLOSED"}}) == len(p2["bugs"])
    step("SampleCopy pipeline re-run: existing bug updated (retest note), no duplicate bug")

    # ── Developer fixes -> QA -> tester retest -> VERIFIED -> CLOSED ─────────
    it = ok(client.post(f"/api/workflow/items/{bug_id}/transition", json={"next_status": "IN_PROGRESS"}, headers=hdr(dev)))["item"]
    fixed_code = (sample_copy / "inventory.py").read_text().replace('item["cost"]', 'item["price"]')
    it = ok(client.post(f"/api/workflow/items/{bug_id}/fix",
                        json={"fixed_code": fixed_code, "fix_explanation": "Use the 'price' key the inventory dict actually stores."},
                        headers=hdr(dev)))["item"]
    it = ok(client.post(f"/api/workflow/items/{bug_id}/transition", json={"next_status": "QA_REVIEW"}, headers=hdr(dev)))["item"]
    assert it["assigned_qa"] == "auto_qa"
    reg = ok(client.post(f"/api/workflow/items/{bug_id}/regression", json={"auto_advance": True}, headers=hdr(qa)))
    assert reg["summary"]["failed"] == 0, reg["summary"]
    assert reg["item"]["workflow_status"] == "TESTING" and reg["item"]["assigned_tester"] == "auto_tester"
    it = ok(client.post(f"/api/workflow/items/{bug_id}/tests",
                        json={"result": "PASS", "notes": "Automated retest confirms price lookup fixed.", "auto_advance": True},
                        headers=hdr(tester)))["item"]
    assert it["workflow_status"] == "VERIFIED"
    it = ok(client.post(f"/api/workflow/items/{bug_id}/transition", json={"next_status": "CLOSED", "notes": "Verified."}, headers=hdr(tester)))["item"]
    assert it["workflow_status"] == "CLOSED"
    step("Developer fix applied -> QA regression PASS -> TESTING -> tester PASS -> VERIFIED -> CLOSED")
    # Pipeline after the fix: suite passes, no new bug.
    p2c = pipeline(admin, pid_py)
    assert stage(p2c, "DEVELOPER_VERIFICATION")["status"] == "PASSED" and not p2c["bugs"]
    assert p2c["current_stage"] == "READY_FOR_RELEASE"
    step(f"SampleCopy pipeline after fix: suite PASSED, no bug, stage={p2c['current_stage']}")

    # ── 3. NumberRush: detection + NO TEST AVAILABLE + real typecheck ────────
    files = ok(client.get(f"/api/projects/{pid_nr}/files", headers=hdr(qa)))["files"]
    assert any(f["project_relative_path"] == "components/ui/Badge.tsx" for f in files)
    r = ok(client.post("/api/testing/run-file-test", json={"file_path": "components/ui/Badge.tsx", "project_id": pid_nr},
                       headers=hdr(tester)))["result"]
    assert r["status"] == "BLOCKED" and r["no_test_found"] and "NO TEST AVAILABLE" in r["error_summary"]
    step("NumberRush Badge.tsx: resolved in ITS root; honest 'NO TEST AVAILABLE' (never executed as a script)")
    p3 = pipeline(admin, pid_nr)
    assert Path(p3["project_root"]).resolve() == NUMBERRUSH.resolve()
    titles = [c["title"] for c in db.test_cases.find({"project_id": pid_nr})]
    assert any("NO TEST AVAILABLE" in t for t in titles) and any("Negative" in t for t in titles)
    tc_results = ok(client.get(f"/api/testing/results?test_run_id={p3['test_run_id']}", headers=hdr(tester)))["results"]
    tcheck = next(r for r in tc_results if "typecheck" in r["case_title"].lower() or "Typecheck" in r["case_title"] or "typecheck" in str(r.get("evidence", {})).lower())
    assert tcheck["mode"] == "automated" and tcheck["status"] in ("passed", "failed")
    assert tcheck["execution"]["command"][0] == "tsc"
    step(f"NumberRush pipeline: real `tsc --noEmit` executed in its root -> {tcheck['status'].upper()} "
         f"({tcheck['execution']['duration_ms']} ms); NO-TEST + negative/boundary charters saved")

    # ── Persistence / audit / visibility ─────────────────────────────────────
    assert db.pipeline_runs.count_documents({}) == 6
    for coll in ("test_plans", "test_cases", "test_runs", "test_results", "tickets", "audit_events", "notifications"):
        assert db[coll].count_documents({}) > 0, f"{coll} must be persisted"
    acts = {e["action"] for e in db.audit_events.find({})}
    assert {"AUTO_PIPELINE", "DEV_VERIFICATION", "TEST_RUN_STARTED", "TEST_EXECUTED", "BUG_CREATED"} <= acts, acts
    closed = db.tickets.find_one({"id": bug_id})
    hist_status = [h.get("status") for h in closed["history"]]
    for s in ("ASSIGNED", "IN_PROGRESS", "FIXED", "QA_REVIEW", "TESTING", "VERIFIED", "CLOSED"):
        assert s in hist_status, f"missing {s} in bug history"
    status = ok(client.get(f"/api/pipeline/status/{pid_js}", headers=hdr(admin)))
    assert status["pipeline_status"]["latest_run"]["pipeline_id"] == p1b["pipeline_id"]
    step("DB persistence, audit actions, full bug history, and pipeline status endpoint verified")
    print("=== AUTO PIPELINE E2E: ALL CHECKS PASSED ===")


if __name__ == "__main__":
    test_auto_pipeline()
