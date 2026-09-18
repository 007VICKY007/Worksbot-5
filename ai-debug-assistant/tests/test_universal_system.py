import sys
import os
import shutil
from pathlib import Path
import pytest

sys.path.insert(0, "src")
sys.path.insert(0, "backend")

from languages import detect_language, get_supported_extensions, LANGUAGES
from universal_analyzer import analyze_source_file, PythonAnalyzer
from fix_validator import validate_code_fix, compute_unified_diff
from server import apply_fix, ApplyFixRequest

def test_language_detection():
    assert detect_language("test.py") == "Python"
    assert detect_language("test.js") == "JavaScript"
    assert detect_language("test.ts") == "TypeScript"
    assert detect_language("Test.java") == "Java"
    assert detect_language("test.c") == "C"
    assert detect_language("test.cpp") == "C++"
    assert detect_language("test.go") == "Go"
    assert detect_language("test.rs") == "Rust"
    assert detect_language("test.sql") == "SQL"
    assert detect_language("test.sh") == "Shell"

def test_python_preservation_9_rules():
    p = Path("f.py")
    # 1. BareExcept
    src_bare = "try:\n    x = 1\nexcept:\n    pass\n"
    bugs = PythonAnalyzer().analyze(p, "f.py", src_bare)
    assert any(b["rule"] == "BareExcept" for b in bugs)

    # 2. MutableDefault
    src_mut = "def fn(x=[]):\n    pass\n"
    bugs = PythonAnalyzer().analyze(p, "f.py", src_mut)
    assert any(b["rule"] == "MutableDefault" for b in bugs)

    # 3. NoneComparison
    src_none = "x = 1\nif x == None:\n    pass\n"
    bugs = PythonAnalyzer().analyze(p, "f.py", src_none)
    assert any(b["rule"] == "NoneComparison" for b in bugs)

    # 4. BuiltinShadow
    src_shadow = "def fn(id, list):\n    pass\n"
    bugs = PythonAnalyzer().analyze(p, "f.py", src_shadow)
    assert any(b["rule"] == "BuiltinShadow" for b in bugs)

    # 5. UnusedImport
    src_import = "import math\nx = 1\n"
    bugs = PythonAnalyzer().analyze(p, "f.py", src_import)
    assert any(b["rule"] == "UnusedImport" for b in bugs)

    # 6. MissingReturn
    src_ret = "def fn(x):\n    if x > 0:\n        return True\n"
    bugs = PythonAnalyzer().analyze(p, "f.py", src_ret)
    assert any(b["rule"] == "MissingReturn" for b in bugs)

def test_multi_language_deterministic_detectors():
    # JavaScript eval
    js_bugs = analyze_source_file(Path("test.js"), "test.js", "eval(\"alert(1)\");")
    assert any(b["rule"] == "DangerousEval" for b in js_bugs)

    # SQL DELETE without WHERE
    sql_bugs = analyze_source_file(Path("test.sql"), "test.sql", "DELETE FROM users;")
    assert any(b["rule"] == "MissingWhereClause" for b in sql_bugs)

    # Java String == comparison
    java_bugs = analyze_source_file(Path("Test.java"), "Test.java", "class Test { boolean f(String s) { return s == \"admin\"; } }")
    assert any(b["rule"] == "StringReferenceEquality" for b in java_bugs)

def test_sandbox_validation():
    orig = "def foo(x=[]):\n    return x\n"
    valid_fix = "def foo(x=None):\n    if x is None:\n        x = []\n    return x\n"
    bad_fix = "def foo(x=None):\n    return x {\n" # syntax error

    # Valid fix passes
    v_res = validate_code_fix("foo.py", orig, valid_fix)
    assert v_res["is_valid"] is True
    assert v_res["status"] == "VERIFIED"
    assert "--- a/foo.py" in v_res["diff"]

    # Bad fix fails in sandbox
    b_res = validate_code_fix("foo.py", orig, bad_fix)
    assert b_res["is_valid"] is False
    assert b_res["status"] == "FAILED"
    assert "SyntaxError" in b_res["compiler_errors"]

def test_apply_fix_with_backup(tmp_path):
    target_file = tmp_path / "app.js"
    orig_code = "if (role == 'admin') { eval(cmd); }"
    target_file.write_text(orig_code, encoding="utf-8")

    fixed_code = "if (role === 'admin') { console.log(cmd); }"
    req = ApplyFixRequest(
        scanned_directory=str(tmp_path),
        file="app.js",
        fixed_code=fixed_code,
    )
    res = apply_fix(req, username="tester")
    assert res["success"] is True
    assert res["backup"] == "app.js.bak"
    assert res["resolved"] is True
    assert (tmp_path / "app.js.bak").read_text() == orig_code
    assert (tmp_path / "app.js").read_text() == fixed_code
