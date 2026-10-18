"""
MongoDB connection and persistence manager for Mindora AI Debug Assistant.

Configure these environment variables in Render:
    MONGO_URI      = MongoDB Atlas connection string
    MONGO_DB_NAME  = mindora_debug_assistant
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

# Do not hard-code database credentials in this file.
# Render must provide MONGO_URI for production.
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "mindora_debug_assistant")

_client: Optional[MongoClient] = None
_db: Optional[Database] = None


def get_mongo_client() -> Optional[MongoClient]:
    """Create and verify the MongoDB client once."""
    global _client

    if _client is not None:
        return _client

    if not MONGO_URI:
        logger.error("MONGO_URI environment variable is not configured.")
        return None

    client: Optional[MongoClient] = None
    try:
        client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
            appname="MindoraAIDebugger",
        )
        client.admin.command("ping")
        _client = client
        logger.info("MongoDB connected successfully.")
        return _client
    except PyMongoError as exc:
        logger.error("MongoDB connection failed (%s). Check Atlas URI, credentials, and Network Access.", type(exc).__name__)
        if client is not None:
            client.close()
        return None


def ping_database() -> bool:
    """Return True only after a real round-trip ping to the database.

    Reuses the cached client when available; otherwise attempts a fresh
    connection. Never raises.
    """
    try:
        client = get_mongo_client()
        if client is None:
            return False
        client.admin.command("ping")
        return True
    except Exception as exc:  # noqa: BLE001 — health checks must not raise
        logger.error("MongoDB ping failed: %s", type(exc).__name__)
        return False


def get_mongo_db() -> Optional[Database]:
    """Return the configured application database."""
    global _db

    client = get_mongo_client()
    if client is None:
        return None

    if _db is None:
        _db = client[MONGO_DB_NAME]
    return _db


def init_mongo() -> bool:
    """Create indexes used by authentication, scans, tests, bugs, and notifications."""
    db = get_mongo_db()
    if db is None:
        return False

    try:
        # Users and authentication
        db.users.create_index([("username", ASCENDING)], unique=True)
        db.users.create_index(
            [("google_subject", ASCENDING)], unique=True, sparse=True
        )

        # Audit scans
        db.audit_scans.create_index([("scan_id", ASCENDING)], unique=True)
        db.audit_scans.create_index([("timestamp", DESCENDING)])
        db.audit_scans.create_index([("username", ASCENDING)])

        # RAG / error memory
        db.error_memory_vectors.create_index([("error_id", ASCENDING)], unique=True)
        db.error_memory_vectors.create_index([("username", ASCENDING)])
        db.error_memory_vectors.create_index([("language", ASCENDING)])
        db.error_memory_vectors.create_index([("category", ASCENDING)])
        db.error_memory_vectors.create_index([("created_at", DESCENDING)])

        # QA / testing workflow
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

        # Bugs and workflow history
        db.bugs.create_index([("id", ASCENDING)], unique=True)
        db.bugs.create_index([("project_id", ASCENDING)])
        db.bugs.create_index([("status", ASCENDING)])
        db.bugs.create_index([("assigned_to", ASCENDING)])
        db.bugs.create_index([("created_by", ASCENDING)])
        db.bug_history.create_index([("bug_id", ASCENDING)])

        # Events, tickets, notifications
        db.audit_events.create_index([("timestamp", DESCENDING)])
        db.audit_events.create_index([("username", ASCENDING)])
        db.audit_events.create_index([("action", ASCENDING)])

        db.tickets.create_index([("id", ASCENDING)], unique=True)
        db.tickets.create_index([("bug_id", ASCENDING)])
        db.tickets.create_index(
            [("project_id", ASCENDING), ("workflow_status", ASCENDING)]
        )

        db.notifications.create_index([("id", ASCENDING)], unique=True)
        db.notifications.create_index(
            [("recipient", ASCENDING), ("read", ASCENDING)]
        )

        logger.info("MongoDB indexes initialized.")
        return True
    except PyMongoError as exc:
        logger.error("MongoDB index initialization failed (%s).", type(exc).__name__)
        return False


# User operations

def mongo_upsert_user(user_doc: Dict[str, Any]) -> bool:
    """Insert or update a user by username."""
    db = get_mongo_db()
    if db is None:
        return False

    try:
        username = user_doc["username"]
        doc = dict(user_doc)
        doc.pop("_id", None)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        db.users.update_one({"username": username}, {"$set": doc}, upsert=True)
        return True
    except (PyMongoError, KeyError, TypeError) as exc:
        logger.error("Could not save user (%s).", type(exc).__name__)
        return False


def mongo_find_user(username: str) -> Optional[Dict[str, Any]]:
    """Find a user by username."""
    db = get_mongo_db()
    if db is None:
        return None

    try:
        return db.users.find_one({"username": username}, {"_id": 0})
    except PyMongoError as exc:
        logger.error("Could not find user (%s).", type(exc).__name__)
        return None


def mongo_find_user_by_google_subject(subject: str) -> Optional[Dict[str, Any]]:
    """Find a user by Google's stable subject identifier."""
    db = get_mongo_db()
    if db is None:
        return None

    try:
        return db.users.find_one({"google_subject": subject}, {"_id": 0})
    except PyMongoError as exc:
        logger.error("Could not find Google user (%s).", type(exc).__name__)
        return None


