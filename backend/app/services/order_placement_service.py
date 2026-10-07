import secrets
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    PermissionDeniedError,
    TenantInactiveError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.core.ws_manager import ws_manager
from app.models.branch import Branch
from app.models.branch_menu import BranchItemOverride
from app.models.business import Business
from app.models.enums import (
    CourseStage,
    ItemAvailabilityStatus,
    OrderItemStatus,
    OrderSource,
    OrderStatus,
    OrderType,
    OrganizationStatus,
    TableSessionStatus,
    TableStatus,
)
from app.models.menu_item import MenuItem
from app.models.modifier import MenuItemModifierGroup, ModifierGroup
from app.models.order import Order, OrderItem, OrderItemModifier
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession, generate_session_token
from app.schemas.order import (
    GuestOrderPlacementRequest,
    OrderItemCreate,
    OrderResponse,
    StaffOrderPlacementRequest,
    TableSessionOrdersSummaryResponse,
)
from app.services.tenancy import get_branch_for_tenant

logger = structlog.get_logger("app.services.order_placement_service")


def _generate_order_number() -> str:
    """Generates a concise, daily human-readable order number e.g. '#A102'."""
    prefix = secrets.choice(["A", "B", "C", "D", "E"])
    num = secrets.randbelow(900) + 100
    return f"#{prefix}{num}"


async def _resolve_financial_settings(
    session: AsyncSession,
    branch: Branch,
) -> tuple[Decimal, Decimal, Decimal]:
    """
    Resolves tax percentage, service charge percentage, and USD-to-KHR exchange rate.
    Uses branch-level overrides if defined, falling back to business settings.
    """
    business_result = await session.execute(
        select(Business).where(Business.id == branch.business_id)
    )
    business = business_result.scalar_one_or_none()
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent business not found.",
        )

    # Tax percentage
    if branch.tax_percentage is not None:
        tax_pct = branch.tax_percentage
    elif business.tax_percentage is not None:
        tax_pct = business.tax_percentage
    else:
        tax_pct = Decimal("0.00")

    # Service charge percentage
    if branch.service_charge_percentage is not None:
        sc_pct = branch.service_charge_percentage
    elif business.service_charge_percentage is not None:
        sc_pct = business.service_charge_percentage
    else:
        sc_pct = Decimal("0.00")

    # Exchange rate
    if branch.exchange_rate is not None and branch.exchange_rate > 0:
        usd_to_khr = branch.exchange_rate
    elif business.exchange_rate is not None and business.exchange_rate > 0:
        usd_to_khr = business.exchange_rate
    else:
        usd_to_khr = Decimal("4100.00")

    return tax_pct, sc_pct, usd_to_khr


async def _validate_and_build_order_items(
    session: AsyncSession,
    branch: Branch,
    items_payload: list[OrderItemCreate],
) -> tuple[list[OrderItem], Decimal]:
    """
    Validates dish availability, stock overrides, size variants, and modifier groups.
    Computes exact line-item math and builds OrderItem + OrderItemModifier models.

    Menu items are scoped to the branch's organization and business, and must be
    either master items (no branch) or local items of this branch. An unknown
    item, or one owned by another tenant or another branch, is rejected as not
    found.
    """
    built_items: list[OrderItem] = []
    order_subtotal_usd = Decimal("0.00")

    now_utc = datetime.now(timezone.utc)
    has_starters = any(i.course_stage == CourseStage.STARTERS for i in items_payload)

    # Collect menu item IDs
    item_ids = [item.menu_item_id for item in items_payload]
    menu_items_res = await session.execute(
        select(MenuItem)
        .options(
            selectinload(MenuItem.category),
            selectinload(MenuItem.variants),
            selectinload(MenuItem.modifier_group_links)
            .selectinload(MenuItemModifierGroup.group)
            .selectinload(ModifierGroup.options),
        )
        .where(
            MenuItem.id.in_(item_ids),
            MenuItem.organization_id == branch.organization_id,
            MenuItem.business_id == branch.business_id,
            or_(MenuItem.branch_id.is_(None), MenuItem.branch_id == branch.id),
        )
    )
    menu_items_map = {m.id: m for m in menu_items_res.scalars().all()}

    # Check branch stock overrides
    overrides_res = await session.execute(
        select(BranchItemOverride).where(
            BranchItemOverride.organization_id == branch.organization_id,
            BranchItemOverride.branch_id == branch.id,
            BranchItemOverride.menu_item_id.in_(item_ids),
        )
    )
    overrides_map = {o.menu_item_id: o for o in overrides_res.scalars().all()}

    for item_input in items_payload:
        menu_item = menu_items_map.get(item_input.menu_item_id)
        if menu_item is None:
            logger.warning(
                "Order rejected: menu item not available to this branch",
                menu_item_id=str(item_input.menu_item_id),
                branch_id=str(branch.id),
                organization_id=str(branch.organization_id),
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Menu item '{item_input.menu_item_id}' not found.",
            )

        if not menu_item.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Menu item '{menu_item.name_en}' is currently inactive.",
            )

        # Check stock override
        override = overrides_map.get(menu_item.id)
        if override is not None:
            if override.availability_status in (
                ItemAvailabilityStatus.TEMPORARILY_OUT_OF_STOCK,
                ItemAvailabilityStatus.TEMPORARILY_OUT_OF_STOCK.value,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item '{menu_item.name_en}' is temporarily out of stock.",
                )
            if override.availability_status in (
                ItemAvailabilityStatus.HIDDEN,
                ItemAvailabilityStatus.HIDDEN.value,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item '{menu_item.name_en}' is hidden at this branch.",
                )

        # Base price (consider branch price override if present)
        base_price = (
            override.price_override
            if (override and override.price_override is not None)
            else menu_item.base_price
        )

        # Variant validation & price adjustment
        variant_name_en: str | None = None
        variant_name_km: str | None = None
        variant_adjustment = Decimal("0.00")

        if item_input.item_variant_id is not None:
            variant = next(
                (
                    v
                    for v in menu_item.variants
                    if v.id == item_input.item_variant_id and v.is_active
                ),
                None,
            )
            if variant is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid variant for item '{menu_item.name_en}'.",
                )
            variant_name_en = variant.name_en
            variant_name_km = variant.name_km
            variant_adjustment = variant.price_adjustment

        # Modifier validation & constraints
        selected_mod_ids = {
            m.modifier_option_id: m.quantity for m in item_input.modifiers
        }
        built_modifiers: list[OrderItemModifier] = []
        modifiers_total_extra = Decimal("0.00")

        # Map available modifier groups for this item
        for item_mod_group in menu_item.modifier_group_links:
            group = item_mod_group.group
            if not group.is_active:
                continue

            group_option_ids = {opt.id: opt for opt in group.options if opt.is_active}
            chosen_in_group = [
                (opt_id, qty)
                for opt_id, qty in selected_mod_ids.items()
                if opt_id in group_option_ids
            ]
            total_chosen_count = sum(qty for _, qty in chosen_in_group)

            # Check min selections constraint
            if group.min_selections > 0 and total_chosen_count < group.min_selections:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Option group '{group.name_en}' on '{menu_item.name_en}' "
                        f"requires at least {group.min_selections} selection(s)."
                    ),
                )

            # Check max selections constraint
            if group.max_selections > 0 and total_chosen_count > group.max_selections:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Option group '{group.name_en}' on '{menu_item.name_en}' "
                        f"allows at most {group.max_selections} selection(s)."
                    ),
                )

            # Build modifiers
            for opt_id, qty in chosen_in_group:
                opt = group_option_ids[opt_id]
                extra = opt.price * qty
                modifiers_total_extra += extra
                built_modifiers.append(
                    OrderItemModifier(
                        modifier_option_id=opt.id,
                        name_en=opt.name_en,
                        name_km=opt.name_km,
                        unit_price=opt.price,
                        quantity=qty,
                    )
                )

        # Calculate unit price and subtotal
        unit_price = base_price + variant_adjustment + modifiers_total_extra
        subtotal_price = unit_price * item_input.quantity
        order_subtotal_usd += subtotal_price

        # Resolve kitchen station (Item station -> Category station -> None)
        target_station_id = menu_item.kitchen_station_id
        if target_station_id is None and menu_item.category:
            target_station_id = menu_item.category.kitchen_station_id

        # Course Hold / Fire Status
        if (
            item_input.course_stage in (CourseStage.MAINS, CourseStage.DESSERTS)
            and has_starters
        ):
            initial_status = OrderItemStatus.HELD
            item_fired_at = None
        else:
            initial_status = OrderItemStatus.PENDING
            item_fired_at = now_utc

        order_item = OrderItem(
            menu_item_id=menu_item.id,
            item_variant_id=item_input.item_variant_id,
            kitchen_station_id=target_station_id,
            item_name_en=menu_item.name_en,
            item_name_km=menu_item.name_km,
            variant_name_en=variant_name_en,
            variant_name_km=variant_name_km,
            base_unit_price=base_price,
            unit_price=unit_price,
            quantity=item_input.quantity,
            subtotal_price=subtotal_price,
            course_stage=item_input.course_stage,
            special_instructions=item_input.special_instructions,
            status=initial_status,
            fired_at=item_fired_at,
            modifiers=built_modifiers,
        )
        built_items.append(order_item)

    return built_items, order_subtotal_usd


