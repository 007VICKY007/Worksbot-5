# AI Debug Assistant

**Upload Python code → Get bugs found and fixed.**

A tool that reads your Python files, finds what's wrong, explains why, and shows you how to fix it.

---

## What Does It Do?

You have Python code. Something's broken. You don't know what.

This tool:
1. Reads your code
2. Finds the bugs
3. Explains what's wrong
4. Shows you the fixed version
5. Tells you how to fix it

That's it.

---

# Output

<img width="1470" height="956" alt="Screenshot 2026-08-29 at 11 00 31 AM" src="https://github.com/user-attachments/assets/fad10a15-857f-4323-b5f5-ee994e0012d2" />


## See It In Action

### Before (Your Broken Code)
```python
texts.append(build_profile_text(cleaned))
embeddings = encode_profiles(texts)
logger.info(f"Embeddings generated with shape: {embeddings.shape}")
```

### After (What's Wrong)
- **Line 13:** Function doesn't exist
- **Line 31:** Assumes 'skills' key exists (might not)
- **Line 38:** Assumes object has 'shape' attribute (might not)

### Fixed (Here's The Answer)
```python
if 'skills' in raw_dict:
    skills = parse_list_field(raw_dict['skills'])
if hasattr(embeddings, 'shape'):
    logger.info(f"Shape: {embeddings.shape}")
```

---

## Installation

### What You Need First

- Python 3.11 or newer (check with `python --version`)
- Node.js (for the website part)
- OpenAI API key (get one from openai.com)

### Step 1: Get The Code

```bash
git clone <repo-url>
cd ai-debug-assistant
```

### Step 2: Backend Setup

The backend is the part that finds bugs.

```bash
cd backend
pip3 install -r requirements.txt
```

Create a file called `.env` and add:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

Start it:
```bash
python api.py
```

You should see:
```
Running on http://localhost:5000
```

### Step 3: Frontend Setup

The frontend is the website you use.

```bash
cd frontend
npm install
npm run dev
```

You should see:
```
localhost:3000
```

### Step 4: Open It

Go to **http://localhost:3000** in your browser.

---

## How To Use It

### Way #1: Upload A File

1. Click "Browse .py File"
2. Pick a Python file from your computer
3. Click "Analyze with GPT"
4. Wait a few seconds
5. Read the results

### Way #2: Paste Code

1. Click in the text box
2. Paste or type your Python code
3. Click "Analyze with GPT"
4. Read the results

### What You Get Back

Three tabs with information:

**Bugs Found**
- Line number where problem is
- What the problem is
- Why it matters

**Fixed Code**
- The corrected version
- Ready to copy into your project

**Explanation**
- Details about each bug
- Why the fix works
- What you learned

---

## Real Examples From The Tool

### Example #1: Missing Error Handling

**Your Code:**
```python
texts.append(build_profile_text(cleaned))
logger.info(f"Generating embeddings for {len(texts)} profile texts...")
embeddings = encode_profiles(texts)
logger.info(f"Embeddings generated with shape: {embeddings.shape}")
```

**What Went Wrong:**
```
Bugs Found:

1. Line 13 ↦ The import statement for 'parse_list_field' might be 
   incorrect if the function is not defined in 'backend.profile_processor'.

2. Line 31 ↦ The 'parse_list_field' function is called without checking 
   if 'raw_dict.get("skills")' is 'None', which might cause an error if 
   'skills' is not a key in the dictionary.

3. Line 38 ↦ The script assumes that 'encode_profiles' returns an object 
   with a 'shape' attribute, which might not be the case.
```

**How To Fix:**
```python
# Check if skills exists before using it
if 'skills' in raw_dict:
    skills = parse_list_field(raw_dict['skills'])
else:
    skills = []

# Check if embeddings has shape before using it
if hasattr(embeddings, 'shape'):
    logger.info(f"Embeddings generated with shape: {embeddings.shape}")
```

---

### Example #2: Wrong Test Setup

**Your Code:**
```python
def test_get_device():
    device = get_device()
    assert device in ["cpu", "cuda", "mps"]
```

**What Went Wrong:**
```
Bugs Found:

1. Line 18 ↦ The 'monkeypatch.setattr' target is incorrect. 
   It should be the actual import path of the 'load_embedding_model' 
   function, not a string.

2. Line 18 ↦ The lambda function should return an instance of 
   'DummyModel', not the class itself.
```

**How To Fix:**
```python
def test_get_device(monkeypatch):
    def mock_model():
        return DummyModel()  # Return an instance
    
    monkeypatch.setattr("module.load_embedding_model", mock_model)
    device = get_device()
    assert device in ["cpu", "cuda", "mps"]
```

---

## What It Can Find

✓ Missing error checks
✓ Assuming things exist when they might not
✓ Wrong function calls
✓ Broken test setup
✓ Missing checks before using data
✓ Wrong object attributes
✓ Missing imports
✓ Type problems

---

## What It CAN'T Do

✗ Fix everything perfectly (you should review)
✗ Work with completely broken code
✗ Understand your custom framework
✗ Handle files bigger than 1MB
✗ Deploy code for you
✗ Fix security issues automatically

---

## Folder Structure

