from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

logger = structlog.get_logger("api.health")

router = APIRouter(
    prefix="/health",
    tags=["Health"],
)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
)
async def check_health(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    """
    Checks the status of the API and its connection to the database.
    """
    try:
        # Perform a quick database probe to confirm connection integrity
        await session.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "up",
        }
    except Exception as exc:
        logger.error("Database health check probe failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        ) from exc
