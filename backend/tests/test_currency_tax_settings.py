from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import (
    MembershipStatus,
    OrganizationStatus,
    StaffRole,
    UserStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.services.branch_service import calculate_order_totals
from app.services.subscription_service import ensure_default_plans

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def setup_test_tenant(
    session, org_name="Finance Org", email="fin_owner@example.com"
):
    """Helper to setup user, org, business, and branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Finance Owner",
        status=UserStatus.ACTIVE,
        is_verified=True,
    )
    org = Organization(
        name=org_name,
        slug=f"slug-{uuid4().hex[:8]}",
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )
    session.add_all([user, org])
    await session.flush()

    mem = OrganizationMembership(
        organization_id=org.id,
        user_id=user.id,
        role=StaffRole.OWNER,
        status=MembershipStatus.ACTIVE,
        is_owner=True,
    )
    biz = Business(
        organization_id=org.id,
        name_en=f"{org_name} Business",
        business_type="Restaurant",
        base_currency="USD",
        exchange_rate=Decimal("4100.00"),
        tax_percentage=Decimal("0.00"),
        is_tax_inclusive=True,
        service_charge_percentage=Decimal("0.00"),
        is_service_charge_inclusive=False,
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Main Branch",
        code="MAIN",
        base_currency="USD",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    from app.services.subscription_service import provision_trial_subscription

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_business_financial_settings_defaults_and_updates():
    """
    Test updating business default base currency, exchange rate, VAT,
    and service charge.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Check initial defaults
            get_resp = await client.get(f"/api/v1/businesses/{biz.id}", headers=headers)
            assert get_resp.status_code == status.HTTP_200_OK
            data = get_resp.json()
            assert data["base_currency"] == "USD"
            assert float(data["exchange_rate"]) == 4100.00
            assert float(data["tax_percentage"]) == 0.00
            assert data["is_tax_inclusive"] is True
            assert float(data["service_charge_percentage"]) == 0.00
            assert data["is_service_charge_inclusive"] is False

            # 2. Update financial settings
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers=headers,
                json={
                    "base_currency": "KHR",
                    "exchange_rate": 4150.00,
                    "tax_percentage": 10.00,
                    "is_tax_inclusive": False,
                    "service_charge_percentage": 5.00,
                    "is_service_charge_inclusive": True,
                },
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            updated = patch_resp.json()
            assert updated["base_currency"] == "KHR"
            assert float(updated["exchange_rate"]) == 4150.00
            assert float(updated["tax_percentage"]) == 10.00
            assert updated["is_tax_inclusive"] is False
            assert float(updated["service_charge_percentage"]) == 5.00
            assert updated["is_service_charge_inclusive"] is True

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_branch_custom_exchange_rate_and_tax_overrides():
    """Test custom per-branch exchange rate, tax %, and service charge overrides."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create a 2nd branch with custom exchange rate and VAT overrides
            create_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={
                    "name_en": "Airport Branch",
                    "code": "AIRPORT-01",
                    "base_currency": "USD",
                    "exchange_rate": 4200.00,
                    "tax_percentage": 10.00,
                    "is_tax_inclusive": True,
                    "service_charge_percentage": 7.00,
                    "is_service_charge_inclusive": False,
                },
            )
            assert create_resp.status_code == status.HTTP_201_CREATED
            b2_data = create_resp.json()
            b2_id = b2_data["id"]
            assert float(b2_data["exchange_rate"]) == 4200.00
            assert float(b2_data["tax_percentage"]) == 10.00
            assert float(b2_data["service_charge_percentage"]) == 7.00

            # 2. Update branch 1 with custom exchange rate
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}",
                headers=headers,
                json={
                    "exchange_rate": 4120.00,
                    "tax_percentage": 5.00,
                },
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            b1_data = patch_resp.json()
            assert float(b1_data["exchange_rate"]) == 4120.00
            assert float(b1_data["tax_percentage"]) == 5.00

            # 3. Verify get branch
            get_b2 = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{b2_id}",
                headers=headers,
            )
            assert get_b2.status_code == status.HTTP_200_OK
            assert float(get_b2.json()["exchange_rate"]) == 4200.00

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_validation_rejects_invalid_financial_values():
    """Test validation constraints on currency, exchange rate, and tax values."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Invalid currency
            r1 = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers=headers,
                json={"base_currency": "EUR"},
            )
            assert r1.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

            # 2. Negative exchange rate
            r2 = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers=headers,
                json={"exchange_rate": -50.00},
            )
            assert r2.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

            # 3. Tax percentage > 100%
            r3 = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers=headers,
                json={"tax_percentage": 150.00},
            )
            assert r3.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

        app.dependency_overrides.clear()

    await engine.dispose()


def test_calculate_order_totals_math():
    """Test the order financial computation helper with dual-currency breakdown."""
    # Test 1: USD base with Exclusive 10% VAT and Exclusive 5% Service Charge
    # Subtotal = $100.00
    # Service Charge (5%) = $5.00
    # Tax (10% of $105.00) = $10.50
    # Grand Total = $115.50
    # Rate = 4,100 -> Grand Total in KHR = 473,550 KHR
    res1 = calculate_order_totals(
        subtotal=Decimal("100.00"),
        base_currency="USD",
        exchange_rate=Decimal("4100.00"),
        tax_percentage=Decimal("10.00"),
        is_tax_inclusive=False,
        service_charge_percentage=Decimal("5.00"),
        is_service_charge_inclusive=False,
    )
    assert res1["subtotal"] == Decimal("100.00")
    assert res1["service_charge"] == Decimal("5.00")
    assert res1["tax_amount"] == Decimal("10.50")
    assert res1["total_base"] == Decimal("115.50")
    assert res1["total_alt"] == Decimal("473550.00")

    # Test 2: USD base with Inclusive Tax (prices already include 10% VAT)
    res2 = calculate_order_totals(
        subtotal=Decimal("110.00"),
        base_currency="USD",
        exchange_rate=Decimal("4100.00"),
        tax_percentage=Decimal("10.00"),
        is_tax_inclusive=True,
        service_charge_percentage=Decimal("0.00"),
        is_service_charge_inclusive=False,
    )
    assert res2["total_base"] == Decimal("110.00")
    assert res2["tax_amount"] == Decimal("10.00")
    assert res2["total_alt"] == Decimal("451000.00")
