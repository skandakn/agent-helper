"""Minimal authentication scaffolding for MVP routes."""

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password for future full auth implementation."""

    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash."""

    return pwd_context.verify(password, hashed_password)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    """Create a signed JWT token."""

    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret_value, algorithm=settings.JWT_ALGORITHM)


async def get_optional_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> int | None:
    """Return the authenticated user id if a bearer token is present.

    MVP endpoints allow anonymous local usage, but this dependency is wired so
    production auth can become strict without redesigning route signatures.
    """

    if credentials is None:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_value,
            algorithms=[settings.JWT_ALGORITHM],
        )
        subject = payload.get("sub")
        return int(subject) if subject is not None else None
    except (JWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc
