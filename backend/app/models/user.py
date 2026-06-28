"""Pydantic models for user APIs."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """Create a user."""

    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str | None = Field(default=None, min_length=8, max_length=255)


class UserRead(BaseModel):
    """Readable user record."""

    id: int
    name: str
    email: EmailStr
    preferences: dict
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
