# backend/ai_workflow.py
"""
AI enhancements for the Developer -> QA -> Tester bug lifecycle.

Everything here composes existing building blocks instead of adding new engines:
  - departments.analyze_bug_with_ai      (GPT + RAG bug diagnosis, local fallback)
  - ai_analyzer.analyze_file             (GPT fix generation + sandbox validation loop + RAG)
  - fix_validator.validate_code_fix      (temp-dir compiler/static validation, never writes the project)
  - departments.generate_ai_test_cases   (GPT test-case generation)
  - rag_pipeline.retrieve_relevant_memories (MongoDB vector memory)
  - departments.run_file_in_root         (existing subprocess test runner)

Results are persisted on the workflow item (ai_analysis / ai_code_review / ai_generated_tests)
through workflow.annotate(), which records history + audit without changing workflow state.
"""
import json
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

import workflow

MAX_SANDBOX_FILES = 400
MAX_SANDBOX_BYTES = 20 * 1024 * 1024


def _openai_key() -> str:
    from departments import OPENAI_API_KEY
    return OPENAI_API_KEY


def item_source(item: Dict[str, Any]):
    """Resolve the item's registered target file (same containment rules as fixes)."""
    if not item.get("target_file"):
        raise HTTPException(400, "This item has no target file.")
    root, target = workflow.target_path(item["project_id"], item["target_file"])
    return root, target, str(target.relative_to(root)), target.read_text(encoding="utf-8", errors="replace")


def _bug_context(item: Dict[str, Any]) -> str:
    parts = [f"Bug {item['id']}: {item.get('title', '')}",
             f"Severity/Priority: {item.get('severity', '')}/{item.get('priority', '')}"]
    for label, key in (("Description", "description"), ("Steps to reproduce", "steps_to_reproduce"),
                       ("Error type", "error_type"), ("Root cause", "root_cause")):
        if item.get(key):
            parts.append(f"{label}: {str(item[key])[:1500]}")
    logs = item.get("error_logs") or item.get("logs")
    if logs:
        parts.append(f"Logs:\n{str(logs)[:2500]}")
    failures = [r for r in item.get("test_results", []) if r.get("status") == "failed"][-3:]
    for r in failures:
        parts.append(f"Failed {r.get('role')} test ({r.get('test_case_title') or r.get('test_case_id') or 'manual'}): "
                     f"{(r.get('execution') or {}).get('error_summary') or r.get('notes', '')}"[:400])
    return "\n".join(parts)


# ── AI bug analysis ───────────────────────────────────────────────────────────

def bug_analysis(item_id: str, user) -> Dict[str, Any]:
    from departments import analyze_bug_with_ai
    item = workflow.load(item_id)
    source, rel = "", item.get("target_file", "")
    try:
        _, _, rel, source = item_source(item)
    except HTTPException:
        pass  # Analysis still works from logs/description alone.
    analysis = analyze_bug_with_ai(
        error_message=item.get("error_type") or item.get("title", ""),
        logs=item.get("error_logs") or item.get("logs", ""),
        project_id=item["project_id"], test_case_title=item.get("title", ""),
        source_code=source, file_path=rel, description=_bug_context(item),
    )
    workflow.annotate(item_id, user, "ai_analysis", analysis, "AI_BUG_ANALYSIS",
                      str(analysis.get("root_cause", ""))[:300])
    return analysis


# ── AI fix generation + sandbox verification ─────────────────────────────────

