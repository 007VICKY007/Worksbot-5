# app.py  —  AI Code Debugging Assistant
# Pick any Python file → GPT reads the code → finds bugs + suggests fixes
# No log file needed.

import sys
import re
import ast
import subprocess
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).parent
sys.path.insert(0, str(_ROOT / "src"))
sys.path.insert(0, str(_ROOT))

import openai
from config import OPENAI_API_KEY

# ── Native file/folder pickers (subprocess — avoids macOS main-thread crash) ────────────

_DIALOG = str(_ROOT / "file_dialog.py")


def pick_python_file() -> str:
    """Open a native file picker in a subprocess and return the chosen path."""
    result = subprocess.run(
        [sys.executable, _DIALOG, "file"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def pick_folder() -> str:
    """Open a native folder picker in a subprocess and return the chosen path."""
    result = subprocess.run(
        [sys.executable, _DIALOG, "folder"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


# ── GPT code review ───────────────────────────────────────────────────────────

def review_code_stream(filename: str, code: str):
    """Stream GPT's review of the given code."""
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    system = """You are an expert Python code reviewer and debugger.
Analyse the provided code and respond using EXACTLY these section headers:

## BUGS FOUND
List every bug, with the line number and what is wrong.

## ROOT CAUSE
Explain the main root cause in 1-2 sentences.

## FIXED CODE
Provide the complete corrected file in a ```python block```.

## EXPLANATION
Step-by-step explanation of every fix made.

## CONFIDENCE
Rate your confidence: HIGH, MEDIUM, or LOW."""

    prompt = f"### File: {filename}\n\n```python\n{code}\n```"

    stream = client.chat.completions.create(
        model="gpt-4o",
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
            yield delta


def parse_gpt_response(text: str) -> dict:
    markers = {
        "bugs":        "## BUGS FOUND",
        "root_cause":  "## ROOT CAUSE",
        "fixed_code":  "## FIXED CODE",
        "explanation": "## EXPLANATION",
        "confidence":  "## CONFIDENCE",
    }
    positions = {k: text.find(v) for k, v in markers.items() if text.find(v) != -1}
    sorted_keys = sorted(positions, key=lambda k: positions[k])
    sections = {k: "" for k in markers}
    sections["raw"] = text

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


def quick_syntax_check(code: str) -> list[str]:
    """Run a quick AST syntax check and return a list of error strings."""
    errors = []
    try:
        ast.parse(code)
    except SyntaxError as e:
        errors.append(f"SyntaxError on line {e.lineno}: {e.msg}")
    return errors


def get_py_files(folder: str) -> list[Path]:
    return sorted(Path(folder).rglob("*.py"))


# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(page_title="AI Code Debugger", page_icon="🔍", layout="centered")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
.stApp { background:#0f1117; color:#e0e0e0; }

[data-testid="stSidebar"],
[data-testid="collapsedControl"] { display:none !important; }

.hdr { text-align:center; padding:1.6rem 0 1rem; border-bottom:1px solid #1e2130; margin-bottom:1.5rem; }
.hdr-title { font-size:1.8rem; font-weight:700; color:#fff; margin:0; }
.hdr-sub   { color:#555; font-size:.87rem; margin-top:.3rem; }

.sec-label { font-size:.75rem; font-weight:600; color:#a0aec0;
             text-transform:uppercase; letter-spacing:.9px; margin-bottom:.35rem; }

.path-box {
  background:#12151f; border:1px solid #2a2d3e; border-radius:8px;
  padding:.55rem .9rem; font-family:'JetBrains Mono',monospace;
  font-size:.82rem; color:#60a5fa; word-break:break-all;
  min-height:2.2rem;
}
.path-box.empty { color:#6b7280; font-style:italic; }

.card { background:#1a1d27; border:1px solid #1e2130;
        border-radius:10px; padding:1rem 1.3rem; margin-bottom:.9rem; }

.bug-item { background:#1e0e0e; border-left:3px solid #ef4444;
            border-radius:0 6px 6px 0; padding:.6rem .9rem;
            margin:.4rem 0; font-family:'JetBrains Mono',monospace; font-size:.82rem; }

.badge-high   { background:rgba(52,211,153,.12); border:1px solid rgba(52,211,153,.3); color:#34d399; }
.badge-medium { background:rgba(251,191,36,.12); border:1px solid rgba(251,191,36,.3); color:#fbbf24; }
.badge-low    { background:rgba(255,80,80,.12);  border:1px solid rgba(255,80,80,.3);  color:#ef4444; }
.cbadge { display:inline-block; padding:.22rem .7rem; border-radius:20px;
          font-size:.76rem; font-weight:700; letter-spacing:.4px; }

.stButton > button {
  background:#2563eb; color:#fff; border:none; border-radius:8px;
  padding:.5rem 1.2rem; font-size:.88rem; font-weight:600; width:100%;
  transition:background .15s;
}
.stButton > button:hover    { background:#1d4ed8; }
.stButton > button:disabled { background:#1c1f2e; color:#3a3f5c; }

.stTabs [data-baseweb="tab-list"] { border-bottom:1px solid #1e2130; gap:.15rem; }
.stTabs [data-baseweb="tab"] { color:#555; font-size:.83rem; font-weight:500;
  padding:.4rem .85rem; border-radius:6px 6px 0 0; }
.stTabs [aria-selected="true"] {
  background:rgba(37,99,235,.1) !important;
  color:#60a5fa !important; border-bottom:2px solid #2563eb !important;
}

/* Radio buttons — make label text visible */
.stRadio label { color:#e2e8f0 !important; font-size:.92rem !important; font-weight:500 !important; }
.stRadio div[role="radiogroup"] { gap:1.5rem; }

/* Selectbox */
.stSelectbox label { color:#e2e8f0 !important; }
.stSelectbox > div > div { background:#12151f !important; border:1px solid #2a2d3e !important;
  color:#e2e8f0 !important; border-radius:8px !important; }

/* Expander label */
[data-testid="stExpander"] summary p { color:#a0aec0 !important; font-weight:500 !important; }

/* General paragraph text */
.stApp p, .stApp li { color:#cbd5e0; }

/* Text input */
.stTextInput input {
  background:#12151f !important; border:1px solid #2a2d3e !important;
  color:#e2e8f0 !important; border-radius:8px !important; font-size:.86rem !important;
}

/* Expander */
[data-testid="stExpander"] { border:1px solid #2a2d3e; border-radius:8px; background:#12151f; }

hr { border-color:#2a2d3e; }
::-webkit-scrollbar { width:5px; }
::-webkit-scrollbar-track { background:#0f1117; }
::-webkit-scrollbar-thumb { background:#2a2d3e; border-radius:3px; }
</style>
""", unsafe_allow_html=True)

# ── Header ────────────────────────────────────────────────────────────────────
st.markdown("""
<div class="hdr">
  <div class="hdr-title">🔍 AI Code Debugging Assistant</div>
  <div class="hdr-sub" style="color:#94a3b8">Pick any Python file or folder → GPT finds bugs &amp; fixes them instantly</div>
</div>
""", unsafe_allow_html=True)

# ── Session state ─────────────────────────────────────────────────────────────
for k, v in dict(
    selected_file="", folder_path="", file_list=[],
    code="", gpt_result=None, mode="file"
).items():
    if k not in st.session_state:
        st.session_state[k] = v

# ─────────────────────────────────────────────────────────────────────────────
# MODE TOGGLE
# ─────────────────────────────────────────────────────────────────────────────
mode = st.radio(
    "Select mode",
    ["📄 Single File", "📁 Browse Folder"],
    horizontal=True,
    label_visibility="collapsed",
)
st.session_state.mode = mode
st.markdown("")

# ─────────────────────────────────────────────────────────────────────────────
# SINGLE FILE MODE
# ─────────────────────────────────────────────────────────────────────────────
if mode == "📄 Single File":
    st.markdown('<div class="sec-label">📄 Select Python File</div>', unsafe_allow_html=True)

    col_path, col_btn = st.columns([5, 1])
    with col_btn:
        if st.button("📂 Browse", key="pick_file"):
            p = pick_python_file()
            if p:
                st.session_state.selected_file = p
                st.session_state.code       = Path(p).read_text(encoding="utf-8", errors="replace")
                st.session_state.gpt_result = None

    if st.session_state.selected_file:
        st.markdown(f'<div class="path-box">📄 {st.session_state.selected_file}</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="path-box empty">No file selected — click 📂 Browse to pick a .py file</div>', unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# FOLDER MODE
# ─────────────────────────────────────────────────────────────────────────────
else:
    st.markdown('<div class="sec-label">📁 Select Project Folder</div>', unsafe_allow_html=True)

    col_path2, col_btn2 = st.columns([5, 1])
    with col_btn2:
        if st.button("📁 Browse", key="pick_folder"):
            p = pick_folder()
            if p:
                st.session_state.folder_path = p
                files = get_py_files(p)
                st.session_state.file_list   = [str(f) for f in files]
                st.session_state.selected_file = ""
                st.session_state.code        = ""
                st.session_state.gpt_result  = None

    if st.session_state.folder_path:
        st.markdown(f'<div class="path-box">📁 {st.session_state.folder_path}</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="path-box empty">No folder selected — click 📁 Browse to pick your project</div>', unsafe_allow_html=True)

    # File list picker
    if st.session_state.file_list:
        st.markdown('<div class="sec-label" style="margin-top:.9rem">Select a File to Debug</div>', unsafe_allow_html=True)

        # Show relative paths for readability
        base = st.session_state.folder_path
        rel_files = [str(Path(f).relative_to(base)) for f in st.session_state.file_list]

        chosen = st.selectbox(
            "File",
            options=rel_files,
            label_visibility="collapsed",
        )

        if chosen:
            full_path = str(Path(base) / chosen)
            if full_path != st.session_state.selected_file:
                st.session_state.selected_file = full_path
                st.session_state.code          = Path(full_path).read_text(encoding="utf-8", errors="replace")
                st.session_state.gpt_result    = None

        st.markdown(f'<p style="color:#94a3b8;font-size:.8rem">{len(st.session_state.file_list)} Python files found in folder</p>', unsafe_allow_html=True)
    elif st.session_state.folder_path:
        st.warning("No Python (.py) files found in this folder.")

# ─────────────────────────────────────────────────────────────────────────────
# CODE PREVIEW + ANALYSE
# ─────────────────────────────────────────────────────────────────────────────
code = st.session_state.code

if code:
    st.divider()

    # Syntax check
    syntax_errors = quick_syntax_check(code)
    if syntax_errors:
        for err in syntax_errors:
            st.error(f"⚠️ Syntax Error: {err}")
    else:
        st.markdown('<p style="color:#34d399;font-size:.82rem">✅ No syntax errors detected</p>', unsafe_allow_html=True)

    # Preview
    with st.expander(f"👁️ Preview: {Path(st.session_state.selected_file).name}  ({len(code.splitlines())} lines)"):
        st.code(code, language="python")

    st.markdown("")

    # Analyse button
    a_col, r_col = st.columns([3, 1])
    with a_col:
        analyse_btn = st.button("🤖 Analyse Code with GPT")
    with r_col:
        if st.button("🔄 Reset"):
            for k in list(st.session_state.keys()):
                del st.session_state[k]
            st.rerun()

    # ── Run GPT ───────────────────────────────────────────────────────────────
    if analyse_btn:
        st.session_state.gpt_result = None
        fname = Path(st.session_state.selected_file).name

        stream_placeholder = st.empty()
        chunks = []

        progress = st.progress(0, text="Sending code to GPT…")
        try:
            for i, chunk in enumerate(review_code_stream(fname, code)):
                chunks.append(chunk)
                # Show live streaming output
                stream_placeholder.markdown(
                    f"```\n{''.join(chunks)}\n```"
                )
                progress.progress(min(95, 10 + i), text="GPT is analysing…")

            raw = "".join(chunks)
            stream_placeholder.empty()
            progress.progress(100, text="✅ Done!")
            progress.empty()
            st.session_state.gpt_result = parse_gpt_response(raw)
            st.rerun()

        except Exception as e:
            stream_placeholder.empty()
            progress.empty()
            st.error(f"❌ GPT error: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# GPT RESULTS
# ─────────────────────────────────────────────────────────────────────────────
gpt = st.session_state.gpt_result

if gpt:
    st.divider()
    st.markdown('<div class="sec-label">🤖 GPT Analysis Results</div>', unsafe_allow_html=True)

    # Confidence + root cause
    conf      = gpt.get("confidence", "MEDIUM")
    badge_cls = {"HIGH": "badge-high", "MEDIUM": "badge-medium", "LOW": "badge-low"}.get(conf, "badge-medium")
    icon      = {"HIGH": "🟢", "MEDIUM": "🟡", "LOW": "🔴"}.get(conf, "🟡")

    st.markdown(f"""
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <div style="font-size:.72rem;font-weight:600;color:#4a5280;
                    text-transform:uppercase;letter-spacing:.8px">Root Cause</div>
        <span class="cbadge {badge_cls}">{icon} {conf} Confidence</span>
      </div>
      <p style="margin:0;line-height:1.7;color:#ccc">{gpt.get('root_cause', 'No root cause identified.')}</p>
    </div>
    """, unsafe_allow_html=True)

    # Bugs found
    if gpt.get("bugs"):
        st.markdown("**🐛 Bugs Found**")
        for line in gpt["bugs"].splitlines():
            line = line.strip()
            if line:
                st.markdown(f'<div class="bug-item">{line}</div>', unsafe_allow_html=True)

    # Result tabs
    tab1, tab2 = st.tabs(["✅ Fixed Code", "💡 Explanation"])

    with tab1:
        if gpt.get("fixed_code"):
            st.markdown(gpt["fixed_code"])

            # Extract raw code for download
            code_match = re.search(r"```(?:python)?\s*\n(.*?)```", gpt["fixed_code"], re.DOTALL)
            if code_match:
                fixed = code_match.group(1).strip()
                fname = Path(st.session_state.selected_file).stem
                st.download_button(
                    "⬇️ Download Fixed File",
                    data=fixed,
                    file_name=f"{fname}_fixed.py",
                    mime="text/x-python",
                    use_container_width=True,
                )
        else:
            st.info("No fixed code was generated.")

    with tab2:
        if gpt.get("explanation"):
            st.markdown(gpt["explanation"])
        else:
            st.info("No explanation available.")

    # Re-run
    if st.button("🔁 Re-analyse"):
        st.session_state.gpt_result = None
        st.rerun()

# ── Empty state ───────────────────────────────────────────────────────────────
elif not code:
    st.markdown("""
    <div style="text-align:center;padding:2.5rem 0">
      <div style="font-size:3rem">🔍</div>
      <p style="color:#94a3b8;font-size:.95rem;margin-top:.6rem">
        Choose <strong style="color:#60a5fa">📄 Single File</strong> to pick one Python file,<br>
        or <strong style="color:#60a5fa">📁 Browse Folder</strong> to explore your whole project.
      </p>
      <p style="color:#6b7280;font-size:.84rem;margin-top:.4rem">No log file needed — GPT reads your code directly.</p>
    </div>
    """, unsafe_allow_html=True)
