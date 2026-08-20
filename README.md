# 🍽️ មីនុយ - E-Menu API

[![FastAPI](https://img.shields.io/badge/FastAPI-0.140+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python)](https://www.python.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00?logo=sqlalchemy)](https://www.sqlalchemy.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![uv](https://img.shields.io/badge/uv-Fast_Package_Manager-DE5D43)](https://github.com/astral-sh/uv)
[![Tests](https://img.shields.io/badge/Tests-75%20Passed-brightgreen)](tests/)
[![Ruff](https://img.shields.io/badge/Code_Style-Ruff_0_Errors-000000)](https://github.com/astral-sh/ruff)

**មីនុយ (E-Menu)** is an enterprise multi-tenant cloud SaaS operating system purpose-built for Cambodian restaurants, cafés, rooftop bars, and multi-branch food chains. It provides bilingual (Khmer 🇰🇭 & English 🇬🇧) digital menus, permanent table QR code stand generation, live table session lifecycles, real-time floor map dashboards, dual currency (USD & KHR), and tiered subscription management.

---

## 📑 Table of Contents

- [Implemented Features (Phases 1 — 3)](#-implemented-features-phases-1--3)
  - [🏢 Phase 1: Multi-Tenant Core, RBAC & Subscriptions](#-phase-1-multi-tenant-core-rbac--subscriptions)
  - [🍽️ Phase 2: Menu Engineering & Multi-Branch Catalog](#-phase-2-menu-engineering--multi-branch-catalog)
  - [🪑 Phase 3: Tables, Dining Areas & Dynamic QR Engine](#-phase-3-tables-dining-areas--dynamic-qr-engine)
- [System Architecture](#-system-architecture)
- [Project Directory Structure](#-project-directory-structure)
- [API Reference Matrix](#-api-reference-matrix)
- [Getting Started](#-getting-started)
  - [Prerequisites](#1-prerequisites)
  - [Installation & Dependency Sync](#2-installation--dependency-sync)
  - [Database Migrations](#3-database-migrations)
  - [Running the Development Server](#4-running-the-development-server)
- [Testing & Quality Assurance](#-testing--quality-assurance)

---

## 🚀 Implemented Features (Phases 1 — 3)

### 🏢 Phase 1: Multi-Tenant Core, RBAC & Subscriptions
- **Multi-Tenant Hierarchy:** Multi-level tenant isolation: `Organization` ➔ `Business` (Brand) ➔ `Branch` (Physical Location).
- **Fast-Fail Tenant Context:** Dependency injection (`TenantContext`) ensuring automatic data isolation and preventing cross-tenant leakage.
- **Streamlined Owner Sign-Up:** Frictionless owner onboarding with smart workspace provisioning and auto-generated URL slugs.
- **Role-Based Access Control (RBAC):** Hierarchical staff roles (`OWNER`, `MANAGER`, `STAFF`, `CASHIER`, `KITCHEN`) with secure invitation tokens.
- **Subscription Engine:** Tiered plans (`Starter`, `Standard`, `Growth`) with automated 30-day trial provisioning, seat limits, and downgrade guards.
- **Dual Currency & Cambodian Financials:** Dual USD/KHR pricing with branch exchange rate overrides, VAT (e.g. 10%), and service charge calculations.
- **Structured Audit Logging:** Persistent compliance audit trail tracking administrative actions and party movements.

### 🍽️ Phase 2: Menu Engineering & Multi-Branch Catalog
- **Bilingual Category Trees:** Unlimited parent/child subcategories with Khmer (`name_km`) and English (`name_en`) translations.
- **Menu Items & Media Storage:** Rich item metadata (SKUs, prep times, calories, spice levels 0–5, dietary tags) and static local image uploads (`/uploads/media/`).
- **Matrix Size Variants:** Batch variant creation with price adjustments or price overrides.
- **Modifier Option Groups:** Add-on groups (e.g. *"Sugar Level"*, *"Toppings"*) with selection rules (`min_selections`, `max_selections`) and surcharges.
- **Combos & Set Bundles:** Set menu bundles (e.g. *Main + Drink + Side*) with choice constraints and surcharge calculations.
- **Branch Menu Overrides:** Central master catalog with branch-specific price overrides and instant stock availability toggles (`available`, `out_of_stock`, `hidden`).

### 🪑 Phase 3: Tables, Dining Areas & Dynamic QR Engine
- **Spatial Dining Areas / Zones:** Dynamic zone management (e.g. *Main Dining*, *Outdoor Patio*, *VIP Room*) with custom zone service charges and minimum spends.
- **Rapid Batch Table Generator:** Generate sequential table ranges (e.g. `T-01` to `T-20`) in a single API call with capacity and shape attributes (`ROUND`, `RECTANGLE`, `BAR_SEAT`, `BOOTH`).
- **Permanent Physical Table QR Stands:** Acrylic stands printed once per table with signed cryptographic tokens to prevent URL spoofing.
- **Vector & Raster QR Rendering:** Real-time generation of table QR codes in **PNG, SVG vector, or Base64 Data URI**.
- **Batch QR ZIP Export:** 1-click batch download of all table QR codes for an entire branch or zone as a compressed ZIP file ready for print shops.
- **Live Table Session Lifecycle:** Dual activation (Guest mobile scan / Staff POS), ephemeral session tokens (`ACTIVE` ➔ `BILL_REQUESTED` ➔ `COMPLETED`), and turnover cleanup.
- **Live Floor Map Dashboard:** Real-time occupancy counters (`available`, `occupied`, `bill_requested`, `cleaning`) and active dining timers grouped by zones.
- **Table Merging & Transfers:** Seamless table-to-table transfers and party merging/unmerging for large groups.

---

## 🏛️ System Architecture

The platform follows a **Clean Layered Architecture** with strict Single Responsibility Principle (SRP):

```text
               ┌──────────────────────────────────────────────┐
               │    Customer QR PWA / Staff POS Web Tablet    │
               └──────────────────────┬───────────────────────┘
                                      │ HTTP / REST
                                      ▼
               ┌──────────────────────────────────────────────┐
               │         FastAPI Application Gateway          │
               │   (Tenant Middleware + JWT RBAC Security)    │
               └──────────────────────┬───────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│  Auth & Tenant    │       │ Catalog & Menu    │       │ Floor & Live QR   │
│     Services      │       │     Services      │       │     Services      │
└─────────┬─────────┘       └─────────┬─────────┘       └─────────┬─────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │
                                      ▼
               ┌──────────────────────────────────────────────┐
               │     PostgreSQL Database (Asyncpg / Psycopg)  │
               │        (Alembic Relational Migrations)       │
               └──────────────────────────────────────────────┘
```

---

## 📁 Project Directory Structure

```text
Menu/
├── backend/
│   ├── alembic/                      # Database migration scripts (17 revisions)
│   │   └── versions/                 # Version-controlled schema migrations
│   ├── app/
│   │   ├── api/                      # HTTP Routers & Endpoints
│   │   │   ├── dependencies/         # Auth & TenantContext dependency injection
│   │   │   └── v1/
│   │   │       ├── endpoints/        # Modular domain routers (18 endpoints)
│   │   │       └── router.py         # Central API v1 router registry
│   │   ├── core/                     # Config, security, exceptions, and logging
│   │   ├── db/                       # Database session factory & metadata
│   │   ├── models/                   # Declarative SQLAlchemy 2.0 ORM models
│   │   ├── schemas/                  # Pydantic V2 validation & DTO schemas
│   │   ├── services/                 # Business logic domain services
│   │   └── main.py                   # FastAPI application initialization
│   ├── tests/                        # 17 automated test suites (75 tests)
│   ├── pyproject.toml                # Dependencies and tool configurations
│   ├── uv.lock                       # Deterministic dependency lockfile
│   └── .env.example                  # Environment configuration template
├── Document/                         # Business & product specification docs
├── .gitignore                        # Git exclusion rules
└── README.md                         # Project documentation
```

---

## 🔌 API Reference Matrix

| Feature Area | Method | Endpoint | Description |
|---|---|---|---|
| **Authentication** | `POST` | `/api/v1/auth/register` | Register new owner & provision initial workspace |
| | `POST` | `/api/v1/auth/login` | Authenticate & retrieve JWT access token |
| | `GET` | `/api/v1/auth/me` | Fetch authenticated user profile & memberships |
| **Organizations & Staff**| `GET` | `/api/v1/businesses` | List tenant businesses |
| | `POST` | `/api/v1/members/invite` | Invite staff member with branch & role assignment |
| | `GET` | `/api/v1/members` | Filter and list organization staff |
| **Subscriptions** | `GET` | `/api/v1/subscriptions/plans` | List active subscription plans |
| | `GET` | `/api/v1/subscriptions/current`| Get active organization subscription & usage |
| **Catalog & Menus** | `GET/POST` | `/api/v1/businesses/{id}/categories` | Manage bilingual category tree |
| | `GET/POST` | `/api/v1/businesses/{id}/menu-items` | Manage bilingual menu items & attributes |
| | `POST` | `/api/v1/businesses/{id}/menu-items/{id}/variants/batch` | Batch create item size variants |
| | `POST` | `/api/v1/businesses/{id}/modifier-groups` | Create modifier options & selection rules |
| | `POST` | `/api/v1/businesses/{id}/combos` | Create set menu combo bundles |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/menu/overrides` | Set branch pricing & stock availability |
| | `POST` | `/api/v1/media/upload` | Upload item images with size & MIME validation |
| **Floor & Tables** | `GET/POST` | `/api/v1/businesses/{id}/branches/{id}/dining-areas` | Manage spatial dining zones & rules |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/tables/batch` | Rapid batch table generator |
| | `GET` | `/api/v1/businesses/{id}/branches/{id}/tables/qr/batch` | Download all table QRs as ZIP archive |
| | `GET` | `/api/v1/businesses/{id}/branches/{id}/tables/{id}/qr` | Render single table QR (PNG/SVG) |
| | `GET` | `/api/v1/businesses/{id}/branches/{id}/tables-dashboard` | Real-time floor overview & occupancy counters |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/tables/{id}/transfer` | Transfer party and orders to new table |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/tables/{id}/merge` | Merge multiple tables for large parties |
| **Public Guest Ordering** | `GET` | `/api/v1/public/tables/verify` | Verify scanned table QR & get branch menu |
| | `POST` | `/api/v1/public/tables/sessions/open` | Open guest self-ordering table session |
| | `POST` | `/api/v1/public/tables/sessions/request-bill`| Request bill from guest device |

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Python 3.13+**
- **`uv`** package manager:
  ```bash
  # Windows (PowerShell)
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

  # macOS / Linux
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

---

### 2. Installation & Dependency Sync

```bash
cd backend
uv sync
```

---

### 3. Database Migrations

Copy the `.env.example` file and configure your database credentials:

```bash
cp .env.example .env
```

Apply all 17 Alembic database migrations:

```bash
uv run alembic upgrade head
```

---

### 4. Running the Development Server

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Interactive Swagger Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🧪 Testing & Quality Assurance

The codebase includes an extensive automated test suite covering multi-tenant isolation, catalog trees, pricing calculations, table sessions, and QR security.

```bash
# Run all unit and integration tests
uv run pytest -v

# Run code linter and formatting checks
uv run ruff check .
uv run ruff format --check .
```

---

## 📄 License & Repository

- **Repository:** [`git@github.com:phallymakara/Menu.git`](https://github.com/phallymakara/Menu)
- **Copyright:** © 2026 E-Menu SaaS. All rights reserved.
