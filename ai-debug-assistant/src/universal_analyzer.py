# src/universal_analyzer.py
# Universal Multi-Language Deterministic Code Analyzer & Bug Detector.

import os
import re
import ast
import sys
import json
import uuid
import shutil
import tempfile
import py_compile
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

SRC_DIR = str(Path(__file__).resolve().parent)
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from languages import detect_language, get_language_config, LanguageConfig


# ── Universal Bug Data Structure (Requirement 4) ─────────────────────────────

def create_bug(
    language: str,
    file_path: str,
    line: Optional[int],
    column: Optional[int],
    severity: str,   # "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    category: str,   # "SYNTAX" | "LOGIC" | "RUNTIME" | "SECURITY" | "PERFORMANCE" | "TYPE" | "QUALITY"
    rule: str,
    message: str,
    code: str = "",
    root_cause: str = "",
    suggested_fix: str = "",
    confidence: float = 1.0,
) -> Dict[str, Any]:
    """
    Construct a standardized Universal Bug representation.
    Maintains backward compatibility with the frontend by including
    lowercase severity and 'snippet'.
    """
    # Map high/critical/medium/low to frontend's expected error/warning/info
    sev_upper = severity.upper()
    frontend_sev = "error" if sev_upper in ("CRITICAL", "HIGH") else ("warning" if sev_upper == "MEDIUM" else "info")

    clean_code = code.strip() if code else ""
    bug_id = f"{language[:2].upper()}-{abs(hash((file_path, line, rule, message))) % 100000:05d}"

    return {
        "id": bug_id,
        "language": language,
        "file": file_path,
        "line": line,
        "column": column,
        "severity": sev_upper,            # Standardized: CRITICAL | HIGH | MEDIUM | LOW
        "category": category.upper(),      # Standardized: SYNTAX | LOGIC | RUNTIME | SECURITY | PERFORMANCE | TYPE | QUALITY
        "rule": rule,
        "message": message,
        "code": clean_code,
        "snippet": clean_code,             # Backward-compatibility alias for existing UI
        "root_cause": root_cause,
        "suggested_fix": suggested_fix,
        "confidence": confidence,
        # Helper for frontend styling
        "_legacy_severity": frontend_sev,
    }


# ── Helper for line extraction ───────────────────────────────────────────────

def _get_line_snippet(lines: List[str], line_no: Optional[int]) -> str:
    if line_no and 1 <= line_no <= len(lines):
        return lines[line_no - 1]
    return ""


# ── Base Analyzer Interface ──────────────────────────────────────────────────

class BaseAnalyzer:
    """Base interface for language-specific deterministic analyzers."""
    language_name = "Unknown"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        raise NotImplementedError


# ── 1. Python Analyzer (Preserving all 9 original detectors) ──────────────────

