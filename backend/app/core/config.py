"""Environment-driven application configuration."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, computed_field
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
    AGENT_RUNTIME: Literal["deterministic", "gemini"] = "deterministic"

    QDRANT_URL: str = "http://qdrant:6333"
    QDRANT_API_KEY: SecretStr | None = None
    QDRANT_ENABLED: bool = True

    POSTGRES_URL: str = "postgresql+asyncpg://user:pass@postgres:5432/hackathon_db"

    JWT_SECRET: SecretStr = Field(default=SecretStr("change_me_to_random_256bit_secret"))
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    USE_SENTENCE_TRANSFORMERS: bool = False

    BACKEND_CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    @computed_field  # type: ignore[misc]
    @property
    def gemini_key(self) -> str | None:
        """Return the first configured Gemini-compatible API key."""

        key = self.GEMINI_API_KEY or self.GOOGLE_API_KEY
        return key.get_secret_value() if key else None

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


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()


settings = get_settings()
