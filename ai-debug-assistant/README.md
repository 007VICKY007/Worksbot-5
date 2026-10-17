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
```

---

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

### 8. Simplified QA Workflow (`Project → Create Tests → Run Tests → Fix Issues`)
- **Test Case Management:** Create, edit, and organize test cases (Unit, Integration, E2E, Manual) with AI-powered generation from source code.
- **Test Execution:** Run test cases against the codebase with real-time output, error capture, and stack traces.
- **Auto-Issue Creation:** Failed tests automatically create issues with error logs, reproduction steps, severity, and target file mapping.
- **Issue Lifecycle Tracking:** Status flow `Open → In Progress → Fixed → Retest → Verified → Closed` with `Reopened` support.
- **Developer Assignment:** QA assigns issues to developers with automatic status transition and notification.
- **Fix Submission:** Developers submit fixes with sandbox validation, automatic `.bak` backup, and diff generation.
- **Retest & Verification:** QA retests fixed issues using original or new test runs; auto-transitions to `Verified` on pass, `Reopened` on fail.
- **Complete Audit Trail:** Every status change, assignment, fix, and retest recorded with timestamps and actor.
- **Dashboard & Metrics:** Real-time summary with counts by status, severity, and visual status flow diagram.
- **AI Test Generation:** Generate test cases automatically from any source file using GPT-4o.

### 9. Browser Folder Picker — Local & Live Modes
- **No local agent required:** Select an entire project folder directly in the browser using the standard `webkitdirectory` folder picker; the selected folder's structure and files are read client-side.
- **Local mode:** With the backend running on the same machine (`NEXT_PUBLIC_API_URL=http://localhost:8001`), pick a folder and click **Upload & Scan** — files are uploaded to the local backend, stored under `UPLOAD_DIR`, and scanned immediately.
- **Live mode (Vercel + Render):** With the frontend on Vercel and the backend on Render, the same **Upload & Scan** flow uploads the selected folder to the Render backend, which preserves the folder structure, registers a project, runs the full multi-language static scan, and returns the report. Optional **AI deep analysis** runs GPT-4o comprehension on every uploaded file.
- **Mode indicator:** The workspace header shows a `LOCAL BACKEND` or `LIVE BACKEND` badge so users always know which backend serves the scan.
- **Upload progress & errors:** Selected-file listing, upload/scan busy states, and inline error/notice messages keep the flow transparent.
- **Security:** Relative paths from the browser are validated server-side (absolute paths and `..` traversal rejected); uploads require a valid JWT; project size and file-count limits are enforced.
- **CORS configuration:** The backend accepts extra browser origins via the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated), so the Vercel frontend can call the Render API.

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
| `GET` | `/api/qa/simple/test-cases` | Lists test cases for a project | Yes (Bearer) |
| `POST` | `/api/qa/simple/test-cases` | Creates a new test case | Yes (Bearer) |
| `POST` | `/api/qa/simple/test-cases/generate-ai` | Generates AI test cases from source file | Yes (Bearer) |
| `POST` | `/api/qa/simple/test-runs` | Executes a test case (auto-creates issue on failure) | Yes (Bearer) |
| `GET` | `/api/qa/simple/test-runs` | Lists test runs for a project | Yes (Bearer) |
| `GET` | `/api/qa/simple/issues` | Lists issues with optional status filter | Yes (Bearer) |
| `GET` | `/api/qa/simple/issues/{id}` | Retrieves full issue detail with history | Yes (Bearer) |
| `PATCH` | `/api/qa/simple/issues/{id}/status` | Updates issue status (validates transitions) | Yes (Bearer) |
| `POST` | `/api/qa/simple/issues/{id}/assign` | Assigns issue to a developer | Yes (Bearer) |
| `GET` | `/api/qa/simple/summary` | Retrieves workflow metrics dashboard | Yes (Bearer) |
| `POST` | `/api/qa/simple/issues/{id}/retest` | Retests a fixed issue with a test run | Yes (Bearer) |
| `POST` | `/api/projects/upload` | Multipart upload of browser-selected folder files (manifest + files); stores, registers, and scans the project | Yes (Bearer) |
| `GET` | `/api/health` | Health check endpoint returning `{"status": "ok"}` | No |

