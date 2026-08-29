# Menu - E-Menu API

[![FastAPI](https://img.shields.io/badge/FastAPI-0.140+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python)](https://www.python.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00?logo=sqlalchemy)](https://www.sqlalchemy.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![uv](https://img.shields.io/badge/uv-Fast_Package_Manager-DE5D43)](https://github.com/astral-sh/uv)
[![Tests](https://img.shields.io/badge/Tests-160%20Passed-brightgreen)](tests/)
[![Ruff](https://img.shields.io/badge/Code_Style-Ruff_0_Errors-000000)](https://github.com/astral-sh/ruff)

**Menu (E-Menu)** is an enterprise multi-tenant cloud SaaS operating system purpose-built for Cambodian restaurants, cafes, rooftop bars, and multi-branch food chains. It provides bilingual (Khmer and English) digital menus, permanent table QR code stand generation, live table session lifecycles, real-time floor map dashboards, dual currency (USD and 100-Riel rounded KHR), Bakong KHQR dynamic payment settlement, Kitchen Display System (KDS) station routing, multi-branch inventory transfers, centralized store analytics, and a Super Admin platform governance suite.

---

## Table of Contents

- [Implemented Features](#implemented-features)
  - [Phase 1: Multi-Tenant Core, RBAC and Subscriptions](#phase-1-multi-tenant-core-rbac-and-subscriptions)
  - [Phase 2: Menu Engineering and Multi-Branch Catalog](#phase-2-menu-engineering-and-multi-branch-catalog)
  - [Phase 3: Tables, Dining Areas and Dynamic QR Engine](#phase-3-tables-dining-areas-and-dynamic-qr-engine)
  - [Phase 4: Order Lifecycle, Multi-Station KDS and WebSockets](#phase-4-order-lifecycle-multi-station-kds-and-websockets)
  - [Phase 5: Dual-Currency Billing, 100-Riel Cash Engine, Bakong KHQR and Receipts](#phase-5-dual-currency-billing-100-riel-cash-engine-bakong-khqr-and-receipts)
  - [Phase 6: Multi-Branch Inventory, Transfers, Recipe Wastage and Centralized Analytics](#phase-6-multi-branch-inventory-transfers-recipe-wastage-and-centralized-analytics)
  - [Super Admin Platform Backend](#super-admin-platform-backend)
- [System Architecture](#system-architecture)
- [Project Directory Structure](#project-directory-structure)
- [API Reference Matrix](#api-reference-matrix)
- [Getting Started](#getting-started)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Installation and Dependency Sync](#2-installation-and-dependency-sync)
  - [3. Database Migrations](#3-database-migrations)
  - [4. Running the Development Server](#4-running-the-development-server)
- [Testing and Quality Assurance](#testing-and-quality-assurance)
- [License and Repository](#license-and-repository)

---

## Implemented Features

### Phase 1: Multi-Tenant Core, RBAC and Subscriptions
- **Multi-Tenant Hierarchy:** Multi-level tenant isolation: `Organization` -> `Business` (Brand) -> `Branch` (Physical Location).
- **Fast-Fail Tenant Context:** Dependency injection (`TenantContext`) ensuring automatic data isolation and preventing cross-tenant leakage.
- **Streamlined Owner Sign-Up:** Frictionless owner onboarding with smart workspace provisioning and auto-generated URL slugs.
- **Role-Based Access Control (RBAC):** Hierarchical staff roles (`OWNER`, `MANAGER`, `STAFF`, `CASHIER`, `KITCHEN`, `INVENTORY`, `MENU_EDITOR`, `REPORT_VIEWER`) with secure invitation tokens and roaming branch assignments.
- **Subscription Engine:** Tiered plans with automated trial provisioning, seat limits, and downgrade guards.
- **Dual Currency and Cambodian Financials:** Dual USD/KHR pricing with branch exchange rate overrides, VAT (e.g. 10%), and service charge calculations.
- **Structured Audit Logging:** Persistent compliance audit trail tracking administrative actions.

### Phase 2: Menu Engineering and Multi-Branch Catalog
- **Bilingual Category Trees:** Unlimited parent/child subcategories with Khmer (`name_km`) and English (`name_en`) translations.
- **Menu Items and Media Storage:** Rich item metadata (SKUs, prep times, calories, spice levels 0-5, dietary tags) and static local image uploads (`/uploads/media/`).
- **Matrix Size Variants:** Batch variant creation with price adjustments or price overrides.
- **Modifier Option Groups:** Add-on groups (e.g. "Sugar Level", "Toppings") with selection rules (`min_selections`, `max_selections`) and surcharges.
- **Combos and Set Bundles:** Set menu bundles (e.g. Main + Drink + Side) with choice constraints and surcharge calculations.
- **Branch Menu Overrides:** Central master catalog with branch-specific price overrides and instant stock availability toggles (`available`, `out_of_stock`, `hidden`).

### Phase 3: Tables, Dining Areas and Dynamic QR Engine
- **Spatial Dining Areas / Zones:** Dynamic zone management (e.g. Main Dining, Outdoor Patio, VIP Room) with custom zone service charges and minimum spends.
- **Rapid Batch Table Generator:** Generate sequential table ranges (e.g. `T-01` to `T-20`) in a single API call with capacity and shape attributes (`ROUND`, `RECTANGLE`, `BAR_SEAT`, `BOOTH`).
- **Permanent Physical Table QR Stands:** Acrylic stands printed once per table with signed cryptographic tokens to prevent URL spoofing.
- **Vector and Raster QR Rendering:** Real-time generation of table QR codes in **PNG, SVG vector, or Base64 Data URI**.
- **Batch QR ZIP Export:** 1-click batch download of all table QR codes for an entire branch or zone as a compressed ZIP file ready for print shops.
- **Live Table Session Lifecycle:** Dual activation (Guest mobile scan / Staff POS), ephemeral session tokens (`ACTIVE` -> `BILL_REQUESTED` -> `COMPLETED`), and turnover cleanup.
- **Live Floor Map Dashboard:** Real-time occupancy counters (`available`, `occupied`, `bill_requested`, `cleaning`) and active dining timers grouped by zones.
- **Table Merging and Transfers:** Seamless table-to-table transfers and party merging/unmerging for large groups.

### Phase 4: Order Lifecycle, Multi-Station KDS and WebSockets
- **Course Staging Execution:** Support for staging items across courses (`DRINKS`, `APPETIZERS`, `MAINS`, `DESSERTS`, `DIGESTIFS`) with kitchen firing controls.
- **Kitchen Display System (KDS):** Multi-station routing (Grill, Bar, Wok, Pantry, Expediter pass) with SLA countdown timers, bump-bar progression, and ticket recall drawer.
- **Supervisor PIN Voids and Waste Auditing:** Secure order cancellations and item voids requiring supervisor authorization PIN, reason codes, and waste tracking.
- **Real-Time WebSocket Hub:** Broadcast engine delivering instant updates across Guest Devices, Waiter Handhelds, Cashier POS, and Kitchen Tablets.

### Phase 5: Dual-Currency Billing, 100-Riel Cash Engine, Bakong KHQR and Receipts
- **Bill Aggregation Engine:** Multi-order aggregation, discount evaluation (percentage, fixed amount, category spend), VAT, and zone service charges.
- **Cambodian 100-Riel Cash Settlement:** Mixed multi-currency tendering (USD and KHR) with 100-Riel cash change calculations and change currency preferences.
- **Native Bakong KHQR Integration:** Dynamic scan-to-pay EMVCo-compliant QR generation with CRC16 validation (individual bills and split bills).
- **Dual-Language Thermal Receipt Engine:** Formatted ESC/POS thermal printer receipts and printable HTML receipt slips with tax breakdown and Bakong transaction stamps.

### Phase 6: Multi-Branch Inventory, Transfers, Recipe Wastage and Centralized Analytics
- **Central Master Raw Ingredients:** Ingredient units of measure (GRAM, KILOGRAM, MILLILITER, LITER, PIECE, CAN, BOTTLE, PORTION), cost tracking, and stock-level alerts.
- **Recipe BOM Depletion:** Automatic real-time inventory depletion per menu item ordered and prepared.
- **Multi-Branch Stock Transfers:** Dispatch, transit, and receipt workflows across branches with transit loss tracking.
- **Centralized Franchise Analytics:** Multi-branch sales rollup, top-selling items, payment method breakdowns, peak dining hours, and cost of goods sold (COGS).

### Super Admin Platform Backend
- **Platform Overview and SaaS Economics:** High-level platform health metrics (MRR/ARR, tenant growth rate, churn percentage, subscription plan distribution, live active dining sessions).
- **Global Organization Management:** Search/filter all tenant organizations, deep hierarchical inspection, status lifecycles (activate, suspend, archive), and subscription overrides.
- **Global User Directory and Governance:** Cross-tenant user search, multi-tenant memberships inspection, account lifecycle management, platform admin privilege toggling, and emergency password resets.
- **SaaS Subscription Plans and Feature Gates:** Dynamic creation and pricing of subscription tiers with feature flags (`max_branches`, `max_staff`, `has_kds`, `has_inventory`, `has_analytics`).
- **Platform-Wide Audit Trail:** Cross-tenant security logs query engine with entity joins and timeframe filters.

---

## System Architecture

The platform follows a **Clean Layered Architecture** with strict Single Responsibility Principle (SRP):

```text
               ┌──────────────────────────────────────────────┐
               │    Customer QR PWA / Staff POS Web Tablet    │
               └──────────────────────┬───────────────────────┘
                                      │ HTTP / REST & WebSockets
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
          ├───────────────────────────┼───────────────────────────┤
          ▼                           ▼                           ▼
┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│  Order & KDS Pass │       │ Payment & KHQR    │       │ Inventory & Admin │
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

## Project Directory Structure

```text
Menu/
├── backend/
│   ├── alembic/                      # Database migration scripts
│   │   └── versions/                 # Version-controlled schema migrations
│   ├── app/
│   │   ├── api/                      # HTTP Routers & Endpoints
│   │   │   ├── dependencies/         # Auth, TenantContext & Admin dependencies
│   │   │   └── v1/
│   │   │       ├── endpoints/        # Modular domain routers (23 endpoint modules)
│   │   │       └── router.py         # Central API v1 router registry
│   │   ├── core/                     # Config, security, exceptions, and logging
│   │   ├── db/                       # Database session factory & metadata
│   │   ├── models/                   # Declarative SQLAlchemy 2.0 ORM models
│   │   ├── schemas/                  # Pydantic V2 validation & DTO schemas
│   │   ├── services/                 # Business logic domain services
│   │   └── main.py                   # FastAPI application initialization
│   ├── tests/                        # 37 automated test suites (160 tests)
│   ├── pyproject.toml                # Dependencies and tool configurations
│   ├── uv.lock                       # Deterministic dependency lockfile
│   └── .env.example                  # Environment configuration template
├── Document/                         # Business & product specification docs
├── .gitignore                        # Git exclusion rules
└── README.md                         # Project documentation
```

---

## API Reference Matrix

| Feature Area | Method | Endpoint | Description |
|---|---|---|---|
| **Authentication** | `POST` | `/api/v1/auth/register` | Register new owner & provision initial workspace |
| | `POST` | `/api/v1/auth/login` | Authenticate & retrieve JWT access token |
| | `GET` | `/api/v1/auth/me` | Fetch authenticated user profile & memberships |
| **Organizations & Staff** | `GET` | `/api/v1/businesses` | List tenant businesses |
| | `POST` | `/api/v1/members/invite` | Invite staff member with branch & role assignment |
| | `GET` | `/api/v1/members` | Filter and list organization staff |
| **Subscriptions** | `GET` | `/api/v1/subscriptions/plans` | List active subscription plans |
| | `GET` | `/api/v1/subscriptions/current` | Get active organization subscription & usage |
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
| | `POST` | `/api/v1/public/tables/sessions/request-bill` | Request bill from guest device |
| **Orders & KDS** | `POST` | `/api/v1/businesses/{id}/branches/{id}/orders` | Submit multi-item order with course staging |
| | `GET` | `/api/v1/businesses/{id}/branches/{id}/kds/stations/{id}/tickets` | Fetch live KDS station tickets |
| | `PATCH` | `/api/v1/businesses/{id}/branches/{id}/kds/items/{id}/status` | Bump item status (QUEUED -> PREPARING -> READY) |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/orders/{id}/void` | Supervisor PIN authorized order cancellation |
| **Billing & Payments** | `GET` | `/api/v1/businesses/{id}/branches/{id}/sessions/{id}/bill` | Aggregate session bill with VAT & discounts |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/payments/cash` | Settle cash with 100-Riel change calculation |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/payments/khqr` | Generate Bakong dynamic scan-to-pay QR |
| | `GET` | `/api/v1/businesses/{id}/branches/{id}/payments/{id}/receipt` | Fetch ESC/POS thermal receipt data & HTML |
| **Inventory & Analytics** | `GET/POST` | `/api/v1/businesses/{id}/branches/{id}/inventory` | Manage stock levels & adjustments |
| | `POST` | `/api/v1/businesses/{id}/branches/{id}/inventory/transfers` | Initiate multi-branch stock transfer |
| | `GET` | `/api/v1/businesses/{id}/analytics` | Centralized multi-branch sales analytics |
| **Super Admin Platform** | `GET` | `/api/v1/admin/stats` | Platform-wide KPI & SaaS metrics dashboard |
| | `GET/PATCH`| `/api/v1/admin/organizations` | Global tenant directory & lifecycle management |
| | `GET/PATCH`| `/api/v1/admin/users` | Global user directory & account governance |
| | `GET/POST` | `/api/v1/admin/plans` | SaaS subscription plans & feature gates |
| | `GET` | `/api/v1/admin/audit-logs` | Platform-wide cross-tenant audit trail |

---

## Getting Started

### 1. Prerequisites
- **Python 3.13+**
- **Docker & Docker Compose** (for local PostgreSQL database & Redis)
- **`uv`** package manager:
  ```bash
  # Windows (PowerShell)
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

  # macOS / Linux
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

---

### 2. Local Database & Redis Setup (Docker)

Start the local PostgreSQL 16 database and Redis containers:

```bash
docker compose up -d
```

To stop the containers when finished:
```bash
docker compose down
```

---

### 3. Installation and Dependency Sync

```bash
cd backend
uv sync
```

---

### 4. Database Migrations

Configure your environment file from the template:

```bash
cp .env.example .env
```

Ensure `DATABASE_URL` in `backend/.env` points to your local Docker instance:
```env
DATABASE_URL="postgresql+asyncpg://user:password@localhost:5433/emenu_dev"
REDIS_URL="redis://localhost:6379/0"
```


Apply all Alembic database migrations:

```bash
uv run alembic upgrade head
```

---

### 5. Running the Development Server

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Interactive Swagger Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation:** [http://localhost:8000/redoc](http://localhost:8000/redoc)


---

## Testing and Quality Assurance

The codebase includes an extensive automated test suite covering multi-tenant isolation, catalog trees, pricing calculations, table sessions, QR security, KDS routing, Bakong KHQR settlement, inventory depletion, and platform administration.

```bash
# Run all unit and integration tests (160 tests across 37 test suites)
uv run pytest -v

# Run code linter and formatting checks
uv run ruff check .
uv run ruff format --check .
```

---

## License and Repository

- **Repository:** [`git@github.com:phallymakara/Menu.git`](https://github.com/phallymakara/Menu)
- **Copyright:** (C) 2026 E-Menu SaaS. All rights reserved.
