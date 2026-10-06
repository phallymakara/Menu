"""Rate limiting and brute-force protection of the authentication endpoints."""

import ipaddress
from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, settings
from app.core.exceptions import RateLimitExceededError
from app.core.rate_limit import (
    MemoryRateLimiter,
    RateLimitResult,
    RateLimitRule,
    RedisRateLimiter,
    enforce_rate_limit,
    get_rate_limiter,
    rate_limit_key,
)
from app.db.base import Base
from app.db.session import get_db_session, get_session_factory
from app.main import app
from app.services import auth_service
from app.services.password_reset_delivery import get_password_reset_delivery
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
OWNER_EMAIL = "owner@example.com"
OWNER_PHONE = "+85512345678"
OWNER_PASSWORD = "owner_password123"
CLIENT_IP = "203.0.113.10"


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
    """A seeded owner (email and phone) and a fresh in-memory limiter per test."""
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

    async def _override_limiter():
        return limiter

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_session_factory] = _override_session_factory
    app.dependency_overrides[get_rate_limiter] = _override_limiter
    app.dependency_overrides[get_password_reset_delivery] = _SilentDelivery
    try:
        yield SimpleNamespace(limiter=limiter, sessionmaker=sessionmaker)
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def _client(ip: str = CLIENT_IP) -> AsyncClient:
    transport = ASGITransport(app=app, client=(ip, 50000))
    return AsyncClient(transport=transport, base_url="http://test")


def _assert_too_many_requests(response) -> None:
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    retry_after = int(response.headers["Retry-After"])
    assert retry_after >= 1
    assert response.json()["detail"] == "Too many attempts. Please try again later."


async def _login(client: AsyncClient, identifier: str, password: str):
    return await client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )


