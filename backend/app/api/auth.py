"""Authentication status routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_optional_user_id, get_required_auth_claims, hash_password, verify_password
from app.db.models import User
from app.db.session import get_db
from app.models.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    """Local JWT registration payload for API compatibility and demos."""

    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)


class LoginRequest(BaseModel):
    """Local JWT login payload for API compatibility and demos."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=255)


class AuthTokenResponse(BaseModel):
    """Local JWT auth response."""

    access_token: str
    token_type: str = "bearer"
    user: UserRead


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Register a local JWT user without affecting Clerk authentication."""

    existing = await db.scalar(select(User).where(User.email == str(payload.email)))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(name=payload.name, email=str(payload.email), hashed_password=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer", "user": user}


@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Issue a local JWT for users created through /auth/register or /users."""

    user = await db.scalar(select(User).where(User.email == str(payload.email)))
    if user is None or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer", "user": user}


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
