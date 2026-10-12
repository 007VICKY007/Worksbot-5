"""Focused Google identity and role-persistence tests (no Google network required)."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import auth  # noqa: E402


CLIENT_ID = "test-client.apps.googleusercontent.com"
CLAIMS = {
    "iss": "https://accounts.google.com",
    "email_verified": True,
    "email": "person@example.com",
    "sub": "google-subject-123",
    "name": "Example Person",
    "picture": "https://example.com/profile.png",
}


class GoogleAuthenticationTests(unittest.TestCase):
    def authenticate(self, *, subject_user=None, email_user=None, role=None):
        disk_users = {}
        with (
            patch.dict(os.environ, {"GOOGLE_CLIENT_ID": CLIENT_ID}),
            patch("google.oauth2.id_token.verify_oauth2_token", return_value=CLAIMS),
            patch("google.auth.transport.requests.Request"),
            patch.object(auth, "mongo_find_user_by_google_subject", return_value=subject_user),
            patch.object(auth, "_find_disk_user_by_google_subject", return_value=None),
            patch.object(auth, "mongo_find_user", return_value=email_user),
            patch.object(auth, "_load_disk_users", return_value=disk_users),
            patch.object(auth, "mongo_upsert_user") as mongo_upsert,
            patch.object(auth, "_save_disk_users") as save_disk,
        ):
            user = auth.authenticate_google_id_token("signed-google-id-token", role)
        return user, mongo_upsert, save_disk

    def test_new_google_user_can_register_as_qa(self):
        user, mongo_upsert, save_disk = self.authenticate(role="qa")

        self.assertEqual(user["username"], "person@example.com")
        self.assertEqual(user["role"], "qa")
        created = mongo_upsert.call_args.args[0]
        self.assertEqual(created["role"], "qa")
        self.assertEqual(created["google_subject"], "google-subject-123")
        self.assertEqual(created["email"], "person@example.com")
        self.assertTrue(save_disk.called)

    def test_returning_google_user_keeps_database_role(self):
        existing = {
            "username": "person@example.com",
            "role": "qa",
            "google_subject": "google-subject-123",
            "registered_at": "2026-01-01T00:00:00Z",
        }
        user, mongo_upsert, _ = self.authenticate(subject_user=existing, role="developer")

        self.assertEqual(user["role"], "qa")
        self.assertEqual(mongo_upsert.call_args.args[0]["role"], "qa")

    def test_existing_password_user_is_linked_without_role_reset(self):
        existing = {
            "username": "person@example.com",
            "password_hash": "local-password-hash",
            "role": "tester",
            "registered_at": "2026-01-01T00:00:00Z",
        }
        user, mongo_upsert, _ = self.authenticate(email_user=existing, role="qa")

        self.assertEqual(user["role"], "tester")
        linked = mongo_upsert.call_args.args[0]
        self.assertEqual(linked["auth_provider"], "local_google")
        self.assertEqual(linked["google_subject"], "google-subject-123")

    def test_privileged_role_cannot_be_self_assigned(self):
        with self.assertRaisesRegex(ValueError, "cannot be self-assigned"):
            self.authenticate(role="admin")

    def test_duplicate_google_login_does_not_create_new_user(self):
        existing = {
            "username": "person@example.com",
            "role": "developer",
            "google_subject": "google-subject-123",
            "registered_at": "2026-01-01T00:00:00Z",
        }
        user, mongo_upsert, _ = self.authenticate(subject_user=existing)

        self.assertEqual(user["role"], "developer")
        self.assertEqual(mongo_upsert.call_args.args[0]["username"], "person@example.com")

    def test_administrator_cannot_be_linked_with_google(self):
        existing = {"username": "person@example.com", "role": "admin"}
        with self.assertRaisesRegex(ValueError, "Administrator accounts"):
            self.authenticate(email_user=existing)


if __name__ == "__main__":
    unittest.main()
