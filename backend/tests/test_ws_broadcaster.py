"""Tests for real-time broadcasting: local fan-out and the Redis pub/sub backend.

The Redis tests use a small in-memory stand-in for the async Redis client and
its pub/sub object, so they need no Redis server.
"""

import asyncio
import json
import logging
import time
from collections.abc import Callable
from decimal import Decimal
from itertools import islice
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi import WebSocket
from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette.testclient import TestClient

from app import main as main_module
from app.core.config import Settings, settings
from app.core.ws_broadcaster import (
    MemoryBroadcaster,
    RedisBroadcaster,
    backoff_delays,
    create_broadcaster,
)
from app.core.ws_manager import WebSocketConnectionManager, ws_manager

CHANNEL = "emenu:test:realtime"
BRANCH_ID = uuid4()
POS_ROOM = f"branch:{BRANCH_ID}:pos"
EXPO_ROOM = f"branch:{BRANCH_ID}:expo"
SESSION_ROOM = f"session:{uuid4()}"
OTHER_SESSION_ROOM = f"session:{uuid4()}"


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeSocket:
    """Stands in for a Starlette WebSocket and records what it was sent."""

    def __init__(self, *, fail: bool = False, hang: bool = False) -> None:
        self.sent: list[str] = []
        self.send_calls = 0
        self.close_code: int | None = None
        self._fail = fail
        self._hang = hang

    async def accept(self) -> None:
        return None

    async def send_text(self, text: str) -> None:
        self.send_calls += 1
        if self._fail:
            raise RuntimeError("Cannot call send once the socket is closed")
        if self._hang:
            await asyncio.Event().wait()
        self.sent.append(text)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.close_code = code


class HandshakeSocket(FakeSocket):
    """Finishes a send only after its partner socket has started one."""

    def __init__(self, mine: asyncio.Event, partner: asyncio.Event) -> None:
        super().__init__()
        self._mine = mine
        self._partner = partner

    async def send_text(self, text: str) -> None:
        self._mine.set()
        await self._partner.wait()
        self.sent.append(text)


class FakeRedisServer:
    """Routes published messages to the fake pub/sub objects subscribed to them."""

    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []
        self.subscribers: list["FakePubSub"] = []


class FakePubSub:
    """Minimal stand-in for redis.asyncio.client.PubSub."""

    def __init__(self, client: "FakeRedis") -> None:
        self._client = client
        self.channels: list[str] = []
        self.closed = False
        self._inbox: asyncio.Queue[dict[str, Any] | Exception] = asyncio.Queue()

    async def subscribe(self, *channels: str) -> None:
        self._client.subscribe_calls += 1
        if self._client.subscribe_failures > 0:
            self._client.subscribe_failures -= 1
            raise RedisConnectionError("Error connecting to Redis")
        self.channels.extend(channels)
        self._client.server.subscribers.append(self)

    async def get_message(
        self, ignore_subscribe_messages: bool = False, timeout: float | None = 0.0
    ) -> dict[str, Any] | None:
        try:
            async with asyncio.timeout(timeout):
                item = await self._inbox.get()
        except TimeoutError:
            return None
        if isinstance(item, Exception):
            raise item
        return item

    async def aclose(self) -> None:
        self.closed = True
        if self in self._client.server.subscribers:
            self._client.server.subscribers.remove(self)

    def push(self, channel: str, data: bytes) -> None:
        """Queue a message the way Redis delivers it on a subscribed channel."""
        self._inbox.put_nowait(
            {
                "type": "message",
                "pattern": None,
                "channel": channel.encode(),
                "data": data,
            }
        )

    def drop_connection(self) -> None:
        """Make the next read fail as if the TCP connection had been reset."""
        self._inbox.put_nowait(RedisConnectionError("Connection reset by peer"))


class FakeRedis:
    """Minimal stand-in for redis.asyncio.Redis: publish, pubsub and aclose."""

    def __init__(self, server: FakeRedisServer | None = None) -> None:
        self.server = server or FakeRedisServer()
        self.pubsubs: list[FakePubSub] = []
        self.closed = False
        self.publish_error: Exception | None = None
        self.publish_hangs = False
        self.subscribe_failures = 0
        self.subscribe_calls = 0

    def pubsub(self, **kwargs: Any) -> FakePubSub:
        pubsub = FakePubSub(self)
        self.pubsubs.append(pubsub)
        return pubsub

    async def publish(self, channel: str, message: str) -> int:
        if self.publish_error is not None:
            raise self.publish_error
        if self.publish_hangs:
            await asyncio.Event().wait()
        self.server.published.append((channel, message))
        receivers = [s for s in self.server.subscribers if channel in s.channels]
        for subscriber in receivers:
            subscriber.push(channel, message.encode())
        return len(receivers)

    async def aclose(self) -> None:
        self.closed = True


def as_ws(socket: FakeSocket) -> WebSocket:
    return cast(WebSocket, socket)


def as_redis(client: FakeRedis) -> Redis:
    return cast(Redis, client)


def redis_broadcaster(client: FakeRedis, **kwargs: Any) -> RedisBroadcaster:
    options: dict[str, Any] = {
        "poll_interval": 0.01,
        "reconnect_initial_delay": 0.01,
        "reconnect_max_delay": 0.02,
    }
    options.update(kwargs)
    return RedisBroadcaster(channel=CHANNEL, client=as_redis(client), **options)


async def wait_until(predicate: Callable[[], object], timeout: float = 2.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.005)


def events(socket: FakeSocket) -> list[str]:
    return [json.loads(text)["event"] for text in socket.sent]


@pytest.mark.anyio
async def test_memory_backend_is_the_default_and_delivers_in_process():
    """Without a configured broadcaster the manager fans out to its own sockets."""
    manager = WebSocketConnectionManager()
    pos, expo = FakeSocket(), FakeSocket()
    await manager.connect(as_ws(pos), POS_ROOM)
    await manager.connect(as_ws(expo), EXPO_ROOM)

    await manager.broadcast_to_rooms(
        rooms=[POS_ROOM], event="order.created", data={"order_number": "ORD-001"}
    )

    assert manager.backend == "memory"
    assert events(pos) == ["order.created"]
    assert expo.sent == []


@pytest.mark.anyio
async def test_broken_or_slow_socket_does_not_block_other_clients():
    """A failing or stalled socket is dropped after the timeout; the rest still get the event."""
    manager = WebSocketConnectionManager(send_timeout=0.2)
    healthy_pos, healthy_guest = FakeSocket(), FakeSocket()
    broken, stalled = FakeSocket(fail=True), FakeSocket(hang=True)
    for socket in (healthy_pos, broken, stalled):
        await manager.connect(as_ws(socket), POS_ROOM)
    await manager.connect(as_ws(healthy_guest), SESSION_ROOM)

    started = time.perf_counter()
    async with asyncio.timeout(2.0):
        await manager.broadcast_to_rooms(
            rooms=[POS_ROOM, SESSION_ROOM], event="order.created", data={}
        )
    elapsed = time.perf_counter() - started

    assert elapsed < 1.0
    assert events(healthy_pos) == ["order.created"]
    assert events(healthy_guest) == ["order.created"]

    # Both bad sockets are closed so their clients reconnect.
    await wait_until(lambda: broken.close_code and stalled.close_code)
    assert stalled.close_code == 1013

    # They were removed from the room: the next event skips them entirely.
    await manager.broadcast_to_rooms(
        rooms=[POS_ROOM], event="order.item_bumped", data={}
    )
    assert events(healthy_pos) == ["order.created", "order.item_bumped"]
    assert broken.send_calls == 1
    assert stalled.send_calls == 1


@pytest.mark.anyio
async def test_local_sends_run_concurrently():
    """Each send waits for the other one to start, which only works if they run together."""
    manager = WebSocketConnectionManager(send_timeout=1.0)
    first_started, second_started = asyncio.Event(), asyncio.Event()
    first = HandshakeSocket(first_started, second_started)
    second = HandshakeSocket(second_started, first_started)
    await manager.connect(as_ws(first), POS_ROOM)
    await manager.connect(as_ws(second), POS_ROOM)

    delivered = await manager.deliver_local([POS_ROOM], '{"event": "order.created"}')

    assert delivered == 2
    assert first.sent == second.sent == ['{"event": "order.created"}']


