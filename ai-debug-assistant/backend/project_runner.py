# backend/project_runner.py
"""
Project-aware test configuration detection and execution.

Every imported project runs with ITS OWN repository root, configuration and test
framework. Nothing here assumes Mindora's stack, a single runner, or any specific
project. Supported detection sources: package.json (+lockfiles), pyproject.toml,
requirements.txt, pytest.ini/setup.cfg/tox.ini/conftest.py, go.mod, Cargo.toml,
pom.xml, build.gradle(.kts), Gemfile.

Safety: commands are argv lists (no shell), executed with cwd=<project root>, a
minimal environment, and per-framework timeouts. A result is PASSED only when the
real command exits 0 AND the framework output reports at least one executed test.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Framework knowledge base (extensible, not per-project hardcoding) ─────────

JS_FRAMEWORKS = ("vitest", "jest", "mocha", "ava", "tap", "uvu")
TEST_SCRIPT_IGNORED = re.compile(r'echo\s+"?Error: no test specified"?', re.I)

TIMEOUTS = {"pytest": 120, "unittest": 120, "python-script": 30, "vitest": 240, "jest": 240,
            "mocha": 180, "node-script": 60, "go-test": 300, "cargo-test": 600,
            "maven": 600, "gradle": 600, "rspec": 180, "shell": 60, "typecheck": 240}

_TEST_NAME_RE = re.compile(r"(^test_.*\.py$|_test\.py$|\.test\.[jt]sx?$|\.spec\.[jt]sx?$|_test\.go$"
                           r"|Test[s]?\.java$|^Test.*\.java$|_spec\.rb$|\.test\.mjs$|\.spec\.mjs$)")
TEST_DIR_HINTS = {"tests", "test", "__tests__", "spec"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_test_file(rel_path: str) -> bool:
    p = Path(rel_path)
    if _TEST_NAME_RE.search(p.name):
        return True
    # Python files inside a tests/ directory count even without the prefix.
    return p.suffix == ".py" and any(part.lower() in TEST_DIR_HINTS for part in p.parts[:-1])


def _tool_path(name: str) -> Optional[str]:
    """Resolve a tool on the real system PATH (the sandboxed exec PATH is minimal)."""
    return shutil.which(name)


def _exec_env(root: Path, extra_bins: List[str]) -> Dict[str, str]:
    """Minimal environment: default PATH + the resolved tool dirs + the project's local bin.
    No Mindora secrets (API keys / DB URIs) are inherited by project code."""
    path_parts = [str(root / "node_modules" / ".bin"), *extra_bins, os.defpath]
    seen, parts = set(), []
    for part in path_parts:
        if part and part not in seen:
            seen.add(part)
            parts.append(part)
    return {"PATH": os.pathsep.join(parts), "HOME": os.path.expanduser("~"), "LANG": "C.UTF-8",
            "CI": "1", "NO_COLOR": "1", "FORCE_COLOR": "0", "NODE_ENV": "test",
            "PYTHONPATH": str(root), "PYTHONDONTWRITEBYTECODE": "1",
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1"}


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return {}


# ── Configuration detection ───────────────────────────────────────────────────

def detect_config(root: Path) -> Dict[str, Any]:
    """Inspect the project's own configuration and report language, package manager,
    test framework, test/typecheck commands and dependencies."""
    root = Path(root).resolve()
    cfg: Dict[str, Any] = {"root": str(root), "language": "unknown", "package_manager": None,
                           "test_framework": None, "test_command": None, "test_command_display": None,
                           "typecheck_command": None, "config_files": [], "dependencies": [],
                           "runner_available": False, "notes": []}
    exists = lambda *names: next((root / n for n in names if (root / n).is_file()), None)

    pkg_file = exists("package.json")
    if pkg_file:
        pkg = _read_json(pkg_file)
        cfg["config_files"].append("package.json")
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        cfg["language"] = ("typescript" if exists("tsconfig.json") or "typescript" in deps
                           or any(True for _ in _iter_sources(root, {".ts", ".tsx"}, limit=1)) else "javascript")
        cfg["dependencies"] = sorted(deps)[:80]
        cfg["package_manager"] = ("pnpm" if exists("pnpm-lock.yaml") else "yarn" if exists("yarn.lock")
                                  else "bun" if exists("bun.lockb") else "npm")
        for fw in JS_FRAMEWORKS:
            if fw in deps or exists(f"{fw}.config.js", f"{fw}.config.ts", f"{fw}.config.mjs", f"{fw}.config.mts"):
                cfg["test_framework"] = fw
                break
        script = str(pkg.get("scripts", {}).get("test", "") or "")
        if not cfg["test_framework"] and script and not TEST_SCRIPT_IGNORED.search(script):
            cfg["test_framework"] = next((fw for fw in JS_FRAMEWORKS if fw in script), "npm-script")
        node_modules = (root / "node_modules").is_dir()
        if cfg["test_framework"] in JS_FRAMEWORKS:
            local_bin = root / "node_modules" / ".bin" / cfg["test_framework"]
            runner = str(local_bin) if local_bin.exists() else None
            if runner:
                base = {"vitest": [runner, "run", "--reporter=verbose"],
                        "jest": [runner, "--ci", "--verbose"],
                        "mocha": [runner]}.get(cfg["test_framework"], [runner])
                cfg["test_command"] = base
                cfg["runner_available"] = True
            else:
                cfg["notes"].append(f"{cfg['test_framework']} is declared but not installed "
                                    f"(run `{cfg['package_manager']} install` in the project).")
        elif cfg["test_framework"] == "npm-script":
            npm = _tool_path(cfg["package_manager"]) or _tool_path("npm")
            if npm and node_modules:
                cfg["test_command"] = [npm, "test", "--silent"]
                cfg["runner_available"] = True
            elif npm:
                cfg["notes"].append("A test script exists but node_modules is missing (dependencies not installed).")
        else:
            cfg["notes"].append("No test framework is configured in package.json.")
        if exists("tsconfig.json"):
            cfg["config_files"].append("tsconfig.json")
            tsc = root / "node_modules" / ".bin" / "tsc"
            if tsc.exists():
                cfg["typecheck_command"] = [str(tsc), "--noEmit", "--incremental", "false"]
            elif _tool_path("tsc"):
                cfg["typecheck_command"] = [_tool_path("tsc"), "--noEmit", "--incremental", "false"]

    py_cfg = exists("pyproject.toml", "pytest.ini", "setup.cfg", "tox.ini", "requirements.txt", "conftest.py")
    has_py = py_cfg or any(True for _ in _iter_sources(root, {".py"}, limit=1))
    if cfg["language"] == "unknown" and has_py:
        cfg["language"] = "python"
    if has_py:
        cfg["config_files"] += [n for n in ("pyproject.toml", "requirements.txt", "pytest.ini", "setup.cfg", "conftest.py")
                                if (root / n).is_file()]
        if (root / "requirements.txt").is_file():
            cfg["dependencies"] += [ln.strip() for ln in (root / "requirements.txt").read_text(errors="replace").splitlines()
                                    if ln.strip() and not ln.startswith("#")][:40]
        if not cfg["test_command"]:
            cfg.update(test_framework=cfg["test_framework"] or "pytest", package_manager=cfg["package_manager"] or "pip",
                       test_command=[sys.executable, "-m", "pytest", "-v", "--no-header"], runner_available=True)

    for marker, lang, fw, cmd_name, cmd in (
            ("go.mod", "go", "go-test", "go", lambda t: [t, "test", "./..."]),
            ("Cargo.toml", "rust", "cargo-test", "cargo", lambda t: [t, "test"]),
            ("pom.xml", "java", "maven", "mvn", lambda t: [t, "-q", "test"]),
            ("build.gradle", "java", "gradle", "gradle", lambda t: [t, "test", "--console=plain"]),
            ("build.gradle.kts", "java", "gradle", "gradle", lambda t: [t, "test", "--console=plain"]),
            ("Gemfile", "ruby", "rspec", "rspec", lambda t: [t])):
        if (root / marker).is_file():
            cfg["config_files"].append(marker)
            if cfg["language"] in ("unknown",):
                cfg["language"] = lang
            if not cfg["test_command"]:
                tool = _tool_path(cmd_name)
                cfg["test_framework"] = fw
                cfg["package_manager"] = cfg["package_manager"] or {"go": "go modules", "rust": "cargo",
                                                                    "java": cmd_name, "ruby": "bundler"}[lang]
                if tool:
                    cfg["test_command"] = cmd(tool)
                    cfg["runner_available"] = True
                else:
                    cfg["notes"].append(f"{cmd_name} is not installed on this machine.")

    if cfg["test_command"]:
        cfg["test_command_display"] = " ".join(Path(cfg["test_command"][0]).name.split() + cfg["test_command"][1:])
    return cfg


def _iter_sources(root: Path, exts, limit=100000):
    from departments import IGNORED_PROJECT_DIRS
    count = 0
    for p in root.rglob("*"):
        if count >= limit:
            return
        rel = p.relative_to(root)
        if not p.is_file() or any(part in IGNORED_PROJECT_DIRS or part.startswith(".") for part in rel.parts):
            continue
        if p.suffix.lower() in exts:
            count += 1
            yield rel


def related_test_files(root: Path, rel: str) -> List[str]:
    """Find the project's own tests for a source file (Badge.tsx -> Badge.test.tsx / Badge.spec.tsx, ...)."""
    if is_test_file(rel):
        return [rel]
    stem = Path(rel).stem
    exts = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".go", ".java", ".rb"}
    matches = []
    for cand in _iter_sources(root, exts):
        cand_s = str(cand)
        if not is_test_file(cand_s):
            continue
        cstem = Path(cand).name
        if re.match(rf"(test_)?{re.escape(stem)}([._](test|spec)s?)?\.|{re.escape(stem)}Tests?\.java", cstem, re.I):
            matches.append(cand_s)
    return sorted(matches)


