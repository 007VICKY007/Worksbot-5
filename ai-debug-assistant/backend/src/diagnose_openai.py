# src/diagnose_openai.py
# Uses OpenAI GPT to diagnose the root cause of a Python error.

import openai


def diagnose_gpt(parsed: dict, retrieved: dict, api_key: str) -> dict:
    """Send error context to GPT and return a structured diagnosis.

    Args:
        parsed:    Output of log_parser.parse_log().
        retrieved: Output of code_retriever.retrieve_code().
        api_key:   OpenAI API key.

    Returns:
        dict with: root_cause, fix, explanation, confidence, raw
    """
    client = openai.OpenAI(api_key=api_key)
    prompt = _build_prompt(parsed, retrieved)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        max_tokens=1200,
        temperature=0.2,
    )

    raw = response.choices[0].message.content
    return _parse_response(raw)


def diagnose_gpt_stream(parsed: dict, retrieved: dict, api_key: str):
    """Streaming version — yields text chunks as they arrive."""
    client = openai.OpenAI(api_key=api_key)
    prompt = _build_prompt(parsed, retrieved)

    stream = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        max_tokens=1200,
        temperature=0.2,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


# ── Prompt ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert Python debugging assistant.
Analyse the error and source code, then respond using EXACTLY these section headers:

## ROOT CAUSE
(one paragraph)

## FIX
(corrected code in a ```python block```)

## EXPLANATION
(step-by-step reasoning)

## CONFIDENCE
HIGH, MEDIUM, or LOW
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
        code_block += f"### Context (±10 lines)\n```\n{retrieved['context_src']}\n```\n"

    return (
        "## Error Information\n" + error_block +
        "\n## Source Code\n" + (code_block or "_Source not found._")
    )


# ── Response parser ───────────────────────────────────────────────────────────

def _parse_response(text: str) -> dict:
    sections = {"root_cause": "", "fix": "", "explanation": "", "confidence": "MEDIUM", "raw": text}
    markers  = {"root_cause": "## ROOT CAUSE", "fix": "## FIX",
                 "explanation": "## EXPLANATION", "confidence": "## CONFIDENCE"}

    positions = {k: text.find(v) for k, v in markers.items() if text.find(v) != -1}
    sorted_keys = sorted(positions, key=lambda k: positions[k])

    for i, key in enumerate(sorted_keys):
        start = positions[key] + len(markers[key])
        end   = positions[sorted_keys[i + 1]] if i + 1 < len(sorted_keys) else len(text)
        sections[key] = text[start:end].strip()

    conf = sections["confidence"].upper()
    for level in ("HIGH", "MEDIUM", "LOW"):
        if level in conf:
            sections["confidence"] = level
            break
    return sections