@pytest.mark.anyio
async def test_redis_publish_sends_one_envelope_on_the_channel():
    """broadcast_to_rooms publishes {rooms, message} once, with rooms de-duplicated."""
    client = FakeRedis()
    manager = WebSocketConnectionManager()
    await manager.start(redis_broadcaster(client))
    try:
        await manager.broadcast_to_rooms(
            rooms=[POS_ROOM, SESSION_ROOM, POS_ROOM],
            event="order.created",
            data={"order_number": "ORD-001", "total_amount_usd": Decimal("10.00")},
            branch_id=BRANCH_ID,
        )

        assert manager.backend == "redis"
        assert len(client.server.published) == 1
        channel, payload = client.server.published[0]
        assert channel == CHANNEL

        envelope = json.loads(payload)
        assert set(envelope) == {"rooms", "message"}
        assert envelope["rooms"] == [POS_ROOM, SESSION_ROOM]

        message = json.loads(envelope["message"])
        assert message["event"] == "order.created"
        assert message["branch_id"] == str(BRANCH_ID)
        assert message["business_id"] is None
        assert message["data"] == {
            "order_number": "ORD-001",
            "total_amount_usd": "10.00",
        }
    finally:
        await manager.stop()


@pytest.mark.anyio
async def test_redis_subscriber_fans_out_only_to_matching_rooms_across_workers():
    """An event published by one worker reaches matching rooms on every worker, and no others."""
    server = FakeRedisServer()
    worker_a, worker_b = WebSocketConnectionManager(), WebSocketConnectionManager()
    await worker_a.start(redis_broadcaster(FakeRedis(server)))
    await worker_b.start(redis_broadcaster(FakeRedis(server)))
    try:
        await wait_until(lambda: len(server.subscribers) == 2)
        pos_on_a, guest_on_b = FakeSocket(), FakeSocket()
        expo_on_b, other_guest_on_b = FakeSocket(), FakeSocket()
        await worker_a.connect(as_ws(pos_on_a), POS_ROOM)
        await worker_b.connect(as_ws(guest_on_b), SESSION_ROOM)
        await worker_b.connect(as_ws(expo_on_b), EXPO_ROOM)
        await worker_b.connect(as_ws(other_guest_on_b), OTHER_SESSION_ROOM)

        await worker_a.broadcast_to_rooms(
            rooms=[POS_ROOM, SESSION_ROOM],
            event="payment.completed",
            data={"payment_number": "PAY-001"},
            branch_id=BRANCH_ID,
        )
        await wait_until(lambda: pos_on_a.sent and guest_on_b.sent)

        assert events(pos_on_a) == ["payment.completed"]
        assert guest_on_b.sent == pos_on_a.sent
        assert expo_on_b.sent == []
        assert other_guest_on_b.sent == []
    finally:
        await worker_a.stop()
        await worker_b.stop()


@pytest.mark.anyio
async def test_redis_subscriber_skips_malformed_messages_without_logging_payloads(
    caplog,
):
    """Bad envelopes are dropped with a payload-free warning, and delivery carries on."""
    caplog.set_level(logging.INFO)
    secret = f"session-token-{uuid4().hex}"
    client = FakeRedis()
    manager = WebSocketConnectionManager()
    await manager.start(redis_broadcaster(client))
    try:
        await wait_until(lambda: client.server.subscribers)
        guest = FakeSocket()
        await manager.connect(as_ws(guest), SESSION_ROOM)
        subscriber = client.server.subscribers[0]

        malformed = [
            f"not json {secret}".encode(),
            json.dumps([SESSION_ROOM, secret]).encode(),
            json.dumps({"rooms": SESSION_ROOM, "message": secret}).encode(),
            json.dumps(
                {"rooms": [SESSION_ROOM], "message": {"token": secret}}
            ).encode(),
        ]
        for data in malformed:
            subscriber.push(CHANNEL, data)
        valid_message = json.dumps({"event": "bill_ack", "data": {"note": secret}})
        subscriber.push(
            CHANNEL,
            json.dumps({"rooms": [SESSION_ROOM], "message": valid_message}).encode(),
        )

        await wait_until(lambda: guest.sent)
        assert guest.sent == [valid_message]
        assert caplog.text.count("Ignored malformed realtime message") == len(malformed)
        assert secret not in caplog.text
    finally:
        await manager.stop()


@pytest.mark.anyio
async def test_redis_subscriber_reconnects_after_errors():
    """Subscribe failures and dropped connections are retried, and delivery resumes."""
    client = FakeRedis()
    client.subscribe_failures = 2
    manager = WebSocketConnectionManager()
    await manager.start(redis_broadcaster(client))
    try:
        await wait_until(lambda: client.server.subscribers)
        assert client.subscribe_calls == 3

        client.server.subscribers[0].drop_connection()
        await wait_until(
            lambda: client.subscribe_calls == 4 and client.server.subscribers
        )

        pos = FakeSocket()
        await manager.connect(as_ws(pos), POS_ROOM)
        await manager.broadcast_to_rooms(
            rooms=[POS_ROOM], event="order.created", data={}
        )
        await wait_until(lambda: pos.sent)

        assert events(pos) == ["order.created"]
        assert all(pubsub.closed for pubsub in client.pubsubs[:-1])
    finally:
        await manager.stop()


