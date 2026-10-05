"""Pluggable transports that carry WebSocket room messages to every process.

The room registry in ``app.core.ws_manager`` only knows the sockets connected
to the current process. A broadcaster decides how a serialized room message
reaches every process that may hold a socket in one of its rooms:

- ``MemoryBroadcaster`` delivers straight to this process's sockets. It is the
  default for development and tests, and it is only correct with one process.
- ``RedisBroadcaster`` publishes one JSON envelope per broadcast to a Redis
  pub/sub channel. Each process runs one subscriber task that receives every
  envelope and fans it out to its own sockets in the listed rooms.

Messages can reference guest sessions, orders and payments, so this module
never logs them. Logs carry only channel names, counts and error types.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import random
from collections.abc import Awaitable, Callable, Iterator, Sequence
from typing import TYPE_CHECKING, Protocol

import structlog
from redis.asyncio import Redis
from redis.asyncio.client import PubSub
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialWithJitterBackoff

if TYPE_CHECKING:
    from app.core.config import Settings

logger = structlog.get_logger("app.core.ws_broadcaster")

LocalDelivery = Callable[[Sequence[str], str], Awaitable[object]]
"""Sends a serialized message to this process's sockets in the given rooms."""

PUBLISH_TIMEOUT_SECONDS = 2.0
"""Upper bound for one publish, so an unreachable Redis cannot stall a request."""

POLL_INTERVAL_SECONDS = 1.0
"""How long the subscriber waits for a message before polling again."""

RECONNECT_INITIAL_DELAY_SECONDS = 0.5
RECONNECT_MAX_DELAY_SECONDS = 30.0

REDIS_HEALTH_CHECK_INTERVAL_SECONDS = 30
"""Idle connections are pinged at this interval, which keeps the subscriber's
connection alive through proxies and NAT and surfaces a dead one as an error."""


class Broadcaster(Protocol):
    """Transport that hands every room message to each process's local sockets."""

    @property
    def backend(self) -> str:
        """Short backend name used in logs, such as "memory" or "redis"."""
        ...

    async def start(self, deliver: LocalDelivery) -> None:
        """Start delivering messages to this process's sockets through ``deliver``."""
        ...

    async def stop(self) -> None:
        """Stop delivering messages and release any connections."""
        ...

    async def publish(self, rooms: Sequence[str], message: str) -> None:
        """Send ``message`` to the sockets in ``rooms`` on every process.

        Implementations log transport errors instead of raising them, because
        callers broadcast after their database commit has already succeeded.
        """
        ...


class MemoryBroadcaster:
    """Delivers each message directly to this process's sockets.

    This is only correct when every client is connected to the same process,
    that is one uvicorn worker on one instance. It is the default for local
    development and tests.
    """

    backend = "memory"

    def __init__(self, deliver: LocalDelivery | None = None) -> None:
        self._deliver = deliver

    async def start(self, deliver: LocalDelivery) -> None:
        """Bind the local delivery callback. There is nothing else to start."""
        self._deliver = deliver

    async def stop(self) -> None:
        """Release nothing: in-process delivery holds no connections."""

    async def publish(self, rooms: Sequence[str], message: str) -> None:
        """Deliver ``message`` to this process's sockets in ``rooms``."""
        if self._deliver is None:
            raise RuntimeError("MemoryBroadcaster.publish() called before start()")
        await self._deliver(rooms, message)


