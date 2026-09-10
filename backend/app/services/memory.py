"""Qdrant long-term memory with deterministic in-process fallback."""

from __future__ import annotations

import asyncio
import logging
import math
import time
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

#: Collections whose stored vector config does not match this deployment's
#: EMBEDDING_DIM. Reads and writes for these are routed to the fallback rather
#: than failing at runtime with a dimension error on every upsert.
_unusable_collections: set[str] = set()

#: Result of the last bootstrap, surfaced by /memory/status and the inspector.
_bootstrap_report: dict[str, Any] = {"ran_at": None, "backend": "unknown", "collections": {}}

#: Monotonic timestamp of the last reconnect attempt, so a permanently absent
#: Qdrant does not add a connection attempt to every single memory operation.
_last_reconnect_attempt = 0.0
RECONNECT_COOLDOWN_SECONDS = 60.0
BOOTSTRAP_ATTEMPTS = 3


@dataclass
class CollectionStatus:
    """What bootstrap did to one collection, and whether it is usable."""

    name: str
    action: str  # created | verified | recreated | mismatch | failed | fallback
    usable: bool
    detail: str = ""
    vector_size: int | None = None
    indexed_fields: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "action": self.action,
            "usable": self.usable,
            "detail": self.detail,
            "vector_size": self.vector_size,
            "indexed_fields": self.indexed_fields,
        }


def _collection_usable(collection: str) -> bool:
    """Whether Qdrant should be used for this collection right now."""

    return (
        _qdrant_available
        and _qdrant_client is not None
        and collection not in _unusable_collections
    )


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


async def _ensure_payload_indexes(client: Any, name: str, fields: list[str]) -> tuple[list[str], list[str]]:
    """Create the payload indexes a collection needs, idempotently.

    The previous implementation wrapped this in a bare ``except Exception:
    logger.debug("already exists")``, so a genuine failure — a bad field
    schema, a permissions problem — was indistinguishable from the index
    already being there, and silently produced a collection whose filters did
    not work.
    """

    from qdrant_client.models import PayloadSchemaType

    created: list[str] = []
    problems: list[str] = []
    existing: set[str] = set()
    try:
        info = await client.get_collection(collection_name=name)
        existing = set((getattr(info, "payload_schema", None) or {}).keys())
    except Exception as exc:  # pragma: no cover - older servers omit the schema
        logger.debug("Could not read payload schema for %s: %s", name, exc)

    for field_name in fields:
        if field_name in existing:
            created.append(field_name)
            continue
        try:
            await client.create_payload_index(
                collection_name=name,
                field_name=field_name,
                field_schema=PayloadSchemaType.KEYWORD,
            )
            created.append(field_name)
        except Exception as exc:
            message = str(exc).lower()
            if "already exists" in message or "already indexed" in message:
                created.append(field_name)
            else:
                problems.append(f"{field_name}: {exc}")
    return created, problems


