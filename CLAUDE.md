# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Menu (E-Menu) is a multi-tenant restaurant SaaS for Cambodia. It has bilingual Khmer/English menus, QR table ordering, POS, KDS, dual-currency USD/KHR billing with Bakong KHQR payments, inventory, analytics, and a Super Admin area. It is a monorepo:

- `backend/` is FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL + Alembic. It runs on Python 3.13 and is managed with `uv`.
- `frontend/` is React 18 + Vite + TypeScript + Tailwind, using TanStack Query, Zustand and openapi-fetch.
- `docker-compose.yml` runs Postgres 16 (host port **5433**) and Redis 7 (6379) for local development.
- `Document/` holds the product specs and proposal. They are not code.

## Commands

Run the backend commands from `backend/`:

```bash
docker compose up -d                  # from repo root: Postgres + Redis
uv sync
cp .env.example .env                  # DATABASE_URL uses localhost:5433
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

uv run pytest -v                                        # full suite
uv run pytest tests/test_order_placement.py -v          # one file
uv run pytest tests/test_order_placement.py::test_name  # one test
uv run ruff check . && uv run ruff format --check .
uv run pyright

uv run alembic revision --autogenerate -m "message"     # then review the generated file
```

Run the frontend commands from `frontend/`:

```bash
npm run dev          # Vite on :3000, proxies /api, /uploads, /ws to VITE_BACKEND_URL (default http://127.0.0.1:8000)
npm run build        # tsc type-check + vite build (the only static check; no lint/test scripts)
npm run sync:api     # dump backend OpenAPI -> frontend/openapi.json, then regenerate src/types/api.ts
```

## Backend architecture

The backend has three layers. Keep business logic out of routes.

- `app/api/v1/endpoints/*.py` holds thin routers. Each router declares its own `prefix` (for example `/businesses/{business_id}/categories`) and is registered in `app/api/v1/router.py` under `/api/v1`. A new router must be added there. Routers call service functions and translate domain exceptions from `app/core/exceptions.py` (such as `TenantNotFoundError`, `ResourceConflictError`, `PermissionDeniedError` and `EntitlementLimitExceededError`) into `HTTPException`s.
- `app/services/*_service.py` holds module-level async functions that take `session`, `tenant` and a payload. All queries, business rules, audit logging (`audit_service`), WebSocket broadcasts and Telegram notifications live here.
- `app/models/` holds the SQLAlchemy models. They use `Base`, `UUIDPrimaryKeyMixin` and `TimestampMixin` from `app/db/base.py`, which also sets a constraint naming convention. A new model must be exported from `app/models/__init__.py` and imported in `app/db/models.py`, or Alembic autogenerate will not see it. Enums live in `app/models/enums.py`. Postgres enum migrations must explicitly create, cast and drop the types.
- `app/schemas/` holds the Pydantic v2 request and response DTOs.

**Tenancy.** The hierarchy is Organization → Business (brand) → Branch (location). Authenticated tenant routes depend on `get_current_tenant_context` (`app/api/dependencies/tenant.py`). It resolves a `TenantContext(user, organization, membership)` from the JWT and the optional `X-Organization-Id` header, and requires both the membership and the organization to be ACTIVE. Services must scope every query to `tenant.organization_id` and verify that the business and branch IDs in the path belong to it. Super Admin routes (`admin_*` endpoints) use `app/api/dependencies/admin.py` instead. Guest QR ordering goes through the unauthenticated `public_tables` endpoints using signed table tokens and session tokens.

**Real-time.** `app/core/ws_manager.py` keeps a room registry of the WebSocket connections on the current process. The routes are in `endpoints/websockets.py` (prefix `/ws`), which is mounted both at the root and under `/api/v1`. The rooms are:
- `branch:{id}:pos`
- `branch:{id}:expo`
- `branch:{id}:station:{station_id}`
- `session:{table_session_id}` for guests

