"""Authentication status routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.core.auth import get_optional_user_id, get_required_auth_claims

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/session")
async def session_status(
    claims: dict[str, Any] = Depends(get_required_auth_claims),
    user_id: int | None = Depends(get_optional_user_id),
) -> dict[str, Any]:
    """Return the verified auth provider and local user mapping."""

    return {
        "authenticated": True,
        "provider": claims.get("provider"),
        "subject": claims.get("sub"),
        "user_id": user_id,
        "expires_at": claims.get("exp"),
    }
