"""User API routes for MVP auth scaffolding."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_optional_auth_claims, hash_password
from app.db.models import User
from app.db.session import get_db
from app.models.user import UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    """Create a local user."""

    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        name=payload.name,
        email=str(payload.email),
        hashed_password=hash_password(payload.password) if payload.password else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("", response_model=list[UserRead])
async def list_users(
    _claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """List users for local MVP administration."""

    result = await db.execute(select(User).order_by(User.created_at.desc()).limit(25))
    return list(result.scalars().all())


@router.post("/{user_id}/token")
async def issue_token(
    user_id: int,
    _claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Issue a development JWT for an existing user."""

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer"}
