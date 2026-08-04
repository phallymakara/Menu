from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import LoggingMiddleware, setup_logging

# Initialize logging configuration
setup_logging(
    log_level=settings.log_level,
    environment=settings.environment,
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)

# Add HTTP request tracking and tracing context middleware
app.add_middleware(LoggingMiddleware)

# Configure CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    api_router,
    prefix="/api/v1",
)


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
