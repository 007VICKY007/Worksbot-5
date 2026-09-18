

import os
import sys
import re
import tempfile
from pathlib import Path

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv

# ── Load environment variables ────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.getenv("OPENAI_MODEL", "gpt-4o")
FLASK_PORT     = int(os.getenv("FLASK_PORT", 8000))

# ── Make src/ importable ──────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent / "src"))

from log_parser      import parse_log
from code_retriever  import retrieve_code
from diagnose_openai import diagnose_gpt_stream, _parse_response
from fix_generator   import extract_fixed_code
from test_runner     import run_tests

# ── Project paths ─────────────────────────────────────────────────────────────
_ROOT          = Path(__file__).parent.parent
SAMPLE_LOG     = str(_ROOT / "data" / "sample_logs" / "example1.log")
SAMPLE_SRC     = str(_ROOT / "sample_project")

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "model": OPENAI_MODEL})


# ── Analyse uploaded Python code directly ─────────────────────────────────────
@app.post("/api/analyse-code")
def analyse_code():
    """
    Body (JSON):
        filename  : str  — original filename
        code      : str  — full source code text

    Returns streaming NDJSON:
        { "type": "chunk",  "text": "..." }   (while GPT streams)
        { "type": "result", "data": {...}  }  (final parsed result)
    """
    body     = request.get_json(force=True)
    filename = body.get("filename", "code.py")
    code     = body.get("code", "")

    if not code.strip():
        return jsonify({"error": "No code provided"}), 400

    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not configured"}), 500

    def generate():
        import openai, json

        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        system = """You are an expert Python code reviewer and debugger.
Analyse the code and respond using EXACTLY these section headers:

## BUGS FOUND
List every bug with the line number.

## ROOT CAUSE
One paragraph explaining the main root cause.

## FIXED CODE
The complete corrected file in a ```python block```.

## EXPLANATION
Step-by-step explanation of every fix.

## CONFIDENCE
HIGH, MEDIUM, or LOW"""

        prompt = f"### File: {filename}\n\n```python\n{code}\n```"
        chunks = []

        try:
            stream = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": prompt},
                ],
                max_tokens=2000,
                temperature=0.2,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    chunks.append(delta)
                    yield json.dumps({"type": "chunk", "text": delta}) + "\n"

            raw    = "".join(chunks)
            result = _parse_gpt_response(raw)
            yield json.dumps({"type": "result", "data": result}) + "\n"

        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return Response(
        stream_with_context(generate()),
        mimetype="application/x-ndjson",
    )


# ── Analyse log file ──────────────────────────────────────────────────────────
@app.post("/api/analyse-log")
def analyse_log():
    """
    Body (multipart/form-data):
        log_file   : file  — the crash log
        source_dir : str   — path to source folder on server

    Returns JSON with parsed + retrieved + diagnosis.
    """
    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not configured"}), 500

    source_dir = request.form.get("source_dir", "")
    log_file   = request.files.get("log_file")

    if not log_file:
        return jsonify({"error": "No log file uploaded"}), 400
    if not source_dir:
        return jsonify({"error": "source_dir is required"}), 400

    # Save uploaded log to a temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
    log_file.save(tmp.name)
    tmp.close()

    try:
        parsed    = parse_log(tmp.name)
        retrieved = retrieve_code(source_dir, parsed)

        # Collect GPT stream into full response
        chunks = []
        for chunk in diagnose_gpt_stream(parsed, retrieved, api_key=OPENAI_API_KEY):
            chunks.append(chunk)
        diagnosis = _parse_response("".join(chunks))

        fixed_code = extract_fixed_code(diagnosis)

        return jsonify({
            "parsed":     parsed,
            "retrieved": {
                "found":       retrieved["found"],
                "file_path":   retrieved.get("file_path", ""),
                "context_src": retrieved.get("context_src", ""),
                "function_src":retrieved.get("function_src", ""),
            },
            "diagnosis":  diagnosis,
            "fixed_code": fixed_code,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp.name)


# ── Demo endpoint ─────────────────────────────────────────────────────────────
@app.post("/api/demo")
def run_demo():
    """Run the built-in demo (sample_project + example1.log)."""
    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not configured"}), 500

    if not Path(SAMPLE_LOG).exists():
        return jsonify({"error": "Demo log not found"}), 404

    try:
        parsed    = parse_log(SAMPLE_LOG)
        retrieved = retrieve_code(SAMPLE_SRC, parsed)
        chunks    = []
        for chunk in diagnose_gpt_stream(parsed, retrieved, api_key=OPENAI_API_KEY):
            chunks.append(chunk)
        diagnosis  = _parse_response("".join(chunks))
        fixed_code = extract_fixed_code(diagnosis)

        return jsonify({
            "parsed":     parsed,
            "retrieved": {
                "found":        retrieved["found"],
                "file_path":    retrieved.get("file_path", ""),
                "context_src":  retrieved.get("context_src", ""),
                "function_src": retrieved.get("function_src", ""),
            },
            "diagnosis":  diagnosis,
            "fixed_code": fixed_code,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Run tests ─────────────────────────────────────────────────────────────────
@app.post("/api/run-tests")
def run_tests_endpoint():
    body     = request.get_json(force=True)
    test_dir = body.get("test_dir", "")
    if not test_dir or not Path(test_dir).exists():
        return jsonify({"error": "Invalid test_dir"}), 400
    result = run_tests(test_dir, working_dir=test_dir)
    return jsonify(result)


# ── GPT response parser ───────────────────────────────────────────────────────
def _parse_gpt_response(text: str) -> dict:
    markers = {
        "bugs":        "## BUGS FOUND",
        "root_cause":  "## ROOT CAUSE",
        "fixed_code":  "## FIXED CODE",
        "explanation": "## EXPLANATION",
        "confidence":  "## CONFIDENCE",
    }
    positions   = {k: text.find(v) for k, v in markers.items() if text.find(v) != -1}
    sorted_keys = sorted(positions, key=lambda k: positions[k])
    sections    = {k: "" for k in markers}
    sections["raw"] = text

    for i, key in enumerate(sorted_keys):
        start = positions[key] + len(markers[key])
        end   = positions[sorted_keys[i + 1]] if i + 1 < len(sorted_keys) else len(text)
        sections[key] = text[start:end].strip()

    conf = sections.get("confidence", "MEDIUM").upper()
    for level in ("HIGH", "MEDIUM", "LOW"):
        if level in conf:
            sections["confidence"] = level
            break
    return sections


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(port=FLASK_PORT, debug=True)
