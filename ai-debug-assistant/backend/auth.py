# backend/auth.py
# Handles password hashing, JWT creation/validation, user registration, and storage.
# User profiles and hashed credentials are stored in backend/users.json.

import os
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()   # argon2-cffi — robust & compatible with Python 3.14+

SECRET       = os.getenv("JWT_SECRET", "debug-assistant-secret-key-change-in-prod")
ALGORITHM    = "HS256"
EXPIRE_HOURS = 8

USERS_FILE = Path(__file__).parent / "users.json"


# ── User store ────────────────────────────────────────────────────────────────

def _load_users() -> dict:
    """Load users from disk. Creates default accounts on first run."""
    if USERS_FILE.exists():
        try:
            data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
            # Normalize legacy dict (where value was just a hash string)
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

    # First-run: create defaults and persist them
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
        }
    }
    USERS_FILE.write_text(json.dumps(defaults, indent=2), encoding="utf-8")
    return defaults


def _save_users(users: dict) -> None:
    """Write users dictionary to disk safely."""
    USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")


# ── Registration & Query ──────────────────────────────────────────────────────

def register_user(username: str, password: str, role: str = "developer") -> dict:
    """Register a new user. Raises ValueError if user already exists or input is invalid."""
    u = username.strip()
    if not u or len(u) < 3:
        raise ValueError("Username must be at least 3 characters long.")
    if not password or len(password) < 4:
        raise ValueError("Password must be at least 4 characters long.")

    users = _load_users()
    if u in users:
        raise ValueError(f"Username '{u}' is already registered.")

    now = datetime.now(timezone.utc).isoformat()
    users[u] = {
        "username": u,
        "password_hash": _ph.hash(password),
        "role": role,
        "registered_at": now
    }
    _save_users(users)
    return {
        "username": u,
        "role": role,
        "registered_at": now
    }


def list_registered_users() -> list[dict]:
    """Return all registered users metadata (omitting password hashes)."""
    users = _load_users()
    return [
        {
            "username": u_data.get("username", u),
            "role": u_data.get("role", "developer"),
            "registered_at": u_data.get("registered_at", "")
        }
        for u, u_data in users.items()
    ]


# ── Password verification ──────────────────────────────────────────────────────

def verify_credentials(username: str, password: str) -> bool:
    """Return True if the username exists and the password matches."""
    users = _load_users()
    u = username.strip()
    if u not in users:
        return False
    user_info = users[u]
    pwd_hash = user_info.get("password_hash") if isinstance(user_info, dict) else user_info
    try:
        return _ph.verify(pwd_hash, password)
    except (VerifyMismatchError, Exception):
        return False


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_token(username: str) -> str:
    """Create a signed JWT that expires after EXPIRE_HOURS."""
    payload = {
        "sub": username,
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
