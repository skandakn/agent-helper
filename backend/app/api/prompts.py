"""Prompt template API: list, read, preview, edit, and revert.

Editing a template changes agent behaviour for every user of the instance, so
writes are gated on `PROMPT_EDITING_ENABLED` and require an authenticated
caller. Reads and previews are safe and always available.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import get_request_user_id
from app.core.config import settings
from app.services import prompts

router = APIRouter(prefix="/prompts", tags=["prompts"])


class PromptUpdate(BaseModel):
    """Body for saving a new version of a template."""

    model_config = ConfigDict(extra="forbid")

    system: str = Field(min_length=1, max_length=20000)
    user: str = Field(min_length=1, max_length=20000)
    description: str | None = Field(default=None, max_length=500)


class PromptPreviewRequest(BaseModel):
    """Body for rendering a template without saving it."""

    model_config = ConfigDict(extra="forbid")

    variables: dict[str, str] = Field(default_factory=dict)
    #: Unsaved editor content. When present it is previewed instead of the
    #: stored template, which is what makes the studio's preview live.
    system: str | None = Field(default=None, max_length=20000)
    user: str | None = Field(default=None, max_length=20000)


def _require_editing() -> None:
    if not settings.PROMPT_EDITING_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Prompt editing is disabled on this deployment (PROMPT_EDITING_ENABLED=false).",
        )


def _load_or_404(name: str) -> prompts.PromptTemplate:
    try:
        return prompts.load(name)
    except prompts.PromptError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("")
async def list_prompts() -> dict[str, Any]:
    """List every template with its metadata (no bodies)."""

    return {
        "editable": settings.PROMPT_EDITING_ENABLED,
        "directory": str(prompts.templates_dir()),
        "templates": [template.to_dict(include_body=False) for template in prompts.load_all()],
    }


@router.get("/{name}")
async def get_prompt(name: str) -> dict[str, Any]:
    """Return one template, including its system and user text."""

    return _load_or_404(name).to_dict()


@router.get("/{name}/versions")
async def get_prompt_versions(name: str) -> dict[str, Any]:
    """List the current version plus every archived one."""

    _load_or_404(name)
    return {"name": name, "versions": prompts.versions(name)}


@router.post("/{name}/preview")
async def preview_prompt(name: str, body: PromptPreviewRequest) -> dict[str, Any]:
    """Render a template against variables and report missing or unused ones.

    Falls back to the template's own sample values for any variable the caller
    did not supply, so an untouched preview still shows a realistic prompt.
    """

    template = _load_or_404(name)
    variables = {**template.samples, **body.variables}

    if body.system is not None or body.user is not None:
        system_source = body.system if body.system is not None else template.system
        user_source = body.user if body.user is not None else template.user
        placeholders = set(prompts.PLACEHOLDER_RE.findall(system_source)) | set(
            prompts.PLACEHOLDER_RE.findall(user_source)
        )
        rendered_system = prompts.render_text(system_source, variables, strict=False)
        rendered_user = prompts.render_text(user_source, variables, strict=False)
        return {
            "name": name,
            "version": template.version,
            "draft": True,
            "system": rendered_system,
            "user": rendered_user,
            "missing": sorted(placeholders - set(variables)),
            "unused": sorted(set(variables) - placeholders),
            "characters": len(rendered_system) + len(rendered_user),
        }

    return {**prompts.analyse(name, variables), "draft": False}


@router.put("/{name}")
async def update_prompt(
    name: str,
    body: PromptUpdate,
    _user_id: int = Depends(get_request_user_id),
) -> dict[str, Any]:
    """Save a new version, archiving the current one first."""

    _require_editing()
    _load_or_404(name)
    try:
        saved = prompts.save(name, body.system, body.user, body.description)
    except prompts.PromptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not write the template: {exc}. Set PROMPT_TEMPLATES_DIR to a writable path.",
        ) from exc
    return saved.to_dict()


@router.post("/{name}/revert/{version}")
async def revert_prompt(
    name: str,
    version: int,
    _user_id: int = Depends(get_request_user_id),
) -> dict[str, Any]:
    """Restore an archived version as a new version on top of the current one."""

    _require_editing()
    _load_or_404(name)
    try:
        return prompts.revert(name, version).to_dict()
    except prompts.PromptError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
