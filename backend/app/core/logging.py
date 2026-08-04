import logging
import sys
import time
import uuid
from collections.abc import Awaitable, Callable

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


def setup_logging(log_level: str = "INFO", environment: str = "development") -> None:
    """
    Configures structlog and bridges standard library logging.

    Uses ConsoleRenderer (colorized) for development and JSONRenderer for production.
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
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    # Select renderer based on environment
    if environment.lower() == "production":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

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

    # Force standard logger integrations (Uvicorn and SQLAlchemy)
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
        "Logging configured successfully.",
        log_level=log_level,
        environment=environment,
    )


# --- SQLAlchemy Slow Query Profiler Event Listeners ---


@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(
    conn, cursor, statement, parameters, context, executemany
) -> None:
    """Record the start time of database query execution."""
    if context is not None:
        context._query_start_time = time.perf_counter()


@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(
    conn, cursor, statement, parameters, context, executemany
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
        db_logger = structlog.get_logger("sqlalchemy.slow_query")
        db_logger.warning(
            "Slow database query detected",
            duration_ms=round(duration_ms, 2),
            threshold_ms=threshold,
            statement=statement,  # Omit parameters to prevent leaking secrets
        )


# --- Request Logging Middleware ---


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    FastAPI HTTP middleware to log request start, duration, status codes,
    and propagate X-Request-ID across logging context and response headers.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Check for client-submitted request ID or generate a new one
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Reset context variables and bind request metadata
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        request_logger = structlog.get_logger("api.request")

        # Filter high-frequency low-value requests unless debug mode is active
        is_low_value = request.url.path in IGNORED_PATHS
        should_log_info = not is_low_value or settings.debug

        if should_log_info:
            request_logger.info("Request started")

        start_time = time.perf_counter()
        try:
            response = await call_next(request)
            duration = time.perf_counter() - start_time
            duration_ms = round(duration * 1000, 2)

            # Attach tracing ID to response headers
            response.headers["X-Request-ID"] = request_id

            # Log standard completion
            if should_log_info or response.status_code >= 400:
                request_logger.info(
                    "Request completed",
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )

            # Alert if the request duration exceeds slow threshold
            if duration_ms >= settings.slow_request_threshold_ms:
                request_logger.warning(
                    "Slow request detected",
                    duration_ms=duration_ms,
                    threshold_ms=settings.slow_request_threshold_ms,
                )

            # Log common client errors as warnings
            if 400 <= response.status_code < 500:
                request_logger.warning(
                    "Client error response returned",
                    status_code=response.status_code,
                )

            return response
        except Exception as exc:
            duration = time.perf_counter() - start_time
            request_logger.error(
                "Request failed",
                error=str(exc),
                duration_ms=round(duration * 1000, 2),
                exc_info=True,
            )
            raise exc