# ── Execution ─────────────────────────────────────────────────────────────────

def run_command(root: Path, cmd: List[str], timeout: int, kind: str) -> Dict[str, Any]:
    start = time.perf_counter()
    extra_bins = [str(Path(c).parent) for c in cmd[:1] if os.sep in c]
    for tool in ("node", "npm", "go", "cargo", "java", "mvn", "gradle"):
        t = _tool_path(tool)
        if t:
            extra_bins.append(str(Path(t).parent))
    stdout = stderr = ""
    exit_code: Optional[int] = 1
    try:
        proc = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True,
                              timeout=timeout, env=_exec_env(root, extra_bins))
        stdout, stderr, exit_code = proc.stdout, proc.stderr, proc.returncode
    except subprocess.TimeoutExpired as exc:
        exit_code, stderr = 124, f"Execution timed out after {timeout}s."
        stdout = (exc.stdout or b"" if isinstance(exc.stdout, bytes) else (exc.stdout or ""))[:50000]
    except FileNotFoundError as exc:
        exit_code, stderr = 127, f"Runner not found: {exc}"
    except Exception as exc:  # noqa: BLE001
        stderr = str(exc)
    return {"command": [Path(cmd[0]).name, *cmd[1:]], "kind": kind, "exit_code": exit_code,
            "duration_ms": int((time.perf_counter() - start) * 1000),
            "stdout": stdout.strip()[-50000:], "stderr": stderr.strip()[-50000:]}


