<<<<<<< HEAD
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
=======
# Mindora Intelligence Report &middot; Universal AI Software Debugging Assistant

> **An enterprise-grade, polyglot automated code debugging, static analysis, and AI Intellectual root-cause remediation platform.**  
> **Architected and Developed End-to-End by:** **Vignesh Pandiya G** (AI Engineer & Full-Stack Architect)

---

## 🌟 Executive Summary

Modern software development teams lose between **40% and 60% of their active engineering hours** locating, diagnosing, and repairing code regressions, syntax failures, and runtime hazards across polyglot microservices. Standard linters only output cryptic warnings without context, while naive generative AI prompts lack abstract syntax tree (AST) grounding and frequently hallucinate broken code.

The **Mindora AI Software Debugging Assistant** automates the entire debugging lifecycle end-to-end:
1. **Universal Multi-Language Ingestion:** Automatically detects and analyzes code across **16+ languages** (Python, JavaScript, TypeScript, Java, C, C++, C#, Go, Rust, PHP, Kotlin, Swift, Dart, Ruby, SQL, Shell/Bash).
2. **Deterministic Multi-Vector Static Detection:** Evaluates 9 defect categories (Syntax Errors, Security Vulnerabilities, Logic Defects, Runtime Hazards, Code Quality, Performance Bottlenecks, Resource Leaks, Concurrency Bugs, and Type Safety).
3. **AI Intellectual Deep Code Comprehension (GPT-4o):** Understands the entire architecture and logic flow of every code file (whether buggy or pristine), identifies root causes, and generates complete, correct replacement files.
4. **Deterministic Sandbox Validation Loop:** Automatically compiles and validates generated fixes in an isolated sandbox for up to 3 repair cycles, guaranteeing `VERIFIED` status before code is accepted.
5. **1-Click Verified Fix Deployment:** Applies verified fixes directly to disk with an automatic `.bak` safety backup and live re-scan.
6. **MongoDB Enterprise Persistence:** Automatically stores user profiles, credential hashes, and complete scan audit trails in MongoDB (`mongodb://localhost:27017/`, DB: `mindora_debug_assistant`) with local disk backup failover.
7. **Dedicated Administrator Supervision Portal (`/admin`):** Isolated administrative console tracking all tested files, execution timestamps (Date & Time), user account details, and full audit logs.
8. **Executive Certified Audit Reports:** Generates an official, print-ready **Mindora Intelligence Report** letterhead complete with unique audit reference codes, verified file breakdowns, official certification stamps, and executive sign-off.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 16 + React 19)                          │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────┐  │
│  │   Mindora Glassmorphic  │  │ Interactive OS Folder  │  │ Direct /admin Portal    │  │
│  │    Workspace & Tabs     │  │       Browser Modal    │  │ (Audit Trail & Users)   │  │
│  └────────────┬────────────┘  └───────────┬────────────┘  └───────────┬─────────────┘  │
└───────────────┼───────────────────────────┼───────────────────────────┼────────────────┘
                │ HTTP / REST               │ GET /api/browse           │ JWT Bearer (Admin)
                ▼                           ▼                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (FastAPI + Python 3.11+ / 3.14)                   │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────┐  │
