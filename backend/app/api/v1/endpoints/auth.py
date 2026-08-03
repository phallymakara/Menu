from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RegistrationConflictError
from app.db.session import get_db_session
from app.schemas.auth import OwnerRegistrationRequest, OwnerRegistrationResponse
from app.services.auth_service import register_owner

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register-owner",
    response_model=OwnerRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_owner_endpoint(
    payload: OwnerRegistrationRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OwnerRegistrationResponse:
    try:
        user, organization, business, branch = await register_owner(
            session=session,
            payload=payload,
        )

        await session.commit()

        return OwnerRegistrationResponse(
            user_id=str(user.id),
            organization_id=str(organization.id),
            business_id=str(business.id),
            branch_id=str(branch.id),
            message="Owner account and business workspace created successfully.",
        )

    except RegistrationConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration conflicts with existing data.",
        ) from exc

