"""Fixed-window rate limiting of login, registration, and password reset requests."""

from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.exceptions import RateLimitExceededError
from app.core.rate_limit import (
    MemoryRateLimiter,
    RateLimiterUnavailableError,
    RateLimitResult,
    RateLimitRule,
    RedisRateLimiter,
    enforce_rate_limit,
    get_rate_limiter,
    rate_limit_key,
)
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.services.password_reset_delivery import get_password_reset_delivery
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
OWNER_EMAIL = "owner@example.com"
OWNER_PASSWORD = "owner_password123"


class FakeClock:
    """A controllable replacement for time.time."""

    def __init__(self, now: float) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


class _SilentDelivery:
    async def send(self, ticket: Any) -> None:
        return None


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def limited_app():
    """A seeded owner and a fresh in-memory limiter for each test."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        await setup_test_tenant(session)

    async def _override_db():
        async with sessionmaker() as session:
            yield session

    limiter = MemoryRateLimiter()

    async def _override_limiter():
        return limiter

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_rate_limiter] = _override_limiter
    app.dependency_overrides[get_password_reset_delivery] = _SilentDelivery
    try:
        yield SimpleNamespace(limiter=limiter)
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def _client(ip: str = "203.0.113.10") -> AsyncClient:
    transport = ASGITransport(app=app, client=(ip, 50000))
    return AsyncClient(transport=transport, base_url="http://test")


def _assert_too_many_requests(response) -> None:
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    retry_after = int(response.headers["Retry-After"])
    assert retry_after >= 1
    assert response.json()["detail"] == "Too many attempts. Please try again later."


@pytest.mark.anyio
async def test_login_is_limited_per_identifier_and_ip(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_identifier", 3)
    wrong = {"identifier": OWNER_EMAIL, "password": "wrong-password"}

    async with _client() as client:
        for _ in range(3):
            response = await client.post("/api/v1/auth/login", json=wrong)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        _assert_too_many_requests(await client.post("/api/v1/auth/login", json=wrong))

        # Even the right password is refused until the window ends.
        correct = {"identifier": OWNER_EMAIL, "password": OWNER_PASSWORD}
        _assert_too_many_requests(await client.post("/api/v1/auth/login", json=correct))

        # Other formats of the same identifier share the bucket.
        upper = {"identifier": OWNER_EMAIL.upper(), "password": OWNER_PASSWORD}
        _assert_too_many_requests(await client.post("/api/v1/auth/login", json=upper))

    # The same account from another IP address has its own bucket.
    async with _client("198.51.100.7") as other_client:
        response = await other_client.post("/api/v1/auth/login", json=correct)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_login_is_limited_per_ip_across_identifiers(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_ip", 2)

    async with _client() as client:
        for index in range(2):
            response = await client.post(
                "/api/v1/auth/login",
                json={"identifier": f"user{index}@example.com", "password": "x" * 8},
            )
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        _assert_too_many_requests(
            await client.post(
                "/api/v1/auth/login",
                json={"identifier": "someone-else@example.com", "password": "x" * 8},
            )
        )


@pytest.mark.anyio
async def test_registration_is_limited_per_ip(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_register_per_ip", 2)

    async with _client() as client:
        for index in range(2):
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": f"owner{index}@example.org",
                    "password": "Password123!",
                    "full_name": "Rate Limited Owner",
                },
            )
            assert response.status_code == status.HTTP_201_CREATED, response.text

        _assert_too_many_requests(
            await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "owner-3@example.org",
                    "password": "Password123!",
                    "full_name": "Rate Limited Owner",
                },
            )
        )


@pytest.mark.anyio
async def test_password_reset_request_is_limited_per_identifier(
    limited_app, monkeypatch
):
    monkeypatch.setattr(settings, "rate_limit_password_reset_per_identifier", 2)

    async with _client() as client:
        for identifier in (OWNER_EMAIL, "nobody@example.com"):
            for _ in range(2):
                response = await client.post(
                    "/api/v1/auth/password-reset/request",
                    json={"identifier": identifier},
                )
                assert response.status_code == status.HTTP_202_ACCEPTED

            # Known and unknown accounts are limited alike, so a 429 reveals nothing.
            _assert_too_many_requests(
                await client.post(
                    "/api/v1/auth/password-reset/request",
                    json={"identifier": identifier},
                )
            )


@pytest.mark.anyio
async def test_password_reset_request_is_limited_per_ip(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_password_reset_per_ip", 2)

    async with _client() as client:
        for index in range(2):
            response = await client.post(
                "/api/v1/auth/password-reset/request",
                json={"identifier": f"person{index}@example.com"},
            )
            assert response.status_code == status.HTTP_202_ACCEPTED

        _assert_too_many_requests(
            await client.post(
                "/api/v1/auth/password-reset/request",
                json={"identifier": "person-3@example.com"},
            )
        )


@pytest.mark.anyio
async def test_memory_limiter_resets_when_the_window_ends():
    clock = FakeClock(now=1_000_000.0)
    limiter = MemoryRateLimiter(clock=clock)
    rule = RateLimitRule(limit=2, window_seconds=60)
    window_end = (int(clock.now // 60) + 1) * 60

    assert (await limiter.hit("key", rule)).allowed
    assert (await limiter.hit("key", rule)).allowed
    blocked = await limiter.hit("key", rule)
    assert not blocked.allowed
    assert blocked.retry_after_seconds == window_end - int(clock.now)

    # Other keys are counted separately.
    assert (await limiter.hit("other-key", rule)).allowed

    clock.now = window_end + 0.5
    assert (await limiter.hit("key", rule)).allowed


@pytest.mark.anyio
async def test_enforce_rate_limit_raises_with_retry_after():
    limiter = MemoryRateLimiter()
    rule = RateLimitRule(limit=1, window_seconds=30)

    await enforce_rate_limit(limiter, "scope", rule, "subject")
    with pytest.raises(RateLimitExceededError) as exc_info:
        await enforce_rate_limit(limiter, "scope", rule, "subject")
    assert 1 <= exc_info.value.retry_after_seconds <= 30


def test_rate_limit_keys_do_not_contain_identifiers():
    key = rate_limit_key("login:identifier_ip", "owner@example.com", "203.0.113.10")
    assert key.startswith("ratelimit:login:identifier_ip:")
    assert "owner@example.com" not in key
    assert "203.0.113.10" not in key


class _FakePipeline:
    """Records queued commands like a redis.asyncio transaction pipeline."""

    def __init__(self, store: dict[str, int], ttls: dict[str, int]) -> None:
        self._store = store
        self._ttls = ttls
        self._commands: list[tuple[str, str, int]] = []

    async def __aenter__(self) -> "_FakePipeline":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    def incr(self, key: str) -> "_FakePipeline":
        self._commands.append(("incr", key, 0))
        return self

    def expire(self, key: str, seconds: int) -> "_FakePipeline":
        self._commands.append(("expire", key, seconds))
        return self

    async def execute(self) -> list[int]:
        results: list[int] = []
        for command, key, seconds in self._commands:
            if command == "incr":
                self._store[key] = self._store.get(key, 0) + 1
                results.append(self._store[key])
            else:
                self._ttls[key] = seconds
                results.append(1)
        return results


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, int] = {}
        self.ttls: dict[str, int] = {}
        self.transactions: list[bool] = []

    def pipeline(self, transaction: bool = True) -> _FakePipeline:
        self.transactions.append(transaction)
        return _FakePipeline(self.store, self.ttls)


@pytest.mark.anyio
async def test_redis_limiter_uses_incr_and_expire_in_one_transaction():
    fake = _FakeRedis()
    clock = FakeClock(now=1_000_030.0)
    limiter = RedisRateLimiter(cast(Redis, fake), clock=clock)
    rule = RateLimitRule(limit=2, window_seconds=60)

    results: list[RateLimitResult] = [await limiter.hit("k", rule) for _ in range(3)]

    assert [result.allowed for result in results] == [True, True, False]
    window_key = f"k:{int(clock.now // 60)}"
    assert fake.store == {window_key: 3}
    assert fake.ttls == {window_key: 60}
    assert fake.transactions == [True, True, True]


@pytest.mark.anyio
async def test_redis_outage_fails_open():
    # Nothing listens on port 1, so every command fails to connect.
    limiter = RedisRateLimiter.from_url("redis://127.0.0.1:1/0", timeout_seconds=0.5)
    rule = RateLimitRule(limit=1, window_seconds=60)
    try:
        with pytest.raises(RateLimiterUnavailableError):
            await limiter.hit("k", rule)

        for _ in range(3):
            await enforce_rate_limit(limiter, "login:ip", rule, "203.0.113.10")
    finally:
        await limiter.aclose()
