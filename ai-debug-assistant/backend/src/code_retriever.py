# src/code_retriever.py
# Retrieves the relevant source function/code context from a source folder,
# given a parsed traceback (file name + line number + function name).

import ast
import textwrap
from pathlib import Path


# ── Public API ─────────────────────────────────────────────────────────────────

def retrieve_code(source_folder: str, parsed: dict) -> dict:
    """Find the source file and extract the relevant function context.

    Args:
        source_folder: Root directory to search for source files.
        parsed: Dict from log_parser.parse_log() with keys:
                file, line, function, error_type, message.

    Returns:
        A dict with keys:
            found        (bool)   – whether the file was located
            file_path    (str)    – absolute path of the located file (or "")
            function_src (str)    – source of the enclosing function (or "")
            context_src  (str)    – ±10 lines around the crash line (or "")
            all_src      (str)    – full file contents (or "")
    """
    target_name = parsed["file"]
    target_line = parsed["line"]
    target_func = parsed["function"]

    # Walk the source tree looking for a file whose name matches.
    matches = list(Path(source_folder).rglob(target_name))
    if not matches:
        return _not_found()

    # Prefer exact basename match; take the first hit if multiple.
    file_path = matches[0]
    source_text = file_path.read_text(encoding="utf-8")

    return {
        "found":        True,
        "file_path":    str(file_path),
        "function_src": _extract_function(source_text, target_func),
        "context_src":  _extract_context(source_text, target_line, window=10),
        "all_src":      source_text,
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

def _not_found() -> dict:
    return {
        "found":        False,
        "file_path":    "",
        "function_src": "",
        "context_src":  "",
        "all_src":      "",
    }


def _extract_function(source: str, func_name: str) -> str:
    """Use AST to extract the source of the named function/method."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return ""

    lines = source.splitlines()

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == func_name:
                # end_lineno available in Python 3.8+
                start = node.lineno - 1
                end = getattr(node, "end_lineno", None) or (start + 30)
                snippet = "\n".join(lines[start:end])
                return textwrap.dedent(snippet)

    return ""


def _extract_context(source: str, crash_line: int, window: int = 10) -> str:
    """Return the lines surrounding crash_line (1-indexed), with line numbers."""
    lines = source.splitlines()
    start = max(0, crash_line - window - 1)
    end   = min(len(lines), crash_line + window)
    numbered = []
    for i, line in enumerate(lines[start:end], start=start + 1):
        marker = ">>>" if i == crash_line else "   "
        numbered.append(f"{marker} {i:4d}: {line}")
    return "\n".join(numbered)
