"""The Bakong Open API client maps every provider answer to a status or a domain error."""

import json
import logging
from decimal import Decimal
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

import app.main  # noqa: F401  (configures structlog to log through stdlib logging)
from app.core.config import settings
from app.core.exceptions import PaymentProviderUnavailableError
from app.integrations.bakong import (
    UNAVAILABLE_MESSAGE,
    BakongClient,
    BakongTransactionStatus,
    build_bakong_client,
)

TOKEN = "secret-bakong-token-0123456789"
MD5 = "0123456789abcdef0123456789abcdef"


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _client(
    handler, *, base_url: str = "https://api-bakong.test"
) -> tuple[BakongClient, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def recording_handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    client = BakongClient(
        base_url=base_url,
        api_token=TOKEN,
        timeout_seconds=2.0,
        transport=httpx.MockTransport(recording_handler),
    )
    return client, requests


def _respond(status_code: int, body: object) -> httpx.Response:
    return httpx.Response(status_code, json=body)


# Response samples from the Bakong Open API documentation (v1.0.2).
PAID_DATA: dict[str, Any] = {
    "hash": "8465d722d7d5065f2886f0a474a4d34dc6a7855355b611836f7b6111228893e9",
    "fromAccountId": "rieu_dhqj_1984@devb",
    "toAccountId": "bridge_account@devb",
    "currency": "USD",
    "amount": 34.65,
    "description": "testing bakong generator",
}
PAID: dict[str, Any] = {
    "responseCode": 0,
    "responseMessage": "Getting transaction successfully.",
    "errorCode": None,
    "data": PAID_DATA,
}


def _paid(**data: Any) -> dict[str, Any]:
    """A paid answer whose transaction data is changed by ``data``."""
    return {**PAID, "data": {**PAID_DATA, **data}}


NOT_FOUND = {
    "responseCode": 1,
    "responseMessage": "Transaction could not be found. Please check and try again.",
    "errorCode": 1,
    "data": None,
}
FAILED = {
    "responseCode": 1,
    "responseMessage": "Transaction failed.",
    "errorCode": 3,
    "data": None,
}


@pytest.mark.anyio
async def test_paid_transaction_and_request_shape():
    client, requests = _client(lambda request: _respond(200, PAID))

    result = await client.check_transaction_by_md5(MD5)

    assert result.status == BakongTransactionStatus.PAID
    assert result.transaction_hash == PAID_DATA["hash"]
    assert result.amount == Decimal("34.65")
    assert result.currency == "USD"

    [request] = requests
    assert request.method == "POST"
    assert str(request.url) == "https://api-bakong.test/v1/check_transaction_by_md5"
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert request.headers["Content-Type"] == "application/json"
    assert json.loads(request.content) == {"md5": MD5}


@pytest.mark.anyio
async def test_base_url_with_v1_suffix_and_string_amounts():
    body = _paid(amount="142100", currency="khr")
    client, requests = _client(
        lambda request: _respond(200, body), base_url="https://api-bakong.test/v1/"
    )

    result = await client.check_transaction_by_md5(MD5)

    assert requests[0].url.path == "/v1/check_transaction_by_md5"
    assert result.amount == Decimal("142100")
    assert result.currency == "KHR"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status_code", "body", "expected"),
    [
        (200, NOT_FOUND, BakongTransactionStatus.NOT_FOUND),
        (404, NOT_FOUND, BakongTransactionStatus.NOT_FOUND),
        (200, FAILED, BakongTransactionStatus.FAILED),
        (400, FAILED, BakongTransactionStatus.FAILED),
    ],
)
async def test_not_found_and_failed_transactions(status_code, body, expected):
    client, _ = _client(lambda request: _respond(status_code, body))

    result = await client.check_transaction_by_md5(MD5)

    assert result.status == expected
    assert result.transaction_hash is None
    assert result.amount is None


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response",
    [
        _respond(401, {"responseCode": 1, "errorCode": 6, "data": None}),
        _respond(200, {"responseCode": 1, "errorCode": 6, "data": None}),
        httpx.Response(401, text="Unauthorized"),
        httpx.Response(403, text="<html>Forbidden</html>"),
        httpx.Response(429, text="Too many requests"),
        httpx.Response(500, text="<html>Internal error</html>"),
        httpx.Response(200, text="not json"),
        _respond(200, ["not", "an", "object"]),
        _respond(200, {"responseCode": 1, "errorCode": 9, "data": None}),
        _respond(500, PAID),
        _respond(200, {**PAID, "data": None}),
        _respond(200, _paid(hash="")),
        _respond(200, _paid(hash="f" * 129)),
        _respond(200, _paid(amount="abc")),
        _respond(200, _paid(amount=True)),
        _respond(200, _paid(amount=-1)),
        _respond(200, _paid(currency=None)),
        _respond(200, {"responseCode": False, "data": PAID_DATA}),
    ],
)
async def test_unusable_answers_raise_a_generic_domain_error(response, caplog, capsys):
    client, _ = _client(lambda request: response)

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(PaymentProviderUnavailableError) as raised:
            await client.check_transaction_by_md5(MD5)

    assert str(raised.value) == UNAVAILABLE_MESSAGE
    assert TOKEN not in caplog.text
    assert TOKEN not in capsys.readouterr().out


@pytest.mark.anyio
@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectTimeout("connect timed out"),
        httpx.ReadTimeout("read timed out"),
        httpx.ConnectError("connection refused"),
    ],
)
async def test_timeouts_and_connection_errors_raise_a_domain_error(error):
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    client, _ = _client(handler)

    with pytest.raises(PaymentProviderUnavailableError) as raised:
        await client.check_transaction_by_md5(MD5)

    assert str(raised.value) == UNAVAILABLE_MESSAGE


@pytest.mark.anyio
@pytest.mark.parametrize("md5", ["", "xyz", MD5.upper(), MD5 + "0"])
async def test_rejects_malformed_md5_without_calling_bakong(md5):
    client, requests = _client(lambda request: _respond(200, PAID))

    with pytest.raises(ValueError):
        await client.check_transaction_by_md5(md5)

    assert requests == []


def test_client_is_built_only_with_a_token_and_hides_it(monkeypatch):
    monkeypatch.setattr(settings, "bakong_api_token", None)
    assert build_bakong_client(settings) is None

    monkeypatch.setattr(settings, "bakong_api_token", SecretStr("   "))
    assert build_bakong_client(settings) is None

    monkeypatch.setattr(settings, "bakong_api_token", SecretStr(TOKEN))
    client = build_bakong_client(settings)
    assert client is not None
    assert TOKEN not in repr(client)
    assert TOKEN not in repr(settings)

    with pytest.raises(ValueError):
        BakongClient(base_url="https://api-bakong.test", api_token="  ")
