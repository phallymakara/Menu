import sys
from functools import lru_cache
from typing import Any

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


class Settings(BaseSettings):
    app_name: str = "អុី មីនុយ-E Menu API"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False

    database_url: str = Field(...)
    redis_url: str = Field(...)
    secret_key: str = Field(...)

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # CORS settings
    cors_origins: list[str] = Field(
        default=["*"],
        description="Allowed CORS origins (comma-separated string or list)",
    )

    # Database Pool configurations
    database_pool_size: int = 5
    database_max_overflow: int = 10
    database_pool_timeout: int = 30
    database_pool_recycle: int = 1800

    # Logging configurations
    log_level: str = "INFO"
    slow_request_threshold_ms: float = 500.0
    slow_database_threshold_ms: float = 100.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @property
    def sync_database_url(self) -> URL:
        """
        Derives and returns a synchronous database connection URL
        from the async database URL.

        Converts the database driver to 'postgresql+psycopg' and
        ensures SSL parameters are properly mapped.
        """
        url = make_url(self.database_url).set(drivername="postgresql+psycopg")

        query = dict(url.query)

        if "ssl" in query:
            query["sslmode"] = query.pop("ssl")

        return url.set(query=query)


@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached Settings instance.

    Uses lru_cache to ensure settings are loaded from the environment only once.
    Checks and handles validation errors gracefully.
    """
    try:
        return Settings()  # pyright: ignore[reportCallIssue]
    except ValidationError as e:
        print(f"Configuration validation error: {e}", file=sys.stderr)
        sys.exit(1)


settings = get_settings()
