"""
Bakong Open API client (National Bank of Cambodia).

Only the call this application needs is implemented: confirming that a dynamic
KHQR was paid.

    POST {base_url}/v1/check_transaction_by_md5
    Authorization: Bearer <token>
    Content-Type: application/json
    {"md5": "<lowercase hex MD5 of the KHQR string>"}

Response bodies follow the Bakong Open API documentation (v1.0.2):

- paid: ``{"responseCode": 0, "data": {"hash", "fromAccountId", "toAccountId",
  "currency", "amount", "description"}}``
- not found (not paid yet): ``{"responseCode": 1, "errorCode": 1, "data": null}``
- failed: ``{"responseCode": 1, "errorCode": 3, "data": null}``
- token rejected: ``errorCode`` 6 or HTTP 401

Anything else (timeouts, connection errors, HTTP 403/429/5xx, invalid JSON,
unknown error codes, or a paid answer without hash, amount or currency) raises
``PaymentProviderUnavailableError`` with a generic message. The API token, the
request body and provider messages are never logged or returned to clients.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Any

import httpx
import structlog

from app.core.config import Settings
from app.core.exceptions import PaymentProviderUnavailableError

logger = structlog.get_logger("app.integrations.bakong")

CHECK_TRANSACTION_BY_MD5_PATH = "/v1/check_transaction_by_md5"

# Custom error codes from the Bakong Open API documentation.
_ERROR_CODE_TRANSACTION_NOT_FOUND = 1
_ERROR_CODE_TRANSACTION_FAILED = 3
_ERROR_CODE_UNAUTHORIZED = 6

_MD5_HEX = re.compile(r"[0-9a-f]{32}")
_MAX_TRANSACTION_HASH_LENGTH = 128
_MAX_CONNECT_TIMEOUT_SECONDS = 5.0

UNAVAILABLE_MESSAGE = (
    "Bakong payment verification is unavailable right now. Try again shortly, "
    "or ask a manager to confirm the payment manually."
)


class BakongTransactionStatus(StrEnum):
    """What Bakong reports for one KHQR."""

    PAID = "paid"
    NOT_FOUND = "not_found"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class BakongTransactionCheck:
    """
    Normalized answer of ``check_transaction_by_md5``.

    For a paid transaction ``transaction_hash``, ``amount`` and ``currency`` are
    always set. For the other statuses they are ``None``.
    """

    status: BakongTransactionStatus
    transaction_hash: str | None = None
    amount: Decimal | None = None
    currency: str | None = None


class BakongClient:
    """Async client for the Bakong Open API transaction status check."""

    __slots__ = ("_api_token", "_base_url", "_timeout", "_transport")

    def __init__(
        self,
        *,
        base_url: str,
        api_token: str,
        timeout_seconds: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        """
        Create a client.

        Args:
            base_url: API root such as ``https://api-bakong.nbc.gov.kh``. A
                trailing ``/v1`` is tolerated and removed.
            api_token: Bearer token issued by NBC. It is only ever sent in the
                ``Authorization`` header.
            timeout_seconds: Total time allowed for one request. Connecting is
                capped at 5 seconds.
            transport: Optional httpx transport, used by tests to stub Bakong.

        Raises:
            ValueError: If the token is empty.
        """
        if not api_token.strip():
            raise ValueError("A Bakong API token is required.")
        self._base_url = base_url.strip().rstrip("/").removesuffix("/v1")
        self._api_token = api_token.strip()
        self._timeout = httpx.Timeout(
            timeout_seconds,
            connect=min(timeout_seconds, _MAX_CONNECT_TIMEOUT_SECONDS),
        )
        self._transport = transport

    def __repr__(self) -> str:
        """Describe the client without exposing the API token."""
        return f"BakongClient(base_url={self._base_url!r})"

    async def check_transaction_by_md5(self, md5: str) -> BakongTransactionCheck:
        """
        Ask Bakong whether the KHQR with this MD5 has been paid.

        Args:
            md5: Lowercase hex MD5 of the full KHQR string.

        Returns:
            The normalized transaction status.

        Raises:
            ValueError: If ``md5`` is not a lowercase 32-character hex digest.
            PaymentProviderUnavailableError: If Bakong gives no usable answer.
        """
        if not _MD5_HEX.fullmatch(md5):
            raise ValueError("md5 must be a lowercase hexadecimal MD5 digest.")

        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                transport=self._transport,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    CHECK_TRANSACTION_BY_MD5_PATH,
                    json={"md5": md5},
                    headers={
                        "Authorization": f"Bearer {self._api_token}",
                        "Accept": "application/json",
                    },
                )
        except httpx.TimeoutException as exc:
            logger.warning(
                "Bakong transaction check timed out",
                error_type=type(exc).__name__,
            )
            raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE) from exc
        except (httpx.HTTPError, httpx.InvalidURL) as exc:
            logger.warning(
                "Bakong transaction check could not reach the API",
                error_type=type(exc).__name__,
            )
            raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE) from exc

        return _interpret_response(response)


def build_bakong_client(settings: Settings) -> BakongClient | None:
    """
    Build the Bakong client from application settings.

    Returns:
        A client, or ``None`` when ``BAKONG_API_TOKEN`` is not configured.
    """
    token = (
        settings.bakong_api_token.get_secret_value().strip()
        if settings.bakong_api_token is not None
        else ""
    )
    if not token:
        return None
    return BakongClient(
        base_url=settings.bakong_api_base_url,
        api_token=token,
        timeout_seconds=settings.bakong_api_timeout_seconds,
    )


def _interpret_response(response: httpx.Response) -> BakongTransactionCheck:
    """Map a Bakong HTTP response to a transaction check or a domain error."""
    body = _json_object(response)
    if body is None or "responseCode" not in body:
        _log_http_failure(response.status_code)
        raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE)

    response_code = _as_int(body.get("responseCode"))
    error_code = _as_int(body.get("errorCode"))

    if response_code == 0:
        if not response.is_success:
            logger.warning(
                "Bakong returned a success body with an error HTTP status",
                status_code=response.status_code,
            )
            raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE)
        return _paid_transaction(body.get("data"))

    if error_code == _ERROR_CODE_TRANSACTION_NOT_FOUND:
        return BakongTransactionCheck(status=BakongTransactionStatus.NOT_FOUND)
    if error_code == _ERROR_CODE_TRANSACTION_FAILED:
        return BakongTransactionCheck(status=BakongTransactionStatus.FAILED)

    if error_code == _ERROR_CODE_UNAUTHORIZED or response.status_code == 401:
        logger.error(
            "Bakong rejected the API credentials; renew BAKONG_API_TOKEN",
            status_code=response.status_code,
        )
    else:
        logger.warning(
            "Bakong returned an unexpected error",
            status_code=response.status_code,
            error_code=error_code,
        )
    raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE)


def _paid_transaction(data: Any) -> BakongTransactionCheck:
    """Validate the ``data`` object of a successful check."""
    if not isinstance(data, dict):
        logger.warning("Bakong success response had no transaction data")
        raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE)

    transaction_hash = data.get("hash")
    currency = data.get("currency")
    amount = _parse_amount(data.get("amount"))
    if (
        not isinstance(transaction_hash, str)
        or not transaction_hash.strip()
        or len(transaction_hash.strip()) > _MAX_TRANSACTION_HASH_LENGTH
        or not isinstance(currency, str)
        or not currency.strip()
        or amount is None
    ):
        logger.warning("Bakong success response was missing transaction fields")
        raise PaymentProviderUnavailableError(UNAVAILABLE_MESSAGE)

    return BakongTransactionCheck(
        status=BakongTransactionStatus.PAID,
        transaction_hash=transaction_hash.strip(),
        amount=amount,
        currency=currency.strip().upper(),
    )


def _json_object(response: httpx.Response) -> dict[str, Any] | None:
    """Return the response body as a JSON object, or ``None``."""
    try:
        body = response.json()
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


def _as_int(value: Any) -> int | None:
    """Return ``value`` if it is a JSON integer (booleans excluded)."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _parse_amount(value: Any) -> Decimal | None:
    """Parse a non-negative amount sent as a JSON number or string."""
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        return None
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation:
        return None
    if not amount.is_finite() or amount < 0:
        return None
    return amount


def _log_http_failure(status_code: int) -> None:
    """Log a Bakong response that carried no Bakong body."""
    if status_code in (401, 403):
        logger.error(
            "Bakong refused the request; check BAKONG_API_TOKEN and that this "
            "server's IP address is allowed to call the API",
            status_code=status_code,
        )
    elif status_code == 429:
        logger.warning("Bakong rate limit reached", status_code=status_code)
    else:
        logger.warning(
            "Bakong returned an unusable response",
            status_code=status_code,
        )