class RedisBroadcaster:
    """Relays room messages between processes through one Redis pub/sub channel.

    ``publish`` sends the envelope ``{"rooms": [...], "message": "<json>"}``
    to the channel. The subscriber task started by ``start`` receives every
    envelope, including the ones this process published, and hands it to the
    local delivery callback. On a Redis error the subscriber reconnects with
    capped exponential backoff and jitter.
    """

    backend = "redis"

    def __init__(
        self,
        *,
        channel: str,
        redis_url: str | None = None,
        client: Redis | None = None,
        publish_timeout: float = PUBLISH_TIMEOUT_SECONDS,
        poll_interval: float = POLL_INTERVAL_SECONDS,
        reconnect_initial_delay: float = RECONNECT_INITIAL_DELAY_SECONDS,
        reconnect_max_delay: float = RECONNECT_MAX_DELAY_SECONDS,
    ) -> None:
        if client is None:
            if redis_url is None:
                raise ValueError("RedisBroadcaster needs either redis_url or client")
            client = Redis.from_url(
                redis_url,
                health_check_interval=REDIS_HEALTH_CHECK_INTERVAL_SECONDS,
                # Fail fast: the subscriber has its own reconnect loop, and a
                # failed publish falls back to local delivery.
                retry=Retry(ExponentialWithJitterBackoff(cap=0.5, base=0.05), 2),
            )
        self._client = client
        self._channel = channel
        self._publish_timeout = publish_timeout
        self._poll_interval = poll_interval
        self._reconnect_initial_delay = reconnect_initial_delay
        self._reconnect_max_delay = reconnect_max_delay
        self._deliver: LocalDelivery | None = None
        self._task: asyncio.Task[None] | None = None

    @property
    def channel(self) -> str:
        """The Redis pub/sub channel this broadcaster publishes to and reads from."""
        return self._channel

    async def start(self, deliver: LocalDelivery) -> None:
        """Start the single subscriber task that feeds ``deliver``."""
        if self._task is not None:
            raise RuntimeError("RedisBroadcaster is already started")
        self._deliver = deliver
        self._task = asyncio.create_task(
            self._run_subscriber(), name="realtime-redis-subscriber"
        )
        self._task.add_done_callback(_log_unexpected_exit)

    async def stop(self) -> None:
        """Cancel the subscriber task, wait for it to finish and close the client."""
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            await asyncio.wait({task})
        with contextlib.suppress(Exception):
            await self._client.aclose()
        logger.info("Realtime subscriber stopped", channel=self._channel)

    async def publish(self, rooms: Sequence[str], message: str) -> None:
        """Publish one envelope for ``rooms`` so every subscribed process delivers it.

        If Redis cannot be reached in time, the message is delivered to this
        process's sockets only, so an outage degrades to single-process
        behavior rather than silence. A publish that timed out after Redis
        accepted it can then reach local sockets twice; clients treat events
        as refresh hints, so a rare duplicate is harmless.
        """
        envelope = json.dumps({"rooms": list(rooms), "message": message})
        try:
            async with asyncio.timeout(self._publish_timeout):
                await self._client.publish(self._channel, envelope)
        except Exception as exc:
            logger.warning(
                "Realtime publish to Redis failed; delivering to this process only",
                channel=self._channel,
                room_count=len(rooms),
                error_type=type(exc).__name__,
            )
            if self._deliver is not None:
                await self._deliver(rooms, message)

    async def _run_subscriber(self) -> None:
        """Keep one subscription open, reconnecting with capped backoff on errors."""
        delays = backoff_delays(
            self._reconnect_initial_delay, self._reconnect_max_delay
        )
        while True:
            error_type: str | None = None
            pubsub = self._client.pubsub(ignore_subscribe_messages=True)
            try:
                await pubsub.subscribe(self._channel)
                logger.info("Realtime subscriber listening", channel=self._channel)
                delays = backoff_delays(
                    self._reconnect_initial_delay, self._reconnect_max_delay
                )
                await self._pump(pubsub)
            except Exception as exc:
                error_type = type(exc).__name__
            finally:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()
            delay = random.uniform(0.5, 1.0) * next(delays)
            logger.warning(
                "Realtime subscriber cannot reach Redis; retrying",
                channel=self._channel,
                error_type=error_type,
                retry_in_seconds=round(delay, 2),
            )
            await asyncio.sleep(delay)

    async def _pump(self, pubsub: PubSub) -> None:
        """Read messages from ``pubsub`` and deliver them until an error occurs."""
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=self._poll_interval
            )
            if message is not None and message.get("type") == "message":
                await self._dispatch(message.get("data"))

    async def _dispatch(self, data: object) -> None:
        """Validate one received envelope and fan it out to local sockets."""
        envelope = parse_envelope(data)
        if envelope is None:
            logger.warning("Ignored malformed realtime message", channel=self._channel)
            return
        if self._deliver is None:
            return
        rooms, message = envelope
        try:
            await self._deliver(rooms, message)
        except Exception:
            logger.exception("Realtime local delivery failed", channel=self._channel)


def parse_envelope(data: object) -> tuple[list[str], str] | None:
    """Return ``(rooms, message)`` from a received envelope, or None if it is malformed."""
    if not isinstance(data, bytes | str):
        return None
    try:
        envelope = json.loads(data)
    except ValueError:
        return None
    if not isinstance(envelope, dict):
        return None
    rooms = envelope.get("rooms")
    message = envelope.get("message")
    if not isinstance(rooms, list) or not isinstance(message, str):
        return None
    if not all(isinstance(room, str) for room in rooms):
        return None
    return rooms, message


def backoff_delays(initial: float, maximum: float) -> Iterator[float]:
    """Yield reconnect delays that double from ``initial`` up to ``maximum``."""
    delay = initial
    while True:
        yield delay
        delay = min(delay * 2, maximum)


def realtime_channel(environment: str) -> str:
    """Return the Redis channel for an environment.

    Redis pub/sub ignores the logical database number in ``REDIS_URL``, so the
    environment name keeps, for example, staging and production apart when
    they share one Redis server.
    """
    return f"emenu:{environment.strip().lower()}:realtime"


def create_broadcaster(settings: Settings) -> Broadcaster:
    """Build the broadcaster selected by ``REALTIME_BACKEND``."""
    if settings.realtime_backend == "redis":
        return RedisBroadcaster(
            channel=realtime_channel(settings.environment),
            redis_url=settings.redis_url,
        )
    return MemoryBroadcaster()


def _log_unexpected_exit(task: asyncio.Task[None]) -> None:
    """Log a subscriber task that ended for any reason other than cancellation."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error(
            "Realtime subscriber stopped unexpectedly",
            error_type=type(exc).__name__,
        )
