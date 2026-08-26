# src/test_runner.py
# Runs pytest on a given directory or file and captures the output.

import subprocess
import sys
from pathlib import Path


def run_tests(test_path: str, working_dir: str | None = None) -> dict:
    """Run pytest on test_path and return a structured result dict.

    Args:
        test_path:   Path to a test file or directory.
        working_dir: Working directory for pytest (defaults to test_path's parent).

    Returns:
        A dict with keys:
            passed  (int)   – number of tests that passed
            failed  (int)   – number of tests that failed
            errors  (int)   – number of test errors
            output  (str)   – raw pytest stdout/stderr
            success (bool)  – True if all tests passed (exit code 0)
    """
    cwd = working_dir or str(Path(test_path).parent)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", test_path, "-v", "--tb=short", "--no-header"],
        capture_output=True,
        text=True,
        cwd=cwd,
    )

    output = result.stdout + result.stderr
    return {
        "passed":  _count(output, "passed"),
        "failed":  _count(output, "failed"),
        "errors":  _count(output, "error"),
        "output":  output,
        "success": result.returncode == 0,
    }


def _count(text: str, keyword: str) -> int:
    """Extract a count like '3 passed' or '1 failed' from pytest summary."""
    import re
    match = re.search(rf"(\d+)\s+{keyword}", text)
    return int(match.group(1)) if match else 0