class PythonAnalyzer(BaseAnalyzer):
    language_name = "Python"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. Syntax Check via py_compile ---
        try:
            with tempfile.NamedTemporaryFile(suffix=".py", delete=False) as tmp:
                tmp.write(source_code.encode("utf-8"))
                tmp_name = tmp.name
            py_compile.compile(tmp_name, doraise=True)
            os.unlink(tmp_name)
        except py_compile.PyCompileError as e:
            msg = str(e)
            line = None
            for part in msg.split(","):
                part = part.strip()
                if part.startswith("line "):
                    try:
                        line = int(part.split()[1])
                    except (IndexError, ValueError):
                        pass
            snip = _get_line_snippet(lines, line)
            issues.append(create_bug(
                language="Python",
                file_path=rel_path,
                line=line,
                column=None,
                severity="CRITICAL",
                category="SYNTAX",
                rule="SyntaxError",
                message=msg,
                code=snip,
                root_cause="Code violates Python syntax grammar specifications.",
                suggested_fix="Correct the syntax discrepancy at the highlighted line.",
                confidence=1.0,
            ))
            return issues  # Cannot run AST checks on unparseable syntax
        except Exception:
            pass

        # --- 2. AST-based Checks ---
        try:
            tree = ast.parse(source_code, filename=str(path))
        except SyntaxError as exc:
            snip = _get_line_snippet(lines, exc.lineno)
            issues.append(create_bug(
                language="Python",
                file_path=rel_path,
                line=exc.lineno,
                column=exc.offset,
                severity="CRITICAL",
                category="SYNTAX",
                rule="SyntaxError",
                message=str(exc),
                code=snip,
                root_cause="SyntaxError during AST generation.",
                suggested_fix="Fix the invalid token or indentation.",
                confidence=1.0,
            ))
            return issues

        # Visitor for AST patterns
        class _PyASTVisitor(ast.NodeVisitor):
            def __init__(self, visitor_lines: List[str]):
                self.lines = visitor_lines
                self.found: List[Dict[str, Any]] = []

            def _snip(self, lineno: Optional[int]) -> str:
                return _get_line_snippet(self.lines, lineno)

            # Bare except
            def visit_ExceptHandler(self, node: ast.ExceptHandler):
                if node.type is None:
                    self.found.append(create_bug(
                        language="Python",
                        file_path=rel_path,
                        line=node.lineno,
                        column=node.col_offset,
                        severity="HIGH",
                        category="RUNTIME",
                        rule="BareExcept",
                        message="Bare `except:` catches all exceptions including SystemExit and KeyboardInterrupt. Use `except Exception:`.",
                        code=self._snip(node.lineno),
                        root_cause="Overly broad exception handling swallows program termination signals.",
                        suggested_fix="Change `except:` to `except Exception:` or specify the exact expected exception type.",
                        confidence=0.95,
                    ))
                self.generic_visit(node)

            # Function checks (mutable defaults, missing return, argument shadowing)
            def visit_FunctionDef(self, node: ast.FunctionDef):
                self._check_mutable_defaults(node)
                self._check_missing_return(node)
                self._check_arg_shadowing(node)
                self.generic_visit(node)

            visit_AsyncFunctionDef = visit_FunctionDef

            def _check_mutable_defaults(self, node):
                for default in node.args.defaults + node.args.kw_defaults:
                    if default is None:
                        continue
                    if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                        self.found.append(create_bug(
                            language="Python",
                            file_path=rel_path,
                            line=default.lineno,
                            column=default.col_offset,
                            severity="HIGH",
                            category="LOGIC",
                            rule="MutableDefault",
                            message=f"Mutable default argument `{ast.unparse(default)}` retains state across invocations.",
                            code=self._snip(default.lineno),
                            root_cause="Default parameter values in Python are evaluated once at function definition time, not at call time.",
                            suggested_fix=f"Use `None` as the default value and initialize with `{ast.unparse(default)}` inside the function body.",
                            confidence=0.98,
                        ))

            def _check_missing_return(self, node):
                has_return_val = False
                has_bare_return = False
                for n in ast.walk(node):
                    if isinstance(n, ast.Return):
                        if n.value is not None:
                            has_return_val = True
                        else:
                            has_bare_return = True
                ends_with_return = bool(node.body and isinstance(node.body[-1], ast.Return))
                if has_return_val and (has_bare_return or not ends_with_return):
                    self.found.append(create_bug(
                        language="Python",
                        file_path=rel_path,
                        line=node.lineno,
                        column=node.col_offset,
                        severity="MEDIUM",
                        category="LOGIC",
                        rule="MissingReturn",
                        message=f"Function `{node.name}` returns a value on some code paths but implicitly returns None or bare return on others.",
                        code=self._snip(node.lineno),
                        root_cause="Inconsistent return branches may lead callers to receive unanticipated `None` values.",
                        suggested_fix="Ensure all execution branches explicitly return a value of consistent type.",
                        confidence=0.88,
                    ))

            def _check_arg_shadowing(self, node):
                builtins_list = {"id", "type", "list", "dict", "set", "str", "int", "float", "bool", "len", "max", "min", "sum", "input", "print", "format", "dir", "file", "open"}
                for arg in node.args.args:
                    if arg.arg in builtins_list:
                        self.found.append(create_bug(
                            language="Python",
                            file_path=rel_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="LOW",
                            category="QUALITY",
                            rule="BuiltinShadow",
                            message=f"Function parameter `{arg.arg}` shadows Python built-in `{arg.arg}`.",
                            code=self._snip(node.lineno),
                            root_cause="Overriding built-in identifiers prevents access to standard library built-ins in the local scope.",
                            suggested_fix=f"Rename parameter `{arg.arg}` to something descriptive.",
                            confidence=0.9,
                        ))

            # None comparison (== None instead of is None)
            def visit_Compare(self, node: ast.Compare):
                for op, comparator in zip(node.ops, node.comparators):
                    if isinstance(op, (ast.Eq, ast.NotEq)):
                        if (isinstance(comparator, ast.Constant) and comparator.value is None) or \
                           (isinstance(node.left, ast.Constant) and node.left.value is None):
                            suggested = "is None" if isinstance(op, ast.Eq) else "is not None"
                            self.found.append(create_bug(
                                language="Python",
                                file_path=rel_path,
                                line=node.lineno,
                                column=node.col_offset,
                                severity="LOW",
                                category="QUALITY",
                                rule="NoneComparison",
                                message=f"Comparison with `None` should use `{suggested}` rather than `==` or `!=`.",
                                code=self._snip(node.lineno),
                                root_cause="`== None` invokes `__eq__` on the left operand which can be overridden or cause unexpected behavior.",
                                suggested_fix=f"Replace with identity check `{suggested}`.",
                                confidence=0.95,
                            ))
                self.generic_visit(node)

            # Builtin shadowing
            def visit_Assign(self, node: ast.Assign):
                builtins_list = {"id", "type", "list", "dict", "set", "str", "int", "float", "bool", "len", "max", "min", "sum", "input", "print", "format", "dir", "file", "open"}
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in builtins_list:
                        self.found.append(create_bug(
                            language="Python",
                            file_path=rel_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="LOW",
                            category="QUALITY",
                            rule="BuiltinShadow",
                            message=f"Local variable `{target.id}` shadows Python built-in `{target.id}`.",
                            code=self._snip(node.lineno),
                            root_cause="Overriding built-in identifiers prevents access to standard library built-ins in the local scope.",
                            suggested_fix=f"Rename variable `{target.id}` to something descriptive.",
                            confidence=0.9,
                        ))
                self.generic_visit(node)

            # Security & Resource checks
            def visit_Call(self, node: ast.Call):
                func_name = ""
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr

                if func_name in ("eval", "exec"):
                    self.found.append(create_bug(
                        language="Python",
                        file_path=rel_path,
                        line=node.lineno,
                        column=node.col_offset,
                        severity="CRITICAL",
                        category="SECURITY",
                        rule="DangerousEval",
                        message=f"Direct call to `{func_name}()` allows arbitrary code execution.",
                        code=self._snip(node.lineno),
                        root_cause="Dynamic code evaluation of untrusted strings creates remote code execution vulnerabilities.",
                        suggested_fix="Use safe alternatives like `ast.literal_eval` or structured serializers (json).",
                        confidence=0.99,
                    ))

                if func_name == "Popen":
                    for kw in node.keywords:
                        if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                            self.found.append(create_bug(
                                language="Python",
                                file_path=rel_path,
                                line=node.lineno,
                                column=node.col_offset,
                                severity="CRITICAL",
                                category="SECURITY",
                                rule="CommandInjection",
                                message="`subprocess.Popen(..., shell=True)` is vulnerable to command injection.",
                                code=self._snip(node.lineno),
                                root_cause="Invoking shell=True interprets arguments as raw shell commands.",
                                suggested_fix="Set `shell=False` and pass arguments as a list of strings.",
                                confidence=0.95,
                            ))
                self.generic_visit(node)

        visitor = _PyASTVisitor(lines)
        visitor.visit(tree)
        issues.extend(visitor.found)

        # Unused imports check
        issues.extend(self._check_unused_imports(tree, lines, rel_path))

        # TODO comments check
        issues.extend(self._check_todo_comments(lines, rel_path))

        return issues

    def _check_unused_imports(self, tree: ast.AST, lines: List[str], rel_path: str) -> List[Dict[str, Any]]:
        unused: List[Dict[str, Any]] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname or alias.name
                    other_lines = [l for i, l in enumerate(lines, 1) if i != node.lineno]
                    if not any(name in l for l in other_lines):
                        unused.append(create_bug(
                            language="Python",
                            file_path=rel_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="LOW",
                            category="QUALITY",
                            rule="UnusedImport",
                            message=f"`{name}` is imported but never used.",
                            code=_get_line_snippet(lines, node.lineno),
                            root_cause="Unused dependencies clutter namespace and increase startup overhead.",
                            suggested_fix=f"Remove unused import `{name}`.",
                            confidence=0.88,
                        ))
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    if alias.name == "*":
                        continue
                    name = alias.asname or alias.name
                    other_lines = [l for i, l in enumerate(lines, 1) if i != node.lineno]
                    if not any(name in l for l in other_lines):
                        unused.append(create_bug(
                            language="Python",
                            file_path=rel_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="LOW",
                            category="QUALITY",
                            rule="UnusedImport",
                            message=f"`{name}` is imported but never used.",
                            code=_get_line_snippet(lines, node.lineno),
                            root_cause="Unused dependencies clutter namespace.",
                            suggested_fix=f"Remove `{name}` from imports.",
                            confidence=0.88,
                        ))
        return unused

    def _check_todo_comments(self, lines: List[str], rel_path: str) -> List[Dict[str, Any]]:
        todos: List[Dict[str, Any]] = []
        pattern = re.compile(r"#\s*(TODO|FIXME|HACK|BUG|XXX)\b.*", re.IGNORECASE)
        for i, line in enumerate(lines, 1):
            m = pattern.search(line)
            if m:
                todos.append(create_bug(
                    language="Python",
                    file_path=rel_path,
                    line=i,
                    column=line.find("#"),
                    severity="LOW",
                    category="QUALITY",
                    rule="TodoComment",
                    message=f"Found unresolved task annotation: {m.group(0).strip()}",
                    code=line,
                    root_cause="Unfinished task or known hack left in codebase.",
                    suggested_fix="Address the underlying task or remove obsolete annotation.",
                    confidence=1.0,
                ))
        return todos


