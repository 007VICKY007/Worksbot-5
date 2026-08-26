#!/usr/bin/env python3
# file_dialog.py — run as a subprocess to show a native macOS file/folder picker
# Prints the selected path to stdout (empty string if cancelled).

import sys
import tkinter as tk
from tkinter import filedialog

mode = sys.argv[1] if len(sys.argv) > 1 else "file"

root = tk.Tk()
root.withdraw()
root.wm_attributes("-topmost", True)
root.update()

if mode == "folder":
    path = filedialog.askdirectory(title="Select Project Folder")
else:
    path = filedialog.askopenfilename(
        title="Select Python File to Debug",
        filetypes=[("Python files", "*.py"), ("All files", "*.*")],
    )

print(path or "", end="")
root.destroy()
