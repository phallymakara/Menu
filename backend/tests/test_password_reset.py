"""Self-service password reset: anti-enumeration, single use, expiry, session revocation."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.rate_limit import MemoryRateLimiter, get_rate_limiter
from app.core.security import hash_opaque_token
from app.db.base import Base
from app.db.session import get_db_session, get_session_factory
from app.main import app
from app.models.enums import UserStatus
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.password_reset_delivery import (
    PasswordResetTicket,
    get_password_reset_delivery,
)
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
OWNER_EMAIL = "owner@example.com"
OWNER_PHONE = "+85512345678"
OWNER_PASSWORD = "owner_password123"
NEW_PASSWORD = "brand-new-password-2026"


class RecordingDelivery:
    """Captures tickets instead of sending them."""

    def __init__(self) -> None:
        self.tickets: list[PasswordResetTicket] = []

    async def send(self, ticket: PasswordResetTicket) -> None:
        self.tickets.append(ticket)


class FailingDelivery:
    """Simulates a provider outage."""

    async def send(self, ticket: PasswordResetTicket) -> None:
        raise ConnectionError("provider unavailable")


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def reset_env():
    """A seeded owner with email and phone, a recording delivery, a fresh limiter."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, _, _, _ = await setup_test_tenant(session)
        user.phone = OWNER_PHONE
        await session.commit()

    async def _override_db():
        async with sessionmaker() as session:
            yield session

    async def _override_session_factory():
        return sessionmaker

    limiter = MemoryRateLimiter()
    delivery = RecordingDelivery()

    async def _override_limiter():
        return limiter

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_session_factory] = _override_session_factory
    app.dependency_overrides[get_rate_limiter] = _override_limiter
    app.dependency_overrides[get_password_reset_delivery] = lambda: delivery
    try:
        yield SimpleNamespace(
            sessionmaker=sessionmaker,
            user_id=user.id,
            delivery=delivery,
        )
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _comparable_headers(response) -> dict[str, str]:
    """Response headers without the per-request tracing id."""
    return {
        name: value
        for name, value in response.headers.items()
        if name.lower() != "x-request-id"
    }


async def _request_reset(client: AsyncClient, identifier: str = OWNER_EMAIL):
    return await client.post(
        "/api/v1/auth/password-reset/request",
        json={"identifier": identifier},
    )


async def _confirm(client: AsyncClient, token: str, password: str = NEW_PASSWORD):
    return await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": password},
    )


async def _login(client: AsyncClient, password: str):
    return await client.post(
        "/api/v1/auth/login",
        json={"identifier": OWNER_EMAIL, "password": password},
    )


@pytest.mark.anyio
async def test_request_response_is_identical_for_known_and_unknown_accounts(
    reset_env, monkeypatch
):
    monkeypatch.setattr(settings, "environment", "production")

    async with _client() as client:
        known = await _request_reset(client, OWNER_EMAIL)
        unknown = await _request_reset(client, "nobody@example.com")
        unknown_phone = await _request_reset(client, "+85599999999")

    assert known.status_code == status.HTTP_202_ACCEPTED
    assert unknown.status_code == status.HTTP_202_ACCEPTED
    assert unknown_phone.status_code == status.HTTP_202_ACCEPTED
    assert known.content == unknown.content == unknown_phone.content
    assert (
        _comparable_headers(known)
        == _comparable_headers(unknown)
        == _comparable_headers(unknown_phone)
    )
    assert "debug_reset_token" not in known.json()

    # Only the real account received a token.
    assert len(reset_env.delivery.tickets) == 1
    ticket = reset_env.delivery.tickets[0]
    assert ticket.user_id == reset_env.user_id
    assert ticket.channel == "email"
    assert ticket.destination == OWNER_EMAIL
    assert ticket.reset_url.endswith(f"/reset-password?token={ticket.token}")


@pytest.mark.anyio
@pytest.mark.parametrize("environment", ["production", "test", "staging", ""])
async def test_debug_token_never_leaves_development(
    reset_env, monkeypatch, environment
):
    monkeypatch.setattr(settings, "environment", environment)

    async with _client() as client:
        response = await _request_reset(client)

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert "debug_reset_token" not in response.json()
    assert len(reset_env.delivery.tickets) == 1


@pytest.mark.anyio
async def test_response_does_not_depend_on_the_account_lookup(reset_env, monkeypatch):
    """Outside development the lookup runs after the response, so it cannot shape it."""
    monkeypatch.setattr(settings, "environment", "production")

    async with _client() as client:
        baseline = await _request_reset(client, "nobody@example.com")

        class _BrokenSessionFactory:
            def __call__(self):
                raise ConnectionError("database unavailable")

        async def _broken_factory():
            return _BrokenSessionFactory()

        app.dependency_overrides[get_session_factory] = _broken_factory
        with_broken_database = await _request_reset(client, OWNER_EMAIL)

    assert with_broken_database.status_code == status.HTTP_202_ACCEPTED
    assert with_broken_database.content == baseline.content
    assert _comparable_headers(with_broken_database) == _comparable_headers(baseline)
    assert reset_env.delivery.tickets == []


