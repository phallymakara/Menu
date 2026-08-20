# 🍽️ មីនុយ (E-Menu Backend API)

[![FastAPI](https://img.shields.io/badge/FastAPI-0.140+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python)](https://www.python.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00?logo=sqlalchemy)](https://www.sqlalchemy.org/)
[![Tests](https://img.shields.io/badge/Tests-75%20Passed-brightgreen)](tests/)

FastAPI backend service powering **មីនុយ (E-Menu)** — a multi-tenant cloud SaaS platform for Cambodian restaurants, cafés, and food & beverage businesses.

For the full feature breakdown, architectural diagrams, and system requirements, see the [Main Project README](../README.md).

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
uv sync

# 2. Run database migrations
uv run alembic upgrade head

# 3. Start development server
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## 🧪 Testing & Code Quality

```bash
# Run test suite (75 tests)
uv run pytest -v

# Run linter & formatter checks
uv run ruff check .
uv run ruff format --check .
```
