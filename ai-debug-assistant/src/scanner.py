# src/scanner.py
# Universal Multi-Language Scanner Engine.
#
# Recursively indexes all source files matching supported languages,
# invokes deterministic language analyzers, and outputs standardized Universal Bugs.

import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Set, Tuple

SRC_DIR = str(Path(__file__).resolve().parent)
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from languages import detect_language, get_supported_extensions, LANGUAGES
from universal_analyzer import analyze_source_file, create_bug


# Default directories to ignore during project scanning
DEFAULT_EXCLUDED_DIRS: Set[str] = {
    "__pycache__", ".git", ".svn", ".hg",
    "node_modules", ".next", ".venv", "venv", ".tox",
    ".mypy_cache", ".pytest_cache", "dist", "build",
    "target", ".idea", ".vscode", "bin", "obj",
}


def scan_directory(root: str, include_all_dirs: bool = False) -> List[Dict[str, Any]]:
    """
    Recursively scan all supported source code files under `root` across all
    supported programming languages.

    Returns:
        List of Universal Bug dicts, sorted by (file, line).
    """
    root_path = Path(root).resolve()
    all_issues: List[Dict[str, Any]] = []
    supported_exts = get_supported_extensions()

    if not root_path.exists() or not root_path.is_dir():
        return []

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Filter out heavy build and virtualenv directories
        if not include_all_dirs:
            dirnames[:] = [d for d in dirnames if d not in DEFAULT_EXCLUDED_DIRS]

        for fname in filenames:
            ext = Path(fname).suffix.lower()
            if ext not in supported_exts:
                continue

            full_path = Path(dirpath) / fname
            try:
                rel_path = str(full_path.relative_to(root_path))
            except ValueError:
                rel_path = str(full_path)

            try:
                source_code = full_path.read_text(encoding="utf-8", errors="replace")
            except Exception as exc:
                all_issues.append(create_bug(
                    language="Unknown",
                    file_path=rel_path,
                    line=1,
                    column=None,
                    severity="HIGH",
                    category="RUNTIME",
                    rule="ReadError",
                    message=f"Could not read source file: {exc}",
                    code="",
                    root_cause="File read permission error or encoding corruption.",
                    suggested_fix="Check file permissions.",
                    confidence=1.0,
                ))
                continue

            file_issues = analyze_source_file(full_path, rel_path, source_code)
            all_issues.extend(file_issues)

    # Sort issues by file path, then line number (None placed at end)
    all_issues.sort(key=lambda x: (x.get("file", ""), x.get("line") or 9999999))
    return all_issues


def get_project_files_summary(root: str) -> Dict[str, Any]:
    """
    Retrieve statistics on project files: total files scanned,
    languages breakdown, and total lines of code.
    """
    root_path = Path(root).resolve()
    supported_exts = get_supported_extensions()
    lang_file_counts: Dict[str, int] = {}
    total_files = 0
    total_lines = 0

    if root_path.exists() and root_path.is_dir():
        for dirpath, dirnames, filenames in os.walk(root_path):
            dirnames[:] = [d for d in dirnames if d not in DEFAULT_EXCLUDED_DIRS]
            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext in supported_exts:
                    full_path = Path(dirpath) / fname
                    try:
                        source = full_path.read_text(encoding="utf-8", errors="replace")
                        lang = detect_language(str(full_path), source)
                    except Exception:
                        lang = None
                    if lang:
                        lang_file_counts[lang] = lang_file_counts.get(lang, 0) + 1
                        total_files += 1
                        try:
                            total_lines += len(source.splitlines())
                        except Exception:
                            pass

    return {
        "total_files": total_files,
        "total_lines": total_lines,
        "languages": lang_file_counts,
    }
