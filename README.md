# AI Debug Assistant

Upload your Python code. Get bugs and fixes back.

---

## What's This For?

You write Python code. Code breaks. You spend hours looking at error messages and trying to figure out what went wrong.

This tool reads your code, tells you what's broken, and shows you how to fix it.

---

## How To Use It

1. Go to the website
2. Paste your Python code (or upload a file)
3. Click "Analyze"
4. Get back:
   - Where the bug is (line number)
   - What the bug is (actual problem)
   - How to fix it (actual code)
   - Why it's a problem (explanation)

---

## What Happens Inside

```
Your Code
   ↓
Read it
   ↓
Find problems
   ↓
Figure out what's wrong
   ↓
Suggest a fix
   ↓
You get the answer
```

---

## Getting Started

### Install

```bash
git clone <repo-url>
cd ai-debug-assistant
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Add Your API Key

```bash
export ANTHROPIC_API_KEY=sk-...
```

### Start

```bash
uvicorn src.api.main:app --reload
```

Open `http://localhost:8000` in your browser.

---

## Examples

### Broken Code #1

```python
texts.append(build_profile_text(cleaned))
embeddings = encode_profiles(texts)
logger.info(f"Embeddings generated with shape: {embeddings.shape}")
```

**What's Wrong:**
- Line 13: Function `parse_list_field` might not exist
- Line 31: Code assumes `'skills'` key is in the dict (it might not be)
- Line 38: Assumes the embeddings object has a `shape` attribute

**How To Fix:**
```python
if 'skills' in raw_dict:
    skills = parse_list_field(raw_dict['skills'])
if hasattr(embeddings, 'shape'):
    logger.info(f"Shape: {embeddings.shape}")
```

---

### Broken Code #2

```python
def test_get_device():
    device = get_device()
    assert device in ["cpu", "cuda", "mps"]
```

**What's Wrong:**
- Line 18: Using `monkeypatch.setattr` wrong. Target should be the actual path, not text
- Line 18: The mock function needs to return an object, not just the class

**How To Fix:**
```python
def test_get_device(monkeypatch):
    def mock_device():
        return DummyModel()
    
    monkeypatch.setattr("module.get_device", mock_device)
    device = get_device()
    assert device in ["cpu", "cuda", "mps"]
```

---

## What It Checks For

- Missing error handling
- Assuming things exist when they might not
- Wrong function calls
- Broken test setup
- Missing checks before using data
- Using things wrong

---

## Files & Folders

```
ai-debug-assistant/
├── README.md
├── requirements.txt
├── src/
│   ├── api/              Main app
│   ├── parser/           Read code
│   ├── analyzer/         Find problems
│   └── fixer/            Create fixes
├── tests/                Tests
└── data/                 Example code
```

---

## Setup Steps

### 1. Python Version

Need Python 3.11 or newer.

Check:
```bash
python --version
```

### 2. Virtual Environment

```bash
python -m venv .venv
source .venv/bin/activate
```

On Windows:
```bash
.venv\Scripts\activate
```

### 3. Install Packages

```bash
pip install -r requirements.txt
```

### 4. Add API Key

Get key from Anthropic website, then:
```bash
export ANTHROPIC_API_KEY=sk-your-key-here
```

### 5. Run It

```bash
uvicorn src.api.main:app --reload
```

Go to `http://localhost:8000`

---

## Using The Website

### Step 1: Upload Code

Two ways:
- Click "Browse .py File" - pick from your computer
- Paste code directly in the text box

### Step 2: Analyze

Click "Analyze with GPT" button.

Wait. It reads your code.

### Step 3: Read Results

You get three tabs:

**Bugs Found** - What's broken
- Line number
- What's wrong
- Why it matters

**Fixed Code** - What to change
- The corrected code
- Ready to copy

**Explanation** - Why it matters
- Details on each bug
- How the fix works

---

## API (If You Want To Use It Programmatically)

### Send Code For Analysis

```
POST http://localhost:8000/api/v1/debug

{
  "code": "your python code here",
  "file_name": "script.py"
}
```

### Get Back

```
{
  "bugs_found": [
    {
      "line": 13,
      "issue": "Function might not exist",
      "fix": "Add import or check"
    }
  ],
  "fixed_code": "...",
  "explanation": "..."
}
```

---

## What Languages Work

Right now:
- Python ✓

Later:
- JavaScript/TypeScript
- Java
- Go

---

## Stuff It Can Find

- Missing error checks
- Wrong imports
- Broken function calls
- Bad test setup
- Assuming data exists
- Wrong object attributes
- Missing null checks
- Type problems

---

## What It CAN'T Do

- Fix everything automatically (you still review)
- Work with 100% broken code
- Understand your weird custom framework
- Handle files bigger than 1MB
- Deploy code for you

---

## Tests

```bash
pytest tests/
```

With coverage:
```bash
pytest tests/ --cov=src/
```

---

## What's Next

Soon:
- More languages
- Editor plugins (VS Code)
- GitHub Actions support
- API improvements
- Faster analysis

---

## How It Works (Technical)

1. **Parse** - Break down your code into pieces
2. **Scan** - Look for common problems
3. **Check** - Run it against known issue patterns
4. **Suggest** - Generate fixes
5. **Report** - Show you everything

---

## Questions?

**Doesn't work?**
- Check Python version (need 3.11+)
- Check API key is set
- Check internet connection
- Look at error message in terminal

**Want to help?**
- Report bugs on GitHub
- Submit code improvements
- Add language support
- Write better tests

**Found a security issue?**
- Don't post it publicly
- Email: support@example.com

---

## output

<img width="1470" height="956" alt="Screenshot 2026-08-29 at 10 56 00 AM" src="https://github.com/user-attachments/assets/b43e6c04-be2b-4876-b3a1-f146138d0635" />

<img width="1470" height="956" alt="Screenshot 2026-08-29 at 11 00 31 AM" src="https://github.com/user-attachments/assets/e34fe89e-b0f3-4a29-879f-49590ef0b591" />

<img width="1469" height="954" alt="Screenshot 2026-08-29 at 11 00 37 AM" src="https://github.com/user-attachments/assets/4f1b4994-2cec-46d5-aa70-e8b9533452b3" />



---

## Real Talk

This tool isn't magic. It finds common bugs and suggests fixes. Some fixes might not be perfect. Always check code before running it in production.

Use it to:
- Catch obvious mistakes
- Learn what went wrong
- Get a head start on fixes
- Speed up code review

Don't use it to:
- Blindly deploy code
- Replace code review
- Handle security-critical stuff alone
- Fix everything automatically

---

That's it. Upload code, get fixes. 🔧