# ---------------------------------------------------------------------------
# Login: per IP, per identifier and IP, and failed attempts per account
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_login_is_limited_per_identifier_and_ip(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_identifier", 3)

    async with _client() as client:
        for _ in range(3):
            response = await _login(client, OWNER_EMAIL, "wrong-password")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        _assert_too_many_requests(await _login(client, OWNER_EMAIL, "wrong-password"))

        # Even the right password is refused until the window ends.
        _assert_too_many_requests(await _login(client, OWNER_EMAIL, OWNER_PASSWORD))

    # The same account from another IP address has its own bucket.
    async with _client("198.51.100.7") as other_client:
        response = await _login(other_client, OWNER_EMAIL, OWNER_PASSWORD)
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.anyio
@pytest.mark.parametrize(
    "variants",
    [
        ["owner@example.com", "OWNER@EXAMPLE.COM", "  Owner@Example.com  "],
        ["012 345 678", "+855 12 345 678", "012345678", "+85512345678"],
    ],
)
async def test_identifier_spellings_share_one_bucket(
    limited_app, monkeypatch, variants
):
    monkeypatch.setattr(settings, "rate_limit_login_per_identifier", len(variants))

    async with _client() as client:
        for variant in variants:
            response = await _login(client, variant, "wrong-password")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        # Every spelling now hits the exhausted bucket.
        for variant in variants:
            _assert_too_many_requests(await _login(client, variant, OWNER_PASSWORD))


@pytest.mark.anyio
async def test_successful_login_does_not_reset_counters(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_identifier", 3)
    other_identifier = "someone-else@example.com"

    async with _client() as client:
        for _ in range(2):
            response = await _login(client, other_identifier, "wrong-password")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert (await _login(client, OWNER_EMAIL, "wrong-password")).status_code == 401
        assert (await _login(client, OWNER_EMAIL, OWNER_PASSWORD)).status_code == 200

        # The other identifier keeps its count: one attempt left, then 429.
        response = await _login(client, other_identifier, "wrong-password")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        _assert_too_many_requests(
            await _login(client, other_identifier, "wrong-password")
        )

        # The successful login did not reset its own bucket either: the earlier
        # failure still counts, so the third attempt is the last one allowed.
        assert (await _login(client, OWNER_EMAIL, OWNER_PASSWORD)).status_code == 200
        _assert_too_many_requests(await _login(client, OWNER_EMAIL, OWNER_PASSWORD))


@pytest.mark.anyio
async def test_login_is_limited_per_ip_across_identifiers(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_ip", 2)

    async with _client() as client:
        for index in range(2):
            response = await _login(client, f"user{index}@example.com", "x" * 8)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        _assert_too_many_requests(
            await _login(client, "someone-else@example.com", "x" * 8)
        )


@pytest.mark.anyio
async def test_failed_logins_are_counted_per_account_across_ips(
    limited_app, monkeypatch
):
    monkeypatch.setattr(settings, "rate_limit_login_failures_per_account", 3)

    # Three failures from three addresses, through both the email and the phone.
    attempts = [
        ("198.51.100.1", OWNER_EMAIL),
        ("198.51.100.2", "012 345 678"),
        ("198.51.100.3", OWNER_EMAIL.upper()),
    ]
    for ip, identifier in attempts:
        async with _client(ip) as client:
            response = await _login(client, identifier, "wrong-password")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # The account is locked for every address and identifier, even with the
    # right password, until the window ends.
    for ip, identifier in [
        ("198.51.100.4", OWNER_EMAIL),
        ("198.51.100.5", OWNER_PHONE),
    ]:
        async with _client(ip) as client:
            _assert_too_many_requests(await _login(client, identifier, OWNER_PASSWORD))


@pytest.mark.anyio
async def test_unknown_accounts_are_locked_like_real_ones(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_failures_per_account", 3)
    unknown = "nobody@example.com"

    for index in range(3):
        async with _client(f"198.51.100.{10 + index}") as client:
            response = await _login(client, unknown, "wrong-password")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async with _client("198.51.100.20") as client:
        _assert_too_many_requests(await _login(client, unknown, "wrong-password"))


@pytest.mark.anyio
async def test_unknown_identifier_costs_one_password_hash_check(
    limited_app, monkeypatch
):
    real_verify = auth_service.verify_password_async
    calls: list[str] = []

    async def _counting_verify(password: str, hashed: str) -> bool:
        calls.append(hashed)
        return await real_verify(password, hashed)

    monkeypatch.setattr(auth_service, "verify_password_async", _counting_verify)

    async with _client() as client:
        unknown = await _login(client, "nobody@example.com", "wrong-password")
        known = await _login(client, OWNER_EMAIL, "wrong-password")

    assert unknown.status_code == known.status_code == status.HTTP_401_UNAUTHORIZED
    assert unknown.json() == known.json()
    # One Argon2 verification for the unknown identifier as well as the real account.
    assert len(calls) == 2
    assert all(hashed.startswith("$argon2") for hashed in calls)


# ---------------------------------------------------------------------------
# Client IP: forwarding headers only from trusted proxies
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_forwarded_for_is_ignored_without_trusted_proxies(
    limited_app, monkeypatch
):
    monkeypatch.setattr(settings, "rate_limit_login_per_ip", 2)

    async with _client() as client:
        for index in range(3):
            response = await client.post(
                "/api/v1/auth/login",
                headers={"X-Forwarded-For": f"192.0.2.{index}"},
                json={"identifier": f"user{index}@example.com", "password": "x" * 8},
            )
            if index < 2:
                assert response.status_code == status.HTTP_401_UNAUTHORIZED
            else:
                # Spoofed addresses do not escape the per-IP bucket of the peer.
                _assert_too_many_requests(response)


@pytest.mark.anyio
async def test_forwarded_for_is_used_behind_a_trusted_proxy(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_ip", 2)
    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8")

    async with _client("10.0.0.5") as proxy:
        for index in range(3):
            response = await proxy.post(
                "/api/v1/auth/login",
                headers={"X-Forwarded-For": f"192.0.2.{index}"},
                json={"identifier": f"user{index}@example.com", "password": "x" * 8},
            )
            # Each client behind the proxy has its own per-IP bucket.
            assert response.status_code == status.HTTP_401_UNAUTHORIZED


def _networks(*values: str) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    return [ipaddress.ip_network(value, strict=False) for value in values]


def test_resolve_client_ip_trusts_only_configured_proxies():
    trusted = _networks("10.0.0.0/8", "127.0.0.1")

    # No trusted proxies, or an untrusted peer: the socket address wins.
    assert resolve_client_ip("198.51.100.9", "1.2.3.4", []) == "198.51.100.9"
    assert resolve_client_ip("198.51.100.9", "1.2.3.4", trusted) == "198.51.100.9"
    # A trusted peer without the header.
    assert resolve_client_ip("10.0.0.5", None, trusted) == "10.0.0.5"
    # The rightmost untrusted hop is the client; spoofed hops to its left are ignored.
    assert (
        resolve_client_ip("10.0.0.5", "6.6.6.6, 203.0.113.7, 10.0.0.9", trusted)
        == "203.0.113.7"
    )
    # A malformed hop written by a proxy falls back to the peer.
    assert resolve_client_ip("10.0.0.5", "not-an-ip", trusted) == "10.0.0.5"
    # All hops trusted: the request started inside the trusted network.
    assert resolve_client_ip("10.0.0.5", "10.1.1.1, 127.0.0.1", trusted) == "10.1.1.1"
    assert resolve_client_ip(None, "1.2.3.4", trusted) == "unknown"


def test_trusted_proxies_setting_rejects_invalid_entries():
    with pytest.raises(ValueError):
        Settings(
            database_url="postgresql+asyncpg://u:p@localhost/db",
            redis_url="redis://localhost:6379/0",
            secret_key="test-secret",
            trusted_proxies="10.0.0.0/8, not-a-network",
        )


# ---------------------------------------------------------------------------
# Registration, refresh, and password reset
# ---------------------------------------------------------------------------


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
async def test_refresh_is_limited_per_ip(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_refresh_per_ip", 2)

    async with _client() as client:
        refresh_token = (await _login(client, OWNER_EMAIL, OWNER_PASSWORD)).json()[
            "refresh_token"
        ]
        for _ in range(2):
            response = await client.post(
                "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
            )
            assert response.status_code == status.HTTP_200_OK
            refresh_token = response.json()["refresh_token"]

        _assert_too_many_requests(
            await client.post(
                "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
            )
        )


@pytest.mark.anyio
async def test_password_reset_confirm_is_limited_per_ip(limited_app, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_password_reset_confirm_per_ip", 3)

    async with _client() as client:
        for index in range(3):
            response = await client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"token": f"guess-{index}-" + "x" * 40, "new_password": "x" * 12},
            )
            assert response.status_code == status.HTTP_400_BAD_REQUEST

        _assert_too_many_requests(
            await client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"token": "guess-4-" + "x" * 40, "new_password": "x" * 12},
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


# ---------------------------------------------------------------------------
# Limiter backends
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_memory_limiter_resets_when_the_window_ends():
    clock = FakeClock(now=1_000_000.0)
    limiter = MemoryRateLimiter(clock=clock)
    rule = RateLimitRule(limit=2, window_seconds=60)
    window_end = (int(clock.now // 60) + 1) * 60

    assert (await limiter.peek("key", rule)).allowed
    assert (await limiter.hit("key", rule)).allowed
    assert (await limiter.hit("key", rule)).allowed
    assert not (await limiter.peek("key", rule)).allowed
    blocked = await limiter.hit("key", rule)
    assert not blocked.allowed
    assert blocked.retry_after_seconds == window_end - int(clock.now)

    # Other keys are counted separately.
    assert (await limiter.hit("other-key", rule)).allowed

    clock.now = window_end + 0.5
    assert (await limiter.peek("key", rule)).count == 0
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
    key = rate_limit_key("login:identifier_ip", "owner@example.com", CLIENT_IP)
    assert key.startswith("ratelimit:login:identifier_ip:")
    assert "owner@example.com" not in key
    assert CLIENT_IP not in key


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

    async def get(self, key: str) -> bytes | None:
        value = self.store.get(key)
        return None if value is None else str(value).encode()


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
    assert (await limiter.peek("k", rule)).count == 3


@pytest.mark.anyio
async def test_redis_outage_falls_back_to_memory_limiting():
    # Nothing listens on port 1, so every Redis command fails to connect.
    limiter = RedisRateLimiter.from_url("redis://127.0.0.1:1/0", timeout_seconds=0.5)
    rule = RateLimitRule(limit=2, window_seconds=60)
    try:
        await enforce_rate_limit(limiter, "login:ip", rule, CLIENT_IP)
        await enforce_rate_limit(limiter, "login:ip", rule, CLIENT_IP)
        # Limiting still applies while Redis is down.
        with pytest.raises(RateLimitExceededError):
            await enforce_rate_limit(limiter, "login:ip", rule, CLIENT_IP)
        assert not (
            await limiter.peek(rate_limit_key("login:ip", CLIENT_IP), rule)
        ).allowed
    finally:
        await limiter.aclose()