# ── 2. JavaScript / TypeScript Analyzer ──────────────────────────────────────

class JavaScriptTypeScriptAnalyzer(BaseAnalyzer):
    language_name = "JavaScript/TypeScript"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        is_ts = path.suffix.lower() in (".ts", ".tsx", ".mts", ".cts")
        lang_label = "TypeScript" if is_ts else "JavaScript"
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. Deterministic Syntax Check via Node.js ---
        node_path = shutil.which("node")
        if node_path and not is_ts:  # Node can directly check plain JS syntax
            try:
                res = subprocess.run(
                    [node_path, "--check", str(path)],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if res.returncode != 0:
                    err_output = res.stderr or res.stdout
                    # Parse error line
                    line_no = None
                    col_no = None
                    for l in err_output.splitlines():
                        m = re.search(r":(\d+)(?::(\d+))?", l)
                        if m and str(path) in l:
                            line_no = int(m.group(1))
                            if m.group(2):
                                col_no = int(m.group(2))
                            break
                    snip = _get_line_snippet(lines, line_no)
                    issues.append(create_bug(
                        language=lang_label,
                        file_path=rel_path,
                        line=line_no,
                        column=col_no,
                        severity="CRITICAL",
                        category="SYNTAX",
                        rule="SyntaxError",
                        message=err_output.splitlines()[0] if err_output.splitlines() else "JavaScript syntax error",
                        code=snip,
                        root_cause="File contains invalid JavaScript syntax that fails Node.js compilation.",
                        suggested_fix="Correct the syntax error.",
                        confidence=1.0,
                    ))
            except Exception:
                pass

        # --- 2. Deterministic Pattern Analysis (JS & TS) ---
        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()
            if trimmed.startswith("//") or trimmed.startswith("/*") or trimmed.startswith("*"):
                continue

            # Check 1: eval() / Function() injection
            if re.search(r"\beval\s*\(", line):
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("eval"),
                    severity="CRITICAL",
                    category="SECURITY",
                    rule="DangerousEval",
                    message="Direct use of `eval()` enables arbitrary code execution vulnerabilities.",
                    code=line,
                    root_cause="Executing strings as code allows injection attacks if input is untrusted.",
                    suggested_fix="Replace `eval()` with JSON.parse() or a safe calculation parser.",
                    confidence=0.98,
                ))

            # Check 2: Loose equality (== or != vs === or !==)
            if re.search(r"(?<![=!<>])==(?!=)", line) and "null" not in line and "undefined" not in line:
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("=="),
                    severity="MEDIUM",
                    category="TYPE",
                    rule="LooseEquality",
                    message="Use strict equality `===` instead of loose equality `==` to prevent unintended type coercion.",
                    code=line,
                    root_cause="JavaScript's loose equality performs complex implicit type conversions.",
                    suggested_fix="Replace `==` with `===`.",
                    confidence=0.90,
                ))

            # Check 3: innerHTML XSS injection
            if re.search(r"\.innerHTML\s*=", line):
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("innerHTML"),
                    severity="HIGH",
                    category="SECURITY",
                    rule="DOM_XSS_InnerHTML",
                    message="Direct assignment to `.innerHTML` exposes application to Cross-Site Scripting (XSS).",
                    code=line,
                    root_cause="Unsanitized string interpolation into DOM creates XSS vulnerabilities.",
                    suggested_fix="Use `.textContent` or a secure DOM sanitizer like DOMPurify.",
                    confidence=0.92,
                ))

            # Check 4: Unhandled Promise / missing await / floating promise
            if re.search(r"new Promise\s*\(", line) and "reject" not in line and "resolve" in line:
                if "catch" not in source_code and "try" not in source_code:
                    issues.append(create_bug(
                        language=lang_label,
                        file_path=rel_path,
                        line=idx,
                        column=line.find("Promise"),
                        severity="MEDIUM",
                        category="RUNTIME",
                        rule="UnhandledPromise",
                        message="Promise creation without explicit error rejection handling.",
                        code=line,
                        root_cause="Unhandled promise rejections can crash modern Node.js runtimes.",
                        suggested_fix="Provide `reject` callback and attach `.catch()` or `try/catch`.",
                        confidence=0.85,
                    ))

            # Check 5: Debugger or console.log left in code
            if re.search(r"\bdebugger\s*;", line):
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("debugger"),
                    severity="LOW",
                    category="QUALITY",
                    rule="DebuggerStatement",
                    message="`debugger;` statement left in source code.",
                    code=line,
                    root_cause="Halts execution if browser devtools are open in production.",
                    suggested_fix="Remove `debugger;` before deploying.",
                    confidence=1.0,
                ))

            # Check 6: TypeScript `any` overuse
            if is_ts and re.search(r":\s*any\b", line):
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("any"),
                    severity="LOW",
                    category="TYPE",
                    rule="NoExplicitAny",
                    message="Explicit `: any` defeats TypeScript type checking safety.",
                    code=line,
                    root_cause="Using `any` turns off compiler verification for that symbol.",
                    suggested_fix="Provide an exact interface, type, or `unknown`.",
                    confidence=0.85,
                ))

            # Check 7: Missing return or unreachable code after return
            if trimmed.startswith("return ") or trimmed == "return;":
                # check if next non-empty line in same block has code
                if idx < len(lines):
                    next_line = lines[idx].strip()
                    if next_line and not next_line.startswith("}") and not next_line.startswith("//"):
                        issues.append(create_bug(
                            language=lang_label,
                            file_path=rel_path,
                            line=idx + 1,
                            column=None,
                            severity="MEDIUM",
                            category="LOGIC",
                            rule="UnreachableCode",
                            message="Unreachable statement detected immediately following `return`.",
                            code=lines[idx],
                            root_cause="Statements following an unconditional return are never reached.",
                            suggested_fix="Remove or relocate the unreachable statement.",
                            confidence=0.90,
                        ))

        return issues


