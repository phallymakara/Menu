from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints.websockets import router as ws_router
from app.api.v1.router import api_router
from app.core.body_limit import BodySizeLimitMiddleware
from app.core.config import settings
from app.core.logging import LoggingMiddleware, setup_logging
from app.core.static_files import UploadStaticFiles
from app.core.ws_broadcaster import create_broadcaster
from app.core.ws_manager import ws_manager

# Initialize logging configuration
setup_logging(
    log_level=settings.log_level,
    environment=settings.environment,
)

logger = structlog.get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager for logging startup and shutdown.

    It also runs the real-time broadcaster selected by REALTIME_BACKEND. With
    "redis" that is this process's single subscriber task, which is cancelled
    cleanly on shutdown.
    """
    logger.info(
        "Starting backend application",
        app_name=settings.app_name,
        version=settings.app_version,
    )
    await ws_manager.start(create_broadcaster(settings))
    try:
        yield
    finally:
        logger.info("Shutting down backend application")
        await ws_manager.stop()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

# Innermost: reject oversized bodies before they are read (CORS and logging still apply)
app.add_middleware(
    BodySizeLimitMiddleware,
    max_body_bytes=settings.max_request_body_bytes,
)

# Add HTTP request tracking middleware
app.add_middleware(LoggingMiddleware)

# Configure CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 router and direct ws router
app.include_router(
    api_router,
    prefix="/api/v1",
)
app.include_router(ws_router)

# Mount local uploads static directory
upload_path = Path("uploads")
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", UploadStaticFiles(directory=str(upload_path)), name="uploads")


@app.get("/")
async def root() -> dict[str, str]:
    """
    Root status endpoint to check application availability and version information.
    """
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
    }
