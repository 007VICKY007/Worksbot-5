# src/languages.py
# Universal Programming Language Registry and Detection Engine.

import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Dict, List, Set


@dataclass(frozen=True)
class LanguageConfig:
    name: str
    id: str
    extensions: tuple[str, ...]
    color: str
    compiler_cmd: Optional[str] = None
    runner_cmd: Optional[str] = None

    @property
    def is_compiler_available(self) -> bool:
        if not self.compiler_cmd:
            return False
        return shutil.which(self.compiler_cmd) is not None


# Supported language definitions
LANGUAGES: Dict[str, LanguageConfig] = {
    "Python": LanguageConfig(
        name="Python",
        id="python",
        extensions=(".py", ".pyw"),
        color="#3b82f6",
        compiler_cmd="python3",
        runner_cmd="python3",
    ),
    "JavaScript": LanguageConfig(
        name="JavaScript",
        id="javascript",
        extensions=(".js", ".mjs", ".cjs", ".jsx"),
        color="#eab308",
        compiler_cmd="node",
        runner_cmd="node",
    ),
    "TypeScript": LanguageConfig(
        name="TypeScript",
        id="typescript",
        extensions=(".ts", ".tsx", ".mts", ".cts"),
        color="#2563eb",
        compiler_cmd="node",
        runner_cmd="node",
    ),
    "Java": LanguageConfig(
        name="Java",
        id="java",
        extensions=(".java",),
        color="#ea580c",
        compiler_cmd="javac",
        runner_cmd="java",
    ),
    "C": LanguageConfig(
        name="C",
        id="c",
        extensions=(".c", ".h"),
        color="#64748b",
        compiler_cmd="clang" if shutil.which("clang") else "gcc",
    ),
    "C++": LanguageConfig(
        name="C++",
        id="cpp",
        extensions=(".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"),
        color="#0284c7",
        compiler_cmd="clang++" if shutil.which("clang++") else "g++",
    ),
    "C#": LanguageConfig(
        name="C#",
        id="csharp",
        extensions=(".cs",),
        color="#7c3aed",
        compiler_cmd="dotnet",
    ),
    "Go": LanguageConfig(
        name="Go",
        id="go",
        extensions=(".go",),
        color="#06b6d4",
        compiler_cmd="go",
        runner_cmd="go",
    ),
    "Rust": LanguageConfig(
        name="Rust",
        id="rust",
        extensions=(".rs",),
        color="#f97316",
        compiler_cmd="rustc",
    ),
    "PHP": LanguageConfig(
        name="PHP",
        id="php",
        extensions=(".php", ".phtml"),
        color="#8b5cf6",
        compiler_cmd="php",
    ),
    "Kotlin": LanguageConfig(
        name="Kotlin",
        id="kotlin",
        extensions=(".kt", ".kts"),
        color="#a855f7",
        compiler_cmd="kotlinc",
    ),
    "Swift": LanguageConfig(
        name="Swift",
        id="swift",
        extensions=(".swift",),
        color="#f43f5e",
        compiler_cmd="swiftc" if shutil.which("swiftc") else "swift",
    ),
    "Dart": LanguageConfig(
        name="Dart",
        id="dart",
        extensions=(".dart",),
        color="#0ea5e9",
        compiler_cmd="dart",
    ),
    "Ruby": LanguageConfig(
        name="Ruby",
        id="ruby",
        extensions=(".rb", ".rake"),
        color="#e11d48",
        compiler_cmd="ruby",
        runner_cmd="ruby",
    ),
    "SQL": LanguageConfig(
        name="SQL",
        id="sql",
        extensions=(".sql",),
        color="#10b981",
    ),
    "Shell": LanguageConfig(
        name="Shell",
        id="shell",
        extensions=(".sh", ".bash", ".zsh"),
        color="#475569",
        compiler_cmd="bash",
        runner_cmd="bash",
    ),
}

# Reverse lookup: extension -> LanguageConfig
_EXT_MAP: Dict[str, LanguageConfig] = {}
for lang in LANGUAGES.values():
    for ext in lang.extensions:
        _EXT_MAP[ext.lower()] = lang


def get_supported_extensions() -> Set[str]:
    """Return all recognized file extensions."""
    return set(_EXT_MAP.keys())


def detect_language(file_path: str, source_code: str = "") -> Optional[str]:
    """
    Detect programming language from file path extension and source structure cues.
    Returns language name (e.g. 'Python', 'TypeScript', 'C++') or None.
    """
    p = Path(file_path)
    ext = p.suffix.lower()

    if ext in _EXT_MAP:
        return _EXT_MAP[ext].name

    # Check secondary cues (e.g. shebang or distinctive tokens)
    if source_code:
        first_line = source_code.splitlines()[0] if source_code.splitlines() else ""
        if first_line.startswith("#!"):
            fl = first_line.lower()
            if "python" in fl:
                return "Python"
            if "node" in fl or "deno" in fl or "bun" in fl:
                return "JavaScript"
            if "bash" in fl or "sh" in fl or "zsh" in fl:
                return "Shell"
            if "ruby" in fl:
                return "Ruby"
            if "php" in fl:
                return "PHP"

        # Check header tokens
        if source_code.lstrip().startswith("<?php"):
            return "PHP"
        if "package main" in source_code and "func main()" in source_code:
            return "Go"
        if "fn main()" in source_code and ("println!" in source_code or "let mut" in source_code):
            return "Rust"
        if ("SELECT " in source_code.upper() or "CREATE TABLE" in source_code.upper()) and ";" in source_code:
            return "SQL"

    return None


def get_language_config(lang_name: str) -> Optional[LanguageConfig]:
    """Retrieve configuration metadata for a given language name."""
    return LANGUAGES.get(lang_name)