---

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

```
ai-debug-assistant/
├── backend/
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
│   │   │   ├── page.tsx       # Main Mindora Workspace (Scan, Issues, Types, Letterhead, QA Workflow)
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
```

---

## ⚡ Quick Start & Run Commands

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
# CORS_ALLOWED_ORIGINS= (comma-separated origins for live mode, e.g. https://your-app.vercel.app)
# UPLOAD_DIR=backend/uploaded_projects (where browser-uploaded folders are stored)

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

# 2. Start Next.js development server on port 5173:
npm run dev
```
Frontend will be live at **`http://localhost:5173`**.

---

### 5. Enable “Continue with Google” (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/), configure the OAuth consent screen as **External** and publish it if every Google user should be able to sign in. This app only requests basic identity claims (`openid`, `email`, and `profile`), so it does not require sensitive-scope verification.
2. Open the OAuth 2.0 **Web application** client and add these values to **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   This implementation uses Google Identity Services ID tokens, not an authorization-code redirect; leave **Authorized redirect URIs** empty unless another integration needs one.
3. Copy `backend/.env.example` to `backend/.env`, then set `GOOGLE_CLIENT_ID` to that client ID.
4. Copy `frontend/.env.example` to `frontend/.env.local`, then set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the **same** client ID.
5. Restart both servers. The sign-in dialog will show **Continue with Google**. In the **Register** tab, choose Developer, QA Engineer, or Software Tester before continuing with Google; that approved role is stored for a first-time account. Existing accounts always keep their saved role. Administrator sign-in remains password-only.

---

## 🚀 Deployment — Vercel (Frontend) + Render (Backend)

Local mode works out of the box with the Quick Start above. For **live mode**, deploy the frontend to Vercel and the backend to Render, then point them at each other:

### 1. Deploy the backend to Render
1. Create a new **Web Service** on [Render](https://render.com) from this repository (root directory).
2. Build command: `pip install -r backend/requirements.txt`
3. Start command: `python3 -m uvicorn backend.server:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `MONGO_URI` — a MongoDB Atlas connection string (Render's free instances are ephemeral; use Atlas for durable storage)
   - `MONGO_DB_NAME` — e.g. `mindora_debug_assistant`
   - `JWT_SECRET` — a long random string
   - `OPENAI_API_KEY` — optional, enables AI deep analysis
   - `CORS_ALLOWED_ORIGINS` — your Vercel URL, e.g. `https://your-app.vercel.app`
   - `UPLOAD_DIR` — e.g. `/var/data/uploads` (optional; defaults to `backend/uploaded_projects`)
5. Note the Render URL, e.g. `https://your-backend.onrender.com`.

### 2. Deploy the frontend to Vercel
1. Import this repository on [Vercel](https://vercel.com); set the **Root Directory** to `frontend/`.
2. Add environment variables:
   - `NEXT_PUBLIC_API_URL` — the Render backend URL from step 1 (e.g. `https://your-backend.onrender.com`)
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — optional, for Google sign-in
3. Deploy. The workspace header will show the **LIVE BACKEND** badge.

### 3. Verify live mode
1. Open the Vercel URL, sign in, and click **Choose project folder** to select a project on your computer.
2. Click **Upload & Scan** — files upload to the Render backend (folder structure preserved) and the scan report renders in the workspace.
3. Check **Run AI deep analysis after the static scan** to additionally run GPT-4o comprehension per file (requires `OPENAI_API_KEY`).

---

## 🔐 Portals & Default Credentials

| Portal | URL | Default Username | Default Password | Access Level |
|---|---|---|---|---|
| **Developer Code Scanner** | [http://localhost:5173](http://localhost:5173) | `user` | `user123` | Developer |
| **QA Workspace** | [http://localhost:5173](http://localhost:5173) (QA Workflow tab) | `qa_user` | `qa123` | QA Engineer |
| **Testing Execution Workspace** | [http://localhost:5173/testing](http://localhost:5173/testing) | `tester_user` | `tester123` | Software Tester |
| **Admin Supervision Console** | [http://localhost:5173/admin](http://localhost:5173/admin) | `admin` | `admin123` | Administrator |
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
