# tests/test_audit_logger.py
# Verification of audit logging, scan event recording, and admin role authorization.

import sys
import unittest
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "backend"))

from audit_logger import record_scan_event, get_audit_logs, get_scan_detail, get_system_audit_stats, clear_audit_logs
from scanner import scan_directory_detailed
from auth import create_token, decode_token, get_user_role


class TestAuditLogger(unittest.TestCase):

    def setUp(self):
        clear_audit_logs()

    def tearDown(self):
        clear_audit_logs()

    def test_record_and_retrieve_scan_event(self):
        sample_report = {
            "total_files": 2,
            "files_with_issues": 1,
            "total_issues": 1,
            "summary": {"error": 1, "warning": 0, "info": 0},
            "severity_breakdown": {"CRITICAL": 1},
            "by_category": {"SYNTAX": 1},
            "languages_detected": {"Python": 1, "TypeScript": 1},
            "issues": [
                {
                    "file": "bad.py",
                    "line": 10,
                    "severity": "CRITICAL",
                    "category": "SYNTAX",
                    "rule": "SyntaxError",
                    "message": "invalid syntax",
                }
            ]
        }
        all_files = [
            {
                "file": "bad.py",
                "filename": "bad.py",
                "language": "Python",
                "lines": 25,
                "issues_count": 1,
                "status": "DEFECTS_DETECTED",
                "issues": sample_report["issues"]
            },
            {
                "file": "clean.ts",
                "filename": "clean.ts",
                "language": "TypeScript",
                "lines": 40,
                "issues_count": 0,
                "status": "PASSED",
                "issues": []
            }
        ]

        # Record scan event
        record = record_scan_event(
            username="vicky_dev",
            user_role="developer",
            directory="/workspace/demo",
            report=sample_report,
            all_files_tested=all_files
        )

        self.assertIn("scan_id", record)
        self.assertEqual(record["username"], "vicky_dev")
        self.assertEqual(record["user_role"], "developer")
        self.assertEqual(record["overall_status"], "DEFECTS_DETECTED")
        self.assertEqual(len(record["files_tested"]), 2)
        self.assertEqual(record["clean_files_count"], 1)
        self.assertEqual(record["defective_files_count"], 1)

        # Retrieve through get_audit_logs
        logs = get_audit_logs(limit=10)
        self.assertEqual(logs["total"], 1)
        item = logs["items"][0]
        self.assertEqual(item["username"], "vicky_dev")
        self.assertEqual(item["files_tested_count"], 2)

        # Retrieve detail
        detail = get_scan_detail(record["scan_id"])
        self.assertIsNotNone(detail)
        self.assertEqual(len(detail["files_tested"]), 2)

        # Check stats
        stats = get_system_audit_stats()
        self.assertEqual(stats["total_scans"], 1)
        self.assertEqual(stats["total_files_tested"], 2)
        self.assertEqual(stats["total_issues_found"], 1)
        self.assertIn("vicky_dev", stats["unique_users"])

    def test_role_in_token(self):
        token = create_token("admin", role="admin")
        payload = decode_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["sub"], "admin")
        self.assertEqual(payload["role"], "admin")

    def test_scan_directory_detailed_returns_all_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            f1 = tmp / "clean.py"
            f1.write_text("x = 10\nprint(x)\n", encoding="utf-8")
            f2 = tmp / "bad.py"
            f2.write_text("def f(x=[]):\n    pass\n", encoding="utf-8")

            issues, files_tested = scan_directory_detailed(str(tmp))
            self.assertEqual(len(files_tested), 2)
            statuses = {f["file"]: f["status"] for f in files_tested}
            self.assertEqual(statuses.get("clean.py"), "PASSED")
            self.assertEqual(statuses.get("bad.py"), "DEFECTS_DETECTED")


if __name__ == "__main__":
    unittest.main()
