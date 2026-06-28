"""RAG helpers: chunking, embedding, and convenience retrieval functions."""

from __future__ import annotations

import hashlib
import math
import re
from functools import lru_cache
from typing import Iterable

from app.core.config import settings


def chunk_document(text: str, chunk_words: int = 220, overlap_words: int = 40) -> list[str]:
    """Split text into clean overlapping chunks for retrieval."""

    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    words = normalized.split(" ")
    chunks: list[str] = []
    step = max(1, chunk_words - overlap_words)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_words]).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_words >= len(words):
            break
    return chunks


@lru_cache
def _sentence_transformer():
    """Load the optional local embedding model lazily."""

    if not settings.USE_SENTENCE_TRANSFORMERS:
        return None
    try:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(settings.EMBEDDING_MODEL)
    except Exception:
        return None


def _hash_embedding(text: str) -> list[float]:
    """Create a deterministic local embedding without external downloads.

    This is an MVP fallback, not a semantic embedding replacement. It keeps
    Docker/local demos operational when sentence-transformers or Gemini
    embeddings are unavailable.
    """

    vector = [0.0] * settings.EMBEDDING_DIM
    tokens = re.findall(r"[a-zA-Z0-9]+", text.lower())
    if not tokens:
        tokens = ["empty"]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for offset in range(0, len(digest), 2):
            index = int.from_bytes(digest[offset : offset + 2], "big") % settings.EMBEDDING_DIM
            vector[index] += 1.0
    return _normalize(vector)


def _normalize(values: Iterable[float]) -> list[float]:
    """Return an L2-normalized vector."""

    vector = list(values)
    norm = math.sqrt(sum(item * item for item in vector))
    if norm == 0:
        return vector
    return [item / norm for item in vector]


def embed(text: str) -> list[float]:
    """Embed text using sentence-transformers when enabled, otherwise hash fallback."""

    model = _sentence_transformer()
    if model is not None:
        return model.encode(text, normalize_embeddings=True).tolist()
    return _hash_embedding(text)


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts."""

    model = _sentence_transformer()
    if model is not None:
        return model.encode(texts, normalize_embeddings=True).tolist()
    return [_hash_embedding(text) for text in texts]


async def remember(collection: str, text: str, payload: dict) -> str:
    """Embed text and store it in long-term memory."""

    from app.services.memory import remember as memory_remember

    return await memory_remember(collection, text, payload)


async def recall(
    collection: str,
    query: str,
    top_k: int = 5,
    filters: dict | None = None,
) -> list[dict]:
    """Retrieve relevant memory items by semantic search."""

    from app.services.memory import recall as memory_recall

    return await memory_recall(collection, query, top_k=top_k, filters=filters)