def _guest_token_matches(provided: str, expected: str | None) -> bool:
    """Compares a guest-supplied token with a stored token in constant time."""
    if not expected:
        return False
    return secrets.compare_digest(provided.encode(), expected.encode())


async def _resolve_guest_ordering_context(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    token: str,
) -> tuple[RestaurantTable, Branch, TableSession | None]:
    """
    Resolves and authorizes the table a guest is ordering from.

    A guest has no tenant context, so access is scoped to one table: the token
    must be the table's QR token or the token of the table's active dining
    session. The token is checked before anything is created. The table and its
    branch, business, and organization must all be active.

    Returns:
        The table, its branch, and the active dining session (None if idle).

    Raises:
        TenantNotFoundError: If the table does not exist at this branch.
        PermissionDeniedError: If the token matches neither the table QR token nor
            the active session token.
        TenantInactiveError: If the table, branch, business, or organization is
            inactive.
    """
    table_res = await session.execute(
        select(RestaurantTable)
        .options(
            selectinload(RestaurantTable.branch),
            selectinload(RestaurantTable.business),
            selectinload(RestaurantTable.organization),
        )
        .where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
        )
    )
    table = table_res.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Restaurant table not found at this branch.")

    active_session_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status == TableSessionStatus.ACTIVE,
        )
    )
    table_session = active_session_res.scalar_one_or_none()

    token_is_valid = _guest_token_matches(token, table.qr_code_token) or (
        table_session is not None
        and _guest_token_matches(token, table_session.session_token)
    )
    if not token_is_valid:
        logger.warning(
            "Guest order rejected: invalid table token",
            table_id=str(table_id),
            branch_id=str(branch_id),
            has_active_session=table_session is not None,
        )
        raise PermissionDeniedError("Invalid or expired table QR token.")

    branch = table.branch
    organization = table.organization
    if (
        not table.is_active
        or not branch.is_active
        or not table.business.is_active
        or not organization.is_active
        or organization.status != OrganizationStatus.ACTIVE
    ):
        logger.warning(
            "Guest order rejected: table or tenant is inactive",
            table_id=str(table_id),
            branch_id=str(branch_id),
            organization_id=str(table.organization_id),
        )
        raise TenantInactiveError("This table is not accepting orders right now.")

    return table, branch, table_session