```
ai-debug-assistant/
│
├── backend/                    The part that finds bugs
│   ├── src/
│   │   ├── log_parser.py       Reads error messages
│   │   ├── code_retriever.py   Finds related code
│   │   ├── diagnose_openai.py  Figures out what's wrong
│   │   ├── fix_generator.py    Creates fixes
│   │   └── test_runner.py      Tests the fixes
│   ├── api.py                  Main server
│   ├── requirements.txt        Python packages needed
│   ├── .env                    Your API key (secret)
│   └── .env.example            Template for .env
│
├── frontend/                   The website you use
│   ├── src/
│   │   ├── app/                Pages
│   │   ├── components/         Buttons, forms, etc.
│   │   └── lib/api.ts          Talks to backend
│   ├── package.json            JavaScript packages
│   └── .env.local              Website settings
│
├── sample_project/             Example Python file with a bug
├── data/                       Example error messages
└── README.md                   This file
```

---

## Troubleshooting

### "Can't connect to backend"
- Make sure backend is running (`python api.py` in backend folder)
- Check that it says `Running on http://localhost:5000`

### "API key error"
- Get a key from https://openai.com
- Put it in `backend/.env` file
- Restart the backend

### "Command not found: python"
- Install Python from python.org
- Use `python3` instead of `python` on Mac

### "Port already in use"
- Something else is using port 5000 or 3000
- Stop the other thing, then try again

### Still broken?
- Check terminal for error messages
- Read what it says
- Try the steps again

---

## Using It Programmatically

If you want to use this in your code or automation:

### Send Code For Analysis

```
POST http://localhost:5000/api/analyse-code

{
  "code": "your python code here"
}
```

### Get Back

```
{
  "bugs": [
    {
      "line": 13,
      "problem": "Function might not exist",
      "fix": "Add error handling"
    }
  ],
  "fixed_code": "...",
  "explanation": "..."
}
```

### Check If Server Is Running

```
GET http://localhost:5000/api/health
```

---

## Languages Supported

Right now:
- Python ✓ (fully works)

Coming soon:
- JavaScript
- TypeScript
- Java
- Go

---

## How It Works (Simple Version)

1. You upload code
2. Server receives it
3. Server sends it to GPT-4
4. GPT reads it and finds problems
5. GPT suggests fixes
6. Server sends back the results
7. Website shows it to you

---

## How It Works (If You Care About Details)

1. **Parser** reads your code and breaks it into parts
2. **Analyzer** looks for common problems
3. **Diagnoser** uses AI to figure out root causes
4. **Fixer** generates corrected code
5. **Tester** runs tests to make sure fix works
6. **Reporter** shows you everything nice and clean

---

## Settings & Configuration

### Backend Settings

Edit `backend/api.py`:

```python
# Change which AI model to use
MODEL = "gpt-4o"  # or "gpt-4" or "gpt-3.5-turbo"

# Change port
PORT = 5000  # Change this to something else if needed

# Change timeout
TIMEOUT = 60  # seconds to wait for AI response
```

### Frontend Settings

Edit `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## Testing

### Test The Backend

```bash
cd backend
python -m pytest tests/
```

### Test Everything

```bash
cd backend
pytest tests/ -v
```

---

## Common Questions

**Q: Is my code private?**
A: Your code goes to OpenAI's servers. Read their privacy policy if worried. Run locally to be safest.

**Q: How much does it cost?**
A: You pay OpenAI for API usage. Usually a few cents per analysis.

**Q: Can I use this for production code?**
A: Not alone. Always review suggestions before using. Don't blindly deploy.

**Q: Why didn't it find my bug?**
A: It finds common bugs, not everything. Some bugs need human eyes.

**Q: Can I use different AI model?**
A: Yes. Change MODEL in `backend/api.py` and restart.

**Q: How long does analysis take?**
A: Usually 5-30 seconds depending on code size and API response time.

**Q: Can I upload multiple files?**
A: Not yet. Upload one file at a time.

---

## Next Steps & Future Stuff

Planned:
- Support for JavaScript
- VS Code plugin
- GitHub integration
- Faster analysis
- Better explanations
- More languages

Maybe later:
- Auto-fix and deploy (with approval)
- Team collaboration
- Save history
- Learning from your feedback

---

## How To Help

Want to improve it?

- Report bugs: Open an issue on GitHub
- Add features: Make a pull request
- Test more: Try different code
- Suggest ideas: Tell us what you need

---

## License

MIT - Use it however you want

---

## Who Built This?

Built by developers who were tired of debugging.

---

## Final Notes

### What This IS
- A tool to find bugs faster
- A way to learn what's wrong
- A starting point for fixes
- A code review helper

### What This ISN'T
- A magic fix-everything button
- A replacement for thinking
- A way to deploy without review
- A security solution

### Best Practices

1. Always read what it suggests before using
2. Run tests before deploying
3. Don't use on security-critical code alone
4. Review the fixes
5. Learn from what it finds

---

## Getting Help

Something not working?

1. **Check the error message** - it usually tells you what's wrong
2. **Restart both servers** - turn them off and on again
3. **Check your API key** - make sure it's correct
4. **Look at logs** - terminal shows what's happening
5. **Try simple code first** - test with tiny example

Still stuck?

- Read error messages carefully
- Check GitHub issues
- Try the demo code in `sample_project/`
- Ask on GitHub discussions

---

## That's All

Upload code. Get bugs found. Get fixes. Learn what went wrong.

That's the whole thing.

🔧