def generate_fix(item_id: str, user) -> Dict[str, Any]:
    """Generate a complete replacement file with the existing validated AI fix loop. Never writes to disk."""
    from ai_analyzer import analyze_file
    from universal_analyzer import analyze_source_file
    item = workflow.load(item_id)
    _require_developer(item, user)
    root, target, rel, source = item_source(item)
    issues = analyze_source_file(target, rel, source)
    result = analyze_file(file_path=rel, source_code=source, issues=issues, scanned_directory=str(root),
                          username=user[0], extra_context=_bug_context(item))
    changed = bool(result.get("fixed_code")) and result.get("fixed_code") != source
    verification = verify_fix(item_id, user, result["fixed_code"]) if changed else None
    payload = {**result, "suggested_code": result.get("fixed_code", "") if changed else "",
               "original_code": source, "changed": changed, "verification": verification,
               "provider": "openai" if _openai_key() else "local"}
    workflow.annotate(item_id, user, "ai_generated_fix",
                      {k: payload[k] for k in ("root_cause", "explanation", "validation_status", "confidence", "changed")},
                      "AI_FIX_GENERATED", f"validation={payload.get('validation_status')} changed={changed}")
    return payload


def _require_developer(item, user):
    if user[1] == "admin":
        return
    if user[1] != "developer" or item.get("assigned_developer") != user[0]:
        raise HTTPException(403, "Only the assigned developer may generate or verify fixes for this item.")


def _sandbox_copy(root: Path, dest: Path) -> None:
    from departments import IGNORED_PROJECT_DIRS, ALLOWED_CODE_EXTENSIONS
    count = size = 0
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if any(p in IGNORED_PROJECT_DIRS or p.startswith(".") for p in rel.parts) or not path.is_file():
            continue
        if path.suffix.lower() not in ALLOWED_CODE_EXTENSIONS and path.name not in ("conftest.py", "pytest.ini"):
            continue
        count += 1
        size += path.stat().st_size
        if count > MAX_SANDBOX_FILES or size > MAX_SANDBOX_BYTES:
            raise OverflowError("Project too large for sandbox test execution.")
        (dest / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest / rel)


def _related_tests(root: Path, rel: str) -> List[str]:
    stem = Path(rel).stem
    tests = [f["project_relative_path"] for f in list_project_files_for_root(root) if f["is_test"]]
    related = [t for t in tests if stem in Path(t).stem]
    return (related or tests)[:5]


def list_project_files_for_root(root: Path) -> List[Dict[str, Any]]:
    from departments import IGNORED_PROJECT_DIRS
    files = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if not path.is_file() or any(p in IGNORED_PROJECT_DIRS or p.startswith(".") for p in rel.parts):
            continue
        name = path.name
        import project_runner
        files.append({"project_relative_path": str(rel), "is_test": project_runner.is_test_file(str(rel))})
    return files


def verify_fix(item_id: str, user, fixed_code: str) -> Dict[str, Any]:
    """Validate a candidate fix without touching the project:
    1. existing compiler/static validation in a temp dir (validate_code_fix)
    2. run related project tests against a temporary copy of the project with the candidate applied."""
    from fix_validator import validate_code_fix
    from departments import run_file_in_root
    item = workflow.load(item_id)
    _require_developer(item, user)
    if not fixed_code or not fixed_code.strip():
        raise HTTPException(400, "Provide the complete candidate replacement file.")
    root, target, rel, original = item_source(item)
    validation = validate_code_fix(rel, original, fixed_code, target_issues=item.get("issues"), project_root=str(root))
    sandbox: Dict[str, Any] = {"executed": False, "results": [], "note": ""}
    if validation.get("is_valid"):
        try:
            with tempfile.TemporaryDirectory(prefix="mindora_verify_") as tmp:
                copy_root = Path(tmp)
                _sandbox_copy(root, copy_root)
                (copy_root / rel).parent.mkdir(parents=True, exist_ok=True)
                (copy_root / rel).write_text(fixed_code, encoding="utf-8")
                for test_rel in _related_tests(copy_root, rel):
                    run = run_file_in_root(copy_root, copy_root / test_rel, test_rel)
                    sandbox["results"].append({k: run.get(k) for k in ("file_path", "status", "passed", "exit_code",
                                                                       "duration_ms", "error_summary")}
                                              | {"output": (run.get("stdout", "") + "\n" + run.get("stderr", ""))[-3000:]})
                sandbox["executed"] = bool(sandbox["results"])
                sandbox["note"] = "" if sandbox["results"] else "No test files found; only static validation was performed."
        except OverflowError as exc:
            sandbox["note"] = str(exc)
    else:
        sandbox["note"] = "Static validation failed; sandbox tests were not executed."
    tests_ok = all(r["passed"] for r in sandbox["results"]) if sandbox["results"] else True
    verdict = "VERIFIED" if validation.get("is_valid") and tests_ok else "FAILED"
    result = {"status": verdict, "validation": validation, "sandbox_tests": sandbox, "file": rel,
              "verified_at": workflow.now()}
    workflow.annotate(item_id, user, "last_fix_verification",
                      {"status": verdict, "reason": validation.get("reason"), "tests": len(sandbox["results"]),
                       "verified_at": result["verified_at"]},
                      "FIX_VERIFIED_SANDBOX", f"{verdict}: {validation.get('reason', '')}"[:300])
    return result


