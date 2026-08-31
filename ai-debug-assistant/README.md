# AI Software Debugging Assistant

> Upload any Python file → GPT-4o finds bugs, explains the root cause, and generates a fixed version.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (TypeScript, CSS Modules) |
| Backend | Flask (Python) |
| AI | OpenAI GPT-4o |

## Project Structure

```
ai-debug-assistant/
├── backend/                  # Flask REST API
│   ├── src/                  # Core Python modules
│   │   ├── log_parser.py
│   │   ├── code_retriever.py
│   │   ├── diagnose_openai.py
│   │   ├── fix_generator.py
│   │   └── test_runner.py
│   ├── api.py                # Flask app (all endpoints)
│   ├── .env                  # ← your API key goes here (gitignored)
│   ├── .env.example          # template
│   └── requirements.txt
├── frontend/                 # Next.js app
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   ├── components/       # Reusable UI components
│   │   └── lib/api.ts        # Typed API client
│   └── .env.local            # NEXT_PUBLIC_API_URL
├── data/
│   └── sample_logs/          # Demo crash log
├── sample_project/           # Demo Python project (has a bug)
└── .gitignore
```

## Quick Start

### 1. Backend

```bash
cd backend
pip3 install -r requirements.txt

# Copy the env template and add your key
cp .env.example .env
# Edit .env → set OPENAI_API_KEY=sk-...

python api.py
# → Running on http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → Running on http://localhost:3000
```

### 3. Open the app

Visit **http://localhost:3000**, upload a `.py` file, and click **Analyse with GPT**.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check server status |
| POST | `/api/analyse-code` | Analyse code (streaming NDJSON) |
| POST | `/api/analyse-log` | Parse crash log + diagnose |
| POST | `/api/demo` | Run built-in demo |
| POST | `/api/run-tests` | Run pytest on a directory |