_COUNT_PATTERNS = [  # (regex with named groups, framework hint)
    re.compile(r"(?P<failed>\d+) failed.*?(?P<passed>\d+) passed", re.S),            # pytest/vitest/jest mixed
    re.compile(r"(?P<passed>\d+) passed(?:,\s*(?P<skipped>\d+) skipped)?"),          # pytest/vitest/jest pass-only
    re.compile(r"Tests?:\s+(?:(?P<failed>\d+) failed,\s*)?(?:(?P<skipped>\d+) skipped,\s*)?(?P<passed>\d+) passed,\s*(?P<total>\d+) total"),  # jest
    re.compile(r"Tests run:\s*(?P<total>\d+),\s*Failures:\s*(?P<failed>\d+),\s*Errors:\s*(?P<errors>\d+),\s*Skipped:\s*(?P<skipped>\d+)"),    # maven surefire
    re.compile(r"test result: \w+\. (?P<passed>\d+) passed; (?P<failed>\d+) failed"),  # cargo
    re.compile(r"ok\s+\S+\s+[\d.]+s", re.M),                                          # go test (counted separately)
]


def parse_test_counts(stdout: str, stderr: str) -> Dict[str, int]:
    text = stdout + "\n" + stderr
    for pat in _COUNT_PATTERNS[:5]:
        matches = list(pat.finditer(text))
        if matches:
            m = matches[-1].groupdict()
            passed = int(m.get("passed") or 0)
            failed = int(m.get("failed") or 0) + int(m.get("errors") or 0)
            skipped = int(m.get("skipped") or 0)
            total = int(m.get("total") or 0) or (passed + failed + skipped)
            if total:
                return {"total": total, "passed": passed, "failed": failed, "skipped": skipped}
    go_ok = len(re.findall(r"^(--- PASS|ok\s)", text, re.M))
    go_fail = len(re.findall(r"^(--- FAIL|FAIL\s)", text, re.M))
    if go_ok or go_fail:
        return {"total": go_ok + go_fail, "passed": go_ok, "failed": go_fail, "skipped": 0}
    return {"total": 0, "passed": 0, "failed": 0, "skipped": 0}


