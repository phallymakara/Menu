from functools import lru_cache

from pydantic import Field
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

    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

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
    """
    return Settings()  # pyright: ignore[reportCallIssue]


settings = get_settings()