# ── AI code review ───────────────────────────────────────────────────────────

def _review_pair(item: Dict[str, Any], candidate: Optional[str]):
    """(original, fixed) code for review: a candidate vs current source, or the applied fix vs its backup."""
    root, target, rel, current = item_source(item)
    if candidate:
        return rel, current, candidate, str(root)
    applied = [a for a in item.get("fix_history", []) if a.get("applied")]
    if not applied:
        raise HTTPException(409, "No applied fix to review yet; provide candidate code instead.")
    last = applied[-1]
    original = ""
    if last.get("backup_path") and Path(last["backup_path"]).is_file():
        original = Path(last["backup_path"]).read_text(encoding="utf-8", errors="replace")
    return rel, original, item.get("fixed_code") or current, str(root)


def code_review(item_id: str, user, candidate: Optional[str] = None) -> Dict[str, Any]:
    from fix_validator import validate_code_fix, compute_unified_diff
    from rag_pipeline import retrieve_relevant_memories, format_rag_prompt_context
    item = workflow.load(item_id)
    rel, original, fixed, root = _review_pair(item, candidate)
    diff = compute_unified_diff(original, fixed, Path(rel).name)
    validation = validate_code_fix(rel, original, fixed, target_issues=item.get("issues"), project_root=root) \
        if original != fixed else {"is_valid": False, "reason": "No change between original and fixed code.",
                                   "remaining_issues": [], "new_issues": [], "compiler_errors": ""}
    memories = retrieve_relevant_memories(query_text=f"{item.get('title', '')}\n{diff[:1500]}", top_k=3, min_similarity=0.4)
    review = _llm_review(item, rel, diff, fixed, validation, format_rag_prompt_context(memories)) if _openai_key() else None
    if review is None:
        review = _local_review(diff, validation)
    review.update(diff=diff, file=rel, static_validation={k: validation.get(k) for k in
                  ("is_valid", "reason", "compiler_errors")} | {"remaining_issues": validation.get("remaining_issues", [])[:20]},
                  rag_memories=memories, reviewed_by=user[0], reviewed_at=workflow.now(),
                  scope="candidate" if candidate else "applied_fix")
    workflow.annotate(item_id, user, "ai_code_review", review, "AI_CODE_REVIEW",
                      f"{review.get('verdict')} score={review.get('score')}")
    return review


