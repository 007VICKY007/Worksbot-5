# backend/mongo.py
"""
MongoDB connection and persistence manager for Mindora AI Debug Assistant.
Connects to local or remote MongoDB (default: mongodb://localhost:27017/)
and manages collections:
  - users: user accounts, roles, registration dates
  - audit_scans: complete test execution history and file audit manifests
"""

import os
import sys
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pymongo import MongoClient, ASCENDING, errors

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "mindora_debug_assistant")

_client: Optional[MongoClient] = None
_db = None


def get_mongo_client() -> Optional[MongoClient]:
    """Retrieve or initialize singleton MongoClient with short timeout for responsiveness."""
    global _client
    if _client is None:
        try:
            _client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=2500,
                connectTimeoutMS=2500,
            )
            # Ping to verify active connection
            _client.admin.command("ping")
            print("[MongoDB] Connected.")
        except Exception as e:
            print("[MongoDB] Database unavailable.")
            _client = None
    return _client


def get_mongo_db():
    """Retrieve database instance or None if MongoDB is currently unreachable."""
    client = get_mongo_client()
    if client:
        return client[MONGO_DB_NAME]
    return None


def init_mongo():
    """Ensure indexes exist for performance and unique constraints."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        # Unique index on username
        db.users.create_index([("username", ASCENDING)], unique=True)
        # A Google subject is the immutable account identity. Sparse keeps all
        # existing password-only users valid while preventing duplicate Google
        # identities once they are linked.
        db.users.create_index([("google_subject", ASCENDING)], unique=True, sparse=True)
        # Indexes for audit_scans
        db.audit_scans.create_index([("scan_id", ASCENDING)], unique=True)
        db.audit_scans.create_index([("timestamp", ASCENDING)])
        db.audit_scans.create_index([("username", ASCENDING)])
        # Indexes for RAG vector store collection: error_memory_vectors
        db.error_memory_vectors.create_index([("error_id", ASCENDING)], unique=True)
        db.error_memory_vectors.create_index([("username", ASCENDING)])
        db.error_memory_vectors.create_index([("language", ASCENDING)])
        db.error_memory_vectors.create_index([("category", ASCENDING)])
        db.error_memory_vectors.create_index([("created_at", ASCENDING)])
        # Indexes for Department Collections
        db.test_plans.create_index([("id", ASCENDING)], unique=True)
        db.test_plans.create_index([("project_id", ASCENDING)])
        db.test_plans.create_index([("created_by", ASCENDING)])
        db.test_cases.create_index([("id", ASCENDING)], unique=True)
        db.test_cases.create_index([("project_id", ASCENDING)])
        db.test_cases.create_index([("test_plan_id", ASCENDING)])
        db.test_cases.create_index([("assigned_to", ASCENDING)])
        db.test_runs.create_index([("id", ASCENDING)], unique=True)
        db.test_runs.create_index([("project_id", ASCENDING)])
        db.test_runs.create_index([("test_plan_id", ASCENDING)])
        db.test_results.create_index([("id", ASCENDING)], unique=True)
        db.test_results.create_index([("test_run_id", ASCENDING)])
        db.test_results.create_index([("test_case_id", ASCENDING)])
        db.test_results.create_index([("tester_id", ASCENDING)])
        db.bugs.create_index([("id", ASCENDING)], unique=True)
        db.bugs.create_index([("project_id", ASCENDING)])
        db.bugs.create_index([("status", ASCENDING)])
        db.bugs.create_index([("assigned_to", ASCENDING)])
        db.bugs.create_index([("created_by", ASCENDING)])
        db.bug_history.create_index([("bug_id", ASCENDING)])
        db.audit_events.create_index([("timestamp", ASCENDING)])
        db.audit_events.create_index([("username", ASCENDING)])
        db.audit_events.create_index([("action", ASCENDING)])
        db.tickets.create_index([("id", ASCENDING)], unique=True)
        db.tickets.create_index([("bug_id", ASCENDING)])
        db.tickets.create_index([("project_id", ASCENDING), ("workflow_status", ASCENDING)])
        db.notifications.create_index([("id", ASCENDING)], unique=True)
        db.notifications.create_index([("recipient", ASCENDING), ("read", ASCENDING)])
        return True
    except Exception as e:
        print(f"[MongoDB] Index creation note: {e}")
        return False


# ── User Operations ────────────────────────────────────────────────────────────

def mongo_upsert_user(user_doc: Dict[str, Any]) -> bool:
    """Save or update user document in MongoDB."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        username = user_doc["username"]
        doc = dict(user_doc)
        doc.pop("_id", None)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        db.users.update_one(
            {"username": username},
            {"$set": doc},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[MongoDB] Error saving user '{user_doc.get('username')}': {e}")
        return False


def mongo_find_user(username: str) -> Optional[Dict[str, Any]]:
    """Find a single user by username."""
    db = get_mongo_db()
    if db is None:
        return None


def mongo_find_user_by_google_subject(subject: str) -> Optional[Dict[str, Any]]:
    """Find a user by Google's stable subject identifier."""
    db = get_mongo_db()
    if db is None:
        return None
    try:
        return db.users.find_one({"google_subject": subject}, {"_id": 0})
    except Exception as e:
        print(f"[MongoDB] Error finding Google user: {e}")
        return None
    try:
        doc = db.users.find_one({"username": username}, {"_id": 0})
        return doc
    except Exception as e:
        print(f"[MongoDB] Error finding user '{username}': {e}")
        return None


def mongo_list_users() -> Optional[List[Dict[str, Any]]]:
    """List all registered users without exposing password hashes."""
    db = get_mongo_db()
    if db is None:
        return None
    try:
        cursor = db.users.find({}, {"_id": 0, "password_hash": 0}).sort("registered_at", ASCENDING)
        return list(cursor)
    except Exception as e:
        print(f"[MongoDB] Error listing users: {e}")
        return None


def mongo_get_all_users_full() -> Optional[Dict[str, Dict[str, Any]]]:
    """Retrieve full user dictionary including hashes for authentication."""
    db = get_mongo_db()
    if db is None:
        return None
    try:
        cursor = db.users.find({}, {"_id": 0})
        return {doc["username"]: doc for doc in cursor}
    except Exception as e:
        print(f"[MongoDB] Error loading full users: {e}")
        return None


def mongo_seed_users(default_users: Dict[str, Dict[str, Any]]) -> None:
    """Ensure existing or default users from users.json exist in MongoDB."""
    db = get_mongo_db()
    if db is None:
        return
    try:
        init_mongo()
        for u, data in default_users.items():
            doc = dict(data)
            doc["username"] = u
            doc.pop("_id", None)
            db.users.update_one(
                {"username": u},
                {"$setOnInsert": doc},
                upsert=True
            )
    except Exception as e:
        print(f"[MongoDB] Error seeding users: {e}")


# ── Audit Scan Operations ──────────────────────────────────────────────────────

def mongo_insert_scan(scan_doc: Dict[str, Any]) -> bool:
    """Record an audit scan event into MongoDB."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        doc = dict(scan_doc)
        doc.pop("_id", None)
        db.audit_scans.update_one(
            {"scan_id": doc["scan_id"]},
            {"$set": doc},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[MongoDB] Error inserting scan: {e}")
        return False


def mongo_get_scans(
    limit: int = 50,
    offset: int = 0,
    username: Optional[str] = None,
    status: Optional[str] = None,
    language: Optional[str] = None,
    search: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Retrieve filtered and paginated scan logs from MongoDB."""
    db = get_mongo_db()
    if db is None:
        return None
    try:
        query: Dict[str, Any] = {}
        if username:
            query["username"] = username
        if status:
            if status == "clean":
                query["defect_files_count"] = 0
            elif status == "defects":
                query["defect_files_count"] = {"$gt": 0}
        if language and language != "all":
            query[f"language_breakdown.{language.lower()}"] = {"$exists": True}
        if search:
            query["$or"] = [
                {"directory": {"$regex": search, "$options": "i"}},
                {"project_name": {"$regex": search, "$options": "i"}},
                {"scan_id": {"$regex": search, "$options": "i"}},
                {"username": {"$regex": search, "$options": "i"}},
            ]

        total = db.audit_scans.count_documents(query)
        cursor = db.audit_scans.find(query, {"_id": 0, "issues": 0}).sort("timestamp", -1).skip(offset).limit(limit)
        items = list(cursor)
        return {"total": total, "limit": limit, "offset": offset, "items": items}
    except Exception as e:
        print(f"[MongoDB] Error fetching scans: {e}")
        return None


def mongo_get_scan_detail(scan_id: str) -> Optional[Dict[str, Any]]:
    """Get full scan detail including all issues from MongoDB."""
    db = get_mongo_db()
    if db is None:
        return None
    try:
        doc = db.audit_scans.find_one({"scan_id": scan_id}, {"_id": 0})
        return doc
    except Exception as e:
        print(f"[MongoDB] Error fetching scan detail: {e}")
        return None


def mongo_seed_scans(raw_scans: List[Dict[str, Any]]) -> None:
    """Seed existing disk audit scans into MongoDB."""
    db = get_mongo_db()
    if db is None:
        return
    try:
        for scan in raw_scans:
            mongo_insert_scan(scan)
    except Exception as e:
        print(f"[MongoDB] Error seeding scans: {e}")


def mongo_clear_scans() -> bool:
    """Clear all audit scans from MongoDB."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        db.audit_scans.delete_many({})
        return True
    except Exception as e:
        print(f"[MongoDB] Error clearing scans: {e}")
        return False
