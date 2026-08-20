from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import LoggingMiddleware, setup_logging

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
    """
    logger.info(
        "Starting backend application",
        app_name=settings.app_name,
        version=settings.app_version,
    )
    yield
    logger.info("Shutting down backend application")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
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

# Include API v1 router
app.include_router(
    api_router,
    prefix="/api/v1",
)

# Mount local uploads static directory
upload_path = Path("uploads")
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")


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
