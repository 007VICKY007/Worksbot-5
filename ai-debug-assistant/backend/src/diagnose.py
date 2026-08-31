# src/diagnose.py
# Uses the Claude API to diagnose the root cause of the error and
# suggest a fix, given the parsed traceback + retrieved source code.

import os
import anthropic


# ── Module-level client (lazy-initialised) ─────────────────────────────────────
_client: anthropic.Anthropic | None = None


def _get_client(api_key: str | None = None) -> anthropic.Anthropic:
    global _client
    key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise EnvironmentError(
            "ANTHROPIC_API_KEY is not set. "
            "Pass it explicitly or set the environment variable."
        )
    # Re-create client if a new key is supplied.
    if _client is None or api_key:
        _client = anthropic.Anthropic(api_key=key)
    return _client


# ── Public API ─────────────────────────────────────────────────────────────────

def diagnose(parsed: dict, retrieved: dict, api_key: str | None = None) -> dict:
    """Send the error context to Claude and return a structured diagnosis.

    Args:
        parsed:    Output of log_parser.parse_log().
        retrieved: Output of code_retriever.retrieve_code().
        api_key:   Anthropic API key (falls back to env var).

    Returns:
        A dict with keys:
            root_cause  (str) – concise root-cause explanation
            fix         (str) – the corrected code snippet
            explanation (str) – step-by-step reasoning
            confidence  (str) – HIGH / MEDIUM / LOW
    """
    prompt = _build_prompt(parsed, retrieved)
    client = _get_client(api_key)

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1500,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text
    return _parse_response(raw)


def diagnose_stream(parsed: dict, retrieved: dict, api_key: str | None = None):
    """Streaming version of diagnose(); yields text chunks as they arrive."""
    prompt = _build_prompt(parsed, retrieved)
    client = _get_client(api_key)

    with client.messages.stream(
        model="claude-opus-4-5",
        max_tokens=1500,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            yield text


# ── Prompt construction ────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert Python debugging assistant. Your task is to:
1. Analyse the provided error traceback and source code.
2. Identify the exact root cause of the bug.
3. Provide a corrected code snippet.
4. Rate your confidence as HIGH, MEDIUM, or LOW.

Always respond using the following exact section headers:
## ROOT CAUSE
## FIX
## EXPLANATION
## CONFIDENCE
"""


def _build_prompt(parsed: dict, retrieved: dict) -> str:
    error_block = (
        f"Error type : {parsed['error_type']}\n"
        f"Message    : {parsed['message']}\n"
        f"File       : {parsed['file']}\n"
        f"Line       : {parsed['line']}\n"
        f"Function   : {parsed['function']}\n"
    )

    code_block = ""
    if retrieved.get("function_src"):
        code_block += f"### Failing function\n```python\n{retrieved['function_src']}\n```\n\n"
    if retrieved.get("context_src"):
        code_block += f"### Context (±10 lines around crash)\n```\n{retrieved['context_src']}\n```\n"

    return (
        "## Error Information\n"
        + error_block
        + "\n## Source Code\n"
        + (code_block if code_block else "_Source not found._")
    )


# ── Response parser ────────────────────────────────────────────────────────────

def _parse_response(text: str) -> dict:
    """Extract sections from Claude's structured response."""
    sections = {
        "root_cause":  "",
        "fix":         "",
        "explanation": "",
        "confidence":  "MEDIUM",
        "raw":         text,
    }

    markers = {
        "root_cause":  "## ROOT CAUSE",
        "fix":         "## FIX",
        "explanation": "## EXPLANATION",
        "confidence":  "## CONFIDENCE",
    }

    keys_order = list(markers.keys())
    positions = {}
    for key, marker in markers.items():
        idx = text.find(marker)
        if idx != -1:
            positions[key] = idx

    sorted_keys = sorted(positions, key=lambda k: positions[k])

    for i, key in enumerate(sorted_keys):
        start = positions[key] + len(markers[key])
        end   = positions[sorted_keys[i + 1]] if i + 1 < len(sorted_keys) else len(text)
        sections[key] = text[start:end].strip()

    # Normalise confidence to uppercase single word
    conf = sections["confidence"].upper()
    for level in ("HIGH", "MEDIUM", "LOW"):
        if level in conf:
            sections["confidence"] = level
            break

    return sections
