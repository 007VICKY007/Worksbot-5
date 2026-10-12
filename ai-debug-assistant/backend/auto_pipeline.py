# backend/auto_pipeline.py
"""
Automated Developer -> QA -> Tester workflow for ANY selected project.

Composes only existing building blocks:
  project_runner          - project root/config detection + real framework execution
  departments             - test plans/cases/runs/results, bug filing, audit log
  workflow                - canonical bug lifecycle, auto-assignment, notifications

Stages (all real executions, never mocked):
  1. CONFIG_DETECTION        project's own language/package manager/test framework
  2. DEVELOPER_ANALYSIS      existing deep analysis (files, syntax issues)
  3. DEVELOPER_VERIFICATION  project's own typecheck + full test suite from ITS root
  4. QA_PLAN_AND_CASES       find-or-create plan + useful default cases (no duplicates)
  5. TESTER_RUN              test run over the automated cases, executed for real
  6. BUG_WORKFLOW            failures create/reopen bugs assigned to a real developer
Results are persisted in test_plans/test_cases/test_runs/test_results/tickets/
audit_events/pipeline_runs. Running the pipeline again reuses plan and cases.
"""
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import project_runner
import workflow
from mongo import get_mongo_db

AUTO_TAG = "auto-pipeline"
PLAN_NAME = "Automated QA Plan"


def _now():
    from departments import now_iso
    return now_iso()


def _actor_for(role: str, fallback_user: str, fallback_role: str):
    """A real registered user for the role (least-loaded); the caller as last resort."""
    name = workflow.auto_assignee(role)
    return (name, role) if name else (fallback_user, fallback_role)


def _stage(stages: List[Dict], name: str, status: str, detail: str, **extra):
    stages.append({"stage": name, "status": status, "detail": detail[:500], "timestamp": _now(), **extra})


def _exec_brief(res: Dict[str, Any]) -> Dict[str, Any]:
    keep = ("status", "passed", "exit_code", "duration_ms", "file_path", "test_framework", "command",
            "tests", "failed_tests", "error_summary", "error_type", "no_test_found", "resolved_test_file")
    brief = {k: res.get(k) for k in keep if k in res}
    brief["stdout_tail"] = (res.get("stdout") or "")[-4000:]
    brief["stderr_tail"] = (res.get("stderr") or "")[-4000:]
    return brief


# ── QA stage ──────────────────────────────────────────────────────────────────

def _ensure_plan(db, project_id: str, qa_user: str) -> Dict[str, Any]:
    from departments import create_test_plan
    plan = db.test_plans.find_one({"project_id": project_id, "name": PLAN_NAME}, {"_id": 0})
    if plan:
        return plan
    return create_test_plan({"project_id": project_id, "name": PLAN_NAME,
                             "description": "Automatically generated QA plan: build/typecheck, test-suite, "
                                            "per-test-file regression, and negative/boundary charters.",
                             "tags": [AUTO_TAG]}, created_by=qa_user)


