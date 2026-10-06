"""
Fixed-window rate limiting for abuse-prone endpoints such as login.

Windows are aligned to the clock. A rule of ``limit`` hits per ``window_seconds``
lets each key through ``limit`` times between ``k * window_seconds`` and
``(k + 1) * window_seconds``, and a rejected caller is told to retry when the
current window ends. As with any fixed window, a burst that straddles a window
boundary can reach twice the limit; in exchange each key needs one counter.

Backends, selected with ``RATE_LIMIT_BACKEND``:

- ``memory`` keeps counters inside the process. It is the default for development
  and tests. Every worker process counts on its own, so it does not protect a
  deployment that runs several workers or instances.
- ``redis`` shares counters through ``REDIS_URL`` using ``INCR`` and ``EXPIRE`` in
  one MULTI/EXEC transaction. Production must use it.

Keys are SHA-256 digests of the scope and subject, so emails, phone numbers and IP
addresses are never stored in Redis in plain text.

Limiting never switches off. When Redis cannot be reached, the Redis backend counts
in process memory until it comes back and logs a warning at most once a minute.
"""

import hashlib
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import NoReturn, Protocol

import structlog
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.exceptions import RateLimitExceededError

logger = structlog.get_logger("app.core.rate_limit")

Clock = Callable[[], float]

# Minimum time between two "Redis unavailable" warnings from one process
OUTAGE_LOG_INTERVAL_SECONDS = 60.0


@dataclass(frozen=True, slots=True)
class RateLimitRule:
    """Allow at most ``limit`` hits per key in each ``window_seconds`` window."""

    limit: int
    window_seconds: int


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    """
    State of a key in the current window.

    After ``hit``, ``allowed`` says whether that hit is within the limit. After
    ``peek``, it says whether one more hit would be.
    """

    allowed: bool
    count: int
    retry_after_seconds: int