async def _ensure_collection(client: Any, name: str, config: dict[str, Any]) -> CollectionStatus:
    """Create or verify one collection without destroying data by surprise.

    Creation was already idempotent. Verification was not: a collection left
    over from a deployment with a different EMBEDDING_DIM was accepted as-is,
    and then every upsert against it failed with a dimension error at runtime.
    A mismatch is reported and the collection is routed to the fallback;
    recreating it (which deletes its points) happens only when
    QDRANT_RECREATE_ON_MISMATCH is explicitly set.
    """

    from qdrant_client.models import Distance, VectorParams

    expected_size = settings.EMBEDDING_DIM
    fields = list(config.get("fields_to_index", []))

    try:
        exists = await client.collection_exists(collection_name=name)
    except AttributeError:  # pragma: no cover - older clients
        collections = await client.get_collections()
        exists = name in {item.name for item in collections.collections}

    if not exists:
        await client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=expected_size, distance=Distance.COSINE),
        )
        indexed, problems = await _ensure_payload_indexes(client, name, fields)
        return CollectionStatus(
            name=name,
            action="created",
            usable=not problems,
            detail="; ".join(problems) or f"Created with {expected_size}-dim cosine vectors.",
            vector_size=expected_size,
            indexed_fields=indexed,
        )

    info = await client.get_collection(collection_name=name)
    actual_size = _vector_size_of(info)

    if actual_size is not None and actual_size != expected_size:
        if settings.QDRANT_RECREATE_ON_MISMATCH:
            logger.warning(
                "Recreating collection %s: stored vectors are %s-dim, this deployment uses %s-dim.",
                name,
                actual_size,
                expected_size,
            )
            await client.delete_collection(collection_name=name)
            await client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=expected_size, distance=Distance.COSINE),
            )
            indexed, problems = await _ensure_payload_indexes(client, name, fields)
            return CollectionStatus(
                name=name,
                action="recreated",
                usable=not problems,
                detail=f"Recreated: was {actual_size}-dim, now {expected_size}-dim. Previous points were deleted.",
                vector_size=expected_size,
                indexed_fields=indexed,
            )
        return CollectionStatus(
            name=name,
            action="mismatch",
            usable=False,
            detail=(
                f"Stored vectors are {actual_size}-dim but EMBEDDING_DIM is {expected_size}. "
                "Using the in-process fallback for this collection. Set "
                "QDRANT_RECREATE_ON_MISMATCH=true to rebuild it (this deletes its points)."
            ),
            vector_size=actual_size,
            indexed_fields=[],
        )

    indexed, problems = await _ensure_payload_indexes(client, name, fields)
    return CollectionStatus(
        name=name,
        action="verified",
        usable=not problems,
        detail="; ".join(problems) or "Existing collection matches this deployment.",
        vector_size=actual_size or expected_size,
        indexed_fields=indexed,
    )


def _vector_size_of(info: Any) -> int | None:
    """Read the vector size out of a Qdrant collection info object."""

    try:
        params = info.config.params.vectors
    except AttributeError:
        return None
    if params is None:
        return None
    size = getattr(params, "size", None)
    if size is not None:
        return int(size)
    # Named-vector collections: accept the single unnamed/default vector.
    if isinstance(params, dict) and len(params) == 1:
        only = next(iter(params.values()))
        return int(getattr(only, "size", 0)) or None
    return None


async def bootstrap_collections(force: bool = False) -> dict[str, Any]:
    """Connect to Qdrant and bring every collection to a known-good state.

    Safe to call repeatedly — that is the point. It retries a slow-starting
    Qdrant instead of falling back to in-process memory for the life of the
    process on the first refused connection, which is what happened under
    `docker compose up` when Qdrant took longer to accept connections than the
    API took to start.
    """

    global _qdrant_client, _qdrant_available, _bootstrap_report, _unusable_collections

    if not settings.QDRANT_ENABLED:
        _qdrant_available = False
        _unusable_collections = set(COLLECTIONS)
        _bootstrap_report = {
            "ran_at": datetime.now(timezone.utc).isoformat(),
            "backend": "in_process_stub",
            "reason": "QDRANT_ENABLED=false",
            "collections": {
                name: CollectionStatus(name, "fallback", True, "Qdrant disabled by configuration.").to_dict()
                for name in COLLECTIONS
            },
        }
        logger.warning("Qdrant disabled; using in-process memory fallback.")
        return _bootstrap_report

    if _qdrant_available and not force:
        return _bootstrap_report

    last_error: Exception | None = None
    for attempt in range(1, BOOTSTRAP_ATTEMPTS + 1):
        try:
            from qdrant_client import AsyncQdrantClient

            client = AsyncQdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.qdrant_key,
                timeout=5,
            )
            statuses: dict[str, dict[str, Any]] = {}
            unusable: set[str] = set()
            for name, config in COLLECTIONS.items():
                try:
                    status = await _ensure_collection(client, name, config)
                except Exception as exc:
                    status = CollectionStatus(name, "failed", False, str(exc)[:200])
                if not status.usable:
                    unusable.add(name)
                statuses[name] = status.to_dict()

            _qdrant_client = client
            _qdrant_available = True
            _unusable_collections = unusable
            _bootstrap_report = {
                "ran_at": datetime.now(timezone.utc).isoformat(),
                "backend": "qdrant",
                "url": settings.QDRANT_URL,
                "attempts": attempt,
                "embedding_dim": settings.EMBEDDING_DIM,
                "collections": statuses,
                "degraded_collections": sorted(unusable),
            }
            logger.info(
                "Qdrant memory initialized at %s (%s/%s collections usable)",
                settings.QDRANT_URL,
                len(COLLECTIONS) - len(unusable),
                len(COLLECTIONS),
            )
            return _bootstrap_report
        except Exception as exc:
            last_error = exc
            logger.warning("Qdrant bootstrap attempt %s/%s failed: %s", attempt, BOOTSTRAP_ATTEMPTS, exc)
            if attempt < BOOTSTRAP_ATTEMPTS:
                await asyncio.sleep(2 * attempt)

    _qdrant_available = False
    _unusable_collections = set(COLLECTIONS)
    _bootstrap_report = {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "backend": "in_process_stub",
        "url": settings.QDRANT_URL,
        "attempts": BOOTSTRAP_ATTEMPTS,
        "reason": str(last_error)[:200] if last_error else "unknown",
        "collections": {
            name: CollectionStatus(name, "fallback", True, "Qdrant unreachable.").to_dict()
            for name in COLLECTIONS
        },
    }
    logger.warning("Qdrant unavailable; using in-process memory fallback: %s", last_error)
    return _bootstrap_report