│  │   Argon2id + JWT Auth   │  │   Filesystem Sandbox   │  │ Pydantic v2 Contracts   │  │
│  │   & MongoDB Sync Engine │  │   & Traversal Security │  │ (Validation & Schemas)  │  │
│  └────────────┬────────────┘  └───────────┬────────────┘  └───────────┬─────────────┘  │
│               │                           │                           │                │
│               ▼                           ▼                           ▼                │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────┐  │
│  │ Universal Static Engine │  │ Sandbox Fix Validator  │  │ AI Intellectual Engine  │  │
│  │ • 16+ Languages Auto-ID │  │ • 3-Cycle Auto Repair  │  │ • OpenAI GPT-4o Polyglot│  │
│  │ • AST & Syntax Checkers │  │ • Compiler Verification│  │ • Parallel Thread Pool  │  │
│  │ • 9 Defect Categories   │  │ • Unified Diff Engine  │  │ • Root Cause & Fix Gen  │  │
│  └────────────┬────────────┘  └───────────┬────────────┘  └───────────┬─────────────┘  │
└───────────────┼───────────────────────────┼───────────────────────────┼────────────────┘
                │                           │                           │
                ▼                           ▼                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PERSISTENCE & AUDIT STORAGE                               │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ MongoDB 8+ (mongodb://localhost:27017/ -> mindora_debug_assistant)              │  │
│  │   • users collection: credentials, roles, timestamps                             │  │
│  │   • audit_scans collection: tested files, timestamps, issues, AI analyses        │  │
│  │   • error_memory_vectors: 1536-dim vector store, past tested errors, proven fixes│  │
│  │ Dual-Write Disk Failover: backend/users.json & backend/audit_logs.json           │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
>>>>>>> da512a6 (Update workflows, QA testing and authentication)
```

---

<<<<<<< HEAD
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
=======
## 💻 Technology Stack

### 1. Frontend Architecture
| Technology | Role & Capabilities |
|---|---|
| **Next.js 16 (Turbopack)** | Enterprise React framework with App Router, static page optimization, and instant compilation. |
| **React 19 & TypeScript 5** | Strict compile-time type safety preventing regressions, fully typed domain models. |
| **Framer Motion 13** | Smooth spring physics micro-interactions, animated metric counters, and collapsible cards. |
| **Acrylic Glassmorphism** | Apple-inspired translucent glass UI (`backdrop-filter: blur(16px)`), modern pill badges, SVG icons (zero emojis). |
| **Multi-Language Syntax Highlighter** | Zero-dependency syntax tokenizer highlighting Python, JavaScript, TypeScript, C, Go, Rust, Java, and SQL. |
| **Print & PDF Engine** | Dedicated `@media print` corporate audit letterhead layout for instant PDF export. |

### 2. Backend Architecture
| Technology | Role & Capabilities |
|---|---|
| **Python 3.11+ / 3.14** | Modern Python execution runtime ensuring maximum AST and standard library performance. |
| **FastAPI** | High-speed asynchronous ASGI REST API engine with auto-generated OpenAPI documentation. |
| **Uvicorn** | Production-ready ASGI server handling high-throughput asynchronous requests and hot-reloading. |
| **Pydantic v2** | Data contract validation and schema enforcement for incoming requests and diagnostic reports. |
| **Python `ast` & Compilers** | Standard-library static AST parser and multi-language syntax verification engines. |
| **OpenAI GPT-4o Integration** | Deep reasoning model prompting that returns structured root causes, code fixes, and explanations. |
| **ThreadPoolExecutor** | Concurrent multi-threaded batch AI analyzer processing multiple codebase files in parallel. |

### 3. Database & Security Architecture
| Technology | Role & Capabilities |
|---|---|
| **MongoDB 8+ (`pymongo`)** | Primary document database storing user credentials and persistent test audit logs. |
| **Argon2id (`argon2-cffi`)** | Winner of the Password Hashing Competition; military-grade cryptographic password protection. |
| **JSON Web Tokens (PyJWT)** | Cryptographically signed bearer tokens (HS256) with 8-hour expiry for stateless security. |
| **Role-Based Access Control** | Strictly separates public developers/QA testers from the `/admin` supervisory console. |
| **Disk Backup Failover** | Dual-write synchronization to `users.json` and `audit_logs.json` ensures zero downtime if DB is paused. |

---

## 🚀 Key Features

### 1. Universal Multi-Language Support
Detects and diagnoses code across 16+ languages automatically:
- **Python** (`.py`)
- **JavaScript & TypeScript** (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`)
- **Java** (`.java`)
- **C & C++** (`.c`, `.h`, `.cpp`, `.hpp`, `.cc`)
- **C#** (`.cs`)
- **Go** (`.go`)
- **Rust** (`.rs`)
- **PHP** (`.php`)
- **Kotlin** (`.kt`, `.kts`)
- **Swift** (`.swift`)
- **Dart** (`.dart`)
- **Ruby** (`.rb`)
- **SQL** (`.sql`)
- **Shell / Bash** (`.sh`, `.bash`)