# ── 3. Java Analyzer ─────────────────────────────────────────────────────────

class JavaAnalyzer(BaseAnalyzer):
    language_name = "Java"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. Deterministic javac compiler check if available ---
        javac = shutil.which("javac")
        if javac:
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    res = subprocess.run(
                        [javac, "-Xlint:all", "-d", tmpdir, str(path)],
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )
                    if res.returncode != 0:
                        # Extract errors
                        for l in (res.stderr or "").splitlines():
                            m = re.search(r":(\d+):\s*error:\s*(.*)", l)
                            if m:
                                l_num = int(m.group(1))
                                msg = m.group(2)
                                issues.append(create_bug(
                                    language="Java",
                                    file_path=rel_path,
                                    line=l_num,
                                    column=None,
                                    severity="CRITICAL",
                                    category="SYNTAX",
                                    rule="JavaCompilerError",
                                    message=msg,
                                    code=_get_line_snippet(lines, l_num),
                                    root_cause="Source fails standard Java compilation (`javac`).",
                                    suggested_fix="Fix compiler error.",
                                    confidence=1.0,
                                ))
            except Exception:
                pass

        # --- 2. Deterministic Pattern Checks ---
        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()
            if trimmed.startswith("//") or trimmed.startswith("/*") or trimmed.startswith("*"):
                continue

            # Check 1: String comparison via == instead of .equals()
            if re.search(r'==\s*".*?"|"[^"]*?"\s*==', line):
                issues.append(create_bug(
                    language="Java",
                    file_path=rel_path,
                    line=idx,
                    column=line.find("=="),
                    severity="HIGH",
                    category="LOGIC",
                    rule="StringReferenceEquality",
                    message="Comparing Strings with `==` checks reference identity, not value equality. Use `.equals()`.",
                    code=line,
                    root_cause="Java `==` on objects compares memory addresses, which often evaluates to false for different String instances.",
                    suggested_fix="Replace `str1 == str2` with `str1.equals(str2)` or `Objects.equals(str1, str2)`.",
                    confidence=0.98,
                ))

            # Check 2: Unclosed I/O streams / Resource leaks
            if re.search(r'new\s+(FileInputStream|FileOutputStream|BufferedReader|FileReader|FileWriter)\b', line):
                if "try (" not in line and "try(" not in line and "try {" not in source_code:
                    issues.append(create_bug(
                        language="Java",
                        file_path=rel_path,
                        line=idx,
                        column=None,
                        severity="HIGH",
                        category="RESOURCE",
                        rule="ResourceLeak",
                        message="Potential resource leak: Stream/Reader opened without try-with-resources statement.",
                        code=line,
                        root_cause="Failing to close file descriptors exhausts operating system file handles.",
                        suggested_fix="Wrap stream instantiation in a `try (...) { ... }` block.",
                        confidence=0.88,
                    ))

            # Check 3: Empty catch block
            if re.search(r'catch\s*\(.*?\)\s*\{\s*\}', line):
                issues.append(create_bug(
                    language="Java",
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="HIGH",
                    category="RUNTIME",
                    rule="EmptyCatchBlock",
                    message="Empty `catch` block swallows exceptions silently.",
                    code=line,
                    root_cause="Suppressing exceptions conceals errors and leads to silent system failures.",
                    suggested_fix="Log the exception or rethrow it as a runtime exception.",
                    confidence=0.95,
                ))

        return issues


