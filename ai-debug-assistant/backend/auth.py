# backend/auth.py
# JWT issuance / verification and user registration.
# User profiles and hashed credentials are stored in MongoDB (mongodb://localhost:27017/)
# with backend/users.json kept in sync as a resilient disk backup.

import os
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Import MongoDB operations
try:
    from mongo import (
        init_mongo,
        mongo_upsert_user,
        mongo_find_user,
        mongo_find_user_by_google_subject,
        mongo_list_users,
        mongo_get_all_users_full,
        mongo_seed_users,
    )
except ImportError:
    from backend.mongo import (
        init_mongo,
        mongo_upsert_user,
        mongo_find_user,
        mongo_find_user_by_google_subject,
        mongo_list_users,
        mongo_get_all_users_full,
        mongo_seed_users,
    )

_ph = PasswordHasher()   # argon2-cffi — robust & compatible with Python 3.14+

SECRET       = os.getenv("JWT_SECRET", "debug-assistant-secret-key-change-in-prod")
ALGORITHM    = "HS256"
EXPIRE_HOURS = 8

USERS_FILE = Path(__file__).parent / "users.json"

# These are the only roles a user may select during self-service registration.
# Administrative access is granted exclusively through the protected admin flow.
SELF_SERVICE_ROLES = {"developer", "qa", "tester"}


# ── User store ────────────────────────────────────────────────────────────────

def _load_disk_users() -> dict:
    """Load users from disk backup."""
    if USERS_FILE.exists():
        try:
            data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
            normalized = {}
            for u, val in data.items():
                if isinstance(val, str):
                    normalized[u] = {
                        "username": u,
                        "password_hash": val,
                        "role": "admin" if u == "admin" else "developer",
                        "registered_at": "2026-09-08T00:00:00Z"
                    }
                else:
                    normalized[u] = val
            return normalized
        except Exception:
            pass

    # First-run default accounts
    now = datetime.now(timezone.utc).isoformat()
    defaults = {
        "admin": {
            "username": "admin",
            "password_hash": _ph.hash("admin123"),
            "role": "admin",
            "registered_at": now
        },
        "user": {
            "username": "user",
            "password_hash": _ph.hash("user123"),
            "role": "developer",
            "registered_at": now
        },
        "qa_user": {
            "username": "qa_user",
            "password_hash": _ph.hash("qa123"),
            "role": "qa",
            "registered_at": now
        },
        "tester_user": {
            "username": "tester_user",
            "password_hash": _ph.hash("tester123"),
            "role": "tester",
            "registered_at": now
        }
    }
    try:
        USERS_FILE.write_text(json.dumps(defaults, indent=2), encoding="utf-8")
    except Exception:
        pass
    return defaults


def _save_disk_users(users: dict) -> None:
    """Write users dictionary to disk backup safely."""
    try:
        USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[Auth] Warning writing disk backup: {e}")


def _load_users() -> dict:
    """
    Load users. Attempts MongoDB first; automatically synchronizes
    with disk backup and seeds MongoDB on first start.
    """
    mongo_users = mongo_get_all_users_full()
    disk_users = _load_disk_users()

    now = datetime.now(timezone.utc).isoformat()
    if mongo_users is not None and len(mongo_users) > 0:
        merged = dict(disk_users)
        merged.update(mongo_users)
        if "qa_user" not in merged:
            merged["qa_user"] = {
                "username": "qa_user",
                "password_hash": _ph.hash("qa123"),
                "role": "qa",
                "registered_at": now
            }
            mongo_upsert_user(merged["qa_user"])
        if "tester_user" not in merged:
            merged["tester_user"] = {
                "username": "tester_user",
                "password_hash": _ph.hash("tester123"),
                "role": "tester",
                "registered_at": now
            }
            mongo_upsert_user(merged["tester_user"])
        _save_disk_users(merged)
        return merged
    elif mongo_users is not None and len(mongo_users) == 0:
        mongo_seed_users(disk_users)
        return disk_users

    return disk_users


# Initialization is lazy. Importing the API must not read credentials or seed a DB.


# ── Registration & Query ──────────────────────────────────────────────────────