def _local_review(diff: str, validation: Dict[str, Any]) -> Dict[str, Any]:
    added = [l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
    removed = [l for l in diff.splitlines() if l.startswith("-") and not l.startswith("---")]
    findings = []
    for issue in validation.get("remaining_issues", [])[:10]:
        findings.append({"severity": issue.get("severity", "MEDIUM"), "line": issue.get("line"),
                         "issue": f"[{issue.get('rule', '')}] {issue.get('message', '')}",
                         "recommendation": issue.get("suggested_fix") or "Address before approval."})
    risky = [l for l in added if any(tok in l for tok in ("eval(", "exec(", "except:", "pass  #", "TODO", "print("))]
    for line in risky[:5]:
        findings.append({"severity": "LOW", "line": None, "issue": f"Review added line: {line[1:].strip()[:120]}",
                         "recommendation": "Confirm this is intentional."})
    blocking = any(str(f["severity"]).upper() in ("CRITICAL", "HIGH") for f in findings)
    ok = bool(validation.get("is_valid")) and not blocking
    score = max(0, 100 - 25 * sum(str(f["severity"]).upper() in ("CRITICAL", "HIGH") for f in findings)
                - 5 * sum(str(f["severity"]).upper() in ("MEDIUM", "LOW") for f in findings) - (0 if validation.get("is_valid") else 40))
    return {"verdict": "APPROVE" if ok else "REQUEST_CHANGES", "score": score,
            "summary": f"Local deterministic review: +{len(added)}/-{len(removed)} lines. {validation.get('reason', '')}",
            "findings": findings, "risks": [] if ok else ["Static validation or high-severity findings require changes."],
            "test_recommendations": ["Re-run the project's regression suite against this fix.",
                                     "Add a test reproducing the original failure."],
            "provider": "local"}


def _llm_review(item, rel, diff, fixed, validation, rag_context) -> Optional[Dict[str, Any]]:
    import openai
    from departments import OPENAI_MODEL
    prompt = f"""You are Mindora's senior code reviewer. Review this bug fix for correctness, regressions,
security, edge cases and maintainability. Be specific and concise.

{_bug_context(item)}

FILE: {rel}
UNIFIED DIFF:
{diff[:12000]}

STATIC VALIDATION: {json.dumps({k: validation.get(k) for k in ("is_valid", "reason", "compiler_errors")})}
{rag_context}

Respond strictly as JSON:
{{"verdict": "APPROVE|REQUEST_CHANGES", "score": 0-100, "summary": "string",
  "findings": [{{"severity": "CRITICAL|HIGH|MEDIUM|LOW", "line": null, "issue": "string", "recommendation": "string"}}],
  "risks": ["string"], "test_recommendations": ["string"]}}"""
    try:
        resp = openai.OpenAI(api_key=_openai_key()).chat.completions.create(
            model=OPENAI_MODEL, messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}, temperature=0.1)
        data = json.loads(resp.choices[0].message.content or "{}")
        if not validation.get("is_valid"):
            data["verdict"] = "REQUEST_CHANGES"  # AI may not override failed deterministic validation.
        data["provider"] = "openai"
        return data
    except Exception as exc:
        print(f"[AI Code Review] provider error: {exc}")
        return None


# ── AI regression test generation ───────────────────────────────────────────

def _normalize_steps(steps) -> List[Dict[str, Any]]:
    raw = steps if isinstance(steps, list) else [s for s in str(steps or "").splitlines() if s.strip()]
    out = []
    for index, step in enumerate(raw, 1):
        if isinstance(step, dict):
            out.append({"step_number": index, "action": str(step.get("action") or step.get("step") or step.get("description") or ""),
                        "expected": str(step.get("expected") or step.get("expected_result") or "")})
        else:
            out.append({"step_number": index, "action": str(step), "expected": ""})
    return out


