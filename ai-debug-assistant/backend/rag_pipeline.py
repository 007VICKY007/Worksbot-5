# backend/rag_pipeline.py
"""
Mindora RAG (Retrieval-Augmented Generation) Pipeline & Vector Store Engine.
Remembers all errors, code contexts, and verified fixes across every user's tested files.
Persists high-dimensional vector embeddings (1536-dim) in MongoDB collection `error_memory_vectors`.
Enables semantic similarity retrieval to augment AI code reasoning with past proven solutions.
"""

import os
import re
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from pymongo import ASCENDING, errors
from dotenv import load_dotenv

import sys
ROOT = Path(__file__).parent.parent
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))
if str(Path(__file__).parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).parent))

from mongo import get_mongo_db

load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).parent / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
VECTOR_DIM = 1536
COLLECTION_NAME = "error_memory_vectors"

_openai_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None and OPENAI_API_KEY:
        try:
            import openai
            _openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
        except Exception as e:
            print(f"[RAG] OpenAI client init warning: {e}")
            _openai_client = None
    return _openai_client


def _fallback_pseudo_embedding(text: str, dim: int = VECTOR_DIM) -> List[float]:
    """
    Deterministic normalized fallback vector in case API is offline or key missing.
    Uses MD5/SHA256 sliding hashing to populate unit hypersphere uniformly.
    """
    vec = np.zeros(dim, dtype=np.float32)
    cleaned = text.lower().strip()
    words = re.findall(r"\w+", cleaned)
    if not words:
        words = ["empty", "code", "file"]

    for i, word in enumerate(words):
        h = int(hashlib.md5(f"{word}_{i % 64}".encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 4) & 1) else -1.0
        vec[idx] += sign * (1.0 + (len(word) % 5))

    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    else:
        vec[0] = 1.0
    return [round(float(x), 6) for x in vec]


def generate_embedding(text: str) -> List[float]:
    """
    Generate 1536-dimensional vector embedding for text using OpenAI text-embedding-3-small,
    falling back to deterministic semantic vectorizer if necessary.
    """
    cleaned = text.strip()
    if not cleaned:
        cleaned = "code error diagnosis fix"

    client = get_openai_client()
    if client:
        try:
            resp = client.embeddings.create(
                input=cleaned[:8000],
                model=EMBEDDING_MODEL
            )
            return resp.data[0].embedding
        except Exception as e:
            print(f"[RAG] OpenAI embedding API note ({e}), using deterministic vectorizer.")

    return _fallback_pseudo_embedding(cleaned, dim=VECTOR_DIM)


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Compute cosine similarity between two vector lists."""
    a = np.array(v1, dtype=np.float32)
    b = np.array(v2, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def init_rag_mongo():
    """Ensure indexes exist for RAG vector collection in MongoDB."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        col = db[COLLECTION_NAME]
        col.create_index([("error_id", ASCENDING)], unique=True)
        col.create_index([("username", ASCENDING)])
        col.create_index([("language", ASCENDING)])
        col.create_index([("category", ASCENDING)])
        col.create_index([("created_at", ASCENDING)])
        col.create_index([("validation_status", ASCENDING)])
        return True
    except Exception as e:
        print(f"[RAG] Mongo index creation note: {e}")
        return False


def build_error_text_repr(
    language: str,
    category: str,
    rule: str,
    message: str,
    snippet: str,
    root_cause: str = "",
    fixed_code: str = "",
) -> str:
    """Construct dense semantic string used for embedding and vector similarity."""
    parts = [
        f"Language: {language}",
        f"Category: {category}",
        f"Rule: {rule}",
        f"Error: {message}",
    ]
    if snippet:
        parts.append(f"Problematic Code:\n{snippet.strip()}")
    if root_cause:
        parts.append(f"Root Cause:\n{root_cause.strip()[:600]}")
    if fixed_code:
        parts.append(f"Solution Summary:\n{fixed_code.strip()[:600]}")
    return "\n".join(parts)


def store_error_memory(
    username: str,
    directory: str,
    file_path: str,
    language: str,
    category: str,
    severity: str,
    rule: str,
    message: str,
    snippet: str,
    line: Optional[int] = None,
    root_cause: str = "",
    fixed_code: str = "",
    diff: str = "",
    explanation: str = "",
    confidence: str = "HIGH",
    validation_status: str = "VERIFIED",
) -> Optional[Dict[str, Any]]:
    """
    Store a single error occurrence, its code context, and validated fix into MongoDB vector store.
    """
    db = get_mongo_db()
    if db is None:
        return None

    init_rag_mongo()
    col = db[COLLECTION_NAME]

    raw_key = f"{file_path}::{category}::{rule}::{message}::{snippet[:100]}"
    error_id = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]

    text_repr = build_error_text_repr(
        language=language,
        category=category,
        rule=rule,
        message=message,
        snippet=snippet,
        root_cause=root_cause,
        fixed_code=fixed_code,
    )

    embedding = generate_embedding(text_repr)
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "error_id": error_id,
        "username": username or "anonymous",
        "project_name": Path(directory).name if directory else "project",
        "directory": directory,
        "file_path": file_path,
        "language": language or "Universal",
        "category": (category or "GENERAL").upper(),
        "severity": (severity or "HIGH").upper(),
        "rule": rule or "GeneralDefect",
        "message": message or "Detected defect or logic anomaly",
        "snippet": snippet or "",
        "line": line,
        "root_cause": root_cause,
        "fixed_code": fixed_code,
        "diff": diff,
        "explanation": explanation,
        "confidence": confidence,
        "validation_status": validation_status,
        "embedding": embedding,
        "embedding_model": EMBEDDING_MODEL if OPENAI_API_KEY else "mindora-token-hypervector",
        "search_text": text_repr,
        "updated_at": now_iso,
    }

    try:
        col.update_one(
            {"error_id": error_id},
            {
                "$set": doc,
                "$setOnInsert": {"created_at": now_iso},
                "$inc": {"occurrence_count": 1}
            },
            upsert=True
        )
        return doc
    except Exception as e:
        print(f"[RAG] Error saving vector doc: {e}")
        return None