async def place_guest_order(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    token: str,
    payload: GuestOrderPlacementRequest,
) -> Order:
    """
    Places a multi-round guest order from a mobile device using a verified QR session.

    This is a public path with no tenant context. It is scoped to the table whose
    QR token (or active session token) the guest presents, and only accepts menu
    items of that table's business and branch.

    Raises:
        TenantNotFoundError: If the table does not exist at this branch.
        PermissionDeniedError: If the token is not valid for this table.
        TenantInactiveError: If the table or its tenant is inactive.
    """
    # 1. Verify the table and the guest token before anything is created
    table, branch, table_session = await _resolve_guest_ordering_context(
        session, branch_id, table_id, token
    )

    # 2. Link the active table session, or auto-open one for an idle table
    if table_session is None:
        table_session = TableSession(
            organization_id=table.organization_id,
            business_id=table.business_id,
            branch_id=branch_id,
            table_id=table_id,
            session_code=f"S-{secrets.token_hex(3).upper()}",
            guest_count=1,
            session_token=generate_session_token(),
            status=TableSessionStatus.ACTIVE,
        )
        session.add(table_session)
        table.status = TableStatus.OCCUPIED
        await session.flush()

    # 3. Resolve Branch Financial Settings
    tax_pct, sc_pct, usd_to_khr = await _resolve_financial_settings(session, branch)

    # 4. Validate Items and Calculate Subtotal
    order_items, subtotal_usd = await _validate_and_build_order_items(
        session, branch, payload.items
    )

    # 5. Multi-round sequencing
    round_count_res = await session.execute(
        select(func.count(Order.id)).where(Order.table_session_id == table_session.id)
    )
    existing_rounds = round_count_res.scalar() or 0
    current_round = existing_rounds + 1

    # 6. Financial Calculations
    tax_amount_usd = (subtotal_usd * (tax_pct / Decimal("100"))).quantize(
        Decimal("0.01")
    )
    sc_amount_usd = (subtotal_usd * (sc_pct / Decimal("100"))).quantize(Decimal("0.01"))
    total_amount_usd = subtotal_usd + tax_amount_usd + sc_amount_usd

    subtotal_khr = (subtotal_usd * usd_to_khr).quantize(Decimal("1.00"))
    total_amount_khr = (total_amount_usd * usd_to_khr).quantize(Decimal("1.00"))

    # 7. Create Order Record
    order = Order(
        organization_id=table.organization_id,
        business_id=table.business_id,
        branch_id=branch_id,
        table_id=table_id,
        table_session_id=table_session.id,
        order_number=_generate_order_number(),
        order_type=OrderType.DINE_IN,
        order_source=OrderSource.GUEST_QR,
        round_number=current_round,
        status=OrderStatus.PENDING,
        subtotal_usd=subtotal_usd,
        subtotal_khr=subtotal_khr,
        tax_rate_percent=tax_pct,
        tax_amount_usd=tax_amount_usd,
        service_charge_percent=sc_pct,
        service_charge_amount_usd=sc_amount_usd,
        total_amount_usd=total_amount_usd,
        total_amount_khr=total_amount_khr,
        guest_notes=payload.guest_notes,
        items=order_items,
    )
    session.add(order)
    await session.commit()

    reloaded_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(Order.id == order.id)
    )
    reloaded_order = reloaded_res.scalar_one()

    logger.info(
        "Guest order placed successfully",
        order_id=str(reloaded_order.id),
        order_number=reloaded_order.order_number,
        round_number=reloaded_order.round_number,
        table_id=str(table_id),
        total_usd=float(total_amount_usd),
    )

    # Real-time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos", f"branch:{branch_id}:expo"]
    for item in reloaded_order.items:
        if item.kitchen_station_id:
            notify_rooms.append(f"branch:{branch_id}:station:{item.kitchen_station_id}")
    if reloaded_order.table_session_id:
        notify_rooms.append(f"session:{reloaded_order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="order.created",
        data={
            "order_id": str(reloaded_order.id),
            "order_number": reloaded_order.order_number,
            "table_id": str(reloaded_order.table_id)
            if reloaded_order.table_id
            else None,
            "table_session_id": str(reloaded_order.table_session_id)
            if reloaded_order.table_session_id
            else None,
            "status": reloaded_order.status.value,
            "round_number": reloaded_order.round_number,
            "total_amount_usd": str(reloaded_order.total_amount_usd),
            "total_amount_khr": int(reloaded_order.total_amount_khr),
            "item_count": len(reloaded_order.items),
        },
        business_id=reloaded_order.business_id,
        branch_id=branch_id,
    )

    return reloaded_order


async def place_staff_order(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: StaffOrderPlacementRequest,
) -> Order:
    """
    Places an order from a staff POS terminal at a table or for takeaway.

    The branch must belong to the business in the path and to the caller's
    organization, and every ordered item must belong to that business.

    Raises:
        TenantNotFoundError: If the branch is not part of the business and tenant.
    """
    branch = await get_branch_for_tenant(session, tenant, business_id, branch_id)

    table_session_id: UUID | None = None
    table_id = payload.table_id

    # Handle Table Session for Dine-In
    if payload.order_type == OrderType.DINE_IN and table_id is not None:
        table_res = await session.execute(
            select(RestaurantTable).where(
                RestaurantTable.id == table_id,
                RestaurantTable.branch_id == branch_id,
                RestaurantTable.organization_id == tenant.organization_id,
            )
        )
        table = table_res.scalar_one_or_none()
        if table is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Table not found at this branch.",
            )

        active_session_res = await session.execute(
            select(TableSession).where(
                TableSession.table_id == table_id,
                TableSession.status == TableSessionStatus.ACTIVE,
            )
        )
        table_session = active_session_res.scalar_one_or_none()
        if table_session is None:
            table_session = TableSession(
                organization_id=branch.organization_id,
                business_id=branch.business_id,
                branch_id=branch_id,
                table_id=table_id,
                session_code=f"S-{secrets.token_hex(3).upper()}",
                guest_count=1,
                session_token=generate_session_token(),
                status=TableSessionStatus.ACTIVE,
            )
            session.add(table_session)
            table.status = TableStatus.OCCUPIED
            await session.flush()

        table_session_id = table_session.id

    # Financial settings & Item calculations
    tax_pct, sc_pct, usd_to_khr = await _resolve_financial_settings(session, branch)
    order_items, subtotal_usd = await _validate_and_build_order_items(
        session, branch, payload.items
    )

    current_round = 1
    if table_session_id is not None:
        round_count_res = await session.execute(
            select(func.count(Order.id)).where(
                Order.table_session_id == table_session_id
            )
        )
        existing_rounds = round_count_res.scalar() or 0
        current_round = existing_rounds + 1

    tax_amount_usd = (subtotal_usd * (tax_pct / Decimal("100"))).quantize(
        Decimal("0.01")
    )
    sc_amount_usd = (subtotal_usd * (sc_pct / Decimal("100"))).quantize(Decimal("0.01"))
    total_amount_usd = subtotal_usd + tax_amount_usd + sc_amount_usd

    subtotal_khr = (subtotal_usd * usd_to_khr).quantize(Decimal("1.00"))
    total_amount_khr = (total_amount_usd * usd_to_khr).quantize(Decimal("1.00"))

    order = Order(
        organization_id=branch.organization_id,
        business_id=branch.business_id,
        branch_id=branch_id,
        table_id=table_id,
        table_session_id=table_session_id,
        order_number=_generate_order_number(),
        order_type=payload.order_type,
        order_source=OrderSource.STAFF_POS,
        round_number=current_round,
        status=OrderStatus.CONFIRMED,  # Staff orders auto-confirmed
        subtotal_usd=subtotal_usd,
        subtotal_khr=subtotal_khr,
        tax_rate_percent=tax_pct,
        tax_amount_usd=tax_amount_usd,
        service_charge_percent=sc_pct,
        service_charge_amount_usd=sc_amount_usd,
        total_amount_usd=total_amount_usd,
        total_amount_khr=total_amount_khr,
        guest_notes=payload.guest_notes,
        placed_by_user_id=tenant.user_id,
        items=order_items,
    )
    session.add(order)
    await session.commit()

    reloaded_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(Order.id == order.id)
    )
    reloaded_order = reloaded_res.scalar_one()

    logger.info(
        "Staff POS order placed",
        order_id=str(reloaded_order.id),
        order_number=reloaded_order.order_number,
        staff_id=str(tenant.user_id),
        organization_id=str(tenant.organization_id),
    )

    # Real-time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos", f"branch:{branch_id}:expo"]
    for item in reloaded_order.items:
        if item.kitchen_station_id:
            notify_rooms.append(f"branch:{branch_id}:station:{item.kitchen_station_id}")
    if reloaded_order.table_session_id:
        notify_rooms.append(f"session:{reloaded_order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="order.created",
        data={
            "order_id": str(reloaded_order.id),
            "order_number": reloaded_order.order_number,
            "table_id": str(reloaded_order.table_id)
            if reloaded_order.table_id
            else None,
            "table_session_id": str(reloaded_order.table_session_id)
            if reloaded_order.table_session_id
            else None,
            "status": reloaded_order.status.value,
            "round_number": reloaded_order.round_number,
            "total_amount_usd": str(reloaded_order.total_amount_usd),
            "total_amount_khr": int(reloaded_order.total_amount_khr),
            "item_count": len(reloaded_order.items),
        },
        business_id=reloaded_order.business_id,
        branch_id=branch_id,
    )

    return reloaded_order


async def get_table_session_orders_summary(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    token: str,
) -> TableSessionOrdersSummaryResponse:
    """
    Retrieves all orders across all rounds placed during an active table dining session.
    """
    table_res = await session.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
        )
    )
    table = table_res.scalar_one_or_none()
    if table is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant table not found.",
        )

    session_res = await session.execute(
        select(TableSession)
        .options(
            selectinload(TableSession.table),
        )
        .where(
            TableSession.table_id == table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    table_session = session_res.scalar_one_or_none()
    if table_session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active dining session found for this table.",
        )

    if token != table.qr_code_token and token != table_session.session_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid QR access token.",
        )

    # Fetch orders for session
    orders_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(Order.table_session_id == table_session.id)
        .order_by(Order.round_number.asc())
    )
    orders = list(orders_res.scalars().all())

    # Aggregate totals
    total_subtotal_usd = sum((o.subtotal_usd for o in orders), Decimal("0.00"))
    total_subtotal_khr = sum((o.subtotal_khr for o in orders), Decimal("0.00"))
    total_tax_usd = sum((o.tax_amount_usd for o in orders), Decimal("0.00"))
    total_sc_usd = sum((o.service_charge_amount_usd for o in orders), Decimal("0.00"))
    grand_total_usd = sum((o.total_amount_usd for o in orders), Decimal("0.00"))
    grand_total_khr = sum((o.total_amount_khr for o in orders), Decimal("0.00"))
    total_items_count = sum(sum(item.quantity for item in o.items) for o in orders)

    return TableSessionOrdersSummaryResponse(
        table_session_id=table_session.id,
        table_id=table.id,
        table_number=table.table_number,
        # The column is a plain string; a freshly loaded row holds str, not the enum.
        status=TableSessionStatus(table_session.status).value,
        total_rounds=len(orders),
        total_items_count=total_items_count,
        subtotal_usd=total_subtotal_usd,
        subtotal_khr=total_subtotal_khr,
        tax_amount_usd=total_tax_usd,
        service_charge_amount_usd=total_sc_usd,
        grand_total_usd=grand_total_usd,
        grand_total_khr=grand_total_khr,
        orders=[OrderResponse.model_validate(o) for o in orders],
    )


async def list_branch_orders(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    status_filter: OrderStatus | None = None,
    table_id: UUID | None = None,
) -> list[Order]:
    """
    Lists the order tickets of a branch, newest first, with optional filters.

    Raises:
        TenantNotFoundError: If the branch is not part of the business and tenant.
    """
    await get_branch_for_tenant(session, tenant, business_id, branch_id)

    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(
            Order.organization_id == tenant.organization_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
        .order_by(Order.created_at.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)
    if table_id is not None:
        stmt = stmt.where(Order.table_id == table_id)

    res = await session.execute(stmt)
    return list(res.scalars().all())


async def get_branch_order(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
) -> Order:
    """
    Retrieves one order ticket of a branch with its items and modifiers.

    Raises:
        TenantNotFoundError: If the order does not exist in this branch, business,
            and tenant.
    """
    res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(
            Order.id == order_id,
            Order.organization_id == tenant.organization_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    order = res.scalar_one_or_none()
    if order is None:
        raise TenantNotFoundError("Order ticket not found.")
    return order