def register_user(username: str, password: str, role: str = "developer") -> dict:
    """
    Register a new user directly in MongoDB (and syncs to disk backup).
    Raises ValueError if user already exists or input is invalid.
    """
    role = role.strip().lower()
    if role not in SELF_SERVICE_ROLES:
        raise ValueError("This role cannot be self-assigned.")
    u = username.strip()
    if not u or len(u) < 3:
        raise ValueError("Username must be at least 3 characters long.")
    if not password or len(password) < 4:
        raise ValueError("Password must be at least 4 characters long.")

    # Check MongoDB or cached users
    existing = mongo_find_user(u)
    if not existing:
        current_users = _load_users()
        if u in current_users:
            existing = current_users[u]

    if existing:
        raise ValueError(f"Username '{u}' is already registered.")

    now = datetime.now(timezone.utc).isoformat()
    new_user_doc = {
        "username": u,
        "password_hash": _ph.hash(password),
        "role": role,
        "registered_at": now
    }

    # 1. Store in MongoDB
    mongo_upsert_user(new_user_doc)

    # 2. Store in disk backup
    disk_users = _load_disk_users()
    disk_users[u] = new_user_doc
    _save_disk_users(disk_users)

    return {
        "username": u,
        "role": role,
        "registered_at": now
    }


def _find_disk_user_by_google_subject(subject: str) -> Optional[dict]:
    """Find a persisted fallback user using the immutable Google account ID."""
    return next(
        (user for user in _load_disk_users().values() if user.get("google_subject") == subject),
        None,
    )


def _self_service_role(role: Optional[str]) -> str:
    """Validate a role chosen during registration; never trust the browser."""
    chosen = normalize_role(role or "developer")
    if chosen not in SELF_SERVICE_ROLES:
        raise ValueError("This role cannot be self-assigned.")
    return chosen


def _save_google_profile(user: dict, claims: dict, subject: str, email: str) -> dict:
    """Persist non-sensitive Google profile data without resetting the saved role."""
    now = datetime.now(timezone.utc).isoformat()
    updated = {
        **user,
        "google_subject": subject,
        "email": email,
        "display_name": str(claims.get("name", "")).strip(),
        "profile_image": str(claims.get("picture", "")).strip(),
        "last_login_at": now,
        "auth_provider": "google" if not user.get("password_hash") else "local_google",
    }
    mongo_upsert_user(updated)
    disk_users = _load_disk_users()
    disk_users[updated["username"]] = {**disk_users.get(updated["username"], {}), **updated}
    _save_disk_users(disk_users)
    return updated


