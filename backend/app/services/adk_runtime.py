"""Optional Gemini/ADK integration points.

The MVP workflow is deterministic by default so local Docker demos do not
require paid API keys. When AGENT_RUNTIME=gemini and a key is configured, this
module can be extended to execute real ADK agents while preserving the same
Pydantic contracts used by the deterministic runtime.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import settings

logger = logging.getLogger(__name__)
ModelT = TypeVar("ModelT", bound=BaseModel)


@dataclass(frozen=True)
class AgentSpec:
    """Declarative description of an agent boundary."""

    name: str
    model_name: str
    instruction: str
    reads_memory: list[str]
    writes_memory: list[str]


def adk_available() -> bool:
    """Return whether google-adk imports in the current environment."""

    try:
        import google.adk  # noqa: F401

        return True
    except Exception:
        return False


async def maybe_generate_json_with_gemini(
    spec: AgentSpec,
    prompt: str,
    output_model: type[ModelT],
) -> ModelT | None:
    """Optionally call Gemini and validate JSON output against a contract.

    This is deliberately conservative. If Gemini is not configured or returns
    malformed JSON, the caller should use its deterministic fallback and record
    that fallback in the runtime metadata.
    """

    if settings.AGENT_RUNTIME != "gemini" or not settings.gemini_key:
        return None
    try:
        import google.generativeai as genai

        os.environ["GOOGLE_API_KEY"] = settings.gemini_key
        genai.configure(api_key=settings.gemini_key)
        model = genai.GenerativeModel(
            model_name=spec.model_name,
            system_instruction=spec.instruction,
        )
        response = await model.generate_content_async(
            [
                prompt,
                "Return only valid JSON matching this schema:",
                json.dumps(output_model.model_json_schema(), indent=2),
            ],
            generation_config={"response_mime_type": "application/json"},
        )
        text = getattr(response, "text", "") or ""
        parsed = json.loads(_strip_json_fence(text))
        return output_model.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Gemini output failed validation for %s: %s", spec.name, exc)
    except Exception as exc:
        logger.warning("Gemini unavailable for %s; using deterministic fallback: %s", spec.name, exc)
    return None


def _strip_json_fence(text: str) -> str:
    """Remove common Markdown JSON fences from model output."""

    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.removeprefix("```json").removeprefix("```").strip()
        stripped = stripped.removesuffix("```").strip()
    return stripped