# ── 4. C / C++ Analyzer ──────────────────────────────────────────────────────

class C_CppAnalyzer(BaseAnalyzer):
    language_name = "C/C++"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        is_cpp = path.suffix.lower() in (".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx")
        lang_label = "C++" if is_cpp else "C"
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. Deterministic Compiler Check via clang or gcc ---
        compiler = shutil.which("clang++" if is_cpp else "clang") or shutil.which("g++" if is_cpp else "gcc")
        if compiler:
            try:
                res = subprocess.run(
                    [compiler, "-fsyntax-only", "-Wall", str(path)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if res.returncode != 0:
                    for l in (res.stderr or "").splitlines():
                        m = re.search(r":(\d+):(\d+):\s*error:\s*(.*)", l)
                        if m:
                            l_num = int(m.group(1))
                            c_num = int(m.group(2))
                            msg = m.group(3)
                            issues.append(create_bug(
                                language=lang_label,
                                file_path=rel_path,
                                line=l_num,
                                column=c_num,
                                severity="CRITICAL",
                                category="SYNTAX",
                                rule="CompilerSyntaxError",
                                message=msg,
                                code=_get_line_snippet(lines, l_num),
                                root_cause="Code fails compiler syntax verification.",
                                suggested_fix="Fix the compilation error.",
                                confidence=1.0,
                            ))
            except Exception:
                pass

        # --- 2. Deterministic Memory & Security Checks ---
        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()
            if trimmed.startswith("//") or trimmed.startswith("/*") or trimmed.startswith("*"):
                continue

            # Check 1: gets() buffer overflow
            if re.search(r"\bgets\s*\(", line):
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("gets"),
                    severity="CRITICAL",
                    category="SECURITY",
                    rule="DangerousFunction_Gets",
                    message="`gets()` function has no buffer boundary check and is inherently insecure.",
                    code=line,
                    root_cause="`gets()` cannot prevent buffer overflows and was removed in C11.",
                    suggested_fix="Replace with `fgets(buf, sizeof(buf), stdin)`.",
                    confidence=1.0,
                ))

            # Check 2: strcpy / strcat without bounds
            if re.search(r"\b(strcpy|strcat)\s*\(", line):
                func = re.search(r"\b(strcpy|strcat)\b", line).group(1)
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find(func),
                    severity="HIGH",
                    category="SECURITY",
                    rule=f"UnsafeStringFunction_{func}",
                    message=f"`{func}()` does not check destination buffer size and can cause memory corruption.",
                    code=line,
                    root_cause="Unbounded memory copy leads to buffer overflows.",
                    suggested_fix=f"Replace `{func}()` with `{func}s()` or `strncpy()` / `snprintf()`.",
                    confidence=0.92,
                ))

            # Check 3: Format string vulnerability
            if re.search(r"\bprintf\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\)", line):
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("printf"),
                    severity="CRITICAL",
                    category="SECURITY",
                    rule="FormatStringVulnerability",
                    message="Passing variable directly as format string to `printf()` allows arbitrary memory read/write.",
                    code=line,
                    root_cause="If variable contains format specifiers (%x, %n), attacker can read/overwrite stack values.",
                    suggested_fix='Use `printf("%s", variable)` instead.',
                    confidence=0.98,
                ))

            # Check 4: malloc without NULL check or free
            if "malloc(" in line and "if (" not in line and "free(" not in source_code:
                issues.append(create_bug(
                    language=lang_label,
                    file_path=rel_path,
                    line=idx,
                    column=line.find("malloc"),
                    severity="HIGH",
                    category="RUNTIME",
                    rule="MemoryLeak_MallocWithoutFree",
                    message="Memory allocated via `malloc()` is never released with `free()`.",
                    code=line,
                    root_cause="Unfreed dynamically allocated memory causes memory leaks.",
                    suggested_fix="Ensure `free(ptr)` is called on all termination paths.",
                    confidence=0.88,
                ))

        return issues