def _default_cases(cfg: Dict[str, Any], files: List[Dict[str, Any]], project_id: str) -> List[Dict[str, Any]]:
    """Useful default cases derived from the project's real configuration (never one-size-fits-all)."""
    fw = cfg.get("test_framework") or "none"
    cmd = cfg.get("test_command_display") or "n/a"
    tests = [f["project_relative_path"] for f in files if f.get("is_test")]
    sources = [f["project_relative_path"] for f in files if not f.get("is_test")]
    main = next((s for s in sources if Path(s).stem.lower() in ("index", "main", "app", "server")), sources[0] if sources else "")
    cases: List[Dict[str, Any]] = []

    def case(title, suite, priority, ctype, target, steps, expected, runner, tags, preconditions=None):
        cases.append({"title": title, "suite": suite, "priority": priority, "type": ctype, "target_file": target,
                      "preconditions": preconditions or [f"Project root: {cfg['root']}",
                                                         f"Detected framework: {fw} ({cfg.get('language')})"],
                      "steps": [{"step_number": i + 1, "action": a, "expected": e} for i, (a, e) in enumerate(steps)],
                      "expected_result": expected, "tags": [AUTO_TAG, *tags],
                      "description": f"Runner: {runner}"})

    if cfg.get("typecheck_command"):
        case("Build & typecheck verification", "smoke", "CRITICAL", "FUNCTIONAL", "",
             [("Run the project's own typecheck from its root", "Exit code 0, no type errors")],
             "Typecheck completes with no errors.", " ".join(cfg["typecheck_command"][-2:]), ["typecheck"])
    if cfg.get("runner_available") and tests:
        case("Full test-suite execution", "regression", "CRITICAL", "REGRESSION", "",
             [(f"Execute `{cmd}` from the project root", "All tests pass")],
             "Entire suite passes with 0 failures.", cmd, ["suite"])
    for t in tests[:10]:
        case(f"Test file: {t}", "regression", "HIGH", "REGRESSION", t,
             [(f"Execute {t} with {fw}", "All tests in the file pass")],
             "All tests in this file pass.", cmd, ["testfile"])
    if main:
        if not tests:
            case(f"Main functionality: {main} — NO TEST AVAILABLE", "smoke", "HIGH", "FUNCTIONAL", "",
                 [(f"Inspect {main}; no related test exists in this project", "Documented gap")],
                 "NO TEST AVAILABLE: the project defines no test for its main module. Generate one with the "
                 "AI Test Case Generator or add a framework test.", "n/a", ["manual", "no-test"])
        case(f"Negative & error handling: {main}", "regression", "HIGH", "NEGATIVE", "",
             [(f"Exercise {main} with invalid/empty/oversized input", "Graceful, typed errors; no crash")],
             "Invalid input is rejected without unhandled exceptions.", "manual", ["manual", "negative"])
        case(f"Boundary conditions: {main}", "regression", "MEDIUM", "BOUNDARY", "",
             [(f"Exercise {main} at limits (0, 1, max, unicode, concurrency)", "Correct behaviour at boundaries")],
             "Boundary values behave to specification.", "manual", ["manual", "boundary"])
    if any("auth" in d or "jwt" in d or "crypto" in d for d in map(str.lower, cfg.get("dependencies", []))):
        case("Security: authentication & secrets handling", "security", "HIGH", "SECURITY", "",
             [("Verify tokens/credentials are validated and never logged", "No secret leakage, invalid tokens rejected")],
             "Security checks pass.", "manual", ["manual", "security"])
    return cases


def _ensure_cases(db, plan: Dict[str, Any], wanted: List[Dict[str, Any]], qa_user: str, project_id: str):
    """Create missing cases only (dedupe by title+target within the plan); never overwrite existing ones."""
    from departments import create_test_case
    existing = {(c.get("title"), c.get("target_file") or "") for c in
                db.test_cases.find({"test_plan_id": plan["id"], "is_archived": {"$ne": True}}, {"_id": 0})}
    created = []
    for c in wanted:
        if (c["title"], c.get("target_file") or "") in existing:
            continue
        created.append(create_test_case({**c, "test_plan_id": plan["id"], "project_id": project_id}, created_by=qa_user))
    all_cases = list(db.test_cases.find({"test_plan_id": plan["id"], "is_archived": {"$ne": True}}, {"_id": 0}))
    return created, all_cases


# ── Tester stage ──────────────────────────────────────────────────────────────

def _execute_case(root: Path, cfg: Dict[str, Any], case: Dict[str, Any], project_id: str) -> Optional[Dict[str, Any]]:
    tags = case.get("tags") or []
    if "typecheck" in tags:
        return project_runner.run_typecheck(root, cfg)
    if "suite" in tags:
        return project_runner.run_target(root, None, cfg)
    if case.get("target_file"):
        from departments import execute_project_file_test
        return execute_project_file_test(case["target_file"], project_id)
    return None  # manual charter — not auto-executable


def _record_result(db, result_row: Dict[str, Any], execution: Dict[str, Any], tester: str):
    from departments import update_test_result
    status = execution["status"].lower()  # passed/failed/blocked
    summary = (f"[automated] {execution.get('test_framework') or execution.get('kind', 'run')}: "
               f"{execution['tests']['passed']}/{execution['tests']['total']} passed, "
               f"{execution['tests']['failed']} failed, exit={execution.get('exit_code')}. "
               f"{execution.get('error_summary', '')}")[:900]
    doc = update_test_result(result_id=result_row["id"], status=status, actual_result=summary,
                             execution_log=(execution.get("stdout", "") + "\n" + execution.get("stderr", ""))[-20000:],
                             error_message=execution.get("error_summary", "") if not execution["passed"] else "",
                             tester_id=tester, duration_ms=execution.get("duration_ms", 0),
                             evidence={"exit_code": execution.get("exit_code"),
                                       "failed_tests": execution.get("failed_tests", []),
                                       "command": execution.get("command")})
    target = execution.get("resolved_test_file") or result_row.get("target_file", "")
    if not target:  # whole-suite runs: derive from the first real failed test id (e.g. "test_x.py::test_y")
        for name in execution.get("failed_tests", []):
            cand = name.split("::")[0].strip()
            if "." in Path(cand).name:
                target = cand
                break
    db.test_results.update_one({"id": result_row["id"]},
                               {"$set": {"mode": "automated", "execution": _exec_brief(execution),
                                         "target_file": target}})
    return doc