def test_backoff_delays_double_up_to_the_cap():
    assert list(islice(backoff_delays(0.5, 4.0), 6)) == [0.5, 1.0, 2.0, 4.0, 4.0, 4.0]


@pytest.mark.anyio
@pytest.mark.parametrize("failure", ["error", "timeout"])
async def test_redis_publish_failure_falls_back_to_local_delivery(failure, caplog):
    """When Redis is down or too slow, this worker's own clients still get the event."""
    caplog.set_level(logging.INFO)
    secret = f"session-token-{uuid4().hex}"
    client = FakeRedis()
    if failure == "error":
        client.publish_error = RedisConnectionError("Connection refused")
    else:
        client.publish_hangs = True
    manager = WebSocketConnectionManager()
    await manager.start(redis_broadcaster(client, publish_timeout=0.05))
    try:
        guest = FakeSocket()
        await manager.connect(as_ws(guest), SESSION_ROOM)

        await manager.broadcast_to_rooms(
            rooms=[SESSION_ROOM], event="payment.completed", data={"note": secret}
        )

        assert events(guest) == ["payment.completed"]
        assert "Realtime publish to Redis failed" in caplog.text
        assert secret not in caplog.text
    finally:
        await manager.stop()


@pytest.mark.anyio
async def test_stop_cancels_the_subscriber_and_closes_redis():
    client = FakeRedis()
    manager = WebSocketConnectionManager()
    await manager.start(redis_broadcaster(client))
    await wait_until(lambda: client.server.subscribers)

    await manager.stop()

    assert manager.backend == "memory"
    assert client.closed
    assert client.pubsubs and all(pubsub.closed for pubsub in client.pubsubs)
    assert not [
        task
        for task in asyncio.all_tasks()
        if task.get_name() == "realtime-redis-subscriber"
    ]

    # After shutdown, broadcasts are delivered in-process instead of published.
    pos = FakeSocket()
    await manager.connect(as_ws(pos), POS_ROOM)
    await manager.broadcast_to_rooms(rooms=[POS_ROOM], event="order.created", data={})
    assert events(pos) == ["order.created"]
    assert client.server.published == []


def test_app_lifespan_runs_one_redis_subscriber_and_stops_it(monkeypatch):
    """The FastAPI lifespan starts the subscriber on startup and cancels it on shutdown."""
    client = FakeRedis()
    monkeypatch.setattr(
        main_module, "create_broadcaster", lambda _settings: redis_broadcaster(client)
    )

    with TestClient(main_module.app):
        assert ws_manager.backend == "redis"
        deadline = time.monotonic() + 2.0
        while not client.server.subscribers and time.monotonic() < deadline:
            time.sleep(0.01)
        assert len(client.server.subscribers) == 1
        assert client.server.subscribers[0].channels == [CHANNEL]

    assert ws_manager.backend == "memory"
    assert client.closed
    assert len(client.pubsubs) == 1
    assert client.pubsubs[0].closed


@pytest.mark.anyio
async def test_create_broadcaster_follows_realtime_backend_setting():
    memory = create_broadcaster(
        settings.model_copy(update={"realtime_backend": "memory"})
    )
    assert isinstance(memory, MemoryBroadcaster)

    redis_settings = settings.model_copy(
        update={"realtime_backend": "redis", "environment": "Staging"}
    )
    redis_backend = create_broadcaster(redis_settings)
    assert isinstance(redis_backend, RedisBroadcaster)
    assert redis_backend.channel == "emenu:staging:realtime"
    await redis_backend.stop()


def test_realtime_backend_setting_is_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("REALTIME_BACKEND", "redis")
    assert Settings().realtime_backend == "redis"  # pyright: ignore[reportCallIssue]

    monkeypatch.setenv("REALTIME_BACKEND", "kafka")
    with pytest.raises(ValidationError) as exc_info:
        Settings()  # pyright: ignore[reportCallIssue]
    assert [error["loc"] for error in exc_info.value.errors()] == [
        ("realtime_backend",)
    ]