async def init_collections() -> None:
    """Startup hook. Kept for the existing call site in main.py."""

    await bootstrap_collections()


async def _maybe_reconnect() -> None:
    """Retry the Qdrant connection at most once per cooldown window.

    Without this, one refused connection at startup meant the process used the
    in-process fallback forever, even after Qdrant came back.
    """

    global _last_reconnect_attempt

    if _qdrant_available or not settings.QDRANT_ENABLED:
        return
    now = time.monotonic()
    if now - _last_reconnect_attempt < RECONNECT_COOLDOWN_SECONDS:
        return
    _last_reconnect_attempt = now
    await bootstrap_collections(force=True)


def bootstrap_report() -> dict[str, Any]:
    """The last bootstrap result."""

    return _bootstrap_report


def memory_backend() -> str:
    """Return the memory backend currently in use."""

    if not settings.QDRANT_ENABLED:
        return "disabled"
    if not _qdrant_available:
        return "in_process_stub"
    return "qdrant" if not _unusable_collections else "mixed"


async def check_memory(timeout_seconds: float = 3.0) -> tuple[str, float | None, str]:
    """Probe long-term memory.

    Returns ``(status, latency_ms, detail)`` where status is one of
    ``ok`` / ``degraded`` / ``skipped``. Qdrant being unreachable is a
    degradation, not an outage: the workflow keeps running on the in-process
    fallback, and the console should be able to say exactly that instead of
    showing an undifferentiated red dot.
    """

    if not settings.QDRANT_ENABLED:
        return "skipped", None, "Qdrant is disabled by configuration; using in-process memory."
    if not _qdrant_available or _qdrant_client is None:
        return "degraded", None, f"Qdrant at {settings.QDRANT_URL} is not connected; using in-process fallback."

    started = time.perf_counter()
    try:
        async with asyncio.timeout(timeout_seconds):
            collections = await _qdrant_client.get_collections()
        latency_ms = (time.perf_counter() - started) * 1000
        known = {collection.name for collection in collections.collections}
        missing = sorted(set(COLLECTIONS) - known)
        if missing:
            return "degraded", latency_ms, f"Missing collections: {', '.join(missing)}."
        return "ok", latency_ms, f"{len(known & set(COLLECTIONS))} collections available."
    except TimeoutError:
        return "degraded", (time.perf_counter() - started) * 1000, f"Qdrant did not answer within {timeout_seconds}s."
    except Exception as exc:  # pragma: no cover - depends on deployment state
        logger.warning("Qdrant health probe failed: %s", exc)
        return "degraded", (time.perf_counter() - started) * 1000, str(exc)[:200]