@pytest.mark.anyio
async def test_debug_token_is_returned_only_in_development(reset_env, monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")

    async with _client() as client:
        known = await _request_reset(client)
        unknown = await _request_reset(client, "nobody@example.com")

    assert known.json()["debug_reset_token"] == reset_env.delivery.tickets[0].token
    assert "debug_reset_token" not in unknown.json()


@pytest.mark.anyio
async def test_reset_by_phone_targets_the_phone_number(reset_env):
    async with _client() as client:
        response = await _request_reset(client, "012 345 678")

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert len(reset_env.delivery.tickets) == 1
    assert reset_env.delivery.tickets[0].channel == "sms"
    assert reset_env.delivery.tickets[0].destination == OWNER_PHONE


@pytest.mark.anyio
async def test_reset_sets_new_password_and_token_is_single_use(reset_env):
    async with _client() as client:
        await _request_reset(client)
        token = reset_env.delivery.tickets[0].token

        confirmed = await _confirm(client, token)
        assert confirmed.status_code == status.HTTP_200_OK, confirmed.text

        assert (await _login(client, NEW_PASSWORD)).status_code == status.HTTP_200_OK
        old = await _login(client, OWNER_PASSWORD)
        assert old.status_code == status.HTTP_401_UNAUTHORIZED

        reused = await _confirm(client, token, "another-password-2026")
        assert reused.status_code == status.HTTP_400_BAD_REQUEST
        assert reused.json()["detail"] == "Invalid or expired password reset token."

    async with reset_env.sessionmaker() as session:
        result = await session.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == hash_opaque_token(token)
            )
        )
        row = result.scalar_one()
    assert row.used_at is not None
    assert row.token_hash != token


@pytest.mark.anyio
async def test_expired_reset_token_is_rejected(reset_env):
    async with _client() as client:
        await _request_reset(client)
        ticket = reset_env.delivery.tickets[0]
        expected_expiry = datetime.now(UTC) + timedelta(
            minutes=settings.password_reset_token_expire_minutes
        )
        assert abs((ticket.expires_at - expected_expiry).total_seconds()) < 60

        async with reset_env.sessionmaker() as session:
            await session.execute(
                update(PasswordResetToken)
                .where(PasswordResetToken.token_hash == hash_opaque_token(ticket.token))
                .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            await session.commit()

        response = await _confirm(client, ticket.token)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (await _login(client, OWNER_PASSWORD)).status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_a_new_request_invalidates_the_previous_token(reset_env):
    async with _client() as client:
        await _request_reset(client)
        await _request_reset(client)
        first, second = (ticket.token for ticket in reset_env.delivery.tickets)

        assert (await _confirm(client, first)).status_code == 400
        assert (await _confirm(client, second)).status_code == 200


@pytest.mark.anyio
async def test_reset_revokes_every_refresh_token(reset_env):
    async with _client() as client:
        session_a = (await _login(client, OWNER_PASSWORD)).json()["refresh_token"]
        session_b = (await _login(client, OWNER_PASSWORD)).json()["refresh_token"]

        await _request_reset(client)
        token = reset_env.delivery.tickets[0].token
        assert (await _confirm(client, token)).status_code == status.HTTP_200_OK

        for refresh_token in (session_a, session_b):
            response = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": refresh_token},
            )
            assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.anyio
async def test_reset_uses_the_registration_password_policy(reset_env):
    async with _client() as client:
        await _request_reset(client)
        token = reset_env.delivery.tickets[0].token

        too_short = await _confirm(client, token, "short")
        assert too_short.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        too_long = await _confirm(client, token, "x" * 129)
        assert too_long.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

        # The token was not consumed by the rejected attempts.
        assert (await _confirm(client, token)).status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_inactive_accounts_get_no_token(reset_env):
    async with reset_env.sessionmaker() as session:
        await session.execute(
            update(User)
            .where(User.id == reset_env.user_id)
            .values(status=UserStatus.SUSPENDED)
        )
        await session.commit()

    async with _client() as client:
        response = await _request_reset(client)

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert reset_env.delivery.tickets == []


@pytest.mark.anyio
async def test_delivery_failure_does_not_change_the_response(reset_env):
    app.dependency_overrides[get_password_reset_delivery] = FailingDelivery

    async with _client() as client:
        response = await _request_reset(client)

    assert response.status_code == status.HTTP_202_ACCEPTED
