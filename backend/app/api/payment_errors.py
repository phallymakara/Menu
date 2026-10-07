"""Translation of payment and KHQR domain exceptions into HTTP errors."""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException, status

from app.core.exceptions import (
    PaymentAccountNotConfiguredError,
    PaymentAttemptExpiredError,
    PaymentNotReceivedError,
    PaymentProviderNotConfiguredError,
    PaymentProviderUnavailableError,
    PermissionDeniedError,
    ResourceConflictError,
    TenantNotFoundError,
)


@contextmanager
def payment_error_responses() -> Iterator[None]:
    """
    Map payment domain exceptions raised inside the block to HTTP errors.

    - 404: the bill, branch or payment attempt does not exist for the tenant
    - 403: the caller's role may not perform the action
    - 409: the bill or attempt is in a conflicting state, including "payment not
      received yet" (the client may retry) and a missing Bakong account
    - 503: Bakong verification is not configured or not reachable

    The messages are written by the services and never contain provider
    responses or credentials.
    """
    try:
        yield
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except (
        ResourceConflictError,
        PaymentAccountNotConfiguredError,
        PaymentNotReceivedError,
        PaymentAttemptExpiredError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except (
        PaymentProviderNotConfiguredError,
        PaymentProviderUnavailableError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
