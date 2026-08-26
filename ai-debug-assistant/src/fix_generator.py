# src/fix_generator.py
# Applies a suggested fix from Claude to the actual source file,
# creating a patched copy rather than modifying the original in-place.

import re
import ast
import textwrap
from pathlib import Path


# ── Public API ─────────────────────────────────────────────────────────────────

def extract_fixed_code(diagnosis: dict) -> str:
    """Pull the first Python code block from Claude's FIX section.

    Returns the raw code string, or "" if no code block was found.
    """
    fix_section = diagnosis.get("fix", "")
    # Look for ```python ... ``` or ``` ... ```
    match = re.search(r"```(?:python)?\s*\n(.*?)```", fix_section, re.DOTALL)
    if match:
        return textwrap.dedent(match.group(1)).strip()
    # Fallback: if no code fences, return the raw section
    stripped = fix_section.strip()
    return stripped if stripped else ""


def apply_fix(original_file: str, fixed_function_src: str, function_name: str) -> str:
    """Replace the named function in the original file with the fixed version.

    Args:
        original_file:      Path to the source file to patch.
        fixed_function_src: The corrected function source code.
        function_name:      Name of the function to replace.

    Returns:
        The patched file content as a string.

    Raises:
        ValueError: if the function cannot be found in the file.
    """
    original_src = Path(original_file).read_text(encoding="utf-8")
    return _replace_function(original_src, function_name, fixed_function_src)


def write_patched_file(original_file: str, patched_content: str) -> str:
    """Write the patched content next to the original with a .fixed suffix.

    Returns the path to the new file.
    """
    p = Path(original_file)
    out = p.with_name(p.stem + ".fixed" + p.suffix)
    out.write_text(patched_content, encoding="utf-8")
    return str(out)


# ── Internal helpers ───────────────────────────────────────────────────────────

def _replace_function(source: str, func_name: str, new_func_src: str) -> str:
    """Replace a named function in source with new_func_src using AST offsets."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        raise ValueError("Original source has a syntax error; cannot apply fix.")

    lines = source.splitlines(keepends=True)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == func_name:
                start = node.lineno - 1          # 0-indexed
                end   = getattr(node, "end_lineno", None)
                if end is None:
                    raise ValueError("Python 3.8+ required for end_lineno.")

                # Preserve leading indentation of the original definition.
                original_indent = len(lines[start]) - len(lines[start].lstrip())
                indent_str = " " * original_indent

                # Re-indent the replacement code.
                dedented = textwrap.dedent(new_func_src)
                re_indented = textwrap.indent(dedented, indent_str)

                patched = lines[:start] + [re_indented + "\n"] + lines[end:]
                return "".join(patched)

    raise ValueError(
        f"Function '{func_name}' not found in source; cannot apply fix."
    )
