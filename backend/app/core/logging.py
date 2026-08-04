import logging
import sys
import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Central logger for this module
logger = structlog.get_logger("app.core.logging")


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
        request_logger.info("Request started")

        start_time = time.perf_counter()
        try:
            response = await call_next(request)
            duration = time.perf_counter() - start_time

            # Attach tracing ID to response headers
            response.headers["X-Request-ID"] = request_id

            request_logger.info(
                "Request completed",
                status_code=response.status_code,
                duration_ms=round(duration * 1000, 2),
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