### 2. AI Intellectual Deep Code Comprehension
- **Understands All Code:** Analyzes the architectural intent, logic flow, and runtime behavior of every code file.
- **Evaluates Buggy and Clean Code:** Pinpoints exact root causes for defect files; evaluates and certifies clean files.
- **Concurrent Batch Analysis:** Parallelized via a thread pool to audit entire repositories in seconds.
- **Structured Findings:** Plain-language root cause explanation, confidence rating (`HIGH`, `MEDIUM`, `LOW`), complete replacement code, and unified diff preview.

### 3. Deterministic Sandbox Validation Loop
- **Multi-Cycle Auto-Repair:** Automatically attempts up to 3 repair cycles if a generated fix fails syntax or compiler checks.
- **Compiler Grounding:** Validates candidate code in an isolated sandbox before returning results to the user.
- **Strict Verification Badges:** Surfaces `VERIFIED` (green) or `FAILED` (red) status and loop iterations (`Loop: 1/3`).

### 4. 1-Click Fix Deployment with `.bak` Safety
- **1-Click Apply:** Directly overwrites the file on disk with the verified clean code.
- **Automatic Backup:** Automatically creates a timestamped safety backup (`<filename>.<ext>.bak`) before any disk modification.
- **Real-Time Live Re-scan:** Re-scans the repository immediately to reflect updated issue counts.

### 5. Type of Errors Directory & Intellectual AI Workspace
Organizes defects into 9 comprehensive software quality dimensions:
1. **Syntax Errors:** Violations of language grammar, parse errors, uncompilable structures.
2. **Security Vulnerabilities:** Remote code execution, dangerous eval, SQL injection, unsafe memory.
3. **Logic Defects:** Mutable defaults, missing where clauses, dead branches, reference comparison errors.
4. **Runtime Hazards:** Broad exception swallowing, panics, unhandled promise rejections, crash vectors.
5. **Code Quality:** Built-in shadowing, unused imports, explicit any types, anti-patterns.
6. **Performance Issues:** Unoptimized database queries, heavy allocations, algorithmic bottlenecks.
7. **Resource Leaks:** Unclosed HTTP bodies, dangling file descriptors, unclosed database handles.
8. **Concurrency Bugs:** Goroutine loop capture, race conditions, unsafe thread synchronization.
9. **Type Safety:** Loss of type safety, non-null assertions, missing type declarations.

### 6. Dedicated Administrator Supervision Console (`/admin`)
- **Isolated URL Route:** Navigating directly to `http://localhost:3000/admin` opens the Administrator Login form.
- **Zero Frontend Leaks:** Public workspace (`/`) and landing page (`/login`) contain no admin buttons or navigation links.
- **Role Protection:** Public registration restricts role selection to Developer and QA Engineer only; backend rejects admin registration attempts with `403 Forbidden`.
- **Supervisory Dashboard:**
  - Complete historical log of all tested scans.
  - Formatted **Date & Time** stamps for every execution.
  - **User details** (username and role).
  - Tested files manifest, issue counts, duration, and language breakdown.
  - Deep Inspection Modal reviewing all issues and AI determinations per scan.
  - Global platform KPI metrics (total scans, files tested, bugs detected, unique users).