def _failed_names(stdout: str) -> List[str]:
    names = re.findall(r"^(?:FAILED|--- FAIL:?|✗|×|✘)\s+(\S.*?)(?:\s+-|$)", stdout, re.M)
    names += re.findall(r"^\s*(?:✕|✗)\s+(.+)$", stdout, re.M)
    return [n.strip()[:200] for n in dict.fromkeys(names)][:20]


def _error_summary(res: Dict[str, Any]) -> str:
    combined = (res["stderr"] + "\n" + res["stdout"]).strip()
    for line in reversed(combined.splitlines()):
        ls = line.strip()
        if re.search(r"(Error|Exception|FAILED|assert)", ls):
            return ls[:300]
    return combined.splitlines()[-1][:300] if combined else ""


def _single_file_cmd(cfg: Dict[str, Any], rel: str) -> Optional[List[str]]:
    """Scope the project's own test command to one test file where the framework supports it."""
    base = cfg.get("test_command")
    fw = cfg.get("test_framework")
    if not base:
        return None
    if fw in ("pytest",):
        return [sys.executable, "-m", "pytest", rel, "-v", "--no-header"]
    if fw in ("vitest", "jest", "mocha"):
        return [*base, rel]
    if fw == "go-test":
        pkg_dir = str(Path(rel).parent) or "."
        return [base[0], "test", "./" + pkg_dir.rstrip("/")]
    return base  # cargo/maven/gradle/npm-script run the suite


