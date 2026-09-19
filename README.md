# AI Software Debugging Assistant

**Scan a Python project → get AST-verified issues, AI root-cause analysis, and ready-to-paste fixes.**

A local-first debugging platform that combines native Abstract Syntax Tree static analysis with GPT-4o reasoning, then compiles the results into a printable audit report (the *Mindora Intelligence Report*).

Built end-to-end by **Vignesh Pandiya G** — AI Engineer & Full-Stack Architect.

<img width="1470" height="956" alt="Mindora AI Debugging Assistant dashboard" src="https://github.com/user-attachments/assets/fad10a15-857f-4323-b5f5-ee994e0012d2" />

---

## Table of Contents

1. [Why this exists](#why-this-exists)
2. [How it works](#how-it-works)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Tech stack](#tech-stack)
6. [Quick start](#quick-start)
7. [Using the app](#using-the-app)
8. [What it detects](#what-it-detects)
9. [Examples](#examples)
10. [API reference](#api-reference)
11. [Project structure](#project-structure)
12. [Configuration](#configuration)
13. [Testing](#testing)
14. [Troubleshooting](#troubleshooting)
15. [FAQ](#faq)
16. [Limitations](#limitations)
17. [Roadmap](#roadmap)
18. [Contributing](#contributing)
19. [License](#license)
20. [Author](#author)

---

## Why this exists

Standard linters emit cryptic warnings with no context. Standard "paste it into ChatGPT" workflows have no AST grounding, burn tokens on files that were never broken, and confidently hallucinate fixes.

This tool separates the two jobs:

- **Static analysis runs locally and deterministically.** Every project file is parsed through Python's own `ast` and `py_compile`, so syntax errors and structural hazards are found with zero network calls, zero cost, and no false confidence.
- **The LLM only sees what the AST flagged.** GPT-4o receives the specific problem file plus its detected issues — not the whole repo. That keeps token consumption down by roughly an order of magnitude and keeps the model's reasoning anchored to verified findings.

---

## How it works

```
Select directory
      │
      ▼
Recursive .py traversal  ──►  py_compile (syntax gate)
      │
      ▼
AST NodeVisitor  ──►  9 static detectors  ──►  Issue list (instant, offline)
      │
      ▼
[optional] GPT-4o  ──►  root cause + corrected file + step-by-step rationale + confidence
      │
      ▼
Report compiler  ──►  letterhead, audit ref, metrics  ──►  Print / Save PDF
```

Static analysis works with no API key at all. The AI stage is opt-in, per file or batched across the project.

---

## Features

### Multi-vector AST static analysis
Parses the syntax tree directly — your code is never executed. Nine detectors run on every file, covering syntax failures, mutable default arguments, bare excepts, `== None` comparisons, builtin shadowing, unused imports, line-length violations, forgotten TODO/FIXME markers, and annotated functions that fall through without returning.

### AI root-cause reasoning
For any flagged file, GPT-4o returns four things: a plain-language root cause, a complete executable replacement file, a numbered breakdown of every modification, and a confidence rating (`HIGH` / `MEDIUM` / `LOW`). `Auto-Diagnose All` runs this across every flagged file in one pass.

### Visual directory browser
An in-app filesystem explorer replaces manual path typing. It sandboxes traversal, and skips `.git`, `.venv`, `node_modules`, `__pycache__`, and dotfiles.

### Certified audit report
The Report tab renders an executive letterhead with a generated reference ID (`MND-DIAG-YYYY-XXXX`), the scanned directory, the auditing user and role, timestamp, summary metrics, and syntax-highlighted before/after code. A dedicated `@media print` stylesheet strips all navigation and chrome for a clean PDF export.

### Authentication
Argon2id password hashing (`argon2-cffi`) with stateless HS256 JWTs on an 8-hour expiry. Users are stored file-backed in `backend/users.json`, so local multi-user testing needs no database. Self-service registration is available from the login modal; roles (`admin`, `developer`, `qa_lead`) carry through onto report attribution.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       FRONTEND — Next.js 16 + React 19                       │
│  ┌───────────────────┐  ┌────────────────────┐  ┌────────────────────────┐   │
│  │ Glassmorphic      │  │ Directory browser  │  │ Auth & registration UI │   │
│  │ dashboard + tabs  │  │ modal              │  │                        │   │
│  └─────────┬─────────┘  └─────────┬──────────┘  └───────────┬────────────┘   │
└────────────┼──────────────────────┼─────────────────────────┼────────────────┘
             │ REST                 │ GET /api/browse         │ JWT Bearer
             ▼                      ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND — FastAPI + Python 3.11+                        │
│  ┌───────────────────┐  ┌────────────────────┐  ┌────────────────────────┐   │
│  │ Argon2id + JWT    │  │ Filesystem sandbox │  │ Pydantic v2 contracts  │   │
│  └───────────────────┘  └────────────────────┘  └────────────────────────┘   │
│                                   │                                          │
│            ┌──────────────────────┴──────────────────────┐                   │
│            ▼                                             ▼                   │
│  ┌───────────────────────┐                  ┌──────────────────────────┐     │
│  │ AST static engine     │                  │ AI reasoning engine      │     │
│  │ • py_compile          │                  │ • OpenAI GPT-4o          │     │
│  │ • ast.NodeVisitor     │                  │ • single + batch modes   │     │
│  │ • 9 detectors         │                  │ • fixed code + diff      │     │
│  └───────────────────────┘                  └──────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech stack

### Frontend

| Technology | Role |
|---|---|
| Next.js 16 (Turbopack) | App Router, static optimization, sub-second builds |
| React 19 + TypeScript 5 | Strict compile-time safety and type-safe API calls |
| Framer Motion 13 | Spring transitions, animated metric counters, accordion drawers |
| CSS Modules | Bespoke glassmorphism, `backdrop-filter: blur(16px)`, translucent badges |
| Custom highlighter | Zero-dependency Python tokenizer for keywords, builtins, strings, comments, decorators |
| `@media print` engine | Executive letterhead layout for one-click PDF export |

### Backend

| Technology | Role |
|---|---|
| Python 3.11+ | Runtime, aligned with modern AST specifications |
| FastAPI | Async ASGI REST layer with auto-generated OpenAPI docs |
| Uvicorn | ASGI server, hot reload in development |
| Pydantic v2 | Request validation and diagnostic report serialization |
| `ast` + `py_compile` | Standard-library static analysis — no heavy external tooling |
| OpenAI GPT-4o | Structured JSON root causes, corrected code, explanations |

### Security

| Technology | Role |
|---|---|
| Argon2id (`argon2-cffi`) | Credential hashing, resistant to GPU/ASIC attack |
| PyJWT (HS256) | Signed stateless bearer tokens, 8-hour expiry |
| `backend/users.json` | File-backed user store for local multi-user testing |
| Traversal sandbox | Blocks path-traversal, hides sensitive dotfiles |

---

## Quick start

### Prerequisites

- Python 3.11 or newer — check with `python3 --version`
- Node.js 18+ and npm — check with `node --version`
- An OpenAI API key — **optional**; static analysis runs fully offline without one

### 1. Clone

```bash
git clone <repo-url>
cd ai-debug-assistant
```

### 2. Backend

```bash
pip install -r backend/requirements.txt
```

Create `backend/.env`:

```env
OPENAI_API_KEY=sk-your-actual-key-here
JWT_SECRET=change-this-to-a-long-random-string
```

Launch on port 8001:

```bash
python3 -m uvicorn backend.server:app --port 8001 --reload
```

Confirm it's healthy:

```bash
curl http://localhost:8001/api/health
# {"status":"ok"}
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev -- --port 3000
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001
```

### 4. Sign in

Open **http://localhost:3000**.

| Username | Password |
|---|---|
| `admin` | `admin123` |

> ⚠️ These are seed credentials for local evaluation only. Change or delete them before exposing the service on any network, and set a real `JWT_SECRET`.

Or click **Register Account** to create your own profile.

### 5. First scan

1. Click **Browse** and select the bundled `sample_project/` folder.
2. Click **Run scan** — AST results appear immediately.
3. Click **Analyze with AI** on a file, or **Auto-Diagnose All Files with AI**.
4. Open the **Report** tab and click **Print / Save PDF**.

---

## Using the app

The dashboard has three tabs:

**Scan** — pick a directory, run the AST pass, see per-file issue counts and severity.

**Issues** — every detected issue with file, line number, detector name, and description. Trigger AI analysis from here, individually or in bulk.

**Report** — the compiled letterhead: audit reference, scanned target, user and role, timestamp, summary metrics, root causes, and side-by-side original/corrected code.

---

## What it detects

| Detector | Catches |
|---|---|
| `SyntaxError` | Files that fail `py_compile` before runtime |
| `BareExcept` | `except:` blocks that swallow `KeyboardInterrupt` and `SystemExit` |
| `MutableDefault` | `def append_to(item, target=[])` — state that persists across calls |
| `NoneComparison` | `== None` instead of `is None` |
| `BuiltinShadow` | Variables named `list`, `dict`, `id`, `type`, `len` |
| `UnusedImport` | Imports never referenced in the module AST |
| `LineTooLong` | Configurable limit (PEP 8 default: 120 characters) |
| `TodoComment` | Forgotten `# TODO`, `# FIXME`, `# HACK`, `# BUG` markers |
| `MissingReturn` | Return-annotated functions that exit without a value |

The AI layer goes further, surfacing things the AST can't know: missing existence checks, calls to functions that aren't defined, attribute access on objects that may not have it, and incorrect test doubles.

---

## Examples

### Missing existence checks

**Original:**

```python
texts.append(build_profile_text(cleaned))
logger.info(f"Generating embeddings for {len(texts)} profile texts...")
embeddings = encode_profiles(texts)
logger.info(f"Embeddings generated with shape: {embeddings.shape}")
```

**Findings:**

| Line | Issue |
|---|---|
| 13 | `parse_list_field` may not exist in `backend.profile_processor` |
| 31 | `raw_dict.get("skills")` is passed on without a `None` check |
| 38 | `encode_profiles` is assumed to return something with `.shape` |

**Fix:**

```python
skills = parse_list_field(raw_dict["skills"]) if "skills" in raw_dict else []

if hasattr(embeddings, "shape"):
    logger.info(f"Embeddings generated with shape: {embeddings.shape}")
```

### Incorrect test double

**Original:**

```python
def test_get_device():
    device = get_device()
    assert device in ["cpu", "cuda", "mps"]
```

**Findings:**

| Line | Issue |
|---|---|
| 18 | `monkeypatch.setattr` target must be the real import path |
| 18 | The lambda returns the class, not an instance of `DummyModel` |

**Fix:**

```python
def test_get_device(monkeypatch):
    def mock_model():
        return DummyModel()  # instance, not the class

    monkeypatch.setattr("module.load_embedding_model", mock_model)
    device = get_device()
    assert device in ["cpu", "cuda", "mps"]
```

---

## API reference

Base URL: `http://localhost:8001`

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create an account with an Argon2id hash | — |
| `POST` | `/api/auth/login` | Exchange credentials for a JWT | — |
| `GET` | `/api/auth/me` | Validate session, return current user | Bearer |
| `GET` | `/api/auth/users` | List registered accounts and roles | Bearer |
| `GET` | `/api/auth/public-users` | Public user directory (demo endpoint) | — |
| `GET` | `/api/browse?path=/` | Traverse local directories safely | Bearer |
| `POST` | `/api/scan` | Run full AST static analysis on a directory | Bearer |
| `POST` | `/api/analyze` | GPT-4o root cause + fixed code for one file | Bearer |
| `POST` | `/api/analyze-all` | Batch-analyze every flagged file | Bearer |
| `GET` | `/api/health` | Health check → `{"status": "ok"}` | — |

Interactive OpenAPI docs are served at `http://localhost:8001/docs`.

### Example: authenticate and scan

```bash
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .access_token)

curl -X POST http://localhost:8001/api/scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"/absolute/path/to/sample_project"}'
```

---

## Project structure

```
ai-debug-assistant/
├── backend/
│   ├── server.py                  FastAPI application & REST routing
│   ├── auth.py                    Argon2id hashing, JWT lifecycle
│   ├── ai_analyzer.py             GPT-4o integration (single & batch)
│   ├── users.json                 Persistent credential & role store
│   ├── requirements.txt           Backend dependencies
│   ├── .env                       Secrets — never commit
│   ├── .env.example               Template
│   └── src/
│       ├── scanner.py             AST NodeVisitor static engine
│       ├── report.py              Report compiler & metrics aggregator
│       ├── log_parser.py          Stack trace / runtime log ingestion
│       ├── code_retriever.py      Local code context extraction
│       └── test_runner.py         Test execution & patch validation
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           Dashboard — Scan, Issues, Report tabs
│   │   │   ├── page.module.css    Glassmorphic styles + print stylesheet
│   │   │   ├── layout.tsx         Root layout, Geist font config
│   │   │   ├── globals.css        CSS variables, animations, theme baseline
│   │   │   └── login/
│   │   │       ├── page.tsx       Landing page, docs accordion, auth modal
│   │   │       └── login.module.css
│   │   ├── components/
│   │   │   └── AnimatedText.tsx   Framer Motion spring text animator
│   │   └── lib/
│   │       ├── api.ts             Type-safe backend client
│   │       ├── auth.ts            Browser session & token manager
│   │       └── types.ts           Shared domain models
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.local                 NEXT_PUBLIC_API_URL
│
├── sample_project/                Seeded demo project with real bugs
│   ├── inventory.py               Mutable defaults, bare except, unused imports
│   ├── order_processor.py         Syntax anomalies, None comparisons
│   └── test_inventory.py          Tests demonstrating the bugs' impact
│
└── README.md
```

---

## Configuration

### Backend — `backend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | Enables AI diagnosis; omit for offline-only mode |
| `JWT_SECRET` | dev fallback | HS256 signing key — **set this in any shared deployment** |
| `JWT_EXPIRY_HOURS` | `8` | Token lifetime |
| `OPENAI_MODEL` | `gpt-4o` | Swap for `gpt-4` or `gpt-4o-mini` |
| `REQUEST_TIMEOUT` | `60` | Seconds to wait on the OpenAI API |
| `MAX_LINE_LENGTH` | `120` | Threshold for the `LineTooLong` detector |

### Frontend — `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8001
```

### Changing ports

Backend: `python3 -m uvicorn backend.server:app --port 9001 --reload`
Frontend: `npm run dev -- --port 4000` (and update `NEXT_PUBLIC_API_URL` to match)

---

## Testing

```bash
# Backend suite
cd backend
python -m pytest tests/ -v

# Single module
python -m pytest tests/test_scanner.py -v

# With coverage
python -m pytest tests/ --cov=src --cov-report=term-missing
```

Frontend type checking:

```bash
cd frontend
npx tsc --noEmit
```

---

## Troubleshooting

**"Can't connect to backend"**
Confirm uvicorn is running and `curl http://localhost:8001/api/health` returns `{"status":"ok"}`. Check that `NEXT_PUBLIC_API_URL` matches the backend port — Next.js only reads `.env.local` at startup, so restart the dev server after editing it.

**"API key error" / AI analysis returns nothing**
Verify `OPENAI_API_KEY` is set in `backend/.env` and restart the backend. Static scanning will keep working regardless.

**401 Unauthorized on `/api/scan`**
Your JWT expired (8-hour lifetime). Sign out and back in.

**"Port already in use"**
`lsof -ti:8001 | xargs kill -9`, or start on a different port.

**"Command not found: python"**
Use `python3` on macOS and most Linux distributions.

**Scan finds nothing in a directory you know is broken**
Confirm the path is absolute and contains `.py` files outside the ignore list (`.git`, `.venv`, `node_modules`, `__pycache__`).

**Still stuck**
Read the uvicorn terminal output — FastAPI logs the full traceback. Then test against `sample_project/`, which is known to produce findings.

---

## FAQ

**Why AST plus AI rather than AI alone?**
Scanning a whole repo with an LLM is slow, expensive, and non-deterministic. Local AST analysis finds structural issues instantly and precisely; GPT-4o is then applied only to the isolated problem segments. That cuts token consumption by over 90% and grounds the model in verified language rules instead of guesswork.

**Is my source code sent to external servers?**
Static analysis, directory traversal, authentication, and reporting are entirely local. Only when you explicitly click *Analyze with AI* is that single file plus its detected issues transmitted over TLS to OpenAI. Run without an API key for a fully offline workflow.

**What does it cost?**
The static engine is free. AI analysis is billed by OpenAI, typically a few cents per file.

**Can I use it on production code?**
As an assistant, yes. As an autopilot, no — always read and test suggested fixes before merging.

**How do I integrate it into CI/CD?**
`POST /api/scan` returns strongly typed JSON. GitHub Actions or GitLab CI can call it as a quality gate, failing pull requests that introduce high-severity findings, and archive the generated report as a build artifact.

**Can I analyze multiple files at once?**
Yes — `Auto-Diagnose All Files with AI` batches every flagged file in the scanned project.

**Can I use a different model?**
Set `OPENAI_MODEL` in `backend/.env` and restart.

**How long does analysis take?**
The AST pass is effectively instant. AI analysis is typically 5–30 seconds per file, depending on size and API latency.

---

## Limitations

- Python only — other languages are not yet parsed.
- Files over 1 MB are skipped.
- Custom frameworks and heavy metaprogramming will confuse the AI layer.
- Suggested fixes need human review; they are not guaranteed correct.
- Not a security scanner — it will not reliably find injection flaws, secrets, or auth bugs.
- `users.json` is a local-testing store, not a production identity system.

---

## Roadmap

**Near term**
- JavaScript and TypeScript support
- Multi-file upload without a local directory
- Faster batch analysis via concurrent requests
- Persisted scan history

**Later**
- VS Code extension
- GitHub App with inline PR comments
- Java and Go detectors
- Feedback loop that learns which suggestions were accepted

---

## Contributing

- **Bugs:** open an issue with the file, the detector, and what you expected.
- **Features:** open a pull request; new detectors belong in `backend/src/scanner.py`.
- **Testing:** try it on real projects and report false positives — those are the most useful reports.

---

## License

MIT — use it however you want.

---

## Author

**Vignesh Pandiya G** — AI Engineer & Full-Stack Architect
Chennai, Tamil Nadu · B.Tech in Artificial Intelligence & Data Science

Complete end-to-end system design: FastAPI backend, Next.js 16 frontend, AST static engine, and GPT-4o reasoning integration.

Specializations: autonomous multi-agent AI systems, AST-based code analysis, high-performance full-stack applications.