# ── Bug workflow ──────────────────────────────────────────────────────────────

def _file_or_reopen_bug(db, result_doc, execution, case, project_id, tester_actor, dev_actor):
    """FAIL -> create a bug (or reopen the existing open one for this case) and assign a real developer."""
    from departments import create_bug_from_test_failure
    existing = db.tickets.find_one({"test_case_id": case["id"], "project_id": project_id,
                                    "workflow_status": {"$nin": ["CLOSED", "VERIFIED"]}}, {"_id": 0})
    if existing:
        note = (f"Automated retest still failing ({_now()}): {execution.get('error_summary', '')[:300]} "
                f"[run result {result_doc['id']}]")
        workflow.comment(existing["id"], note, tester_actor)
        if not existing.get("assigned_developer"):
            workflow.assign(existing["id"], {"developer": dev_actor[0]}, tester_actor)
        return {"bug_id": existing["id"], "action": "updated-existing"}
    bug = create_bug_from_test_failure(
        test_result_id=result_doc["id"], reporter=tester_actor[0],
        severity="high" if case.get("priority") in ("CRITICAL", "HIGH") else "medium",
        priority="high",
        custom_title=f"[auto] {case['title']}: {execution.get('error_type') or 'TestFailure'}",
        logs=(execution.get("stdout", "") + "\n" + execution.get("stderr", ""))[-8000:],
        steps_to_reproduce=f"1. cd {execution.get('project_root', '')}\n"
                           f"2. Run: {' '.join(map(str, execution.get('command') or []))}\n"
                           f"3. Observe: {execution.get('error_summary', '')[:200]}",
    )
    workflow.assign(bug["id"], {"developer": dev_actor[0]}, tester_actor)
    return {"bug_id": bug["id"], "action": "created", "assigned_developer": dev_actor[0]}


# ── Orchestrator ──────────────────────────────────────────────────────────────

