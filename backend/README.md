# Menu - E-Menu Backend API

[![FastAPI](https://img.shields.io/badge/FastAPI-0.140+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python)](https://www.python.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00?logo=sqlalchemy)](https://www.sqlalchemy.org/)
[![Tests](https://img.shields.io/badge/Tests-160%20Passed-brightgreen)](tests/)
[![Ruff](https://img.shields.io/badge/Code_Style-Ruff_0_Errors-000000)](https://github.com/astral-sh/ruff)

FastAPI backend service powering **Menu (E-Menu)** — an enterprise multi-tenant cloud SaaS platform for Cambodian restaurants, cafes, rooftop bars, and multi-branch food chains.

For the full feature breakdown, architectural diagrams, API reference matrix, and system requirements, see the [Main Project README](../README.md).

---

## Quick Start

```bash
# 1. Start local PostgreSQL & Redis containers (from project root)
docker compose up -d

# 2. Install dependencies
uv sync

# 3. Run database migrations
uv run alembic upgrade head

# 4. Start development server
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)


---

## Authentication in Production

Login returns a short-lived access token and a rotating refresh token, and the
auth endpoints are rate limited. Before going live:

- **Password reset delivery.** No email or SMS provider is integrated yet, so reset
  tokens are not delivered and users cannot finish a reset on their own. Implement
  `PasswordResetDelivery` in `app/services/password_reset_delivery.py` and return it
  from `get_password_reset_delivery`.
- **`ENVIRONMENT=production`.** Only `development` returns `debug_reset_token` in the
  reset response.
- **`RATE_LIMIT_BACKEND=redis`.** The `memory` backend counts per process.
- **`TRUSTED_PROXIES`.** Behind a load balancer or reverse proxy, list its addresses,
  or every client shares one rate limit bucket. `X-Forwarded-For` is ignored from
  any other address.

---

## Testing and Code Quality

```bash
# Run test suite (160 tests across 37 test suites)
uv run pytest -v

# Run linter and formatter checks
uv run ruff check .
uv run ruff format --check .
```
