"""In-process stand-in for the Bakong Open API, so tests never call the real API."""

from __future__ import annotations

import json
from decimal import Decimal

import httpx

from app.integrations.bakong import CHECK_TRANSACTION_BY_MD5_PATH, BakongClient

FAKE_BAKONG_TOKEN = "fake-bakong-token-for-tests-only"
FAKE_BAKONG_BASE_URL = "https://bakong.test"


class FakeBakong:
    """
    Answers ``check_transaction_by_md5`` like the Bakong Open API documents it.

    MD5s marked paid return ``responseCode`` 0 with transaction data, MD5s marked
    failed return ``errorCode`` 3, and anything else returns "not found"
    (``errorCode`` 1). Set ``error`` to raise an httpx exception (for example a
    timeout) or ``raw_response`` to return a fixed response instead.
    """

    def __init__(self) -> None:
        self.paid: dict[str, dict[str, object]] = {}
        self.failed: set[str] = set()
        self.requests: list[httpx.Request] = []
        self.error: Exception | None = None
        self.raw_response: httpx.Response | None = None

    def mark_paid(
        self,
        md5: str,
        *,
        amount: Decimal | float | str,
        currency: str,
        transaction_hash: str | None = None,
    ) -> str:
        """Record a payment for ``md5`` and return its Bakong transaction hash."""
        tx_hash = transaction_hash or (md5 * 2)
        self.paid[md5] = {
            "hash": tx_hash,
            "fromAccountId": "customer_test@bank",
            "toAccountId": "merchant_test@bank",
            "currency": currency,
            "amount": float(amount) if isinstance(amount, Decimal) else amount,
            "description": "test payment",
        }
        return tx_hash

    def mark_failed(self, md5: str) -> None:
        """Make Bakong report the transaction for ``md5`` as failed."""
        self.failed.add(md5)

    def handler(self, request: httpx.Request) -> httpx.Response:
        """httpx MockTransport handler emulating the Bakong endpoint."""
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        if self.raw_response is not None:
            return self.raw_response
        if request.url.path != CHECK_TRANSACTION_BY_MD5_PATH:
            return httpx.Response(404, text="Not Found")
        if request.headers.get("Authorization") != f"Bearer {FAKE_BAKONG_TOKEN}":
            return httpx.Response(
                401,
                json={
                    "responseCode": 1,
                    "responseMessage": "Unauthorized",
                    "errorCode": 6,
                    "data": None,
                },
            )
        md5 = json.loads(request.content)["md5"]
        if md5 in self.paid:
            return httpx.Response(
                200,
                json={
                    "responseCode": 0,
                    "responseMessage": "Getting transaction successfully.",
                    "errorCode": None,
                    "data": self.paid[md5],
                },
            )
        if md5 in self.failed:
            return httpx.Response(
                200,
                json={
                    "responseCode": 1,
                    "responseMessage": "Transaction failed.",
                    "errorCode": 3,
                    "data": None,
                },
            )
        return httpx.Response(
            200,
            json={
                "responseCode": 1,
                "responseMessage": (
                    "Transaction could not be found. Please check and try again."
                ),
                "errorCode": 1,
                "data": None,
            },
        )

    def client(self) -> BakongClient:
        """A real BakongClient wired to this fake through httpx.MockTransport."""
        return BakongClient(
            base_url=FAKE_BAKONG_BASE_URL,
            api_token=FAKE_BAKONG_TOKEN,
            timeout_seconds=2.0,
            transport=httpx.MockTransport(self.handler),
        )
