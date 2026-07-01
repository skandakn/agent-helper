"""Authentication helpers for local JWTs and Clerk session tokens."""

import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)
_JWKS_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_JWKS_TTL_SECONDS = 300


def hash_password(password: str) -> str:
    """Hash a password for local development users."""

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


def _decode_local_token(token: str) -> dict[str, Any] | None:
    """Decode a first-party development JWT, returning None if it is not one."""

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_value,
            algorithms=[settings.JWT_ALGORITHM],
        )
        payload["provider"] = "local"
        return payload
    except JWTError:
        return None


async def _fetch_clerk_jwks() -> list[dict[str, Any]]:
    """Fetch and cache Clerk JWKS keys for standalone FastAPI verification."""

    endpoint = settings.clerk_jwks_endpoint
    if not endpoint:
        return []
    cached = _JWKS_CACHE.get(endpoint)
    now = time.monotonic()
    if cached and now - cached[0] < _JWKS_TTL_SECONDS:
        return cached[1]
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(endpoint)
        response.raise_for_status()
    keys = list(response.json().get("keys", []))
    _JWKS_CACHE[endpoint] = (now, keys)
    return keys


async def verify_clerk_session_token(token: str) -> dict[str, Any] | None:
    """Verify a Clerk session token when Clerk JWKS settings are configured."""

    keys = await _fetch_clerk_jwks()
    if not keys:
        return None
    header = jwt.get_unverified_header(token)
    key = next((item for item in keys if item.get("kid") == header.get("kid")), None)
    if key is None:
        raise JWTError("No matching Clerk signing key")

    decode_kwargs: dict[str, Any] = {
        "algorithms": ["RS256"],
        "options": {"verify_aud": bool(settings.CLERK_AUDIENCE)},
    }
    if settings.CLERK_ISSUER_URL:
        decode_kwargs["issuer"] = settings.CLERK_ISSUER_URL.rstrip("/")
    if settings.CLERK_AUDIENCE:
        decode_kwargs["audience"] = settings.CLERK_AUDIENCE
    payload = jwt.decode(token, key, **decode_kwargs)

    if settings.CLERK_AUTHORIZED_PARTIES:
        authorized_party = payload.get("azp")
        if authorized_party not in settings.CLERK_AUTHORIZED_PARTIES:
            raise JWTError("Unauthorized Clerk token party")
    payload["provider"] = "clerk"
    return payload


async def decode_bearer_token(token: str) -> dict[str, Any]:
    """Decode a bearer token from either the local JWT or Clerk path."""

    local_payload = _decode_local_token(token)
    if local_payload is not None:
        return local_payload
    clerk_payload = await verify_clerk_session_token(token)
    if clerk_payload is not None:
        return clerk_payload
    raise JWTError("No configured verifier accepted this token")


def _stable_external_user_id(subject: str) -> int:
    """Map an external Clerk subject to a stable positive local integer id."""

    digest = hashlib.sha256(subject.encode("utf-8")).hexdigest()
    return 100000 + (int(digest[:12], 16) % 900000000)


async def get_optional_auth_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any] | None:
    """Return verified bearer claims, allowing anonymous access in optional mode."""

    if credentials is None:
        if settings.backend_auth_strict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        return None
    try:
        return await decode_bearer_token(credentials.credentials)
    except (JWTError, httpx.HTTPError) as exc:
        if not settings.backend_auth_strict and not settings.clerk_jwks_endpoint:
            try:
                payload = jwt.get_unverified_claims(credentials.credentials)
                if payload.get("sub"):
                    payload["provider"] = "clerk_unverified"
                    return payload
            except JWTError:
                return None
        if not settings.backend_auth_strict and not settings.clerk_jwks_endpoint:
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc


async def get_required_auth_claims(
    claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
) -> dict[str, Any]:
    """Return verified claims or reject anonymous requests."""

    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return claims


async def get_optional_user_id(
    claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
) -> int | None:
    """Return a local numeric user id for local JWT or Clerk-authenticated users."""

    if claims is None:
        return None
    try:
        subject = claims.get("sub")
        if claims.get("provider") in {"clerk", "clerk_unverified"} and subject:
            return _stable_external_user_id(str(subject))
        return int(subject) if subject is not None else None
    except (JWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc
