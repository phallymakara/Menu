"""Regression tests: oversized request bodies are refused before being read."""

import pytest
from fastapi import FastAPI, Request, status
from httpx import ASGITransport, AsyncClient

from app.core.body_limit import BodySizeLimitMiddleware

LIMIT = 100


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware, max_body_bytes=LIMIT)

    @app.post("/echo")
    async def echo(request: Request) -> dict[str, int]:
        return {"size": len(await request.body())}

    return app


async def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test")


@pytest.mark.anyio
async def test_body_within_the_limit_is_accepted():
    async with await _client() as client:
        res = await client.post("/echo", content=b"x" * LIMIT)
    assert res.status_code == status.HTTP_200_OK
    assert res.json() == {"size": LIMIT}


@pytest.mark.anyio
async def test_declared_content_length_over_the_limit_gets_413():
    async with await _client() as client:
        res = await client.post("/echo", content=b"x" * (LIMIT + 1))
    assert res.status_code == status.HTTP_413_CONTENT_TOO_LARGE


@pytest.mark.anyio
async def test_streamed_body_over_the_limit_is_cut_off():
    async def chunks():
        for _ in range(10):
            yield b"x" * 50

    async with await _client() as client:
        res = await client.post("/echo", content=chunks())
    assert res.status_code == status.HTTP_413_CONTENT_TOO_LARGE