Services call `ws_manager.broadcast_to_rooms(...)` after they commit. The manager serializes the event once and hands it to a pluggable broadcaster from `app/core/ws_broadcaster.py`, chosen by `REALTIME_BACKEND`:
- `memory` is the default for development and tests. It sends straight to this process's sockets, so it only works with a single process.
- `redis` publishes one JSON envelope, `{"rooms": [...], "message": "<event JSON>"}`, to the pub/sub channel `emenu:{ENVIRONMENT}:realtime` on `REDIS_URL`. Each process runs one subscriber task, started and cancelled by the FastAPI lifespan in `app/main.py`. It fans received messages out to its own sockets in those rooms and reconnects with capped backoff. If a publish fails, the event still reaches this process's sockets. Production with more than one worker or instance must use `redis`.

Local sends run concurrently with a 2 s timeout per socket. A dead or slow socket is removed from its rooms and closed, so it never delays the others. Never log message payloads.

**Config and logging.** `app/core/config.py` holds the pydantic-settings configuration, loaded from `.env`. Alembic uses `settings.sync_database_url` (psycopg), while the app uses asyncpg. Logging is structlog via `app/core/logging.py` with request-tracking middleware. Get loggers with `structlog.get_logger("app.<module path>")`. Uploaded media is served as static files from `backend/uploads/` at `/uploads`.

**Tests.** There is no `conftest.py`, and the tests do not need Postgres or Docker. Each test file builds its own in-memory `sqlite+aiosqlite` engine, runs `Base.metadata.create_all`, and seeds data in a fixture. It then sets `app.dependency_overrides[get_db_session]` and calls the app through `httpx.AsyncClient(transport=ASGITransport(app))` with tokens from `create_access_token`. Tests are marked `@pytest.mark.anyio`, with an `anyio_backend` fixture returning `"asyncio"`. Clear `app.dependency_overrides` in teardown. New code must stay SQLite-compatible for tests while targeting Postgres.

## Frontend architecture

- The code is organized by feature under `src/features/<feature>/`: `admin`, `pos`, `kds`, `guest`, `onboarding`, `auth`, `landing` and `service-hub`. Each feature has its own `components/`, `hooks/`, `stores/` and `types/`. Shared UI lives in `src/components/` and routes in `src/router/index.tsx`. Staff routes are `/admin/*`, `/pos` and `/kds`. Guest QR routes are `/t/:qr_token` and `/order/:branch_id`.
- **API layer (partly migrated).** The target pattern is TanStack Query hooks (`features/*/hooks/use*Queries.ts`) that call `apiFetch` from `src/lib/api-client.ts`. `apiFetch` is openapi-fetch typed against the generated `src/types/api.ts`, and schema types come from `components['schemas'][...]`. Some older code still uses the axios instance in `src/lib/api.ts`, which has a `/api/v1` baseURL. Both clients attach `Authorization: Bearer` from `localStorage.emenu_access_token` and the tenant header from `emenu_tenant_id`/`emenu_organization_id`. Both redirect staff routes to `/?auth=login` on a 401. Prefer `apiFetch` + query hooks for new work, and run `npm run sync:api` after backend schema changes. Do not hand-edit `src/types/api.ts`.
- **Real-time.** The `useWebSocket` hook (`src/lib/websocket.ts`) auto-reconnects. Pages such as POS, KDS and Guest react to messages by calling `queryClient.invalidateQueries` on the relevant query keys (for example `['kds', 'tickets', bizId, branchId]` or `['tables', ...]`) rather than patching state by hand.
- Zustand stores hold client-only state: auth, theme, language, cart, guest session, POS and KDS UI. Server state belongs in TanStack Query (`src/lib/query-client.ts`).
- **i18n.** Translations live in `src/locales/en.ts` and `km.ts`, and components read them through `getTranslation(lang, key)` using the language store. Any user-facing string needs both an English and a Khmer entry.
- The path alias is `@/` → `src/`.

## Domain conventions

- Money is `Decimal` in the backend. KHR is derived from USD using the business or branch `exchange_rate`, and cash KHR amounts round to 100 riel. Tax and service charge each have an "inclusive" flag.
- Bilingual fields use `name_en` / `name_km`.
- Do not use emojis in code, comments, logs, API responses or docs. This comes from the team's backend rules in `.agents/rules/`. That folder also asks for docstrings on public functions, keeping Ruff and Pyright clean, and never logging secrets, tokens, emails or phone numbers.