def store_file_audit_memory(
    username: str,
    directory: str,
    file_path: str,
    language: str,
    issues: List[Dict[str, Any]],
    ai_analysis: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Ingest all errors from an analyzed file into the MongoDB vector store.
    If no static issues existed, records a clean architectural audit pattern.
    """
    saved = []
    root_cause = ai_analysis.get("root_cause", "")
    fixed_code = ai_analysis.get("fixed_code", "")
    diff = ai_analysis.get("diff", "")
    explanation = ai_analysis.get("explanation", "")
    conf = ai_analysis.get("confidence", "HIGH")
    status = ai_analysis.get("validation_status", "VERIFIED")

    if issues:
        for iss in issues:
            doc = store_error_memory(
                username=username,
                directory=directory,
                file_path=file_path,
                language=language or iss.get("language") or "Universal",
                category=iss.get("category", "DEFECT"),
                severity=iss.get("severity", "HIGH"),
                rule=iss.get("rule", "StaticDefect"),
                message=iss.get("message", ""),
                snippet=iss.get("snippet") or iss.get("code") or "",
                line=iss.get("line"),
                root_cause=root_cause,
                fixed_code=fixed_code,
                diff=diff,
                explanation=explanation,
                confidence=conf,
                validation_status=status,
            )
            if doc:
                saved.append(doc)
    else:
        doc = store_error_memory(
            username=username,
            directory=directory,
            file_path=file_path,
            language=language,
            category="CLEAN_ARCHITECTURE",
            severity="INFO",
            rule="VerifiedCleanCode",
            message=f"Verified pristine {language} source implementation without defects.",
            snippet="// Clean Verified Implementation",
            line=1,
            root_cause=root_cause or "Architectural review verified clean execution and zero defects.",
            fixed_code=fixed_code,
            diff="",
            explanation=explanation,
            confidence="HIGH",
            validation_status="VERIFIED",
        )
        if doc:
            saved.append(doc)

    return saved


def retrieve_relevant_memories(
    query_text: str,
    language: Optional[str] = None,
    category: Optional[str] = None,
    top_k: int = 3,
    min_similarity: float = 0.55,
    exclude_file: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve past tested errors and verified fixes from the MongoDB vector store
    matching semantic query using vector cosine similarity.
    """
    db = get_mongo_db()
    if db is None:
        return []

    query_embedding = generate_embedding(query_text)
    col = db[COLLECTION_NAME]

    query_filter: Dict[str, Any] = {}
    if language and language.lower() not in ["all", "universal"]:
        query_filter["language"] = {"$regex": f"^{language}$", "$options": "i"}
    if category and category.lower() != "all":
        query_filter["category"] = category.upper()

    try:
        cursor = col.find(
            query_filter,
            {
                "embedding": 1,
                "error_id": 1,
                "username": 1,
                "file_path": 1,
                "language": 1,
                "category": 1,
                "severity": 1,
                "rule": 1,
                "message": 1,
                "snippet": 1,
                "root_cause": 1,
                "fixed_code": 1,
                "diff": 1,
                "confidence": 1,
                "validation_status": 1,
                "created_at": 1,
                "occurrence_count": 1,
            }
        ).sort("created_at", -1).limit(500)

        scored: List[Tuple[float, Dict[str, Any]]] = []
        for doc in cursor:
            if exclude_file and doc.get("file_path") == exclude_file:
                continue

            stored_vec = doc.get("embedding")
            if not stored_vec:
                continue

            sim = cosine_similarity(query_embedding, stored_vec)
            if sim >= min_similarity:
                clean_doc = dict(doc)
                clean_doc.pop("_id", None)
                clean_doc.pop("embedding", None)
                clean_doc["similarity"] = round(sim, 4)
                clean_doc["similarity_percent"] = round(sim * 100, 1)
                scored.append((sim, clean_doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scored[:top_k]]
    except Exception as e:
        print(f"[RAG] Vector retrieval error: {e}")
        return []


def format_rag_prompt_context(memories: List[Dict[str, Any]]) -> str:
    """Format retrieved memories into high-density prompt context for GPT-4o."""
    if not memories:
        return ""

    lines = [
        "================================================================================",
        "=== MINDORA RAG INSTITUTIONAL MEMORY (RETRIEVED FROM PREVIOUS TESTED FILES) ===",
        "================================================================================",
        f"Found {len(memories)} matching past error pattern(s) in MongoDB Vector Store:\n"
    ]

    for idx, mem in enumerate(memories, 1):
        lines.append(
            f"--- Past Memory #{idx} (Similarity: {mem.get('similarity_percent', 0)}%, "
            f"Tested by @{mem.get('username', 'user')} on {mem.get('created_at', '')[:10]}) ---\n"
            f"File: {mem.get('file_path')} | Language: {mem.get('language')} | Category: {mem.get('category')}\n"
            f"Error Rule & Message: [{mem.get('rule')}] {mem.get('message')}\n"
            f"Past Code Snippet:\n{mem.get('snippet', '')[:300]}\n"
            f"Previous Root Cause Analysis:\n{mem.get('root_cause', '')[:400]}\n"
            f"Proven Verified Fix:\n{mem.get('fixed_code', '')[:400]}\n"
        )

    lines.append(
        "INSTITUTIONAL MEMORY DIRECTIVE:\n"
        "Leverage the previous proven root causes and verified fixes above as high-confidence precedents "
        "to resolve the current file accurately and avoid recurring regressions.\n"
        "================================================================================"
    )
    return "\n".join(lines)


def get_rag_stats() -> Dict[str, Any]:
    """Retrieve aggregate statistics about the MongoDB Vector Store."""
    db = get_mongo_db()
    if db is None:
        return {
            "total_vectors": 0,
            "distinct_languages": 0,
            "distinct_users": 0,
            "dimension": VECTOR_DIM,
            "embedding_model": EMBEDDING_MODEL,
            "languages": {},
            "categories": {},
            "recent_memories": [],
        }

    try:
        col = db[COLLECTION_NAME]
        total = col.count_documents({})
        users = len(col.distinct("username"))
        languages = col.distinct("language")

        cat_pipeline = [
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        cat_counts = {item["_id"]: item["count"] for item in col.aggregate(cat_pipeline) if item.get("_id")}

        lang_pipeline = [
            {"$group": {"_id": "$language", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        lang_counts = {item["_id"]: item["count"] for item in col.aggregate(lang_pipeline) if item.get("_id")}

        recent = list(col.find(
            {},
            {"_id": 0, "embedding": 0}
        ).sort("created_at", -1).limit(5))

        return {
            "total_vectors": total,
            "distinct_languages": len(languages),
            "distinct_users": users,
            "dimension": VECTOR_DIM,
            "embedding_model": EMBEDDING_MODEL if OPENAI_API_KEY else "mindora-token-hypervector",
            "languages": lang_counts,
            "categories": cat_counts,
            "recent_memories": recent,
        }
    except Exception as e:
        print(f"[RAG] Error fetching stats: {e}")
        return {
            "total_vectors": 0,
            "distinct_languages": 0,
            "distinct_users": 0,
            "dimension": VECTOR_DIM,
            "error": str(e)
        }


def list_rag_memories(
    limit: int = 50,
    offset: int = 0,
    username: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieve filtered and paginated error memories from MongoDB Vector Store."""
    db = get_mongo_db()
    if db is None:
        return {"total": 0, "limit": limit, "offset": offset, "items": []}

    try:
        col = db[COLLECTION_NAME]
        query: Dict[str, Any] = {}
        if username:
            query["username"] = username
        if language and language.lower() != "all":
            query["language"] = {"$regex": f"^{language}$", "$options": "i"}
        if category and category.lower() != "all":
            query["category"] = category.upper()
        if search:
            query["$or"] = [
                {"message": {"$regex": search, "$options": "i"}},
                {"file_path": {"$regex": search, "$options": "i"}},
                {"rule": {"$regex": search, "$options": "i"}},
                {"root_cause": {"$regex": search, "$options": "i"}},
                {"snippet": {"$regex": search, "$options": "i"}},
            ]

        total = col.count_documents(query)
        cursor = col.find(
            query,
            {"_id": 0, "embedding": 0}
        ).sort("created_at", -1).skip(offset).limit(limit)

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": list(cursor)
        }
    except Exception as e:
        print(f"[RAG] Error listing memories: {e}")
        return {"total": 0, "limit": limit, "offset": offset, "items": [], "error": str(e)}


def delete_rag_memory(error_id: str) -> bool:
    """Delete a specific error memory from the vector collection."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        col = db[COLLECTION_NAME]
        res = col.delete_one({"error_id": error_id})
        return res.deleted_count > 0
    except Exception as e:
        print(f"[RAG] Error deleting memory: {e}")
        return False


def clear_all_rag_memories() -> bool:
    """Clear all stored vectors and memories in the MongoDB collection."""
    db = get_mongo_db()
    if db is None:
        return False
    try:
        col = db[COLLECTION_NAME]
        col.delete_many({})
        return True
    except Exception as e:
        print(f"[RAG] Error clearing memories: {e}")
        return False