def authenticate_google_id_token(credential: str, requested_role: Optional[str] = None) -> dict:
    """Verify a Google ID token and return the linked local user.

    Google authentication is deliberately verified by the API, never trusted from
    browser-supplied profile fields. Returning users are resolved by Google's
    immutable ``sub`` claim and always retain their saved role. First-time users
    may choose only a server-approved self-service role.
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise ValueError("Google sign-in is not configured on the server.")
    if not credential or not credential.strip():
        raise ValueError("Google did not return an ID token.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:
        raise ValueError("Google sign-in support is unavailable. Install google-auth.") from exc

    try:
        claims = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except Exception as exc:
        raise ValueError("Google sign-in could not be verified.") from exc

    issuer = claims.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise ValueError("Google sign-in token has an invalid issuer.")
    if not claims.get("email_verified"):
        raise ValueError("Your Google account must have a verified email address.")

    email = str(claims.get("email", "")).strip().lower()
    subject = str(claims.get("sub", "")).strip()
    if not email or not subject:
        raise ValueError("Google sign-in token is missing account details.")

    # Subject-first lookup prevents duplicate accounts when a Google user changes
    # their email address. The email lookup below is only for one-time linking of
    # a pre-existing local account.
    existing = mongo_find_user_by_google_subject(subject) or _find_disk_user_by_google_subject(subject)

    if existing:
        if existing.get("disabled"):
            raise ValueError("This account is disabled.")
        updated = _save_google_profile(existing, claims, subject, email)
        return {
            "username": updated["username"],
            "role": normalize_role(updated.get("role")),
            "registered_at": updated.get("registered_at", ""),
        }

    existing = mongo_find_user(email) or _load_disk_users().get(email)
    if existing:
        if existing.get("role") == "admin":
            raise ValueError("Administrator accounts must use administrator sign-in.")
        if existing.get("disabled"):
            raise ValueError("This account is disabled.")
        updated = _save_google_profile(existing, claims, subject, email)
        return {
            "username": updated["username"],
            "role": normalize_role(updated.get("role")),
            "registered_at": updated.get("registered_at", ""),
        }

    now = datetime.now(timezone.utc).isoformat()
    role = _self_service_role(requested_role)
    user = {
        "username": email,
        "email": email,
        "password_hash": None,
        "role": role,
        "registered_at": now,
        "last_login_at": now,
        "auth_provider": "google",
        "google_subject": subject,
        "display_name": str(claims.get("name", "")).strip(),
        "profile_image": str(claims.get("picture", "")).strip(),
    }
    mongo_upsert_user(user)
    disk_users = _load_disk_users()
    disk_users[email] = user
    _save_disk_users(disk_users)
    return {"username": email, "role": role, "registered_at": now}


def list_registered_users() -> list[dict]:
    """Return all registered users metadata from MongoDB (omitting password hashes)."""
    mongo_users = mongo_list_users()
    if mongo_users is not None and len(mongo_users) > 0:
        return [
            {
                "username": u.get("username", ""),
                "role": u.get("role", "developer"),
                "disabled": bool(u.get("disabled", False)),
                "registered_at": u.get("registered_at", "")
            }
            for u in mongo_users
        ]

    # Fallback to disk users
    users = _load_users()
    return [
        {
            "username": u_data.get("username", u),
            "role": u_data.get("role", "developer"),
            "disabled": bool(u_data.get("disabled", False)),
            "registered_at": u_data.get("registered_at", "")
        }
        for u, u_data in users.items()
    ]


# ── Password verification ──────────────────────────────────────────────────────

def verify_credentials(username: str, password: str) -> bool:
    """Return True if the username exists in MongoDB/disk and the password matches."""
    u = username.strip()

    # Try fetching directly from MongoDB
    user_doc = mongo_find_user(u)
    if not user_doc:
        users = _load_users()
        user_doc = users.get(u)

    if not user_doc or user_doc.get("disabled"):
        return False

    pwd_hash = user_doc.get("password_hash") if isinstance(user_doc, dict) else user_doc
    if not pwd_hash:
        return False
    try:
        return _ph.verify(pwd_hash, password)
    except (VerifyMismatchError, Exception):
        return False


VALID_ROLES = {"developer", "qa", "tester", "admin"}
# Legacy role names stored by older versions of the app.
ROLE_ALIASES = {"qa_tester": "qa", "qa-tester": "qa", "qatester": "qa", "dev": "developer", "test": "tester"}


def normalize_role(role) -> str:
    """Canonical role used by RBAC and the frontend router (unknown -> developer)."""
    r = str(role or "").strip().lower()
    r = ROLE_ALIASES.get(r, r)
    return r if r in VALID_ROLES else "developer"


def get_user_role(username: str) -> str:
    """Lookup user role from MongoDB or persistent store."""
    u = username.strip()
    user_doc = mongo_find_user(u)
    if user_doc and isinstance(user_doc, dict):
        return normalize_role(user_doc.get("role", "developer"))

    users = _load_users()
    u_info = users.get(u, {})
    if isinstance(u_info, dict):
        return normalize_role(u_info.get("role", "developer"))
    return "developer"


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_token(username: str, role: Optional[str] = None) -> str:
    """Create a signed JWT that expires after EXPIRE_HOURS."""
    user_role = role or get_user_role(username)
    payload = {
        "sub": username,
        "role": user_role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns the payload or None if invalid."""
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def update_registered_user(username: str, updates: dict, actor: str) -> dict:
    """Serialize role changes and protect the last enabled administrator."""
    from fastapi import HTTPException
    from pymongo.errors import DuplicateKeyError
    from workflow import database
    from departments import log_department_action
    db = database()
    if not updates or set(updates) - {"role", "disabled"}:
        raise HTTPException(400, "Provide role and/or disabled.")
    if "role" in updates and updates["role"] not in {"developer", "qa", "tester", "admin"}:
        raise HTTPException(400, "Unknown role.")
    lock = "workflow-admin-users-lock"
    try:
        db.code_changes.insert_one({"_id": lock, "actor": actor})
    except DuplicateKeyError:
        raise HTTPException(409, "Another administrator is updating users. Retry after reloading.")
    try:
        user = db.users.find_one({"username": username})
        if not user:
            raise HTTPException(404, "User not found.")
        changed = {**user, **updates}
        if (user.get("role") == "admin" and not user.get("disabled")
                and (changed.get("role") != "admin" or changed.get("disabled"))
                and db.users.count_documents({"role": "admin", "disabled": {"$ne": True}}) <= 1):
            raise HTTPException(409, "The last enabled administrator cannot be disabled or demoted.")
        db.users.update_one({"username": username}, {"$set": updates})
        # Keep the existing fallback current, never expose credential fields in responses.
        disk_users = _load_disk_users()
        if username in disk_users:
            disk_users[username].update(updates)
            _save_disk_users(disk_users)
        log_department_action(actor, "admin", "USER_UPDATED", resource_id=username, metadata=updates)
        return {"username": username, "role": changed["role"], "disabled": bool(changed.get("disabled")),
                "registered_at": changed.get("registered_at", "")}
    finally:
        db.code_changes.delete_one({"_id": lock})