def mongo_list_users() -> Optional[List[Dict[str, Any]]]:
    """List users without exposing password hashes."""
    db = get_mongo_db()
    if db is None:
        return None

    try:
        cursor = db.users.find(
            {}, {"_id": 0, "password_hash": 0}
        ).sort("registered_at", ASCENDING)
        return list(cursor)
    except PyMongoError as exc:
        logger.error("Could not list users (%s).", type(exc).__name__)
        return None


def mongo_get_all_users_full() -> Optional[Dict[str, Dict[str, Any]]]:
    """Retrieve users including hashes for internal authentication use."""
    db = get_mongo_db()
    if db is None:
        return None

    try:
        cursor = db.users.find({}, {"_id": 0})
        return {doc["username"]: doc for doc in cursor}
    except (PyMongoError, KeyError) as exc:
        logger.error("Could not load user records (%s).", type(exc).__name__)
        return None


def mongo_seed_users(default_users: Dict[str, Dict[str, Any]]) -> None:
    """Insert default users only when they do not already exist."""
    db = get_mongo_db()
    if db is None:
        return

    try:
        init_mongo()
        for username, data in default_users.items():
            doc = dict(data)
            doc["username"] = username
            doc.pop("_id", None)
            db.users.update_one(
                {"username": username}, {"$setOnInsert": doc}, upsert=True
            )
    except PyMongoError as exc:
        logger.error("Could not seed default users (%s).", type(exc).__name__)


# Audit scan operations

def mongo_insert_scan(scan_doc: Dict[str, Any]) -> bool:
    """Save or update an audit scan using its scan_id."""
    db = get_mongo_db()
    if db is None:
        return False

    try:
        doc = dict(scan_doc)
        doc.pop("_id", None)
        scan_id = doc["scan_id"]
        db.audit_scans.update_one(
            {"scan_id": scan_id}, {"$set": doc}, upsert=True
        )
        return True
    except (PyMongoError, KeyError, TypeError) as exc:
        logger.error("Could not save audit scan (%s).", type(exc).__name__)
        return False


def mongo_get_scans(
    limit: int = 50,
    offset: int = 0,
    username: Optional[str] = None,
    status: Optional[str] = None,
    language: Optional[str] = None,
    search: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return filtered and paginated scan logs."""
    db = get_mongo_db()
    if db is None:
        return None

    try:
        query: Dict[str, Any] = {}
        if username:
            query["username"] = username
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
        cursor = (
            db.audit_scans.find(query, {"_id": 0, "issues": 0})
            .sort("timestamp", DESCENDING)
            .skip(max(0, offset))
            .limit(max(1, min(limit, 500)))
        )
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": list(cursor),
        }
    except PyMongoError as exc:
        logger.error("Could not retrieve scans (%s).", type(exc).__name__)
        return None


def mongo_get_scan_detail(scan_id: str) -> Optional[Dict[str, Any]]:
    """Get one full scan record, including issues."""
    db = get_mongo_db()
    if db is None:
        return None

    try:
        return db.audit_scans.find_one({"scan_id": scan_id}, {"_id": 0})
    except PyMongoError as exc:
        logger.error("Could not retrieve scan detail (%s).", type(exc).__name__)
        return None


def mongo_seed_scans(raw_scans: List[Dict[str, Any]]) -> None:
    """Import existing scan records into MongoDB."""
    for scan in raw_scans:
        mongo_insert_scan(scan)


def mongo_clear_scans() -> bool:
    """Delete all audit scan records."""
    db = get_mongo_db()
    if db is None:
        return False

    try:
        db.audit_scans.delete_many({})
        return True
    except PyMongoError as exc:
        logger.error("Could not clear scans (%s).", type(exc).__name__)
        return False


def close_mongo() -> None:
    """Close the MongoDB client during application shutdown."""
    global _client, _db

    if _client is not None:
        _client.close()

    _client = None
    _db = None
    logger.info("MongoDB client closed.")
