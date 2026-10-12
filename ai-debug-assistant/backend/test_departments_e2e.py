import sys
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).parent))

from auth import register_user, create_token, get_user_role, verify_credentials
from departments import (
    list_projects,
    create_test_plan,
    list_test_plans,
    create_test_case,
    list_test_cases,
    create_test_run,
    list_test_runs,
    list_test_results,
    update_test_result,
    create_bug_from_test_failure,
    list_bugs,
    assign_bug,
    developer_submit_fix,
    qa_close_bug,
    qa_reopen_bug,
    analyze_bug_with_ai,
    get_qa_report,
    get_tester_report,
    list_audit_events,
)

def run_tests():
    print("=== STARTING DEPARTMENT WORKFLOW E2E TESTS ===")

    # 1. Projects
    projects = list_projects()
    assert len(projects) > 0, "No projects loaded"
    print(f"✓ Projects loaded: {len(projects)} projects available")

    # 2. QA creates Test Plan
    plan_data = {
        "project_id": "sample_project",
        "name": "E2E Automated Release Validation Plan",
        "scope": "Microservices, math calculators, and auth handlers.",
        "objectives": "Zero defect escape to production.",
        "target_date": "2026-10-15"
    }
    plan = create_test_plan(plan_data, created_by="qa_lead")
    assert plan["id"].startswith("tp_"), "Failed creating test plan"
    print(f"✓ QA Created Test Plan: {plan['id']} ('{plan['name']}')")

    # 3. QA creates Test Case
    case_data = {
        "test_plan_id": plan["id"],
        "title": "Division by Zero Exception Check",
        "suite": "regression",
        "priority": "critical",
        "type": "functional",
        "target_file": "sample_project/calc.py",
        "expected_result": "ZeroDivisionError handled gracefully without server crash.",
        "steps": [
            {"step_number": 1, "action": "Invoke divide(10, 0)", "expected": "Graceful error message"}
        ]
    }
    case = create_test_case(case_data, created_by="qa_lead")
    assert case["id"].startswith("tc_"), "Failed creating test case"
    print(f"✓ QA Created Test Case: {case['id']} ('{case['title']}')")

    # 4. Tester creates Test Run
    run = create_test_run(
        name="Sprint 12 Regression Execution Run",
        created_by="tester_alice",
        project_id="sample_project",
        test_plan_id=plan["id"],
        environment="Staging",
        test_case_ids=[case["id"]]
    )
    assert run["id"].startswith("tr_"), "Failed creating test run"
    print(f"✓ Tester Created Test Run: {run['id']} with {run['total_tests']} tests linked")

    # 5. Tester executes test & marks failed
    results = list_test_results(test_run_id=run["id"])
    assert len(results) >= 1, "No test results generated in run"
    target_result = results[0]
    
    updated_result = update_test_result(
        result_id=target_result["id"],
        status="failed",
        actual_result="Process terminated with unhandled ZeroDivisionError",
        duration_ms=145,
        tester_id="tester_alice"
    )
    assert updated_result["status"] == "failed", "Test status not updated to failed"
    print(f"✓ Tester Executed Result {target_result['id']}: marked FAILED")

    # 6. Tester 1-Click logs defect from test failure
    bug = create_bug_from_test_failure(
        test_result_id=target_result["id"],
        reporter="tester_alice",
        title_override="ZeroDivisionError in calc.py during zero input",
        severity_override="critical",
        priority_override="blocker",
        steps_to_reproduce="Call calc.py divide with denominator 0",
        logs="Traceback (most recent call last):\n  File 'calc.py', line 12, in divide\n    return a / b\nZeroDivisionError: division by zero"
    )
    assert bug["id"].startswith("bug_"), "Failed logging bug"
    print(f"✓ Tester Logged Bug: {bug['id']} ('{bug['title']}')")

    # 7. QA assigns defect to Developer
    assigned_bug = assign_bug(
        bug_id=bug["id"],
        assigned_to="developer",
        assigned_by="qa_lead"
    )
    assert assigned_bug["status"] == "assigned", "Bug status not marked assigned"
    assert assigned_bug["assigned_to"] == "developer"
    print(f"✓ QA Triaged & Assigned Bug {bug['id']} to 'developer'")

    # 8. Developer submits fix
    fixed_bug = developer_submit_fix(
        bug_id=bug["id"],
        developer_id="developer",
        fix_explanation="Added explicit divisor check to return informative DomainError instead of raw exception.",
        fixed_code="def divide(a, b):\n    if b == 0:\n        raise ValueError('Cannot divide by zero')\n    return a / b"
    )
    assert fixed_bug["status"] in ("fixed", "retest"), "Bug status not marked fixed/retest"
    print(f"✓ Developer Submitted Fix for Bug {bug['id']}: status is '{fixed_bug['status']}'")

    # 9. QA validates & closes bug
    closed_bug = qa_close_bug(
        bug_id=bug["id"],
        closed_by="qa_lead",
        validation_notes="Verified in staging environment. Regression rerun passed."
    )
    assert closed_bug["status"] == "closed", "Bug not closed by QA"
    print(f"✓ QA Validated & Closed Bug {bug['id']}")

    # 10. Admin checks department oversight
    qa_report = get_qa_report()
    assert qa_report["total_test_plans"] >= 1
    assert qa_report["total_test_cases"] >= 1
    print(f"✓ Admin Oversight: {qa_report['total_test_plans']} test plans, {qa_report['total_test_cases']} test cases, {qa_report['bug_metrics']['closed_bugs']} closed bugs")

    audit_events = list_audit_events(limit=10)
    assert len(audit_events) >= 5, "Audit events not recorded properly"
    print(f"✓ Cross-Department Audit Trail: {len(audit_events)} audit events recorded")

    print("\n=== ALL DEPARTMENT TESTS PASSED WITH 100% SUCCESS ===")

if __name__ == "__main__":
    run_tests()
