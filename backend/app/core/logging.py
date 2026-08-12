import logging
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from fastapi import Request, Response
from sqlalchemy import event
from sqlalchemy.engine import Engine
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# Central logger for this module
logger = structlog.get_logger("app.core.logging")

# High-frequency, low-value paths that should not clutter normal logs
IGNORED_PATHS = {
    "/",
    "/api/v1/health",
    "/docs",
    "/redoc",
    "/openapi.json",
}

# Sensitive keys that must be masked from log outputs
SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "access_token",
    "refresh_token",
    "api_key",
    "secret_key",
    "database_url",
    "authorization",
    "cookie",
    "token",
    "secret",
}


def censor_sensitive_data(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """
    Structlog processor that masks sensitive parameters (passwords, tokens, keys)
    from log events.
    """
    for key in list(event_dict.keys()):
        key_lower = key.lower()
        if any(sensitive_word in key_lower for sensitive_word in SENSITIVE_KEYS):
            event_dict[key] = "[FILTERED]"
    return event_dict


class DevelopmentConsoleRenderer:
    """
    Custom console renderer for local development matching standard format:
    TIMESTAMP | LEVEL | MODULE | MESSAGE | CONTEXT
    """

    def __call__(self, logger: Any, name: str, event_dict: dict[str, Any]) -> str:
        timestamp = event_dict.pop("timestamp", time.strftime("%Y-%m-%d %H:%M:%S"))
        level = str(event_dict.pop("level", "info")).upper().ljust(8)
        module = str(event_dict.pop("logger_name", name or "app")).ljust(22)
        message = str(event_dict.pop("event", ""))

        # Omit internal tracing variables from context string
        event_dict.pop("request_id", None)
        exc_info = event_dict.pop("exc_info", None)

        context_parts: list[str] = []
        for key, val in event_dict.items():
            if key.startswith("_"):
                continue
            context_parts.append(f"{key}={val}")

        context_str = " | ".join(context_parts)

        log_line = f"{timestamp} | {level} | {module} | {message}"
        if context_str:
            log_line += f" | {context_str}"

        if exc_info:
            if isinstance(exc_info, str):
                log_line += f"\n{exc_info}"
            elif exc_info is True:
                import traceback

                log_line += f"\n{traceback.format_exc()}"

        return log_line


def setup_logging(log_level: str = "INFO", environment: str = "development") -> None:
    """
    Configures structlog and bridges standard library logging.

    Uses DevelopmentConsoleRenderer for development and JSONRenderer for production.
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Clear existing log handlers
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Standard structlog processors
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
        censor_sensitive_data,
    ]

    # Select renderer based on environment
    if environment.lower() == "production":
        renderer: Any = structlog.processors.JSONRenderer()
    else:
        renderer = DevelopmentConsoleRenderer()

    # Configure structlog
    structlog.configure(
        processors=processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Stream handler directing logs to stdout
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=renderer,
            foreign_pre_chain=processors,
        )
    )

    root_logger.addHandler(handler)
    root_logger.setLevel(numeric_level)

    # Patch third-party loggers
    loggers_to_patch = [
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "sqlalchemy.engine",
    ]
    for logger_name in loggers_to_patch:
        log = logging.getLogger(logger_name)
        log.handlers = [handler]
        log.propagate = False
        log.setLevel(numeric_level)

    logger.info(
        "Logging system initialized",
        log_level=log_level,
        environment=environment,
    )


# --- SQLAlchemy Slow Query Profiler Event Listeners ---


@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(
    conn: Any,
    cursor: Any,
    statement: str,
    parameters: Any,
    context: Any,
    executemany: bool,
) -> None:
    """Record the start time of database query execution."""
    if context is not None:
        context._query_start_time = time.perf_counter()


@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(
    conn: Any,
    cursor: Any,
    statement: str,
    parameters: Any,
    context: Any,
    executemany: bool,
) -> None:
    """Check database query duration and log warnings for slow queries."""
    if context is None:
        return
    start_time = getattr(context, "_query_start_time", None)
    if start_time is None:
        return

    duration_ms = (time.perf_counter() - start_time) * 1000.0
    threshold = settings.slow_database_threshold_ms

    if duration_ms >= threshold:
        db_logger = structlog.get_logger("app.database.slow_query")
        db_logger.warning(
            "Slow database query detected",
            duration_ms=round(duration_ms, 2),
            threshold_ms=threshold,
            statement=statement,
        )


# --- Request Logging Middleware ---


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    FastAPI HTTP middleware to log request duration, status codes, and request tracing
    in standard format: METHOD path | status | duration_ms
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
        )

        request_logger = structlog.get_logger("app.api.http")

        is_low_value = request.url.path in IGNORED_PATHS
        should_log = not is_low_value or settings.debug

        start_time = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000.0)

            response.headers["X-Request-ID"] = request_id

            if should_log:
                status_code = response.status_code
                log_message = (
                    f"{request.method} {request.url.path} | "
                    f"{status_code} | {duration_ms}ms"
                )

                if response.status_code >= 500:
                    request_logger.error(log_message)
                elif response.status_code >= 400:
                    request_logger.warning(log_message)
                else:
                    request_logger.info(log_message)

                if duration_ms >= settings.slow_request_threshold_ms:
                    request_logger.warning(
                        "Slow request threshold exceeded",
                        duration_ms=duration_ms,
                        threshold_ms=settings.slow_request_threshold_ms,
                    )

            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000.0)
            request_logger.error(
                f"{request.method} {request.url.path} | 500 | {duration_ms}ms",
                error=str(exc),
                exc_info=True,
            )
            raise exc
