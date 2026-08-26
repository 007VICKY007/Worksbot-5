# AI Software Debugging Assistant

An AI-powered system that ingests application logs, stack traces, and source
code; identifies the likely root cause of a failure; retrieves the relevant
code context; proposes a fix; and validates that fix with automated tests.

---

## 1. Problem Statement

Developers spend a large share of their time reading logs, tracing errors
back to source lines, and manually verifying fixes. This project automates
that loop:

```
Logs / Stack Trace / Source Code
        │
        ▼
 1. Ingestion & Parsing
        │
        ▼
 2. Context Retrieval (RAG over codebase)
        │
        ▼
 3. Root Cause Diagnosis (LLM reasoning)
        │
        ▼
 4. Fix Suggestion (patch / diff)
        │
        ▼
 5. Automated Test Generation & Validation
        │
        ▼
   Verified Fix + Debugging Report
```

---

## 2. Goals

- Accept raw logs, stack traces, and a source repository as input.
- Parse and normalize errors into a structured format regardless of
  language/log format.
- Retrieve the exact files/functions relevant to the failure using
  embedding-based semantic search over the codebase.
- Diagnose the likely root cause with supporting evidence (file, line,
  reasoning).
- Propose a concrete code fix as a unified diff / patch.
- Automatically generate and run tests to validate the fix before
  presenting it to the developer.
- Produce a human-readable debugging report summarizing the whole process.

## 3. Non-Goals

- Fully autonomous, unsupervised code deployment (a human reviews/approves
  the final patch).
- Support for every programming language on day one — the reference
  implementation targets Python and JavaScript/TypeScript first, with a
  pluggable parser layer for others.

---

## 4. Architecture

### 4.1 Components

| Component | Responsibility |
|---|---|
| **Ingestion Service** | Accepts logs/stack traces/source code (file upload, API, or CLI). Normalizes into `LogEntry` / `StackTrace` schema. |
| **Parser Layer** | Language-specific stack trace parsers (Python traceback, Java exception, Node.js stack, generic regex fallback). |
| **Retrieval Engine (RAG)** | Chunks and embeds the source repository; performs vector + keyword hybrid search to fetch the code relevant to the failing frame. |
| **Diagnosis Engine** | LLM-driven reasoning step that combines the parsed error, retrieved code, and (optionally) recent git history to produce a root-cause hypothesis with a confidence score. |
| **Fix Engine** | Generates a candidate patch (unified diff) addressing the diagnosed root cause. Can propose multiple candidates ranked by confidence. |
| **Test Runner / Validator** | Applies the patch in an isolated sandbox, generates/executes regression + reproduction tests, and reports pass/fail. |
| **Report Generator** | Produces a structured Markdown/JSON debugging report: root cause, evidence, patch, test results. |
| **Orchestrator / API** | Coordinates the pipeline end-to-end; exposes a REST API and optional CLI. |

### 4.2 High-Level Flow

```
POST /api/v1/debug
   │
   ▼
IngestionService.parse(logs, stack_trace, repo_ref)
   │
   ▼
RetrievalEngine.get_context(parsed_error)  ──► top-k relevant code chunks
   │
   ▼
DiagnosisEngine.diagnose(parsed_error, context) ──► RootCauseHypothesis
   │
   ▼
FixEngine.generate_fix(hypothesis, context) ──► FixSuggestion (diff)
   │
   ▼
TestRunner.validate(fix, repo_ref) ──► TestResult
   │
   ▼
ReportGenerator.build(hypothesis, fix, test_result) ──► DebugReport
```

### 4.3 Tech Stack (reference implementation)

- **Language:** Python 3.11+
- **LLM access:** Anthropic Claude API (`claude-sonnet-4-6` or configured
  model) via the Messages API, used for diagnosis and fix generation.
- **Embeddings / Vector store:** any of FAISS / Chroma / pgvector for code
  retrieval (pluggable).
- **API layer:** FastAPI
- **Sandbox execution:** Docker container per validation run (isolation +
  reproducibility).
- **Test frameworks supported:** pytest (Python), Jest (JS/TS) — pluggable
  adapter pattern for others.
- **Storage:** SQLite/Postgres for run history; object storage for
  artifacts (patches, reports).

---

## 5. Project Structure

```
ai-debug-assistant/
├── README.md
├── schemas/                     # JSON Schemas for all data contracts
│   ├── log_entry.schema.json
│   ├── stack_trace.schema.json
│   ├── code_context.schema.json
│   ├── diagnosis.schema.json
│   ├── fix_suggestion.schema.json
│   ├── test_result.schema.json
│   └── debug_report.schema.json
├── src/
│   ├── ingestion/                # Log & stack trace parsing/normalization
│   ├── retrieval/                # Code chunking, embedding, RAG search
│   ├── diagnosis/                # LLM-based root cause analysis
│   ├── fix_engine/                # Patch/diff generation
│   ├── testing/                  # Sandbox execution + test validation
│   └── api/                      # FastAPI app / orchestrator / CLI
├── tests/                        # Unit + integration tests for the tool itself
├── data/
│   └── sample_logs/              # Example logs/stack traces for demos
└── docs/
    ├── architecture.md
    └── evaluation.md
```

---