async def remember(collection: str, text: str, payload: dict) -> str:
    """Store a useful summarized memory, not raw conversation dumps."""

    if collection not in COLLECTIONS:
        raise ValueError(f"Unknown memory collection: {collection}")
    point_id = str(uuid.uuid4())
    normalized_payload = {
        **payload,
        "summary": payload.get("summary", text[:800]),
        "stored_at": datetime.now(timezone.utc).isoformat(),
        "memory_backend": "qdrant" if _collection_usable(collection) else "in_process_stub",
    }
    vector = embed(text)
    await _maybe_reconnect()
    if _collection_usable(collection):
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
    await _maybe_reconnect()
    if _collection_usable(collection):
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


async def memory_stats() -> dict[str, Any]:
    """Per-collection counts and which backend is answering for each.

    The console previously had no way to tell whether a search returned
    nothing because memory was empty or because it was silently running on the
    in-process fallback with a fresh, empty dict.
    """

    await _maybe_reconnect()
    collections: list[dict[str, Any]] = []

    for name, config in COLLECTIONS.items():
        entry: dict[str, Any] = {
            "name": name,
            "description": config.get("description", ""),
            "indexed_fields": list(config.get("fields_to_index", [])),
            "backend": "qdrant" if _collection_usable(name) else "in_process_stub",
            "fallback_points": len(_fallback_points.get(name, [])),
            "points": len(_fallback_points.get(name, [])),
            "error": None,
        }
        if _collection_usable(name):
            try:
                result = await _qdrant_client.count(collection_name=name, exact=True)
                entry["points"] = int(getattr(result, "count", 0))
            except Exception as exc:  # pragma: no cover - depends on server state
                entry["error"] = str(exc)[:200]
        collections.append(entry)

    return {
        "backend": memory_backend(),
        "qdrant_enabled": settings.QDRANT_ENABLED,
        "qdrant_url": settings.QDRANT_URL if settings.QDRANT_ENABLED else None,
        "embedding_dim": settings.EMBEDDING_DIM,
        "embedding_model": settings.EMBEDDING_MODEL,
        "degraded_collections": sorted(_unusable_collections),
        "total_points": sum(item["points"] for item in collections),
        "collections": collections,
        "bootstrap": _bootstrap_report,
    }


async def list_points(collection: str, limit: int = 20) -> dict[str, Any]:
    """Return raw stored records for the inspector, newest first where known."""

    if collection not in COLLECTIONS:
        raise ValueError(f"Unknown memory collection: {collection}")
    await _maybe_reconnect()

    if _collection_usable(collection):
        try:
            records, _ = await _qdrant_client.scroll(
                collection_name=collection,
                limit=limit,
                with_payload=True,
                with_vectors=False,
            )
            return {
                "collection": collection,
                "backend": "qdrant",
                "points": [{"id": str(record.id), "payload": record.payload or {}} for record in records],
            }
        except Exception as exc:  # pragma: no cover - depends on server state
            logger.warning("Qdrant scroll failed for %s; reading fallback: %s", collection, exc)

    points = sorted(
        _fallback_points.get(collection, []), key=lambda item: item.created_at, reverse=True
    )[:limit]
    return {
        "collection": collection,
        "backend": "in_process_stub",
        "points": [
            {"id": point.id, "payload": point.payload, "created_at": point.created_at.isoformat()}
            for point in points
        ],
    }


PARITY_COLLECTION = "user_preferences"


