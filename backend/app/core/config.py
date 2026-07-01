"""Environment-driven application configuration."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables.

    Defaults are safe for local Docker Compose. Production deployments should
    override secrets and disable deterministic fallbacks.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "Hackathon Launch & Marketing Agent"
    APP_ENV: Literal["local", "test", "prod"] = "local"
    LOG_LEVEL: str = "INFO"

    GEMINI_API_KEY: SecretStr | None = None
    GOOGLE_API_KEY: SecretStr | None = None
    GEMINI_PRO_MODEL: str = "gemini-2.5-pro"
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash"
    AGENT_RUNTIME: Literal["auto", "deterministic", "gemini"] = "gemini"

    QDRANT_URL: str = "http://qdrant:6333"
    QDRANT_API_KEY: SecretStr | None = None
    QDRANT_ENABLED: bool = True

    POSTGRES_URL: str = "postgresql+asyncpg://user:pass@postgres:5432/hackathon_db"
    AUTO_CREATE_TABLES: bool = True
    RUN_MIGRATIONS_ON_STARTUP: bool = False

    JWT_SECRET: SecretStr = Field(default=SecretStr("change_me_to_random_256bit_secret"))
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24
    BACKEND_AUTH_MODE: Literal["optional", "strict"] = "optional"
    CLERK_ISSUER_URL: str | None = None
    CLERK_JWKS_URL: str | None = None
    CLERK_AUDIENCE: str | None = None
    CLERK_AUTHORIZED_PARTIES: list[str] = Field(default_factory=list)

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    USE_SENTENCE_TRANSFORMERS: bool = False

    BACKEND_CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "https://agent-helper-sable.vercel.app",
        ]
    )

    @field_validator("BACKEND_CORS_ORIGINS", "CLERK_AUTHORIZED_PARTIES", mode="before")
    @classmethod
    def parse_env_list(cls, value: object) -> object:
        """Allow JSON arrays or comma-separated strings in deployment env vars."""

        if isinstance(value, str) and value.strip() and not value.strip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @computed_field  # type: ignore[misc]
    @property
    def gemini_key(self) -> str | None:
        """Return the first configured Gemini-compatible API key."""

        key = self.GEMINI_API_KEY or self.GOOGLE_API_KEY
        return key.get_secret_value() if key else None

    @computed_field  # type: ignore[misc]
    @property
    def effective_agent_runtime(self) -> Literal["deterministic", "gemini"]:
        """Return the runtime that should actually be used for this process."""

        if self.AGENT_RUNTIME == "deterministic":
            return "deterministic"
        if self.gemini_key:
            return "gemini"
        return "deterministic"

    @computed_field  # type: ignore[misc]
    @property
    def qdrant_key(self) -> str | None:
        """Return a Qdrant API key only when one was configured."""

        return self.QDRANT_API_KEY.get_secret_value() if self.QDRANT_API_KEY else None

    @computed_field  # type: ignore[misc]
    @property
    def jwt_secret_value(self) -> str:
        """Return the JWT signing secret as a plain string for jose."""

        return self.JWT_SECRET.get_secret_value()

    @computed_field  # type: ignore[misc]
    @property
    def backend_auth_strict(self) -> bool:
        """Return whether API routes should reject anonymous requests."""

        return self.BACKEND_AUTH_MODE == "strict"

    @computed_field  # type: ignore[misc]
    @property
    def clerk_jwks_endpoint(self) -> str | None:
        """Return the Clerk JWKS endpoint when Clerk verification is configured."""

        if self.CLERK_JWKS_URL:
            return self.CLERK_JWKS_URL
        if self.CLERK_ISSUER_URL:
            return f"{self.CLERK_ISSUER_URL.rstrip('/')}/.well-known/jwks.json"
        return None


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()


settings = get_settings()
