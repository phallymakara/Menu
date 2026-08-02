# មីនុយ (Menu API)

[![FastAPI](https://img.shields.io/badge/FastAPI-0.140+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python)](https://www.python.org/)
[![uv](https://img.shields.io/badge/uv-Fast_Python_Manager-DE5D43)](https://github.com/astral-sh/uv)

FastAPI backend service powering **មីនុយ (Menu)** — a multi-tenant cloud SaaS platform for Cambodian restaurants, cafés, and retail businesses.

For the comprehensive project proposal, vision, feature breakdown, and system architecture, please see the [Main Project README](../README.md).

---

## Quick Setup Instructions

### 1. Install Dependencies

Ensure `uv` is installed, then run:

```bash
uv sync
```

### 2. Environment Configuration

Create `.env` in `backend/`:

```env
APP_NAME="មីនុយ-Menu API"
ENVIRONMENT="development"
DEBUG=True

DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/menu_db"
REDIS_URL="redis://localhost:6379/0"

SECRET_KEY="your-secret-key"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### 3. Run Migrations & Server

```bash
# Run database migrations
uv run alembic upgrade head

# Start development server
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Access API docs at:
- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## Testing & Code Quality

```bash
# Run tests
uv run pytest

# Code linting & formatting
uv run ruff check .
uv run ruff format .

# Type checking
uv run pyright
```