async def verify_fallback_parity() -> dict[str, Any]:
    """Check that the in-process fallback behaves like Qdrant.

    The fallback is described as "clearly labeled" but nothing ever verified
    that it answers the same questions the same way. This writes a uniquely
    worded probe, searches for it, and asserts the properties the pipeline
    actually depends on: the write is retrievable, it outranks unrelated
    records, scores are in [0, 1], and payload filters exclude non-matches.

    It runs against whichever backend is live and always against the fallback,
    so a Qdrant deployment gets a real comparison and a fallback-only
    deployment still gets its invariants checked.
    """

    probe_token = f"parity-probe-{uuid.uuid4().hex[:10]}"
    probe_text = f"{probe_token} coastal seawall resilience sponsorship brief"
    checks: list[dict[str, Any]] = []

    def record(name: str, passed: bool, detail: str) -> None:
        checks.append({"check": name, "passed": passed, "detail": detail})

    async def exercise(backend_name: str, write, search) -> None:
        point_id = await write()
        record(f"{backend_name}: write returns an id", bool(point_id), str(point_id))

        results = await search(probe_token)
        found = [row for row in results if row.get("payload", {}).get("probe") == probe_token]
        record(
            f"{backend_name}: probe is retrievable",
            bool(found),
            f"{len(results)} result(s), {len(found)} matching the probe.",
        )
        if found:
            record(
                f"{backend_name}: probe ranks first",
                results[0].get("payload", {}).get("probe") == probe_token,
                f"top score {results[0].get('score', 0):.3f}",
            )
        record(
            f"{backend_name}: scores are within [0, 1]",
            all(0.0 <= float(row.get("score", 0)) <= 1.0 for row in results),
            f"{len(results)} score(s) checked.",
        )
        filtered = await search(probe_token, {"probe": "definitely-not-this"})
        record(
            f"{backend_name}: payload filters exclude non-matches",
            not any(row.get("payload", {}).get("probe") == probe_token for row in filtered),
            f"{len(filtered)} result(s) with a non-matching filter.",
        )

    # Fallback path, exercised directly so it is checked on every deployment.
    async def fallback_write() -> str:
        point_id = str(uuid.uuid4())
        _fallback_points.setdefault(PARITY_COLLECTION, []).append(
            InMemoryPoint(
                id=point_id,
                vector=embed(probe_text),
                payload={"probe": probe_token, "summary": probe_text, "memory_backend": "in_process_stub"},
            )
        )
        return point_id

    async def fallback_search(query: str, filters: dict | None = None) -> list[dict]:
        vector = embed(query)
        rows = [
            {
                "id": point.id,
                "score": max(0.0, min(1.0, _cosine(vector, point.vector))),
                "payload": point.payload,
                "backend": "in_process_stub",
            }
            for point in _fallback_points.get(PARITY_COLLECTION, [])
            if _payload_matches(point.payload, filters)
        ]
        return sorted(rows, key=lambda item: item["score"], reverse=True)[:5]

    await exercise("fallback", fallback_write, fallback_search)

    qdrant_checked = False
    if _collection_usable(PARITY_COLLECTION):
        qdrant_checked = True

        async def qdrant_write() -> str:
            return await remember(
                PARITY_COLLECTION,
                probe_text,
                {"probe": probe_token, "summary": probe_text, "user_id": "parity-selftest"},
            )

        async def qdrant_search(query: str, filters: dict | None = None) -> list[dict]:
            return await recall(PARITY_COLLECTION, query, top_k=5, filters=filters)

        await exercise("qdrant", qdrant_write, qdrant_search)

    # Leave no probe records behind in the fallback.
    _fallback_points[PARITY_COLLECTION] = [
        point
        for point in _fallback_points.get(PARITY_COLLECTION, [])
        if point.payload.get("probe") != probe_token
    ]

    passed = sum(1 for check in checks if check["passed"])
    return {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "backend": memory_backend(),
        "compared_backends": ["fallback", "qdrant"] if qdrant_checked else ["fallback"],
        "note": (
            "Qdrant and the fallback were both exercised."
            if qdrant_checked
            else "Qdrant is not carrying this collection, so only the fallback was exercised."
        ),
        "passed": passed,
        "total": len(checks),
        "ok": passed == len(checks),
        "checks": checks,
    }
