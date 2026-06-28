"""MCP server exposing Qdrant memory tools."""

from __future__ import annotations

import hashlib
import math
import os
import re
import uuid
from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

mcp = FastMCP("hackathon-qdrant-memory")

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=5)


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


def _embed(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIM
    tokens = re.findall(r"[a-zA-Z0-9]+", text.lower()) or ["empty"]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for offset in range(0, len(digest), 2):
            index = int.from_bytes(digest[offset : offset + 2], "big") % EMBEDDING_DIM
            vector[index] += 1.0
    return _normalize(vector)


def _ensure_collection(collection: str) -> None:
    existing = {item.name for item in client.get_collections().collections}
    if collection not in existing:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )


@mcp.tool()
def qdrant_memory_write(collection: str, text: str, payload: dict) -> dict:
    """Write a summarized memory item into Qdrant."""

    _ensure_collection(collection)
    point_id = str(uuid.uuid4())
    enriched_payload = {
        **payload,
        "summary": payload.get("summary", text[:800]),
        "stored_at": datetime.now(timezone.utc).isoformat(),
        "source": "qdrant_mcp",
    }
    client.upsert(
        collection_name=collection,
        points=[PointStruct(id=point_id, vector=_embed(text), payload=enriched_payload)],
    )
    return {"id": point_id, "collection": collection}


@mcp.tool()
def qdrant_memory_search(collection: str, query: str, top_k: int = 5) -> dict:
    """Search Qdrant memory by text query."""

    _ensure_collection(collection)
    results = client.search(collection_name=collection, query_vector=_embed(query), limit=top_k)
    return {
        "collection": collection,
        "query": query,
        "results": [
            {"id": str(item.id), "score": item.score, "payload": item.payload or {}}
            for item in results
        ],
    }


if __name__ == "__main__":
    mcp.run()