### 7. Mindora Certified Letterhead Report
- Formally branded **Mindora Intelligence Report** letterhead for executive stakeholder presentation.
- Dynamic Audit Reference ID (`MND-DIAG-YYYY-XXXX`).
- Embedded verified file breakdown, code defects table, AI root cause determinations, and recommended fixes.
- Official Verification Seal and certified lead architect sign-off by **Vignesh Pandiya G**.
- One-click print-to-PDF via optimized `@media print` styling.

---

## 📡 API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticates user/admin credentials and returns signed JWT | No |
| `POST` | `/api/auth/register` | Registers developer/QA user in MongoDB (rejects admin role) | No |
| `GET` | `/api/auth/users` | Lists registered user profiles | Yes (Bearer) |
| `GET` | `/api/auth/public-users` | Public user list for audit directory attribution | No |
| `GET` | `/api/browse?path=/` | Safely traverses local filesystem folders | Yes (Bearer) |
| `POST` | `/api/scan` | Scans directory across all languages and records audit log | Yes (Bearer) |
| `POST` | `/api/scan-ai-deep` | Performs complete scan + parallel AI Intellectual analysis on all files | Yes (Bearer) |
| `POST` | `/api/analyze` | AI root-cause analysis and validated fix for a single file | Yes (Bearer) |
| `POST` | `/api/analyze-all` | Batch AI Intellectual analysis across multiple files | Yes (Bearer) |
| `POST` | `/api/fix/apply` | Writes verified code to disk with `.bak` safety backup | Yes (Bearer) |
| `POST` | `/api/fix/verify` | Re-validates code fix in sandbox environment | Yes (Bearer) |
| `GET` | `/api/rag/stats` | Retrieves vector store statistics (dimensions, languages, users) | Yes (Bearer) |
| `GET` | `/api/rag/memories` | Retrieves filtered and paginated error memories from MongoDB | Yes (Bearer) |
| `POST` | `/api/rag/search` | Performs semantic vector similarity search on past tested errors | Yes (Bearer) |
| `DELETE` | `/api/rag/memories/{id}` | Deletes a specific error memory from MongoDB | Yes (Admin) |
| `POST` | `/api/rag/clear` | Clears all stored vector memories from MongoDB | Yes (Admin) |
| `GET` | `/api/admin/scans` | Retrieves paginated and filtered scan audit logs | Yes (Admin) |
| `GET` | `/api/admin/scans/{id}` | Retrieves full file-by-file audit detail of a scan | Yes (Admin) |
| `GET` | `/api/admin/stats` | Retrieves aggregated platform testing KPI statistics | Yes (Admin) |
| `GET` | `/api/admin/users` | Lists users enriched with scan activity metrics | Yes (Admin) |
| `POST` | `/api/admin/scans/clear` | Clears stored scan audit logs in MongoDB and disk | Yes (Admin) |
| `GET` | `/api/health` | Health check endpoint returning `{"status": "ok"}` | No |
>>>>>>> da512a6 (Update workflows, QA testing and authentication)

### Incorrect test double

<<<<<<< HEAD
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
=======
## 🧠 Mindora RAG Pipeline & MongoDB Vector Store

The **Retrieval-Augmented Generation (RAG) Pipeline** gives Mindora an **institutional memory**, allowing it to learn and remember every defect, problematic code context, and verified fix across all tested files by every engineer:

1. **High-Density Vector Embeddings (1536 Dimensions):**
   - Uses OpenAI `text-embedding-3-small` (1536-dimensional unit hypersphere vectors) with a deterministic fallback vectorizer.
   - Vectorizes dense semantic representations containing Language, Error Rule, Error Message, Code Snippets, Root Causes, and Verified Solutions.
2. **MongoDB Dedicated Vector Store Collection (`error_memory_vectors`):**
   - Automatically stores every analyzed error occurrence into the `error_memory_vectors` collection in MongoDB (`mongodb://localhost:27017/`, DB: `mindora_debug_assistant`).
   - Tracks the tester's username (`@vignesh`, `@user`, `@admin`), execution timestamp, file path, language, category, code snippet, and verified fix.
   - Maintains unique indices and occurrence counters for recurring defect patterns.
