"""Refresh token rotation, reuse detection, logout, and branch switch token expiry."""

import threading
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core import security
from app.core.config import settings
from app.core.exceptions import InvalidTokenError
from app.core.rate_limit import MemoryRateLimiter, get_rate_limiter
from app.core.security import (
    create_access_token,
    decode_token_payload,
    hash_opaque_token,
    hash_password_async,
    verify_password_async,
)
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.enums import UserStatus
from app.models.refresh_token import RefreshToken
from app.models.user import User
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
OWNER_EMAIL = "owner@example.com"
OWNER_PASSWORD = "owner_password123"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def auth_env():
    """A seeded tenant, per-request sessions, and an isolated rate limiter."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, _, branch = await setup_test_tenant(session)

    async def _override_db():
        async with sessionmaker() as session:
            yield session

    limiter = MemoryRateLimiter()

    async def _override_limiter():
        return limiter

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_rate_limiter] = _override_limiter
    try:
        yield SimpleNamespace(
            sessionmaker=sessionmaker,
            user_id=user.id,
            org_id=org.id,
            branch_id=branch.id,
        )
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _login(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": OWNER_EMAIL, "password": OWNER_PASSWORD},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    return response.json()


async def _token_row(env: SimpleNamespace, raw_token: str) -> RefreshToken:
    async with env.sessionmaker() as session:
        result = await session.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_opaque_token(raw_token)
            )
        )
        return result.scalar_one()


@pytest.mark.anyio
async def test_login_returns_refresh_token_and_stores_only_its_hash(auth_env):
    async with _client() as client:
        data = await _login(client)

    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == settings.access_token_expire_minutes * 60
    assert len(data["refresh_token"]) >= 40

    row = await _token_row(auth_env, data["refresh_token"])
    assert row.user_id == auth_env.user_id
    assert row.token_hash != data["refresh_token"]
    assert row.revoked_at is None
    expires_at = row.expires_at.replace(tzinfo=UTC)
    expected = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    assert abs((expires_at - expected).total_seconds()) < 60


@pytest.mark.anyio
async def test_register_returns_a_working_refresh_token(auth_env):
    async with _client() as client:
        registration = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "new-owner@example.com",
                "password": "Password123!",
                "full_name": "New Owner",
            },
        )
        assert registration.status_code == status.HTTP_201_CREATED, registration.text
        body = registration.json()
        assert body["access_token"]
        assert body["refresh_token"]

        refreshed = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": body["refresh_token"]},
        )
    assert refreshed.status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_refresh_rotates_token_within_the_same_family(auth_env):
    async with _client() as client:
        first = await _login(client)
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first["refresh_token"]},
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        second = response.json()

        me = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {second['access_token']}"},
        )
        assert me.status_code == status.HTTP_200_OK

    assert second["refresh_token"] != first["refresh_token"]
    assert second["expires_in"] == settings.access_token_expire_minutes * 60

    old_row = await _token_row(auth_env, first["refresh_token"])
    new_row = await _token_row(auth_env, second["refresh_token"])
    assert old_row.revoked_at is not None
    assert old_row.replaced_by_id == new_row.id
    assert new_row.revoked_at is None
    assert new_row.family_id == old_row.family_id
    # Rotation never extends the session beyond the expiry set at login.
    assert new_row.expires_at == old_row.expires_at


@pytest.mark.anyio
async def test_reusing_a_rotated_refresh_token_revokes_the_whole_family(auth_env):
    async with _client() as client:
        first = await _login(client)
        rotated = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first["refresh_token"]},
        )
        assert rotated.status_code == status.HTTP_200_OK
        latest = rotated.json()["refresh_token"]

        # An attacker replays the token that was already rotated.
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first["refresh_token"]},
        )
        assert replay.status_code == status.HTTP_401_UNAUTHORIZED
        assert replay.json()["detail"] == "Invalid or expired refresh token."

        # The legitimate holder of the newest token is signed out too.
        legit = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": latest},
        )
        assert legit.status_code == status.HTTP_401_UNAUTHORIZED

        # A separate login (another family) is unaffected.
        other_session = await _login(client)
        other = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": other_session["refresh_token"]},
        )
        assert other.status_code == status.HTTP_200_OK

    family_id = (await _token_row(auth_env, latest)).family_id
    async with auth_env.sessionmaker() as session:
        result = await session.execute(
            select(RefreshToken).where(RefreshToken.family_id == family_id)
        )
        family = result.scalars().all()
    assert len(family) == 2
    assert all(token.revoked_at is not None for token in family)


@pytest.mark.anyio
async def test_refresh_rejects_unknown_expired_and_inactive_tokens(auth_env):
    async with _client() as client:
        unknown = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "x" * 64},
        )
        assert unknown.status_code == status.HTTP_401_UNAUTHORIZED

        expired = await _login(client)
        async with auth_env.sessionmaker() as session:
            await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.token_hash
                    == hash_opaque_token(expired["refresh_token"])
                )
                .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            await session.commit()
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": expired["refresh_token"]},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        suspended = await _login(client)
        async with auth_env.sessionmaker() as session:
            await session.execute(
                update(User)
                .where(User.id == auth_env.user_id)
                .values(status=UserStatus.SUSPENDED)
            )
            await session.commit()
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": suspended["refresh_token"]},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.anyio
async def test_logout_revokes_only_the_presented_session(auth_env):
    async with _client() as client:
        phone_session = await _login(client)
        laptop_session = await _login(client)
        rotated = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": phone_session["refresh_token"]},
        )
        phone_latest = rotated.json()["refresh_token"]

        logout = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": phone_latest},
        )
        assert logout.status_code == status.HTTP_204_NO_CONTENT
        assert logout.content == b""

        after_logout = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": phone_latest},
        )
        assert after_logout.status_code == status.HTTP_401_UNAUTHORIZED

        laptop = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": laptop_session["refresh_token"]},
        )
        assert laptop.status_code == status.HTTP_200_OK

        # Logging out twice, or with an unknown token, is harmless.
        again = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": phone_latest},
        )
        assert again.status_code == status.HTTP_204_NO_CONTENT
        unknown = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": "y" * 64},
        )
        assert unknown.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.anyio
async def test_switch_branch_keeps_the_current_token_expiry(auth_env):
    expires_at = datetime.now(UTC) + timedelta(minutes=5)
    token = create_access_token(auth_env.user_id, expires_at=expires_at)
    original_exp = decode_token_payload(token)["exp"]

    async with _client() as client:
        response = await client.post(
            "/api/v1/auth/switch-branch",
            headers={"Authorization": f"Bearer {token}"},
            json={"branch_id": str(auth_env.branch_id)},
        )

    assert response.status_code == status.HTTP_200_OK, response.text
    new_payload = decode_token_payload(response.json()["access_token"])
    assert new_payload["active_branch_id"] == str(auth_env.branch_id)
    assert new_payload["exp"] == original_exp
    full_lifetime = datetime.now(UTC) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    assert new_payload["exp"] < full_lifetime.timestamp() - 60


def test_access_tokens_without_expiry_are_rejected():
    token = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000001", "type": "access", "iat": 0},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(InvalidTokenError):
        decode_token_payload(token)


@pytest.mark.anyio
async def test_password_hashing_runs_off_the_event_loop(monkeypatch):
    loop_thread = threading.get_ident()
    seen_threads: list[int] = []

    class _RecordingHasher:
        def hash(self, password: str) -> str:
            seen_threads.append(threading.get_ident())
            return f"hashed:{password}"

        def verify(self, password: str, hashed: str) -> bool:
            seen_threads.append(threading.get_ident())
            return hashed == f"hashed:{password}"

    monkeypatch.setattr(security, "password_hash", _RecordingHasher())

    hashed = await hash_password_async("secret-password")
    assert await verify_password_async("secret-password", hashed)
    assert not await verify_password_async("wrong-password", hashed)

    assert len(seen_threads) == 3
    assert loop_thread not in seen_threads
