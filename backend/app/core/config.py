import ipaddress
import sys
from functools import lru_cache
from typing import Any, Literal

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


def _parse_networks(value: str) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    """Parse a comma-separated list of IP addresses and CIDR ranges."""
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for entry in value.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError as exc:
            raise ValueError(
                f"'{entry}' is not an IP address or CIDR range in TRUSTED_PROXIES"
            ) from exc
    return networks


class Settings(BaseSettings):
    app_name: str = "អុី មីនុយ-E Menu API"
    app_version: str = "0.1.0"
    # Defaults to production so that development-only behavior (such as returning
    # password reset tokens in API responses) must be enabled explicitly.
    environment: str = "production"
    debug: bool = False

    database_url: str = Field(...)
    redis_url: str = Field(...)
    secret_key: str = Field(...)

    # Real-time WebSocket broadcasting. "memory" only reaches clients connected
    # to the same process; "redis" fans out through Redis pub/sub on REDIS_URL.
    realtime_backend: Literal["memory", "redis"] = Field(
        default="memory",
        description=(
            "WebSocket broadcast backend. Production with more than one worker"
            " or instance must use 'redis'."
        ),
    )

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = Field(
        default=14,
        ge=1,
        description="Lifetime of a login session (refresh token family) in days",
    )
    password_reset_token_expire_minutes: int = Field(
        default=30,
        ge=5,
        le=1440,
        description="Lifetime of a single-use password reset token in minutes",
    )
    password_hash_max_concurrency: int = Field(
        default=4,
        ge=1,
        description=(
            "Maximum Argon2 hash or verify operations running at once per process. "
            "Each one uses about 64 MiB of memory."
        ),
    )

    # Rate limiting (fixed window) for the authentication endpoints
    rate_limit_backend: Literal["memory", "redis"] = Field(
        default="memory",
        description=(
            "'memory' counts per process (development and tests only); "
            "'redis' shares counters through REDIS_URL and is required in production"
        ),
    )
    rate_limit_redis_timeout_seconds: float = Field(default=1.0, gt=0)
    rate_limit_login_per_identifier: int = Field(default=10, ge=1)
    rate_limit_login_per_ip: int = Field(default=50, ge=1)
    rate_limit_login_window_seconds: int = Field(default=900, ge=1)
    rate_limit_login_failures_per_account: int = Field(
        default=30,
        ge=1,
        description=(
            "Failed logins allowed per account from all IP addresses together in "
            "one login window, after which the account is locked until it ends"
        ),
    )
    rate_limit_refresh_per_ip: int = Field(default=300, ge=1)
    rate_limit_refresh_window_seconds: int = Field(default=900, ge=1)
    rate_limit_register_per_ip: int = Field(default=10, ge=1)
    rate_limit_register_window_seconds: int = Field(default=3600, ge=1)
    rate_limit_password_reset_per_identifier: int = Field(default=5, ge=1)
    rate_limit_password_reset_per_ip: int = Field(default=20, ge=1)
    rate_limit_password_reset_window_seconds: int = Field(default=3600, ge=1)
    rate_limit_password_reset_confirm_per_ip: int = Field(default=20, ge=1)

    # Reverse proxies whose X-Forwarded-For header may be trusted for client IPs
    trusted_proxies: str = Field(
        default="",
        description=(
            "Comma-separated IP addresses or CIDR ranges of reverse proxies. "
            "X-Forwarded-For is read only on requests from these addresses; when "
            "empty, the socket peer address is always used."
        ),
    )

    frontend_base_url: str = Field(
        default="http://localhost:3000",
        description="Base URL for customer web ordering frontend",
    )

    # CORS settings
    cors_origins: list[str] | str = Field(
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

    # Largest accepted request body; larger requests get 413 before being read.
    max_request_body_bytes: int = 10 * 1024 * 1024

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
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    import json

                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    pass
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @field_validator("trusted_proxies")
    @classmethod
    def validate_trusted_proxies(cls, value: str) -> str:
        """Reject TRUSTED_PROXIES entries that are not IP addresses or CIDR ranges."""
        _parse_networks(value)
        return value

    @property
    def trusted_proxy_networks(
        self,
    ) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
        """TRUSTED_PROXIES parsed into networks (a single address is a /32 or /128)."""
        return _parse_networks(self.trusted_proxies)

    @property
    def is_development(self) -> bool:
        """Return True only when ENVIRONMENT is 'development' (case-insensitive)."""
        return self.environment.strip().lower() == "development"

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
    Checks and handles validation errors gracefully with clear output.
    """
    try:
        return Settings()  # pyright: ignore[reportCallIssue]
    except ValidationError as e:
        missing_fields: list[str] = []
        invalid_fields: list[str] = []

        for error in e.errors():
            field_name = ".".join(str(item) for item in error.get("loc", []))
            msg = error.get("msg", "")
            err_type = error.get("type", "")

            if "missing" in err_type or "Field required" in msg:
                missing_fields.append(field_name.upper())
            else:
                invalid_fields.append(f"{field_name.upper()}: {msg}")

        print("CRITICAL: Configuration validation failed.", file=sys.stderr)

        if missing_fields:
            print("Missing required environment variable(s):", file=sys.stderr)
            for field in missing_fields:
                print(f"  - {field}", file=sys.stderr)

        if invalid_fields:
            print("Invalid configuration field(s):", file=sys.stderr)
            for err in invalid_fields:
                print(f"  - {err}", file=sys.stderr)

        print(
            "Action Required: Please ensure '.env' exists in backend directory"
            " with required variables configured.",
            file=sys.stderr,
        )
        sys.exit(1)


settings = get_settings()