3. **Semantic Vector Similarity Retrieval:**
   - Evaluates cosine similarity via NumPy vector dot products across stored memory vectors.
   - Retrieves top matching past occurrences when analyzing new files or diagnosing subtle regressions.
4. **Context Injection & Prompt Augmentation:**
   - Injects matching previous fixes directly into GPT-4o's prompt as high-confidence precedents, drastically boosting repair accuracy and eliminating duplicate regressions.
5. **Interactive UI Explorer & Admin Supervision:**
   - **RAG Vector Memory Tab:** Users can interactively search the vector store using natural language or code snippets and view similarity matching percentages (e.g. `94.2% Match`).
   - **Admin Management Console (`/admin`):** Oversees all error vectors indexed in MongoDB, provides filtering by user/rule, and enables single-click deletion or clearing of vector memories.

---

## 📁 Repository Structure
>>>>>>> da512a6 (Update workflows, QA testing and authentication)

```
ai-debug-assistant/
├── backend/
<<<<<<< HEAD
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
=======
│   ├── server.py              # FastAPI application, REST endpoints, and auth dependencies
│   ├── ai_analyzer.py         # AI Intellectual reasoning engine, GPT-4o, thread pool batching
│   ├── rag_pipeline.py        # Vector embedding generation (1536-dim), cosine similarity, RAG memory engine
│   ├── mongo.py               # MongoDB connection, collections, and dual-write sync
│   ├── auth.py                # Argon2id password hashing, JWT creation/validation
│   ├── audit_logger.py        # Audit trail recorder (timestamps, users, files tested)
│   ├── fix_validator.py       # Deterministic multi-cycle sandbox validation loop
│   ├── users.json             # Resilient disk backup for registered users
│   ├── audit_logs.json        # Resilient disk backup for scan audit trails
│   ├── requirements.txt       # Backend dependencies (FastAPI, pymongo, PyJWT, Argon2, etc.)
│   └── src/
│       ├── scanner.py         # Multi-language static scanner and directory walker
│       ├── report.py          # Diagnostic report compiler and metrics aggregator
│       ├── languages.py       # Language detector (16+ languages)
│       └── universal_analyzer.py # Polyglot syntax and regex rule matching
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx       # Main Mindora Workspace (Scan, Issues, Types, Letterhead)
│   │   │   ├── page.module.css# 3D Acrylic glassmorphism, responsive cards, print rules
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx   # Dedicated Admin Login & Audit Console
│   │   │   │   └── admin.module.css # Glassmorphic Admin console styling
│   │   │   ├── login/
│   │   │   │   ├── page.tsx   # Public Landing page, Developer bio, User Sign-in/Register
│   │   │   │   └── login.module.css # Public hero aesthetics and auth modal
│   │   │   ├── layout.tsx     # Root HTML layout with typography configurations
│   │   │   └── globals.css    # Global CSS variables, animations, and baseline
│   │   ├── components/
│   │   │   ├── AnimatedText.tsx     # Framer Motion spring physics text animator
│   │   │   ├── TypewriterHero.tsx   # Interactive terminal typing effect
│   │   │   ├── DirBrowser.tsx       # Local filesystem visual explorer modal
│   │   │   └── CodeHighlighter.tsx  # Multi-language code highlighter
│   │   └── lib/
│   │       ├── api.ts         # Type-safe API client for backend communication
│   │       ├── auth.ts        # Local session, token verification, and role helpers
│   │       └── types.ts       # Shared TypeScript domain models and schemas
│   ├── package.json           # Next.js 16, React 19, Framer Motion dependencies
│   └── tsconfig.json          # Strict TypeScript configuration
├── sample_project/            # Seeded demo projects with real-world bugs
│   ├── multi_lang/            # Polyglot test files (Python, JS, TS, Java, C, Go, Rust, SQL, Bash)
│   ├── inventory.py           # Python test module (mutable defaults, bare except)
│   ├── order_processor.py     # Python test module (syntax issues, None comparisons)
│   └── test_inventory.py      # Unit test verification suite
└── README.md                  # Comprehensive Documentation & Architecture Guide
>>>>>>> da512a6 (Update workflows, QA testing and authentication)
```