class RateLimiter(Protocol):
    """A fixed-window counter backend."""

    async def hit(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Count one hit for ``key`` and report whether it is within ``rule``."""
        ...

    async def peek(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Report the hits counted for ``key`` in the current window without adding one."""
        ...

    async def aclose(self) -> None:
        """Release resources held by the backend."""
        ...


def _window_bounds(now: float, window_seconds: int) -> tuple[int, int]:
    """Return the index of the window containing ``now`` and the second it ends."""
    index = int(now // window_seconds)
    return index, (index + 1) * window_seconds


def _retry_after(now: float, window_end: int) -> int:
    """Whole seconds until the window ending at ``window_end`` is over (at least 1)."""
    return max(1, math.ceil(window_end - now))


def _hit_result(
    count: int,
    rule: RateLimitRule,
    now: float,
    window_end: int,
) -> RateLimitResult:
    """Result for the ``count``-th hit of the window ending at ``window_end``."""
    return RateLimitResult(
        allowed=count <= rule.limit,
        count=count,
        retry_after_seconds=_retry_after(now, window_end),
    )


def _peek_result(
    count: int,
    rule: RateLimitRule,
    now: float,
    window_end: int,
) -> RateLimitResult:
    """Result for a key with ``count`` hits so far in the window ending at ``window_end``."""
    return RateLimitResult(
        allowed=count < rule.limit,
        count=count,
        retry_after_seconds=_retry_after(now, window_end),
    )


class MemoryRateLimiter:
    """In-process fixed-window counters for development, tests, and Redis outages."""

    def __init__(self, clock: Clock = time.time, max_keys: int = 10_000) -> None:
        self._clock = clock
        self._max_keys = max_keys
        # key -> (end of the window being counted, hits in that window)
        self._counters: dict[str, tuple[int, int]] = {}

    def _current_count(self, key: str, window_end: int) -> int:
        """Hits counted for ``key`` in the window ending at ``window_end``."""
        stored_window_end, count = self._counters.get(key, (window_end, 0))
        return count if stored_window_end == window_end else 0

    async def hit(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Count one hit for ``key`` in the current window."""
        now = self._clock()
        _, window_end = _window_bounds(now, rule.window_seconds)

        count = self._current_count(key, window_end) + 1
        self._counters[key] = (window_end, count)

        if len(self._counters) > self._max_keys:
            self._prune_expired(now)

        return _hit_result(count, rule, now, window_end)

    async def peek(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Report the hits counted for ``key`` in the current window."""
        now = self._clock()
        _, window_end = _window_bounds(now, rule.window_seconds)
        return _peek_result(self._current_count(key, window_end), rule, now, window_end)

    def _prune_expired(self, now: float) -> None:
        """Drop counters whose window has already ended."""
        expired = [
            key for key, (window_end, _) in self._counters.items() if window_end <= now
        ]
        for key in expired:
            del self._counters[key]

    def reset(self) -> None:
        """Forget every counter."""
        self._counters.clear()

    async def aclose(self) -> None:
        """Forget every counter; there is nothing else to release."""
        self.reset()


class RedisRateLimiter:
    """
    Fixed-window counters shared by every process through Redis.

    While Redis is unreachable, counting continues in a per-process
    ``MemoryRateLimiter``, so limits still apply (per process) during an outage.
    """

    def __init__(
        self,
        client: Redis,
        clock: Clock = time.time,
        fallback: MemoryRateLimiter | None = None,
    ) -> None:
        self._client = client
        self._clock = clock
        self._fallback = fallback or MemoryRateLimiter(clock=clock)
        self._last_outage_log = -OUTAGE_LOG_INTERVAL_SECONDS

    @classmethod
    def from_url(cls, url: str, timeout_seconds: float) -> "RedisRateLimiter":
        """
        Create a limiter for ``url`` that fails over quickly when Redis is unreachable.

        Short socket timeouts and a single immediate retry keep a Redis outage from
        stalling every login request.
        """
        client = Redis.from_url(
            url,
            socket_timeout=timeout_seconds,
            socket_connect_timeout=timeout_seconds,
            retry=Retry(NoBackoff(), retries=1),
        )
        return cls(client)

    def _log_outage(self, exc: Exception) -> None:
        """Warn that the in-memory fallback is in use, at most once a minute."""
        now = time.monotonic()
        if now - self._last_outage_log >= OUTAGE_LOG_INTERVAL_SECONDS:
            self._last_outage_log = now
            logger.warning(
                "Rate limiter cannot reach Redis, counting in process memory",
                error_type=type(exc).__name__,
            )

    async def hit(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Count one hit with INCR, and EXPIRE the window key in the same transaction."""
        now = self._clock()
        index, window_end = _window_bounds(now, rule.window_seconds)
        window_key = f"{key}:{index}"

        try:
            async with self._client.pipeline(transaction=True) as pipe:
                pipe.incr(window_key)
                pipe.expire(window_key, rule.window_seconds)
                count, _ = await pipe.execute()
        except (RedisError, OSError) as exc:
            self._log_outage(exc)
            return await self._fallback.hit(key, rule)

        return _hit_result(int(count), rule, now, window_end)

    async def peek(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Read the hits counted for ``key`` in the current window."""
        now = self._clock()
        index, window_end = _window_bounds(now, rule.window_seconds)

        try:
            stored = await self._client.get(f"{key}:{index}")
        except (RedisError, OSError) as exc:
            self._log_outage(exc)
            return await self._fallback.peek(key, rule)

        count = int(stored) if stored is not None else 0
        return _peek_result(count, rule, now, window_end)

    async def aclose(self) -> None:
        """Close the Redis connection pool."""
        await self._client.aclose()


_rate_limiter: RateLimiter | None = None


def _build_rate_limiter() -> RateLimiter:
    """Create the limiter selected by ``RATE_LIMIT_BACKEND``."""
    if settings.rate_limit_backend == "redis":
        logger.info("Rate limiting uses the Redis backend")
        return RedisRateLimiter.from_url(
            settings.redis_url,
            timeout_seconds=settings.rate_limit_redis_timeout_seconds,
        )

    if not settings.is_development:
        logger.warning(
            "Rate limiting uses the in-memory backend, which counts per process. "
            "Set RATE_LIMIT_BACKEND=redis in production."
        )
    return MemoryRateLimiter()


async def get_rate_limiter() -> RateLimiter:
    """
    Return the process-wide limiter, creating it on first use.

    It is a FastAPI dependency, so tests can override it with a fresh
    ``MemoryRateLimiter``.
    """
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = _build_rate_limiter()
    return _rate_limiter


async def close_rate_limiter() -> None:
    """Close the process-wide limiter, if one was created, at application shutdown."""
    global _rate_limiter
    if _rate_limiter is not None:
        limiter, _rate_limiter = _rate_limiter, None
        await limiter.aclose()


def rate_limit_key(scope: str, *parts: str) -> str:
    """Return a storage key for ``scope`` whose subject ``parts`` are hashed."""
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()
    return f"ratelimit:{scope}:{digest}"


def _rejected(scope: str, rule: RateLimitRule, retry_after_seconds: int) -> NoReturn:
    """Log a rejection and raise RateLimitExceededError."""
    logger.warning(
        "Rate limit exceeded",
        scope=scope,
        limit=rule.limit,
        window_seconds=rule.window_seconds,
        retry_after_seconds=retry_after_seconds,
    )
    raise RateLimitExceededError(retry_after_seconds)


async def enforce_rate_limit(
    limiter: RateLimiter,
    scope: str,
    rule: RateLimitRule,
    *parts: str,
) -> None:
    """
    Count one hit for the subject ``parts`` within ``scope``.

    Raises:
        RateLimitExceededError: The subject has used up ``rule`` for the current
            window. ``retry_after_seconds`` says when the window ends.
    """
    result = await limiter.hit(rate_limit_key(scope, *parts), rule)
    if not result.allowed:
        _rejected(scope, rule, result.retry_after_seconds)


async def ensure_rate_limit_available(
    limiter: RateLimiter,
    scope: str,
    rule: RateLimitRule,
    *parts: str,
) -> None:
    """
    Check, without counting, that the subject ``parts`` may make another attempt.

    Use it with ``record_rate_limit_hit`` to limit only some outcomes, such as
    failed logins.

    Raises:
        RateLimitExceededError: ``rule`` is already used up for the current window.
    """
    result = await limiter.peek(rate_limit_key(scope, *parts), rule)
    if not result.allowed:
        _rejected(scope, rule, result.retry_after_seconds)


async def record_rate_limit_hit(
    limiter: RateLimiter,
    scope: str,
    rule: RateLimitRule,
    *parts: str,
) -> None:
    """Count one hit for the subject ``parts`` within ``scope`` without raising."""
    await limiter.hit(rate_limit_key(scope, *parts), rule)
