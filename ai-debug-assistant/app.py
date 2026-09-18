# app.py — AI Software Debugging Assistant (Static Analysis Edition)
# Clean white Streamlit UI that scans an entire Python directory for bugs
# and generates a downloadable JSON + readable report.
#
# Run with:   streamlit run app.py

import sys
import os
import json
import tempfile
import zipfile
import io
from pathlib import Path
from datetime import datetime

import streamlit as st

# ── Make sure src/ is importable ─────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent / "src"))

from scanner import scan_directory
from report  import build_report, save_report_json, report_to_text

# ── Page config (must be the very first Streamlit call) ──────────────────────
st.set_page_config(
    page_title="Python Debug Assistant",
    page_icon=":material/bug_report:",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ─────────────────────────────────────────────────────────────────────────────
# Session state initialisation
# ─────────────────────────────────────────────────────────────────────────────
def _init_state():
    defaults = {
        "report":      None,   # the full report dict after a scan
        "scan_dir":    "",     # the directory that was last scanned
        "scan_done":   False,
        "active_file": None,   # file filter selection in results tab
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

_init_state()


# ─────────────────────────────────────────────────────────────────────────────
# Sidebar — configuration panel
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title(":material/bug_report: Debug Assistant")
    st.caption("Static analysis for Python projects")
    st.divider()

    st.subheader(":material/folder_open: Project directory", divider=False)
    scan_dir = st.text_input(
        "Path to scan",
        value=st.session_state["scan_dir"] or "",
        placeholder="/path/to/your/project",
        label_visibility="collapsed",
    )

    st.subheader(":material/tune: Options", divider=False)
    max_line_len = st.slider("Max line length", min_value=79, max_value=200, value=120, step=1)

    severity_filter = st.pills(
        "Show severities",
        options=["error", "warning", "info"],
        default=["error", "warning", "info"],
        selection_mode="multi",
    )

    st.space("small")
    run_btn = st.button(
        ":material/play_arrow: Run scan",
        type="primary",
        disabled=not scan_dir.strip(),
    )

    st.divider()
    st.caption("No AI or internet connection required.  \nPure static analysis using Python's `ast` and `py_compile`.")


# ─────────────────────────────────────────────────────────────────────────────
# Trigger scan
# ─────────────────────────────────────────────────────────────────────────────
if run_btn:
    target = scan_dir.strip()
    if not os.path.isdir(target):
        st.error(f":material/error: Directory not found: `{target}`", icon=":material/error:")
    else:
        with st.spinner("Scanning… this may take a moment for large projects."):
            issues  = scan_directory(target, max_line_len=max_line_len)
            report  = build_report(target, issues)
        st.session_state["report"]    = report
        st.session_state["scan_dir"]  = target
        st.session_state["scan_done"] = True
        st.session_state["active_file"] = None
        st.toast("Scan complete!", icon=":material/check_circle:")


# ─────────────────────────────────────────────────────────────────────────────
# Hero / landing state (no scan yet)
# ─────────────────────────────────────────────────────────────────────────────
if not st.session_state["scan_done"]:
    st.title("Python Debug Assistant")
    st.write("Detect bugs, code smells, and issues across your entire Python project — instantly, with no AI or internet required.")
    st.space("small")

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        with st.container(border=True):
            st.markdown(":material/search: **Syntax errors**")
            st.caption("Catches SyntaxErrors before runtime using `py_compile`")
    with col2:
        with st.container(border=True):
            st.markdown(":material/code: **AST analysis**")
            st.caption("Detects bare excepts, mutable defaults, None comparisons & more")
    with col3:
        with st.container(border=True):
            st.markdown(":material/upload_file: **Unused imports**")
            st.caption("Flags imports that are never referenced in the file")
    with col4:
        with st.container(border=True):
            st.markdown(":material/description: **Full report**")
            st.caption("Download a JSON report or copy the plain-text summary")

    st.space("medium")
    st.info(":material/arrow_back: Enter your project path in the sidebar and click **Run scan** to begin.", icon=":material/info:")
    st.stop()


# ─────────────────────────────────────────────────────────────────────────────
# Results — shown after a successful scan
# ─────────────────────────────────────────────────────────────────────────────
report = st.session_state["report"]
issues = report["issues"]

# Apply severity filter
filtered = [i for i in issues if i["severity"] in severity_filter] if severity_filter else issues

# ── Page header ───────────────────────────────────────────────────────────────
st.title(":material/analytics: Scan Results")
st.caption(f"Directory: `{report['scanned_directory']}` · {report['scan_timestamp']}")
st.space("small")

# ── KPI metrics row ───────────────────────────────────────────────────────────
m1, m2, m3, m4, m5 = st.columns(5)
m1.metric(":material/folder: Files scanned",   report["total_py_files"])
m2.metric(":material/warning: Files with issues", report["files_with_issues"])
m3.metric(":red[:material/error: Errors]",        report["summary"]["error"])
m4.metric(":orange[:material/report: Warnings]",  report["summary"]["warning"])
m5.metric(":blue[:material/info: Info]",          report["summary"]["info"])

st.space("small")

# ── Tabs ──────────────────────────────────────────────────────────────────────
tab_issues, tab_chart, tab_json, tab_text = st.tabs([
    ":material/list: Issues",
    ":material/bar_chart: By category",
    ":material/data_object: JSON report",
    ":material/article: Text summary",
])


# ════════════════════════════════════════════════════════════
# TAB 1 — Issue list
# ════════════════════════════════════════════════════════════
with tab_issues:

    if not filtered:
        st.success(":material/check_circle: No issues found for the selected severities!", icon=":material/check_circle:")
    else:
        # File filter pill selector
        file_list = sorted({i["file"] for i in filtered})
        chosen_file = st.selectbox(
            "Filter by file",
            options=["All files"] + file_list,
            index=0,
        )
        st.space("small")

        view = filtered if chosen_file == "All files" else [i for i in filtered if i["file"] == chosen_file]

        # Group by file for display
        by_file: dict[str, list] = {}
        for iss in view:
            by_file.setdefault(iss["file"], []).append(iss)

        # Severity icons & colours
        SEV = {
            "error":   (":material/error:",   ":red[**Error**]"),
            "warning": (":material/warning:", ":orange[**Warning**]"),
            "info":    (":material/info:",    ":blue[**Info**]"),
        }

        for filepath, file_issues in sorted(by_file.items()):
            err_c   = sum(1 for x in file_issues if x["severity"] == "error")
            warn_c  = sum(1 for x in file_issues if x["severity"] == "warning")
            info_c  = sum(1 for x in file_issues if x["severity"] == "info")
            badge   = []
            if err_c:  badge.append(f":red-badge[{err_c} error{'s' if err_c>1 else ''}]")
            if warn_c: badge.append(f":orange-badge[{warn_c} warning{'s' if warn_c>1 else ''}]")
            if info_c: badge.append(f":blue-badge[{info_c} info]")

            with st.expander(f":material/description: `{filepath}`   {'  '.join(badge)}", expanded=True):
                for iss in file_issues:
                    icon, label = SEV.get(iss["severity"], (":material/circle:", ""))
                    loc = f"Line {iss['line']}" if iss["line"] else "—"
                    left, right = st.columns([1, 8])
                    with left:
                        st.markdown(f"{icon}")
                    with right:
                        st.markdown(f"{label} · `{iss['category']}` · **{loc}**")
                        st.write(iss["message"])
                        if iss.get("snippet"):
                            st.code(iss["snippet"], language="python")
                    st.divider()


# ════════════════════════════════════════════════════════════
# TAB 2 — Category bar chart
# ════════════════════════════════════════════════════════════
with tab_chart:
    if not filtered:
        st.info("No issues to chart.")
    else:
        # Build category counts from filtered issues
        cat_counts: dict[str, int] = {}
        for iss in filtered:
            cat_counts[iss["category"]] = cat_counts.get(iss["category"], 0) + 1
        cat_counts = dict(sorted(cat_counts.items(), key=lambda x: x[1], reverse=True))

        # Altair-style via st.bar_chart (no extra dep needed)
        import pandas as pd
        df = pd.DataFrame({
            "Category": list(cat_counts.keys()),
            "Count":    list(cat_counts.values()),
        })
        st.subheader("Issues by category")
        st.bar_chart(df, x="Category", y="Count", color="#2563EB")

        st.space("small")
        st.subheader("Breakdown table")
        # Severity breakdown per category
        rows = []
        for cat in cat_counts:
            cat_issues = [i for i in filtered if i["category"] == cat]
            rows.append({
                "Category": cat,
                "Total":    len(cat_issues),
                "Errors":   sum(1 for i in cat_issues if i["severity"] == "error"),
                "Warnings": sum(1 for i in cat_issues if i["severity"] == "warning"),
                "Info":     sum(1 for i in cat_issues if i["severity"] == "info"),
            })
        st.dataframe(pd.DataFrame(rows), hide_index=True)


# ════════════════════════════════════════════════════════════
# TAB 3 — JSON report download
# ════════════════════════════════════════════════════════════
with tab_json:
    json_str = json.dumps(report, indent=2, ensure_ascii=False)
    st.download_button(
        label=":material/download: Download report.json",
        data=json_str,
        file_name=f"debug_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
        mime="application/json",
        type="primary",
    )
    st.space("small")
    st.code(json_str[:6000] + ("\n\n... (truncated for display)" if len(json_str) > 6000 else ""),
            language="json")


# ════════════════════════════════════════════════════════════
# TAB 4 — Plain-text summary
# ════════════════════════════════════════════════════════════
with tab_text:
    text_summary = report_to_text(report)
    st.download_button(
        label=":material/download: Download summary.txt",
        data=text_summary,
        file_name=f"debug_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
        mime="text/plain",
        type="primary",
    )
    st.space("small")
    st.code(text_summary, language="text")
