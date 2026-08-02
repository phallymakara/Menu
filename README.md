# មីនុយ - Menu (Multi-Tenant SaaS Platform)

**មីនុយ (Menu)** is a multi-tenant Software-as-a-Service (SaaS) cloud operating platform designed for Cambodian restaurants, cafés, drink shops, bakeries. It empowers business owners with bilingual (Khmer & English) ordering, sales, cash & KHQR payments, kitchen display workflows, multi-branch management, and real-time operational analytics without requiring custom server maintenance.

---

## Table of Contents

- [System & Multi-Tenant Architecture](#-system--multi-tenant-architecture)
- [Technology Stack](#-technology-stack)
- [Project Setup & Installation](#-project-setup--installation)
  - [1. Clone Repository](#1-clone-repository)
  - [2. Prerequisites](#2-prerequisites)
  - [3. Backend Setup](#3-backend-setup)
  - [4. Environment Variables](#4-environment-variables)
  - [5. Database Migrations](#5-database-migrations)
  - [6. Running the Development Server](#6-running-the-development-server)
- [API Documentation](#-api-documentation)
- [Development & Quality Assurance](#-development--quality-assurance)
- [Project Structure](#-project-structure)

---

## System & Multi-Tenant Architecture

The platform follows a modular monolith architecture designed for horizontal scalability and strict multi-tenant isolation:

```text
[ Customer QR PWA / Staff Web POS / Admin Portal ]
                         │
                         ▼ (REST API / WebSockets)
             ┌──────────────────────┐
             │   FastAPI Gateway    │
             └──────────┬───────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│ Business Logic  │           │ Tenant Context  │
│   Services      │           │ & Auth Middleware│
└────────┬────────┘           └────────┬────────┘
         │                             │
         ├─────────────────────────────┤
         ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│ PostgreSQL DB    │          │  Redis Cache &   │
│ (Tenant RLS Isolation)     │  Pub/Sub Events  │
└──────────────────┘          └──────────────────┘
```

---

## Technology Stack

### Backend API
- **Framework:** [FastAPI 0.140+](https://fastapi.tiangolo.com/)
- **Runtime:** Python 3.13+
- **Package Manager:** [`uv`](https://github.com/astral-sh/uv)
- **Database ORM:** [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (Async) & [Alembic](https://alembic.sqlalchemy.org/) (Migrations)
- **Database Driver:** `asyncpg` & `psycopg3`
- **Cache & Event Bus:** [Redis 8.1+](https://redis.io/)
- **Security & Tokens:** `pwdlib`, `python-jose`, `email-validator`
- **Testing & Quality:** `pytest`, `ruff` (Linter & Formatter), `pyright` (Type Checker)

### Frontend *(Planned/In Progress)*
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **State & Data Fetching:** TanStack Query, React Router
- **Internationalization:** Khmer & English (i18n)

---

## Project Setup & Installation

### 1. Clone Repository

Using SSH:
```bash
git clone git@github.com:phallymakara/Menu.git
cd Menu
```

Or using HTTPS:
```bash
git clone https://github.com/phallymakara/Menu.git
cd Menu
```

---

### 2. Prerequisites

Ensure the following tools are installed on your environment:

- **Python 3.13+**
- **`uv`** (Astral's fast Python package manager):
  ```bash
  # Install uv on macOS / Linux
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **PostgreSQL 16+** server
- **Redis 7+** server

---

### 3. Backend Setup

Navigate to the `backend/` directory:

```bash
cd backend
```

Install all core and development dependencies using `uv`:

```bash
uv sync
```

*(Alternative using standard `pip`)*:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

---

### 4. Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Application Settings
APP_NAME="មីនុយ-Menu API"
ENVIRONMENT="development"
DEBUG=True

# Database Credentials
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/menu_db"

# Redis Cache
REDIS_URL="redis://localhost:6379/0"

# Security & JWT
SECRET_KEY="replace-this-with-a-secure-random-secret-key"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

---

### 5. Database Migrations

Apply existing Alembic database migrations:

```bash
uv run alembic upgrade head
```

---

### 6. Running the Development Server

Start the FastAPI application with auto-reload:

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The application server will run at: **`http://127.0.0.1:8000`**

---

## API Documentation

FastAPI automatically generates interactive OpenAPI documentation when the server is running:

- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

### Core Base Endpoints:
- `GET /` - Root status API (`{"name": "មីនុយ-Menu API", "status": "running"}`)
- `GET /api/v1/health` - System health check (`{"status": "healthy"}`)

---

## Development & Quality Assurance

### Run Test Suite
```bash
uv run pytest
```

### Code Formatting & Linting
```bash
# Lint checks
uv run ruff check .

# Auto-fix linting issues
uv run ruff check . --fix

# Format code
uv run ruff format .
```

### Static Type Verification
```bash
uv run pyright
```

---

## Project Structure

```text
Menu/
├── Document/
│   └── Project_Proposal.docx     # Full SaaS Platform Proposal Document
├── README.md                      # Primary Project Documentation
└── backend/
    ├── README.md                  # Backend Quick Reference
    ├── .python-version            # Target Python version (3.13)
    ├── pyproject.toml             # Project metadata & dependency list
    ├── uv.lock                    # Dependency lockfile
    ├── app/
    │   ├── main.py                # FastAPI entry point
    │   ├── api/                   # API v1 routes & endpoints
    │   ├── core/                  # Configurations, security & settings
    │   └── db/                    # Database sessions & models
    └── tests/                     # Unit and integration test suite
```

---

## License & Repository

- **Repository:** [`git@github.com:phallymakara/Menu.git`](git@github.com:phallymakara/Menu.git)
- **Ownership:** Proprietary & Confidential - All Rights Reserved.