def run_target(root: Path, rel: Optional[str], cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run the appropriate REAL tests for a target inside its project root.

    rel=None        -> whole project test suite.
    rel=test file   -> that test file via the project's framework.
    rel=source file -> its related test files; if none exist: NO TEST AVAILABLE (BLOCKED).
    Shell scripts/standalone python scripts keep their legacy direct execution (explicit scripts only).
    """
    root = Path(root).resolve()
    cfg = cfg or detect_config(root)
    base: Dict[str, Any] = {"file_path": rel or "", "project_root": str(root),
                            "language": cfg["language"], "test_framework": cfg["test_framework"],
                            "executed_at": now_iso(), "tests": {"total": 0, "passed": 0, "failed": 0, "skipped": 0},
                            "failed_tests": [], "no_test_found": False}

    if rel and Path(rel).suffix == ".sh":
        res = run_command(root, ["bash", rel], TIMEOUTS["shell"], "shell")
        return _finalize(base, res, script_mode=True)

    target_rel = rel
    if rel and not is_test_file(rel):
        related = related_test_files(root, rel)
        if related:
            target_rel = related[0]
            base["related_test_files"] = related
            base["resolved_test_file"] = related[0]
        elif rel and Path(rel).suffix == ".py" and cfg["language"] == "python":
            # Standalone python script with no tests anywhere near it: direct execution (legacy behaviour).
            res = run_command(root, [sys.executable, rel], TIMEOUTS["python-script"], "python-script")
            out = _finalize(base, res, script_mode=True)
            out["no_test_found"] = True
            out["notes"] = ["No related test file exists; the script itself was executed."]
            return out
        else:
            base.update(status="BLOCKED", passed=False, exit_code=None, duration_ms=0, stdout="", stderr="",
                        no_test_found=True,
                        error_summary=f"NO TEST AVAILABLE: no related test file (e.g. "
                                      f"{Path(rel).stem}.test{Path(rel).suffix} / {Path(rel).stem}.spec{Path(rel).suffix}) "
                                      f"exists in this project. Generate one with the AI Test Case Generator.",
                        error_type="NoTestFound")
            if not cfg["runner_available"]:
                base["error_summary"] += " Additionally: " + "; ".join(cfg["notes"] or ["no test framework configured."])
            return base

    if not cfg["runner_available"] or not cfg["test_command"]:
        base.update(status="BLOCKED", passed=False, exit_code=None, duration_ms=0, stdout="",
                    stderr="; ".join(cfg["notes"]) or "No test framework configured for this project.",
                    error_summary="; ".join(cfg["notes"]) or "No test framework configured for this project.",
                    error_type="NoTestRunner")
        return base

    cmd = _single_file_cmd(cfg, target_rel) if target_rel else cfg["test_command"]
    res = run_command(root, cmd, TIMEOUTS.get(cfg["test_framework"], 180), cfg["test_framework"] or "tests")
    return _finalize(base, res)


def _finalize(base: Dict[str, Any], res: Dict[str, Any], script_mode: bool = False) -> Dict[str, Any]:
    counts = parse_test_counts(res["stdout"], res["stderr"])
    if script_mode:
        passed = res["exit_code"] == 0
        blocked = res["exit_code"] in (124, 127)
    else:
        # Never mark PASS artificially: exit 0 alone is not enough, tests must have run.
        passed = res["exit_code"] == 0 and counts["total"] > 0 and counts["failed"] == 0
        blocked = res["exit_code"] in (5, 124, 127) or (res["exit_code"] == 0 and counts["total"] == 0)
    status = "PASSED" if passed else ("BLOCKED" if blocked else "FAILED")
    out = {**base, **res, "tests": counts, "failed_tests": _failed_names(res["stdout"] + "\n" + res["stderr"]),
           "status": status, "passed": passed,
           "error_summary": ("Execution succeeded without unhandled errors." if passed else _error_summary(res)),
           "error_type": "" if passed else ("Timeout" if res["exit_code"] == 124 else
                                            "NoTestsCollected" if (res["exit_code"] in (0, 5) and counts["total"] == 0)
                                            else "TestFailure")}
    return out


def run_typecheck(root: Path, cfg: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Run the project's own typecheck (e.g. tsc --noEmit) when configured. Returns None if unavailable."""
    root = Path(root).resolve()
    cfg = cfg or detect_config(root)
    if not cfg.get("typecheck_command"):
        return None
    res = run_command(root, cfg["typecheck_command"], TIMEOUTS["typecheck"], "typecheck")
    passed = res["exit_code"] == 0
    return {**res, "status": "PASSED" if passed else "FAILED", "passed": passed,
            "file_path": "tsconfig.json", "project_root": str(root), "executed_at": now_iso(),
            "tests": {"total": 1, "passed": int(passed), "failed": int(not passed), "skipped": 0},
            "failed_tests": [], "no_test_found": False,
            "error_summary": "Typecheck passed." if passed else _error_summary(res),
            "error_type": "" if passed else "TypeError"}