---

## ⚡ Quick Start & Run Commands

<<<<<<< HEAD
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

## Author

**Vignesh Pandiya G** — AI Engineer & Full-Stack Architect
Chennai, Tamil Nadu · B.Tech in Artificial Intelligence & Data Science

Complete end-to-end system design: FastAPI backend, Next.js 16 frontend, AST static engine, and GPT-4o reasoning integration.

Specializations: autonomous multi-agent AI systems, AST-based code analysis, high-performance full-stack applications.
=======
### 1. Prerequisites
- **Python 3.11+ / 3.14**
- **Node.js 18+** and `npm`
- **MongoDB** (`mongodb-community` via Homebrew or Docker)
- **OpenAI API Key** (for AI Intellectual deep reasoning; static analysis works 100% offline)

---

### 2. Start MongoDB
If using Homebrew on macOS:
```bash
brew services start mongodb-community
```
Verify MongoDB is running:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```
*(MongoDB Compass connection URI: `mongodb://localhost:27017/`)*

---

### 3. Start the Backend Service
```bash
cd ai-debug-assistant

# 1. Install dependencies
pip install -r backend/requirements.txt pymongo openai python-dotenv

# 2. Configure environment variables (in backend/.env):
# OPENAI_API_KEY=sk-...
# MONGO_URI=mongodb://localhost:27017/

# 3. Start the backend FastAPI server on port 8001:
python3 -m uvicorn backend.server:app --port 8001 --reload
```
Backend will be live at **`http://localhost:8001`**.

---

### 4. Start the Frontend Application
In a new terminal window:
```bash
cd ai-debug-assistant/frontend

# 1. Install dependencies
npm install

# 2. Start Next.js development server on port 3000:
npm run dev -- --port 3000
```
Frontend will be live at **`http://localhost:3000`**.

---

## 🔐 Portals & Default Credentials

| Portal | URL | Default Username | Default Password | Access Level |
|---|---|---|---|---|
| **Developer Code Scanner** | [http://localhost:3000](http://localhost:3000) | `user` | `user123` | Developer |
| **QA Workspace** | [http://localhost:3000/qa](http://localhost:3000/qa) | `qa_user` | `qa123` | QA Engineer |
| **Testing Execution Workspace** | [http://localhost:3000/testing](http://localhost:3000/testing) | `tester_user` | `tester123` | Software Tester |
| **Admin Supervision Console** | [http://localhost:3000/admin](http://localhost:3000/admin) | `admin` | `admin123` | Administrator |
| **Backend REST API** | [http://localhost:8001](http://localhost:8001) | — | — | FastAPI / OpenAPI |
| **API Documentation** | [http://localhost:8001/docs](http://localhost:8001/docs) | — | — | Interactive Swagger UI |
| **MongoDB Database** | `mongodb://localhost:27017/` | — | — | `mindora_debug_assistant` |

---

## 👨‍💻 Author & Lead Architect

**Vignesh Pandiya G**  
*Lead Architect & End-to-End Creator &middot; Mindora Intelligence*  
- **System Architecture:** Complete Full-Stack Design (FastAPI, Next.js 16, Universal AST Engine, MongoDB Persistence, GPT-4o Sandbox Validation)  
- **Specialization:** Autonomous Multi-Agent AI Systems, AST Code Analysis, High-Performance Systems Engineering  
- **Education:** B.Tech in Artificial Intelligence & Data Science
>>>>>>> da512a6 (Update workflows, QA testing and authentication)
