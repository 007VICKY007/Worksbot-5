
"use client";

import { uploadLocalProject, scanDirectory } from "@/lib/api";
import { useRef, useState } from "react";
import styles from "./DirBrowser.module.css";

interface Props {
  initialPath?: string;
  onSelect: (files: File[], projectName: string) => void;
  onClose: () => void;
}

export default function DirBrowser({
  initialPath = "",
  onSelect,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState("");

  const ignoredDirectories = new Set([
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
  ]);

  function handleFolderChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selected = Array.from(event.target.files ?? []);
    setError("");

    if (selected.length === 0) {
      setFiles([]);
      setFolderName("");
      return;
    }

    const firstPath = selected[0].webkitRelativePath;

    if (!firstPath) {
      setError("Your browser did not provide folder paths. Please try another browser.");
      setFiles([]);
      setFolderName("");
      return;
    }

    const rootName = firstPath.split("/")[0];

    const filteredFiles = selected.filter((file) => {
      const parts = file.webkitRelativePath.split("/");

      if (
        parts.some((part) => ignoredDirectories.has(part))
      ) {
        return false;
      }

      // Exclude common secret/config files by default.
      const name = parts[parts.length - 1].toLowerCase();

      if (
        name === ".env" ||
        name.startsWith(".env.") ||
        name.endsWith(".pem") ||
        name.endsWith(".key") ||
        name === "id_rsa" ||
        name === "id_ed25519"
      ) {
        return false;
      }

      return true;
    });

    if (filteredFiles.length === 0) {
      setError("No eligible source files were found in the selected folder.");
      setFiles([]);
      setFolderName(rootName);
      return;
    }

    setFiles(filteredFiles);
    setFolderName(rootName);
  }

  function handleSelect() {
    if (files.length === 0 || !folderName) {
      setError("Please select a project folder first.");
      return;
    }

    /*
     * Return a browser-local project identifier, not a server path.
     * The parent component must upload the selected File objects
     * before starting a scan.
     */
    onSelect(`local-folder://${folderName}`);
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            Select local project
          </span>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.pathForm}>
          <div className={styles.pathInput}>
            {folderName || "Choose a folder from your computer"}
          </div>

          <button
            type="button"
            className={styles.goBtn}
            onClick={() => inputRef.current?.click()}
          >
            Browse
          </button>

          <input
            ref={inputRef}
            type="file"
            // @ts-expect-error Chromium and compatible browsers support webkitdirectory
            webkitdirectory=""
            multiple
            hidden
            onChange={handleFolderChange}
          />
        </div>

        <div className={styles.listing}>
          {error && (
            <div className={styles.errorMsg}>{error}</div>
          )}

          {!folderName && !error && (
            <p className={styles.empty}>
              Select a project folder to scan code on your computer.
              Your files will not be uploaded until you start the scan.
            </p>
          )}

          {folderName && (
            <>
              <p>
                <strong>Selected folder:</strong> {folderName}
              </p>

              <p>
                {files.length} eligible files selected
              </p>

              <p className={styles.loadText}>
                Ignored directories and common secret files are excluded.
              </p>

              <div>
                {files.slice(0, 12).map((file) => (
                  <div
                    key={file.webkitRelativePath}
                    className={styles.listRow}
                  >
                    <FolderIcon />
                    <span>
                      {file.webkitRelativePath}
                    </span>
                  </div>
                ))}

                {files.length > 12 && (
                  <p className={styles.empty}>
                    And {files.length - 12} more files…
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.selectedPath}>
            {folderName || "No folder selected"}
          </span>

          <div className={styles.footerBtns}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="button"
              className={styles.selectBtn}
              onClick={handleSelect}
              disabled={files.length === 0}
            >
              Select this folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, color: "#9098a9" }}
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}
