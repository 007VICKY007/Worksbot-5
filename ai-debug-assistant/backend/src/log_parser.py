# src/log_parser.py
# STEP 2: Parse a Python traceback from a log file into a structured dict.
#
# Python tracebacks always follow a predictable pattern:
#
#   Traceback (most recent call last):
#     File "foo.py", line 20, in some_function
#       <the offending line of code>
#   ErrorType: error message
#
# We exploit this structure with regex to pull out the five fields we need:
#   error_type, message, file, line, function

import re
from pathlib import Path


# ── Regex patterns ────────────────────────────────────────────────────────────

# Matches each "File ..., line N, in function" frame inside the traceback.
# We keep ALL frames but ultimately want the LAST one — that's the frame
# closest to the actual error site.
_FRAME_RE = re.compile(
    r'File "(?P<file>[^"]+)",\s+line\s+(?P<line>\d+),\s+in\s+(?P<function>\S+)'
)

# Matches the final "ErrorType: message" line that ends every Python traceback.
# The message part is optional (e.g. plain `KeyError` with no colon).
_ERROR_RE = re.compile(
    r'^(?P<error_type>[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)'
    r'(?::\s*(?P<message>.+))?$'
)


# ── Public API ────────────────────────────────────────────────────────────────

def parse_log(log_path: str) -> dict:
    """Parse a Python traceback from a log file.

    Reads the entire log, locates the LAST traceback block, extracts the
    innermost frame (the actual error site), and returns a structured dict.

    Args:
        log_path: Path to the log file (absolute or relative).

    Returns:
        A dict with keys: error_type, message, file, line, function.

    Raises:
        ValueError: if no traceback can be found in the file.
    """
    text = Path(log_path).read_text(encoding="utf-8")

    # Extract the last traceback block from the log.
    # Logs may have multiple crashes; we always want the most recent one.
    traceback_block = _extract_last_traceback(text)
    if not traceback_block:
        raise ValueError(f"No Python traceback found in: {log_path}")

    # Parse the innermost frame + the error line from that block.
    return _parse_traceback_block(traceback_block)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _extract_last_traceback(text: str) -> str | None:
    """Return the text of the last 'Traceback (most recent call last):' block.

    Strategy: split on the sentinel string; everything after the LAST
    occurrence is our traceback block.
    """
    sentinel = "Traceback (most recent call last):"

    # rfind gives us the start of the last traceback header.
    start = text.rfind(sentinel)
    if start == -1:
        return None

    block = text[start:]

    # The traceback ends at the first blank line that appears AFTER the
    # "ErrorType: ..." line.  We stop there so surrounding log lines
    # (e.g. "ERROR Order processing failed.") don't confuse the parser.
    lines = block.splitlines()
    tb_lines = []
    for line in lines:
        tb_lines.append(line)
        # Once we hit the error line (no leading whitespace, not the header),
        # stop collecting — the next blank or log line belongs to the app.
        stripped = line.strip()
        if (
            stripped
            and not stripped.startswith("Traceback")
            and not stripped.startswith("File ")
            and not stripped.startswith("~")   # CPython 3.11 caret lines
            and not stripped.startswith("^")
            and not stripped.startswith("During")  # chained exception note
            and _ERROR_RE.match(stripped)
        ):
            break  # we've collected up to and including the error line

    return "\n".join(tb_lines)


def _parse_traceback_block(block: str) -> dict:
    """Extract structured fields from a single traceback block string.

    Returns a dict with:
        error_type (str)  – Python exception class name
        message    (str)  – exception message (may be empty string)
        file       (str)  – basename of the source file at the error site
        line       (int)  – line number at the error site
        function   (str)  – function name at the error site
    """
    # Collect all stack frames; the LAST frame is the innermost (error site).
    frames = _FRAME_RE.findall(block)
    if not frames:
        raise ValueError("Could not find any 'File ..., line N' frames in traceback.")

    # Each match is a tuple: (file, line, function)
    innermost_file, innermost_line, innermost_function = frames[-1]

    # Find the error type + message — the last non-blank line of the block
    # that matches our error pattern.
    error_type = "UnknownError"
    message = ""
    for line in reversed(block.splitlines()):
        stripped = line.strip()
        m = _ERROR_RE.match(stripped)
        if m:
            error_type = m.group("error_type")
            message = (m.group("message") or "").strip()
            break

    return {
        "error_type": error_type,
        "message":    message,
        # Use only the basename so the retriever can search portably.
        "file":       Path(innermost_file).name,
        "line":       int(innermost_line),
        "function":   innermost_function,
    }


# ── Quick smoke-test (run this file directly to verify) ──────────────────────

if __name__ == "__main__":
    import sys, json

    log_file = sys.argv[1] if len(sys.argv) > 1 else "data/sample_logs/example1.log"
    result = parse_log(log_file)
    print(json.dumps(result, indent=2))
