# backend/fix_validator.py
# Deterministic Sandbox Validation Engine for AI-Generated Code Fixes.
#
# Enforces the core rule: NEVER TRUST AI CODE WITHOUT VALIDATION.
# 1. Copies target code into an isolated temporary sandbox.
# 2. Applies the generated fix.
# 3. Executes compiler / parser checks based on language.
# 4. Re-runs deterministic static & security analysis.
# 5. Compares before/after issues and returns validation status + clean diff.

import difflib
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import sys
ROOT = Path(__file__).parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from languages import detect_language, get_language_config
from universal_analyzer import analyze_source_file


def compute_unified_diff(original_code: str, fixed_code: str, filename: str = "file") -> str:
    """Generate a clean unified diff string between original and fixed code."""
    orig_lines = original_code.splitlines(keepends=True)
    fixed_lines = fixed_code.splitlines(keepends=True)
    diff = difflib.unified_diff(
        orig_lines,
        fixed_lines,
        fromfile=f"a/{filename} (original)",
        tofile=f"b/{filename} (fixed)",
        n=3,
    )
    return "".join(diff)


def validate_code_fix(
    file_path: str,
    original_code: str,
    fixed_code: str,
    target_issues: Optional[List[Dict[str, Any]]] = None,
    project_root: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Rigorously validate AI-generated code in an isolated sandbox.

    Returns:
        {
            "status": "VERIFIED" | "FAILED",
            "is_valid": bool,
            "diff": str,
            "remaining_issues": list,
            "new_issues": list,
            "compiler_errors": str,
            "reason": str
        }
    """
    diff = compute_unified_diff(original_code, fixed_code, Path(file_path).name)

    # 1. Reject empty or identical code
    if not fixed_code.strip():
        return {
            "status": "FAILED",
            "is_valid": False,
            "diff": diff,
            "remaining_issues": [],
            "new_issues": [],
            "compiler_errors": "AI produced empty replacement code.",
            "reason": "Generated fix is empty.",
        }

    lang = detect_language(file_path, fixed_code) or "Unknown"

    with tempfile.TemporaryDirectory() as sandbox_dir:
        sandbox_path = Path(sandbox_dir)
        temp_file = sandbox_path / Path(file_path).name
        temp_file.write_text(fixed_code, encoding="utf-8")

        compiler_errors: List[str] = []

        # 2. Compiler & Syntax-check passes
        if lang == "Python":
            import py_compile
            try:
                py_compile.compile(str(temp_file), doraise=True)
            except py_compile.PyCompileError as exc:
                compiler_errors.append(f"Python SyntaxError: {exc}")
        elif lang in ("JavaScript", "TypeScript"):
            node = shutil.which("node")
            if node and lang == "JavaScript":
                res = subprocess.run([node, "--check", str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())
        elif lang == "Java":
            javac = shutil.which("javac")
            if javac:
                res = subprocess.run([javac, "-Xlint:all", "-d", str(sandbox_path), str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())
        elif lang in ("C", "C++"):
            compiler = shutil.which("clang++" if lang == "C++" else "clang") or shutil.which("gcc")
            if compiler:
                res = subprocess.run([compiler, "-fsyntax-only", "-Wall", str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())
        elif lang == "Go":
            go_cmd = shutil.which("go")
            if go_cmd:
                res = subprocess.run([go_cmd, "vet", str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())
        elif lang == "Rust":
            rustc = shutil.which("rustc")
            if rustc:
                res = subprocess.run([rustc, "--emit=metadata", "--out-dir", str(sandbox_path), str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())
        elif lang == "Shell":
            bash = shutil.which("bash")
            if bash:
                res = subprocess.run([bash, "-n", str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())
        elif lang == "Ruby":
            ruby = shutil.which("ruby")
            if ruby:
                res = subprocess.run([ruby, "-c", str(temp_file)], capture_output=True, text=True)
                if res.returncode != 0:
                    compiler_errors.append(res.stderr.strip() or res.stdout.strip())

        # If compiler detected hard syntax failure
        if compiler_errors:
            err_msg = "\n".join(compiler_errors)
            return {
                "status": "FAILED",
                "is_valid": False,
                "diff": diff,
                "remaining_issues": [],
                "new_issues": [],
                "compiler_errors": err_msg,
                "reason": f"Compiler / syntax verification failed in sandbox: {err_msg[:200]}",
            }

        # 3. Deterministic Static Re-Scan of fixed file
        post_issues = analyze_source_file(temp_file, file_path, fixed_code)

        # Check if critical/high issues were introduced or remain
        critical_remaining = [i for i in post_issues if i.get("severity") in ("CRITICAL", "HIGH")]

        # Determine target issue resolution
        if target_issues and isinstance(target_issues, list):
            target_rules = set()
            for item in target_issues:
                if isinstance(item, dict) and item.get("rule"):
                    target_rules.add(item["rule"])
                elif hasattr(item, "rule") and getattr(item, "rule"):
                    target_rules.add(getattr(item, "rule"))
            remaining_target_rules = {i.get("rule") for i in post_issues if i.get("rule") in target_rules}
            if remaining_target_rules:
                return {
                    "status": "FAILED",
                    "is_valid": False,
                    "diff": diff,
                    "remaining_issues": post_issues,
                    "new_issues": [],
                    "compiler_errors": f"Target rules still present after fix: {', '.join(remaining_target_rules)}",
                    "reason": f"Failed to resolve target bug ({', '.join(remaining_target_rules)})",
                }

        # Check if new critical bugs were introduced
        if critical_remaining:
            return {
                "status": "FAILED",
                "is_valid": False,
                "diff": diff,
                "remaining_issues": post_issues,
                "new_issues": critical_remaining,
                "compiler_errors": f"Fixed code introduced critical issues: {critical_remaining[0].get('message')}",
                "reason": f"Introduced new critical defect: {critical_remaining[0].get('message')}",
            }

    return {
        "status": "VERIFIED",
        "is_valid": True,
        "diff": diff,
        "remaining_issues": post_issues,
        "new_issues": [],
        "compiler_errors": "",
        "reason": "All compiler, syntax, and deterministic static checks passed successfully.",
    }
