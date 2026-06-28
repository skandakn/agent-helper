"""MCP server exposing safe utility tools for agents."""

from __future__ import annotations

import os
import re
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("hackathon-tools")
ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", "/data/artifacts")).resolve()
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


@mcp.tool()
async def web_fetch(url: str, max_chars: int = 4000) -> dict:
    """Fetch a web page and return a bounded text excerpt."""

    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
        response = await client.get(url)
        response.raise_for_status()
    text = re.sub(r"\s+", " ", response.text).strip()
    return {"url": str(response.url), "status_code": response.status_code, "text": text[:max_chars]}


@mcp.tool()
def clean_text(text: str) -> dict:
    """Normalize whitespace and simple typography for generated copy."""

    cleaned = re.sub(r"\s+", " ", text).strip()
    cleaned = cleaned.replace("\u2013", "-").replace("\u2014", "-")
    return {"text": cleaned}


@mcp.tool()
def save_artifact(filename: str, content: str) -> dict:
    """Save a text artifact under the configured artifact directory."""

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:120]
    path = (ARTIFACT_DIR / safe_name).resolve()
    if ARTIFACT_DIR not in path.parents and path != ARTIFACT_DIR:
        raise ValueError("Unsafe artifact path")
    path.write_text(content, encoding="utf-8")
    return {"path": str(path), "bytes": len(content.encode("utf-8"))}


if __name__ == "__main__":
    mcp.run()