def generate_tests(item_id: str, user, save: bool = True) -> Dict[str, Any]:
    """Generate regression test cases from the bug + fix context (RAG-augmented) and
    optionally save them to the project's 'AI Regression Suite' plan."""
    from departments import generate_ai_test_cases, list_project_files
    from rag_pipeline import retrieve_relevant_memories, format_rag_prompt_context
    from fix_validator import compute_unified_diff
    item = workflow.load(item_id)
    source, rel = "", item.get("target_file", "")
    try:
        _, _, rel, source = item_source(item)
    except HTTPException:
        pass
    diff = ""
    applied = [a for a in item.get("fix_history", []) if a.get("applied")]
    if applied and applied[-1].get("backup_path") and Path(applied[-1]["backup_path"]).is_file():
        diff = compute_unified_diff(Path(applied[-1]["backup_path"]).read_text(encoding="utf-8", errors="replace"),
                                    source, Path(rel).name)
    memories = retrieve_relevant_memories(query_text=f"{item.get('title', '')} {item.get('description', '')}", top_k=3,
                                          min_similarity=0.4)
    requirements = "\n\n".join(filter(None, [
        "Generate regression test cases that prove this bug is fixed and stays fixed, including negative and boundary cases.",
        _bug_context(item),
        f"Fix summary: {item.get('fix_summary', '')}" if item.get("fix_summary") else "",
        f"Fix diff:\n{diff[:6000]}" if diff else "",
        f"Source ({rel}):\n{source[:6000]}" if source else "",
        format_rag_prompt_context(memories),
    ]))
    if _openai_key():
        generated = generate_ai_test_cases(requirements=requirements, project_id=item["project_id"],
                                           test_type="REGRESSION", created_by=user[0])
    else:
        generated = _local_tests(item, rel)
    stem = Path(rel).stem if rel else ""
    test_file = next((f["project_relative_path"] for f in list_project_files(item["project_id"])
                      if f.get("is_test") and stem and stem in Path(f["project_relative_path"]).stem), "")
    cases = []
    for case in generated:
        cases.append({"title": str(case.get("title") or "Regression check")[:200],
                      "type": str(case.get("type") or "REGRESSION").upper(),
                      "priority": str(case.get("priority") or "HIGH").upper(),
                      "preconditions": case.get("preconditions") or [],
                      "steps": _normalize_steps(case.get("steps")),
                      "expected_result": str(case.get("expected_result") or ""),
                      "target_file": "", "linked_item_id": item["id"]})
    if test_file and cases:
        cases[0]["target_file"] = test_file  # One automated case executes the related test file.
    saved = []
    if save and cases:
        db = workflow.database()
        plan_id = workflow.regression_plan(item["project_id"], user)
        for case in cases:
            doc = {**case, "id": f"tc_{uuid.uuid4().hex[:10]}", "project_id": item["project_id"], "test_plan_id": plan_id,
                   "suite": "regression", "tags": ["ai-generated", item["id"]], "description": f"AI regression case for {item['id']}",
                   "created_by": user[0], "assigned_to": item.get("assigned_tester") or "", "created_at": workflow.now(),
                   "updated_at": workflow.now(), "is_archived": False}
            db.test_cases.insert_one(dict(doc))
            saved.append(doc)
    workflow.annotate(item_id, user, "ai_generated_tests", [c["id"] for c in saved] if saved else [c["title"] for c in cases],
                      "AI_TESTS_GENERATED", f"{len(cases)} cases generated, {len(saved)} saved")
    return {"test_cases": saved or cases, "count": len(cases), "saved": bool(saved),
            "provider": "openai" if _openai_key() else "local", "rag_memories": memories}


def _local_tests(item: Dict[str, Any], rel: str) -> List[Dict[str, Any]]:
    """Deterministic bug-specific cases when no AI provider is configured."""
    title = item.get("title", "the reported defect")
    steps = [s for s in str(item.get("steps_to_reproduce") or "").splitlines() if s.strip()] or [f"Reproduce: {title}"]
    return [
        {"title": f"Regression: {title[:120]} no longer reproduces", "type": "REGRESSION", "priority": "HIGH",
         "preconditions": [f"Fix revision {item.get('fix_revision', 0)} applied"],
         "steps": steps, "expected_result": "The original failure does not occur; no unhandled exception."},
        {"title": f"Negative/boundary inputs around {Path(rel).name or 'the fixed code'}", "type": "NEGATIVE",
         "priority": "HIGH", "preconditions": ["Fix applied"],
         "steps": ["Provide empty, zero, null and maximum-size inputs to the fixed routine", "Observe the handling"],
         "expected_result": "Invalid input is rejected with a clear error; valid input behaves as before."},
        {"title": f"Unchanged behaviour of {Path(rel).name or 'module'} for valid inputs", "type": "REGRESSION",
         "priority": "MEDIUM", "preconditions": ["Fix applied"],
         "steps": ["Execute the primary success scenario", "Compare output to the pre-fix baseline"],
         "expected_result": "Outputs for valid inputs are unchanged."},
    ]