# ── 5. Go Analyzer ───────────────────────────────────────────────────────────

class GoAnalyzer(BaseAnalyzer):
    language_name = "Go"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. go vet / compile check if go is installed ---
        go_cmd = shutil.which("go")
        if go_cmd:
            try:
                res = subprocess.run(
                    [go_cmd, "vet", str(path)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if res.returncode != 0:
                    for l in (res.stderr or "").splitlines():
                        m = re.search(r":(\d+)(?::(\d+))?:\s*(.*)", l)
                        if m and str(path) in l:
                            l_num = int(m.group(1))
                            c_num = int(m.group(2)) if m.group(2) else None
                            msg = m.group(3)
                            issues.append(create_bug(
                                language="Go",
                                file_path=rel_path,
                                line=l_num,
                                column=c_num,
                                severity="HIGH",
                                category="LOGIC",
                                rule="GoVetIssue",
                                message=msg,
                                code=_get_line_snippet(lines, l_num),
                                root_cause="`go vet` detected static hazard or standard library violation.",
                                suggested_fix="Address the compiler diagnostic.",
                                confidence=0.95,
                            ))
            except Exception:
                pass

        # --- 2. Deterministic Go Patterns ---
        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()
            if trimmed.startswith("//") or trimmed.startswith("/*"):
                continue

            # Check 1: Ignored error return (`val, _ :=`)
            if re.search(r',\s*_\s*:?=\s*[a-zA-Z0-9_\.]+\(', line):
                issues.append(create_bug(
                    language="Go",
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="HIGH",
                    category="LOGIC",
                    rule="IgnoredErrorReturn",
                    message="Error returned from function is discarded using blank identifier `_`.",
                    code=line,
                    root_cause="Ignoring errors in Go leads to nil pointer dereferences and undefined states.",
                    suggested_fix="Capture the error: `val, err := ...` and check `if err != nil { return err }`.",
                    confidence=0.90,
                ))

            # Check 2: HTTP response body close missing
            if "http.Get(" in line or "http.Post(" in line:
                if "defer" not in source_code or "Body.Close()" not in source_code:
                    issues.append(create_bug(
                        language="Go",
                        file_path=rel_path,
                        line=idx,
                        column=None,
                        severity="HIGH",
                        category="RESOURCE",
                        rule="UnclosedHttpBody",
                        message="HTTP response body is not closed via `defer resp.Body.Close()`.",
                        code=line,
                        root_cause="Failing to close response body exhausts TCP socket connections.",
                        suggested_fix="Add `defer resp.Body.Close()` immediately after checking `err == nil`.",
                        confidence=0.95,
                    ))

            # Check 3: Goroutine loop variable capture
            if "go func(" in line and "for " in source_code:
                issues.append(create_bug(
                    language="Go",
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="MEDIUM",
                    category="CONCURRENCY",
                    rule="GoroutineLoopCapture",
                    message="Goroutine invoked in loop may capture loop iteration variable by reference.",
                    code=line,
                    root_cause="Goroutines execute asynchronously and may read the variable after it has advanced to the final iteration.",
                    suggested_fix="Pass the loop variable as an explicit argument to the goroutine function.",
                    confidence=0.85,
                ))

        return issues


# ── 6. Rust Analyzer ─────────────────────────────────────────────────────────

class RustAnalyzer(BaseAnalyzer):
    language_name = "Rust"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. rustc compiler check if available ---
        rustc = shutil.which("rustc")
        if rustc:
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    res = subprocess.run(
                        [rustc, "--emit=metadata", "--out-dir", tmpdir, str(path)],
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )
                    if res.returncode != 0:
                        for l in (res.stderr or "").splitlines():
                            m = re.search(r"-->\s*.*?:(\d+):(\d+)", l)
                            if m:
                                l_num = int(m.group(1))
                                c_num = int(m.group(2))
                                issues.append(create_bug(
                                    language="Rust",
                                    file_path=rel_path,
                                    line=l_num,
                                    column=c_num,
                                    severity="CRITICAL",
                                    category="SYNTAX",
                                    rule="RustcCompileError",
                                    message="Rust compiler error: borrow checker or type system violation.",
                                    code=_get_line_snippet(lines, l_num),
                                    root_cause="Fails `rustc` compiler check.",
                                    suggested_fix="Fix compiler error.",
                                    confidence=1.0,
                                ))
            except Exception:
                pass

        # --- 2. Deterministic Rust Patterns ---
        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()
            if trimmed.startswith("//") or trimmed.startswith("/*"):
                continue

            # Check 1: Direct .unwrap() in production code
            if ".unwrap()" in line and not rel_path.startswith("test"):
                issues.append(create_bug(
                    language="Rust",
                    file_path=rel_path,
                    line=idx,
                    column=line.find(".unwrap()"),
                    severity="HIGH",
                    category="RUNTIME",
                    rule="DirectUnwrapPanic",
                    message="Direct `.unwrap()` call will panic at runtime if Option is None or Result is Err.",
                    code=line,
                    root_cause="`.unwrap()` triggers process panic on None or Err values.",
                    suggested_fix="Handle using `match`, `if let`, or the `?` error propagation operator.",
                    confidence=0.92,
                ))

            # Check 2: unsafe block
            if re.search(r"\bunsafe\s*\{", line):
                issues.append(create_bug(
                    language="Rust",
                    file_path=rel_path,
                    line=idx,
                    column=line.find("unsafe"),
                    severity="HIGH",
                    category="SECURITY",
                    rule="UnsafeBlock",
                    message="`unsafe` block bypasses Rust memory safety invariants.",
                    code=line,
                    root_cause="Dereferencing raw pointers or calling unsafe FFI functions can cause memory corruption.",
                    suggested_fix="Ensure all invariants are documented and validated, or refactor to safe Rust.",
                    confidence=0.88,
                ))

        return issues


# ── 7. Shell / Bash Analyzer ─────────────────────────────────────────────────

class ShellAnalyzer(BaseAnalyzer):
    language_name = "Shell"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # --- 1. bash -n syntax check ---
        bash = shutil.which("bash")
        if bash:
            try:
                res = subprocess.run(
                    [bash, "-n", str(path)],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if res.returncode != 0:
                    for l in (res.stderr or "").splitlines():
                        m = re.search(r":\s*line\s*(\d+):\s*(.*)", l)
                        if m:
                            l_num = int(m.group(1))
                            msg = m.group(2)
                            issues.append(create_bug(
                                language="Shell",
                                file_path=rel_path,
                                line=l_num,
                                column=None,
                                severity="CRITICAL",
                                category="SYNTAX",
                                rule="BashSyntaxError",
                                message=msg,
                                code=_get_line_snippet(lines, l_num),
                                root_cause="Script contains invalid Bash syntax.",
                                suggested_fix="Correct syntax error.",
                                confidence=1.0,
                            ))
            except Exception:
                pass

        # --- 2. Deterministic Shell Patterns ---
        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()
            if trimmed.startswith("#"):
                continue

            # Check 1: eval "$VAR" injection
            if re.search(r"\beval\s+.*\$", line):
                issues.append(create_bug(
                    language="Shell",
                    file_path=rel_path,
                    line=idx,
                    column=line.find("eval"),
                    severity="CRITICAL",
                    category="SECURITY",
                    rule="CommandInjectionEval",
                    message="`eval` with variable arguments allows arbitrary command injection.",
                    code=line,
                    root_cause="Shell expands and executes variable content directly as commands.",
                    suggested_fix="Avoid `eval`; use arrays or functions for dynamic commands.",
                    confidence=0.98,
                ))

            # Check 2: Unquoted rm -rf with variable
            if re.search(r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+\$[a-zA-Z_]", line) and '"$' not in line:
                issues.append(create_bug(
                    language="Shell",
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="CRITICAL",
                    category="SECURITY",
                    rule="UnquotedRmVariable",
                    message="`rm -rf` with unquoted variable: if variable is empty or contains spaces, catastrophic deletion may occur.",
                    code=line,
                    root_cause="Word splitting on unquoted variable can evaluate to root directory `/`.",
                    suggested_fix='Always quote variable: `rm -rf "${TARGET_DIR:?}"` with parameter validation.',
                    confidence=0.95,
                ))

        return issues


# ── 8. SQL Analyzer ──────────────────────────────────────────────────────────

class SQLAnalyzer(BaseAnalyzer):
    language_name = "SQL"

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        for idx, line in enumerate(lines, 1):
            upper = line.upper().strip()
            if upper.startswith("--") or upper.startswith("/*"):
                continue

            # Check 1: DELETE or UPDATE without WHERE clause
            if re.search(r"\b(DELETE\s+FROM|UPDATE)\b", upper):
                # check statement termination or surrounding lines
                stmt = ""
                for l in lines[idx - 1:min(len(lines), idx + 5)]:
                    stmt += " " + l.upper().strip()
                    if ";" in l:
                        break
                if ("DELETE FROM" in stmt or "UPDATE" in stmt) and "WHERE" not in stmt:
                    issues.append(create_bug(
                        language="SQL",
                        file_path=rel_path,
                        line=idx,
                        column=None,
                        severity="CRITICAL",
                        category="LOGIC",
                        rule="MissingWhereClause",
                        message="`DELETE` or `UPDATE` statement executed without a `WHERE` clause will affect ALL rows.",
                        code=line,
                        root_cause="Omitting the WHERE predicate applies modification to the entire table.",
                        suggested_fix="Specify exact target rows with a `WHERE id = ...` clause.",
                        confidence=0.95,
                    ))

            # Check 2: Dangerous DROP TABLE without IF EXISTS
            if re.search(r"\bDROP\s+TABLE\s+[a-zA-Z0-9_]+\s*;", upper) and "IF EXISTS" not in upper:
                issues.append(create_bug(
                    language="SQL",
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="HIGH",
                    category="RUNTIME",
                    rule="DropTableWithoutIfExists",
                    message="`DROP TABLE` without `IF EXISTS` fails if table is not present.",
                    code=line,
                    root_cause="Direct drop statement throws runtime failure if relation does not exist.",
                    suggested_fix="Use `DROP TABLE IF EXISTS ...;`.",
                    confidence=0.90,
                ))

            # Check 3: SELECT * in production
            if re.search(r"\bSELECT\s+\*\s+FROM\b", upper):
                issues.append(create_bug(
                    language="SQL",
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="LOW",
                    category="PERFORMANCE",
                    rule="SelectAllColumns",
                    message="`SELECT *` retrieves all columns, degrading query performance and breaking on schema changes.",
                    code=line,
                    root_cause="Wildcard selection forces unnecessary disk I/O and network payload.",
                    suggested_fix="Explicitly specify needed column names.",
                    confidence=0.85,
                ))

        return issues


# ── 9. Generic Fallback & Multi-Language Rule Engine ──────────────────────────

class GenericMultiLanguageAnalyzer(BaseAnalyzer):
    """Fallback analyzer for Ruby, PHP, Swift, Kotlin, Dart, C#."""

    def __init__(self, lang_name: str):
        self.language_name = lang_name

    def analyze(self, path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        lines = source_code.splitlines()

        # Check for Ruby syntax using ruby -c if available
        if self.language_name == "Ruby" and shutil.which("ruby"):
            try:
                res = subprocess.run(["ruby", "-c", str(path)], capture_output=True, text=True, timeout=5)
                if res.returncode != 0:
                    for l in (res.stderr or "").splitlines():
                        m = re.search(r":(\d+):\s*(.*)", l)
                        if m:
                            l_num = int(m.group(1))
                            msg = m.group(2)
                            issues.append(create_bug(
                                language="Ruby",
                                file_path=rel_path,
                                line=l_num,
                                column=None,
                                severity="CRITICAL",
                                category="SYNTAX",
                                rule="RubySyntaxError",
                                message=msg,
                                code=_get_line_snippet(lines, l_num),
                                root_cause="Ruby interpreter syntax error.",
                                suggested_fix="Fix syntax error.",
                                confidence=1.0,
                            ))
            except Exception:
                pass

        # Check for Swift syntax using swiftc if available
        if self.language_name == "Swift" and shutil.which("swiftc"):
            try:
                res = subprocess.run(["swiftc", "-parse", str(path)], capture_output=True, text=True, timeout=5)
                if res.returncode != 0:
                    for l in (res.stderr or "").splitlines():
                        m = re.search(r":(\d+):(\d+):\s*error:\s*(.*)", l)
                        if m:
                            l_num = int(m.group(1))
                            c_num = int(m.group(2))
                            msg = m.group(3)
                            issues.append(create_bug(
                                language="Swift",
                                file_path=rel_path,
                                line=l_num,
                                column=c_num,
                                severity="CRITICAL",
                                category="SYNTAX",
                                rule="SwiftCompilerError",
                                message=msg,
                                code=_get_line_snippet(lines, l_num),
                                root_cause="Swift compiler syntax error.",
                                suggested_fix="Fix compiler error.",
                                confidence=1.0,
                            ))
            except Exception:
                pass

        # General security & quality pattern inspection
        for idx, line in enumerate(lines, 1):
            # Hardcoded API keys or passwords
            if re.search(r'''(?i)(password|secret|api_key|token)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{12,}["']''', line):
                issues.append(create_bug(
                    language=self.language_name,
                    file_path=rel_path,
                    line=idx,
                    column=None,
                    severity="CRITICAL",
                    category="SECURITY",
                    rule="HardcodedCredential",
                    message="Hardcoded secret / credential detected in source code.",
                    code=line,
                    root_cause="Committing plaintext credentials exposes access tokens and accounts.",
                    suggested_fix="Move secret to environment variables or secret management vault.",
                    confidence=0.92,
                ))

            # Infinite loop hazard (while(true) without break or exit)
            if re.search(r'''\bwhile\s*\(\s*(true|1)\s*\)''', line, re.IGNORECASE):
                if "break" not in source_code and "return" not in source_code and "exit" not in source_code:
                    issues.append(create_bug(
                        language=self.language_name,
                        file_path=rel_path,
                        line=idx,
                        column=None,
                        severity="HIGH",
                        category="RUNTIME",
                        rule="InfiniteLoopHazard",
                        message="Potential infinite loop: `while(true)` without apparent break or exit condition.",
                        code=line,
                        root_cause="Loops without termination condition hang CPU and exhaust resources.",
                        suggested_fix="Ensure a bounded condition or `break` statement exists.",
                        confidence=0.88,
                    ))

        return issues


# ── Registry Dispatcher ──────────────────────────────────────────────────────

_ANALYZERS: Dict[str, BaseAnalyzer] = {
    "Python": PythonAnalyzer(),
    "JavaScript": JavaScriptTypeScriptAnalyzer(),
    "TypeScript": JavaScriptTypeScriptAnalyzer(),
    "Java": JavaAnalyzer(),
    "C": C_CppAnalyzer(),
    "C++": C_CppAnalyzer(),
    "Go": GoAnalyzer(),
    "Rust": RustAnalyzer(),
    "Shell": ShellAnalyzer(),
    "SQL": SQLAnalyzer(),
}

def get_analyzer_for_language(lang_name: str) -> BaseAnalyzer:
    """Retrieve the dedicated analyzer or fallback generic analyzer."""
    if lang_name in _ANALYZERS:
        return _ANALYZERS[lang_name]
    return GenericMultiLanguageAnalyzer(lang_name)


def analyze_source_file(path: Path, rel_path: str, source_code: str) -> List[Dict[str, Any]]:
    """
    Main entry point to detect language and run the appropriate deterministic analyzer.
    Returns a list of Universal Bug dicts.
    """
    lang = detect_language(str(path), source_code)
    if not lang:
        return []

    analyzer = get_analyzer_for_language(lang)
    try:
        return analyzer.analyze(path, rel_path, source_code)
    except Exception as exc:
        # Graceful error reporting
        return [create_bug(
            language=lang,
            file_path=rel_path,
            line=1,
            column=None,
            severity="MEDIUM",
            category="RUNTIME",
            rule="AnalyzerException",
            message=f"Deterministic analyzer error for {lang}: {exc}",
            code="",
            root_cause="Internal analyzer error during inspection.",
            suggested_fix="Check file encoding or syntax integrity.",
            confidence=0.5,
        )]
