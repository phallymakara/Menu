"""Shared test configuration.

Each test module builds its own engine from its module-level ``TEST_DATABASE_URL``,
an in-memory SQLite database by default. Setting the ``TEST_DATABASE_URL`` environment
variable to a PostgreSQL URL runs the same suite against PostgreSQL instead:

- every test starts with an empty ``public`` schema, and
- engines use ``NullPool``, so a connection is never shared between the event loops
  that the WebSocket tests (Starlette ``TestClient``) and pytest each run.

Use a dedicated database for this; its ``public`` schema is dropped before each test.
"""

import functools
import os

import psycopg
import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

_TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
_USE_POSTGRES = _TEST_DATABASE_URL.startswith("postgresql")


def _reset_postgres_schema() -> None:
    """Drops and recreates the ``public`` schema of the test database."""
    url = make_url(_TEST_DATABASE_URL)
    with psycopg.connect(
        host=url.host,
        port=url.port,
        user=url.username,
        password=url.password,
        dbname=url.database,
        autocommit=True,
    ) as conn:
        conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND pid <> pg_backend_pid()"
        )
        conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        conn.execute("CREATE SCHEMA public")


@pytest.fixture(autouse=True)
def _postgres_test_database(request: pytest.FixtureRequest, monkeypatch):
    """Points the current test module at PostgreSQL when TEST_DATABASE_URL is set."""
    if not _USE_POSTGRES:
        yield
        return

    module = request.module
    if hasattr(module, "TEST_DATABASE_URL"):
        monkeypatch.setattr(module, "TEST_DATABASE_URL", _TEST_DATABASE_URL)
    if hasattr(module, "create_async_engine"):
        monkeypatch.setattr(
            module,
            "create_async_engine",
            functools.partial(create_async_engine, poolclass=NullPool),
        )
    _reset_postgres_schema()
    yield