## 6. Data Contracts (Schemas)

All inter-component data is validated against JSON Schemas in `/schemas`.
Summary of each:

| Schema | Purpose |
|---|---|
| `log_entry.schema.json` | A single normalized log line (timestamp, level, service, message, metadata). |
| `stack_trace.schema.json` | Parsed exception/stack trace with ordered frames (file, line, function). |
| `code_context.schema.json` | Retrieved code chunks with file path, line range, and relevance score. |
| `diagnosis.schema.json` | Root cause hypothesis, confidence, supporting evidence references. |
| `fix_suggestion.schema.json` | Proposed patch as a unified diff, plus rationale and risk level. |
| `test_result.schema.json` | Outcome of automated validation (pass/fail, logs, coverage delta). |
| `debug_report.schema.json` | Top-level report tying everything together for the developer. |

See `/schemas/*.json` for full definitions.

---

## 7. Pipeline Detail

### 7.1 Ingestion
- Accepts: raw log files (`.log`, `.txt`), JSON-structured logs, stack
  trace text, and a reference to the source repo (local path or git URL).
- Normalizes every log line into a `LogEntry`.
- Detects the exception/stack trace segment and parses it into a
  `StackTrace` object (ordered frames: file, line number, function name,
  code snippet if available).

### 7.2 Retrieval (RAG)
- On first run against a repo, the codebase is chunked (function/class
  granularity) and embedded into a vector store.
- Given a `StackTrace`, the top failing frame(s) are used as anchor points;
  the engine retrieves:
  - the exact function/file at the failure line,
  - semantically similar code (e.g., other callers, similar utility
    functions),
  - relevant tests already covering that code path.
- Output: ranked list of `CodeContext` chunks.

### 7.3 Diagnosis
- The Diagnosis Engine sends the structured error + retrieved context to
  the LLM with a constrained prompt requiring:
  - a root cause statement,
  - a confidence score (0–1),
  - supporting evidence (specific file/line references — no invented
    files),
  - alternative hypotheses if confidence is low.
- Output validated against `diagnosis.schema.json`.

### 7.4 Fix Generation
- Given the diagnosis, the Fix Engine asks the LLM to produce a minimal,
  targeted unified diff.
- Multiple candidate fixes may be generated and ranked by predicted risk
  (e.g., "low risk: null check" vs. "high risk: refactor function
  signature").

### 7.5 Automated Testing / Validation
- The candidate patch is applied to a throwaway branch/sandbox container.
- Steps:
  1. Run existing test suite (regression check).
  2. Generate a reproduction test from the original stack trace if one
     doesn't already exist, confirm it fails on the *unpatched* code and
     passes on the *patched* code.
  3. Record pass/fail, execution logs, and coverage delta.
- Only fixes that pass validation are marked `verified` in the report;
  others are returned as `unverified — needs human review`.

### 7.6 Reporting
- Combines diagnosis + fix + test result into a single `DebugReport`
  (Markdown for humans, JSON for machine consumption / CI integration).

---

## 8. API (reference)

```
POST /api/v1/debug
  Body: { logs, stack_trace, repo_ref, language? }
  Returns: DebugReport (may be async — returns a job_id for long-running runs)

GET /api/v1/debug/{job_id}
  Returns: current status + DebugReport when complete

GET /api/v1/debug/{job_id}/patch
  Returns: the raw unified diff of the (best) verified fix
```

---

## 9. Evaluation Plan

To demonstrate the assistant works, the submission includes:

1. A set of **sample bugs** (in `data/sample_logs/`) seeded into a small
   demo repository, each with a known root cause and known fix.
2. A script that runs the full pipeline against each sample and reports:
   - **Root cause accuracy** — did the diagnosis point to the correct
     file/line?
   - **Fix success rate** — did the generated patch pass validation?
   - **False positive rate** — cases where a fix was marked verified but
     didn't actually resolve the original error.
3. Latency and cost metrics per pipeline run (LLM calls, tokens used).

See `docs/evaluation.md` for the full rubric.

---

## 10. Setup

```bash
git clone <repo-url>
cd ai-debug-assistant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-...

# Run the API
uvicorn src.api.main:app --reload

# Or run via CLI
python -m src.api.cli --logs data/sample_logs/example1.log \
                       --repo ./sample-repo
```

---

## 11. Roadmap / Stretch Goals

- [ ] Multi-language stack trace parsers (Java, Go, Rust)
- [ ] IDE plugin (VS Code) for inline "Explain & Fix" actions
- [ ] CI integration: auto-comment a suggested fix on failing pipeline runs
- [ ] Learning loop: track which suggested fixes were accepted/rejected by
      developers to improve future ranking
- [ ] Support for flaky-test detection vs. genuine regressions

---

## 12. Deliverables Checklist (Internship Submission)

- [x] README with architecture, schemas, and setup instructions
- [x] JSON Schemas for all data contracts
- [ ] Working implementation of ingestion + parsing
- [ ] Working implementation of retrieval (RAG)
- [ ] Working implementation of diagnosis + fix generation
- [ ] Automated test validation module
- [ ] Sample bug set + evaluation report
- [ ] Demo (CLI or short recording) showing an end-to-end run
# Worksbot-5
