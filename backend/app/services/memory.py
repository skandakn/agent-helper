"""Qdrant long-term memory with deterministic in-process fallback."""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.services.rag import embed

logger = logging.getLogger(__name__)

COLLECTIONS: dict[str, dict[str, Any]] = {
    "event_templates": {
        "fields_to_index": ["tags", "type", "theme"],
        "description": "Past event descriptions, briefs, and launch summaries.",
    },
    "sponsor_templates": {
        "fields_to_index": ["sector", "industry"],
        "description": "Sponsor profiles, pitches, and sponsorship patterns.",
    },
    "marketing_assets": {
        "fields_to_index": ["asset_type", "medium"],
        "description": "Generated copy, emails, landing pages, and reusable marketing assets.",
    },
    "campaign_history": {
        "fields_to_index": ["event_id", "medium"],
        "description": "Historical social and launch campaign plans.",
    },
    "user_preferences": {
        "fields_to_index": ["user_id"],
        "description": "Per-user style preferences and feedback summaries.",
    },
}


@dataclass
class InMemoryPoint:
    """Fallback memory point."""

    id: str
    vector: list[float]
    payload: dict
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_fallback_points: dict[str, list[InMemoryPoint]] = {name: [] for name in COLLECTIONS}
_qdrant_client: Any | None = None
_qdrant_available = False


def _cosine(left: list[float], right: list[float]) -> float:
    """Compute cosine similarity for normalized or unnormalized vectors."""

    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


def _payload_matches(payload: dict, filters: dict | None) -> bool:
    """Return whether payload satisfies simple equality/list filters."""

    if not filters:
        return True
    for key, expected in filters.items():
        value = payload.get(key)
        if isinstance(value, list):
            if expected not in value:
                return False
        elif value != expected:
            return False
    return True


async def init_collections() -> None:
    """Create Qdrant collections if available; otherwise retain fallback memory."""

    global _qdrant_client, _qdrant_available
    if not settings.QDRANT_ENABLED:
        _qdrant_available = False
        logger.warning("Qdrant disabled; using in-process memory fallback.")
        return
    try:
        from qdrant_client import AsyncQdrantClient
        from qdrant_client.models import Distance, PayloadSchemaType, VectorParams

        _qdrant_client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.qdrant_key,
            timeout=5,
        )
        existing = {collection.name for collection in (await _qdrant_client.get_collections()).collections}
        for name, config in COLLECTIONS.items():
            if name not in existing:
                await _qdrant_client.create_collection(
                    collection_name=name,
                    vectors_config=VectorParams(size=settings.EMBEDDING_DIM, distance=Distance.COSINE),
                )
            for field_name in config["fields_to_index"]:
                try:
                    await _qdrant_client.create_payload_index(
                        collection_name=name,
                        field_name=field_name,
                        field_schema=PayloadSchemaType.KEYWORD,
                    )
                except Exception:
                    logger.debug("Qdrant payload index already exists: %s.%s", name, field_name)
        _qdrant_available = True
        logger.info("Qdrant memory initialized at %s", settings.QDRANT_URL)
    except Exception as exc:
        _qdrant_available = False
        logger.warning("Qdrant unavailable; using in-process memory fallback: %s", exc)


async def remember(collection: str, text: str, payload: dict) -> str:
    """Store a useful summarized memory, not raw conversation dumps."""

    if collection not in COLLECTIONS:
        raise ValueError(f"Unknown memory collection: {collection}")
    point_id = str(uuid.uuid4())
    normalized_payload = {
        **payload,
        "summary": payload.get("summary", text[:800]),
        "stored_at": datetime.now(timezone.utc).isoformat(),
        "memory_backend": "qdrant" if _qdrant_available else "in_process_stub",
    }
    vector = embed(text)
    if _qdrant_available and _qdrant_client is not None:
        try:
            from qdrant_client.models import PointStruct

            await _qdrant_client.upsert(
                collection_name=collection,
                points=[PointStruct(id=point_id, vector=vector, payload=normalized_payload)],
            )
            return point_id
        except Exception as exc:
            logger.warning("Qdrant write failed; storing fallback memory: %s", exc)
    _fallback_points.setdefault(collection, []).append(
        InMemoryPoint(id=point_id, vector=vector, payload=normalized_payload)
    )
    return point_id


async def recall(
    collection: str,
    query: str,
    top_k: int = 5,
    filters: dict | None = None,
) -> list[dict]:
    """Retrieve top-k relevant memories from Qdrant or fallback memory."""

    if collection not in COLLECTIONS:
        raise ValueError(f"Unknown memory collection: {collection}")
    vector = embed(query)
    if _qdrant_available and _qdrant_client is not None:
        try:
            from qdrant_client.models import FieldCondition, Filter, MatchValue

            query_filter = None
            if filters:
                query_filter = Filter(
                    must=[
                        FieldCondition(key=key, match=MatchValue(value=value))
                        for key, value in filters.items()
                    ]
                )
            if hasattr(_qdrant_client, "search"):
                results = await _qdrant_client.search(
                    collection_name=collection,
                    query_vector=vector,
                    query_filter=query_filter,
                    limit=top_k,
                )
            else:
                response = await _qdrant_client.query_points(
                    collection_name=collection,
                    query=vector,
                    query_filter=query_filter,
                    limit=top_k,
                )
                results = response.points
            return [
                {
                    "id": str(result.id),
                    "score": float(result.score),
                    "payload": result.payload or {},
                    "backend": "qdrant",
                }
                for result in results
            ]
        except Exception as exc:
            logger.warning("Qdrant search failed; reading fallback memory: %s", exc)
    points = _fallback_points.get(collection, [])
    scored = [
        {
            "id": point.id,
            "score": max(0.0, min(1.0, _cosine(vector, point.vector))),
            "payload": point.payload,
            "backend": "in_process_stub",
        }
        for point in points
        if _payload_matches(point.payload, filters)
    ]
    return sorted(scored, key=lambda item: item["score"], reverse=True)[:top_k]


async def search_memory(query: str, top_k: int = 5, collection: str | None = None) -> list[dict]:
    """Search one or all memory collections."""

    if collection:
        collections = [collection]
    else:
        collections = list(COLLECTIONS)
    results: list[dict] = []
    for collection_name in collections:
        for item in await recall(collection_name, query, top_k=top_k):
            results.append({"collection": collection_name, **item})
    return sorted(results, key=lambda item: item["score"], reverse=True)[:top_k]