def run_auto_workflow(project_id: str, username: str, user_role: str) -> Dict[str, Any]:
    from departments import (list_projects, list_project_files, analyze_project_deep,
                             create_test_run, list_test_results, log_department_action, require_db)
    db = require_db()
    proj = next((p for p in list_projects() if p["id"] == project_id), None)
    if not proj:
        from fastapi import HTTPException
        raise HTTPException(404, "Project not found.")
    root = Path(proj["path"]).resolve()
    stages: List[Dict[str, Any]] = []
    pipeline_id = f"pipe_{uuid.uuid4().hex[:10]}"

    dev_actor = _actor_for("developer", username, user_role)
    qa_actor = _actor_for("qa", username, user_role)
    tester_actor = _actor_for("tester", username, user_role)

    # 1. Project root + configuration (the project's OWN root, never Mindora's).
    cfg = project_runner.detect_config(root)
    _stage(stages, "CONFIG_DETECTION", "COMPLETED",
           f"root={root} language={cfg['language']} pm={cfg['package_manager']} framework={cfg['test_framework']} "
           f"test_cmd={cfg['test_command_display']} typecheck={'yes' if cfg['typecheck_command'] else 'no'} "
           f"deps={len(cfg['dependencies'])}", config={k: cfg[k] for k in
           ("root", "language", "package_manager", "test_framework", "test_command_display", "config_files", "notes")})

    # 2. Developer analysis (existing deep analysis).
    files = list_project_files(project_id)
    analysis = analyze_project_deep(project_id)
    _stage(stages, "DEVELOPER_ANALYSIS", "COMPLETED",
           f"{analysis['total_files']} files, {len(analysis.get('syntax_issues', []))} syntax issues, "
           f"{sum(1 for f in files if f.get('is_test'))} test files discovered", actor=dev_actor[0])

    # 3. Developer verification: the project's own typecheck + full suite, from its root.
    verification = {}
    typecheck = project_runner.run_typecheck(root, cfg)
    if typecheck:
        verification["typecheck"] = _exec_brief(typecheck)
    suite = project_runner.run_target(root, None, cfg)
    verification["test_suite"] = _exec_brief(suite)
    dev_ok = (not typecheck or typecheck["passed"]) and suite["status"] != "FAILED"
    _stage(stages, "DEVELOPER_VERIFICATION", "PASSED" if dev_ok else "FAILED",
           f"typecheck={typecheck['status'] if typecheck else 'n/a'}; "
           f"suite={suite['status']} ({suite['tests']['passed']}/{suite['tests']['total']} passed) "
           f"{suite.get('error_summary', '')}", actor=dev_actor[0], verification=verification)
    log_department_action(dev_actor[0], "developer", "DEV_VERIFICATION",
                          project_id, pipeline_id, {"typecheck": typecheck["status"] if typecheck else "n/a",
                                                    "suite": suite["status"]})

    # 4. QA plan + default cases (idempotent).
    plan = _ensure_plan(db, project_id, qa_actor[0])
    created, all_cases = _ensure_cases(db, plan, _default_cases(cfg, files, project_id), qa_actor[0], project_id)
    _stage(stages, "QA_PLAN_AND_CASES", "COMPLETED",
           f"plan={plan['id']} '{PLAN_NAME}'; cases created now={len(created)}, total in plan={len(all_cases)}",
           actor=qa_actor[0], plan_id=plan["id"], created_case_ids=[c["id"] for c in created])

    # 5. Tester run over the automated cases.
    auto_cases = [c for c in all_cases if "manual" not in (c.get("tags") or [])]
    report_results: List[Dict[str, Any]] = []
    bugs: List[Dict[str, Any]] = []
    run_doc = None
    if auto_cases:
        run_doc = create_test_run(project_id=project_id, test_plan_id=plan["id"],
                                  name=f"Automated run {pipeline_id}", environment="Local",
                                  started_by=tester_actor[0], test_case_ids=[c["id"] for c in auto_cases])
        rows = {r["test_case_id"]: r for r in list_test_results(test_run_id=run_doc["id"])}
        for case in auto_cases:
            execution = _execute_case(root, cfg, case, project_id)
            if execution is None:
                continue
            result_doc = _record_result(db, rows[case["id"]], execution, tester_actor[0])
            entry = {"case": case["title"], "result_id": result_doc["id"], "status": result_doc["status"],
                     "tests": execution["tests"], "duration_ms": execution.get("duration_ms"),
                     "exit_code": execution.get("exit_code"), "error": execution.get("error_summary", "")[:200]}
            # 6. Bug workflow on real failure.
            if result_doc["status"] == "failed":
                entry["bug"] = _file_or_reopen_bug(db, result_doc, execution, case, project_id, tester_actor, dev_actor)
                bugs.append(entry["bug"])
            report_results.append(entry)
        run_doc = db.test_runs.find_one({"id": run_doc["id"]}, {"_id": 0})
        _stage(stages, "TESTER_RUN", run_doc["status"],
               f"run={run_doc['id']}: {run_doc['passed']} passed, {run_doc['failed']} failed, "
               f"{run_doc['blocked']} blocked of {run_doc['total_tests']}",
               actor=tester_actor[0], run_id=run_doc["id"])
    else:
        _stage(stages, "TESTER_RUN", "SKIPPED", "No automated cases are executable for this project "
               "(no runner/test files); manual charters were saved to the plan.", actor=tester_actor[0])

    if bugs:
        _stage(stages, "BUG_WORKFLOW", "BUGS_FILED",
               f"{len(bugs)} failing case(s) -> bugs {[b['bug_id'] for b in bugs]} assigned to {dev_actor[0]}")
    else:
        _stage(stages, "BUG_WORKFLOW", "CLEAN", "No failing automated case; no bug was filed or reopened.")

    failed = sum(1 for r in report_results if r["status"] == "failed")
    blocked = sum(1 for r in report_results if r["status"] == "blocked")
    result = {"pipeline_id": pipeline_id, "project_id": project_id, "project_root": str(root),
              "config": {k: cfg[k] for k in ("language", "package_manager", "test_framework",
                                             "test_command_display", "runner_available", "notes")},
              "actors": {"developer": dev_actor[0], "qa": qa_actor[0], "tester": tester_actor[0]},
              "stages": stages, "plan_id": plan["id"], "test_run_id": run_doc["id"] if run_doc else None,
              "results": report_results, "bugs": bugs,
              "current_stage": ("DEVELOPER_FIX_REQUIRED" if bugs or failed else
                                "BLOCKED_NEEDS_TESTS" if blocked and not report_results else
                                "READY_FOR_RELEASE" if report_results and not failed and not blocked else
                                "NEEDS_TESTS"),
              "completed_at": _now(), "triggered_by": username}
    db.pipeline_runs.insert_one(dict(result))
    result.pop("_id", None)
    log_department_action(username, user_role, "AUTO_PIPELINE", project_id, pipeline_id,
                          {"stage": result["current_stage"], "bugs": [b["bug_id"] for b in bugs]})
    return result
