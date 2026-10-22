"""
Comprehensive Demo Data Seeder for Brojane Coffee & Kitchen.
Seeds:
- Business & Branch branding, Bakong KHQR, taxes, currency
- Kitchen Stations (Bar, Hot Kitchen, Bakery)
- Dining Areas & Restaurant Tables
- Table Sessions
- Categories with Unsplash HD images
- Menu Items with Unsplash HD images, descriptions, tags, and prices
- Modifier Groups & Modifier Options
- Branch Category Assignments & Branch Item Overrides
- Live Active Orders (Pending, Preparing, Ready, Served) for POS and KDS
- Service Requests (Call Staff, Request Bill, Water) for Service Hub
- Inventory Items
"""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
import secrets
from uuid import uuid4

from sqlalchemy import select, delete
from app.db.session import AsyncSessionFactory
from app.models.organization import Organization
from app.models.business import Business
from app.models.branch import Branch
from app.models.kitchen_station import KitchenStation
from app.models.dining_area import DiningArea
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.modifier import ModifierGroup, ModifierOption, MenuItemModifierGroup
from app.models.branch_menu import BranchCategoryAssignment, BranchItemOverride
from app.models.order import Order, OrderItem
from app.models.service_request import ServiceRequest
from app.models.inventory import InventoryItem, BranchStock
from app.models.enums import (
    StationType,
    TableStatus,
    TableSessionStatus,
    OrderStatus,
    OrderItemStatus,
    OrderType,
    OrderSource,
    CourseStage,
    ServiceRequestType,
    ServiceRequestStatus,
    UnitOfMeasure,
)

ORG_ID = "cbb864d9-1c83-4ab2-bd41-4f6a6d7557a1"
BIZ_ID = "37480ded-d020-45a8-aa02-deedaf960cdc"
BRANCH_ID = "f2545dbf-a680-4bb7-8ca7-70fb15797ded"


async def seed():
    async with AsyncSessionFactory() as session:
        print("🌱 Starting Comprehensive Seed for Brojane Coffee & Kitchen...")

        # 1. Verify Organization, Business, and Branch exist
        org = (await session.execute(select(Organization).where(Organization.id == ORG_ID))).scalar_one_or_none()
        biz = (await session.execute(select(Business).where(Business.id == BIZ_ID))).scalar_one_or_none()
        branch = (await session.execute(select(Branch).where(Branch.id == BRANCH_ID))).scalar_one_or_none()

        if not org or not biz or not branch:
            print("❌ Error: Target organization, business, or branch not found.")
            return

        # 2. Update Business & Branch Identity & KHQR
        biz.name_en = "Brojane Coffee & Kitchen"
        biz.name_km = "ប្រូចេន កាហ្វេ និងម្ហូប"
        biz.logo_url = "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&auto=format&fit=crop&q=80"
        biz.phone = "012 888 991"
        biz.email = "contact@brojane.com"
        biz.base_currency = "USD"
        biz.exchange_rate = Decimal("4100.00")
        biz.tax_percentage = Decimal("10.00")
        biz.is_tax_inclusive = True
        biz.service_charge_percentage = Decimal("5.00")
        biz.is_service_charge_inclusive = True
        biz.bakong_account_id = "brojane@aclb"
        biz.bakong_merchant_name = "BROJANE COFFEE PP"
        biz.bakong_acquiring_bank = "ACLEDA Bank"
        biz.bakong_merchant_city = "Phnom Penh"

        branch.name_en = "Coffee Store PP"
        branch.name_km = "ហាងកាហ្វេភ្នំពេញ"
        branch.code = "PP-01"
        branch.phone = "012 888 991"
        branch.address = "#123 Preah Norodom Blvd, BKK1, Phnom Penh"
        branch.base_currency = "USD"
        branch.exchange_rate = Decimal("4100.00")
        branch.tax_percentage = Decimal("10.00")
        branch.is_tax_inclusive = True
        branch.service_charge_percentage = Decimal("5.00")
        branch.is_service_charge_inclusive = True
        branch.bakong_account_id = "brojane@aclb"
        branch.bakong_merchant_name = "BROJANE COFFEE PP"
        branch.bakong_acquiring_bank = "ACLEDA Bank"
        branch.bakong_merchant_city = "Phnom Penh"

        # 3. Clean up old transactional/menu data for this branch to prevent duplicates
        await session.execute(delete(ServiceRequest).where(ServiceRequest.branch_id == BRANCH_ID))
        await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(
            select(Order.id).where(Order.branch_id == BRANCH_ID)
        )))
        await session.execute(delete(Order).where(Order.branch_id == BRANCH_ID))
        await session.execute(delete(TableSession).where(TableSession.branch_id == BRANCH_ID))
        await session.execute(delete(BranchItemOverride).where(BranchItemOverride.branch_id == BRANCH_ID))
        await session.execute(delete(BranchCategoryAssignment).where(BranchCategoryAssignment.branch_id == BRANCH_ID))
        await session.execute(delete(MenuItemModifierGroup).where(MenuItemModifierGroup.organization_id == ORG_ID))
        await session.execute(delete(ModifierOption).where(ModifierOption.organization_id == ORG_ID))
        await session.execute(delete(ModifierGroup).where(ModifierGroup.business_id == BIZ_ID))
        await session.execute(delete(MenuItem).where(MenuItem.business_id == BIZ_ID))
        await session.execute(delete(Category).where(Category.business_id == BIZ_ID))
        await session.execute(delete(RestaurantTable).where(RestaurantTable.branch_id == BRANCH_ID))
        await session.execute(delete(DiningArea).where(DiningArea.branch_id == BRANCH_ID))
        await session.execute(delete(KitchenStation).where(KitchenStation.branch_id == BRANCH_ID))
        await session.execute(delete(BranchStock).where(BranchStock.branch_id == BRANCH_ID))
        await session.execute(delete(InventoryItem).where(InventoryItem.business_id == BIZ_ID))
        await session.flush()

        # 4. Kitchen Stations
        station_bar = KitchenStation(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Beverage & Cafe Bar",
            name_km="បារភេសជ្ជៈ និងកាហ្វេ",
            code="BAR",
            station_type=StationType.PREP_STATION,
            is_active=True,
            display_order=1,
        )
        station_hot = KitchenStation(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Main Kitchen (Hot Kitchen)",
            name_km="ផ្ទះបាយក្ដៅ",
            code="HOT_KITCHEN",
            station_type=StationType.PREP_STATION,
            is_active=True,
            display_order=2,
        )
        station_bakery = KitchenStation(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Bakery & Desserts Station",
            name_km="ផ្នែកនំ និងបង្អែម",
            code="BAKERY",
            station_type=StationType.PREP_STATION,
            is_active=True,
            display_order=3,
        )
        session.add_all([station_bar, station_hot, station_bakery])
        await session.flush()
        print("  ✓ Created Kitchen Stations (BAR, HOT_KITCHEN, BAKERY)")

        # 5. Dining Areas
        area_indoor = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Main Indoor Hall",
            name_km="សាលធំខាងក្នុង",
            description_en="Air-conditioned main dining hall with cozy seating",
            display_order=1,
            is_active=True,
        )
        area_garden = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Outdoor Garden Terrace",
            name_km="រានហាលសួនខាងក្រៅ",
            description_en="Lush tropical garden terrace with natural breeze",
            display_order=2,
            is_active=True,
        )
        area_vip = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="VIP Private Lounge",
            name_km="បន្ទប់ពិសេស VIP",
            description_en="Exclusive private room for business meetings and family gatherings",
            display_order=3,
            is_active=True,
        )
        area_bar = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Bar Counter",
            name_km="កន្លែងបារ",
            description_en="High-stool bar counter facing barista workstation",
            display_order=4,
            is_active=True,
        )
        session.add_all([area_indoor, area_garden, area_vip, area_bar])
        await session.flush()
        print("  ✓ Created Dining Areas (Indoor, Garden, VIP, Bar)")

        # 6. Restaurant Tables
        tables_data = [
            # Indoor Hall
            (area_indoor.id, "T-01", "Table 01", 2, 2, "square", "occupied", 1),
            (area_indoor.id, "T-02", "Table 02", 2, 4, "rectangle", "occupied", 2),
            (area_indoor.id, "T-03", "Table 03", 2, 4, "square", "available", 3),
            (area_indoor.id, "T-04", "Table 04", 1, 2, "square", "available", 4),
            (area_indoor.id, "T-05", "Table 05", 2, 4, "round", "available", 5),
            # Garden Terrace
            (area_garden.id, "T-06", "Table 06 (Garden)", 2, 4, "round", "occupied", 6),
            (area_garden.id, "T-07", "Table 07 (Garden)", 4, 6, "rectangle", "available", 7),
            (area_garden.id, "T-08", "Table 08 (Garden)", 2, 4, "square", "occupied", 8),
            (area_garden.id, "T-09", "Table 09 (Garden)", 1, 2, "square", "available", 9),
            (area_garden.id, "T-10", "Table 10 (Garden)", 4, 6, "rectangle", "reserved", 10),
            # VIP Lounge
            (area_vip.id, "VIP-01", "VIP Diamond Suite", 6, 10, "rectangle", "available", 11),
            (area_vip.id, "VIP-02", "VIP Golden Suite", 8, 12, "round", "reserved", 12),
            # Bar Seats
            (area_bar.id, "BAR-01", "Bar Seat 1", 1, 1, "bar_seat", "available", 13),
            (area_bar.id, "BAR-02", "Bar Seat 2", 1, 1, "bar_seat", "available", 14),
            (area_bar.id, "BAR-03", "Bar Seat 3", 1, 1, "bar_seat", "occupied", 15),
            (area_bar.id, "BAR-04", "Bar Seat 4", 1, 1, "bar_seat", "available", 16),
        ]

        created_tables = {}
        for area_id, num, name, min_cap, max_cap, shape, status, order in tables_data:
            tbl = RestaurantTable(
                organization_id=org.id,
                business_id=biz.id,
                branch_id=branch.id,
                dining_area_id=area_id,
                table_number=num,
                name=name,
                min_capacity=min_cap,
                max_capacity=max_cap,
                shape=shape,
                status=status,
                qr_code_token=secrets.token_urlsafe(24),
                display_order=order,
                is_active=True,
            )
            session.add(tbl)
            created_tables[num] = tbl
        await session.flush()
        print(f"  ✓ Created {len(tables_data)} Restaurant Tables across 4 zones")

        # 7. Categories
        categories_data = [
            (
                "Signature Coffee",
                "កាហ្វេពិសេសប្រចាំហាង",
                "Artisan espresso and cold brews crafted with premium roasted beans",
                "កាហ្វេឆុងស្រស់ៗ ប្រើប្រាស់គ្រាប់កាហ្វេគុណភាពខ្ពស់ ឈ្ងុយឆ្ងាញ់ពិសេស",
                "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80",
                station_bar.id,
                1,
            ),
            (
                "Refreshing Tea & Drinks",
                "តែ និងភេសជ្ជៈស្រស់ស្រាយ",
                "Handcrafted organic teas, fruit coolers, and sparkling sodas",
                "តែសរីរាង្គ ភេសជ្ជៈផ្លែឈើ និងសូដា ជួយផ្តល់ភាពស្រស់ស្រាយពេញមួយថ្ងៃ",
                "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80",
                station_bar.id,
                2,
            ),
            (
                "Khmer Traditional Cuisine",
                "ម្ហូបខ្មែរប្រពៃណី",
                "Authentic royal Cambodian recipes with fresh local herbs and spices",
                "ម្ហូបខ្មែរបុរាណរសជាតិដើម ប្រើប្រាស់គ្រឿងទេសខ្មែរស្រស់ៗឈ្ងុយឆ្ងាញ់",
                "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
                station_hot.id,
                3,
            ),
            (
                "Western & Asian Fusion",
                "ម្ហូបអឺរ៉ុប និងអាស៊ី",
                "Gourmet burgers, pasta, and pan-Asian delicacies",
                "ប៊ឺហ្គឺរ ស្ប៉ាហ្គេតធី និងមុខម្ហូបបែបអន្តរជាតិរសជាតិឆ្ងាញ់ជាប់ចិត្ត",
                "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
                station_hot.id,
                4,
            ),
            (
                "Bakery & Desserts",
                "នំបុ័ង និងបង្អែម",
                "Fresh French croissants, molten cakes, and sweet treats",
                "នំប៉័ងដុតក្តៅៗជារៀងរាល់ថ្ងៃ និងបង្អែមឈ្ងុយឆ្ងាញ់ពិសា",
                "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&auto=format&fit=crop&q=80",
                station_bakery.id,
                5,
            ),
            (
                "Appetizers & Snacks",
                "អាហារសម្រន់",
                "Crispy bites, truffle fries, and light appetizers",
                "អាហារសម្រន់បំពងស្រួយឆ្ងាញ់ស័ក្តិសមជាមួយភេសជ្ជៈ",
                "https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80",
                station_hot.id,
                6,
            ),
        ]

        created_categories = []
        for name_en, name_km, desc_en, desc_km, img, station_id, order in categories_data:
            cat = Category(
                organization_id=org.id,
                business_id=biz.id,
                branch_id=None,  # Master Central Category
                name_en=name_en,
                name_km=name_km,
                description_en=desc_en,
                description_km=desc_km,
                image_url=img,
                kitchen_station_id=station_id,
                display_order=order,
                is_active=True,
            )
            session.add(cat)
            created_categories.append(cat)
        await session.flush()

        # Assign all categories to branch
        for cat in created_categories:
            session.add(BranchCategoryAssignment(
                organization_id=org.id,
                business_id=biz.id,
                branch_id=branch.id,
                category_id=cat.id,
                is_active=True,
                display_order=cat.display_order,
            ))
        await session.flush()
        print(f"  ✓ Created and assigned {len(created_categories)} Categories to branch")

        cat_coffee, cat_tea, cat_khmer, cat_fusion, cat_bakery, cat_snacks = created_categories

        # 8. Modifier Groups
        mod_sugar = ModifierGroup(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Sugar Level",
            name_km="កម្រិតជាតិស្ករ",
            description_en="Select preferred sweetness",
            min_selections=1,
            max_selections=1,
            display_order=1,
        )
        mod_milk = ModifierGroup(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Milk Choice",
            name_km="ជម្រើសទឹកដោះគោ",
            description_en="Choose dairy or plant-based milk",
            min_selections=0,
            max_selections=1,
            display_order=2,
        )
        mod_addons = ModifierGroup(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Extra Add-ons",
            name_km="បន្ថែមពិសេស",
            description_en="Extra toppings and shots",
            min_selections=0,
            max_selections=3,
            display_order=3,
        )
        session.add_all([mod_sugar, mod_milk, mod_addons])
        await session.flush()

        # Modifier Options
        sugar_options = [
            ("0% No Sugar", "គ្មានជាតិស្ករ (0%)", Decimal("0.00"), 1),
            ("25% Low Sugar", "ស្ករតិច (25%)", Decimal("0.00"), 2),
            ("50% Half Sugar", "ស្ករកណ្តាល (50%)", Decimal("0.00"), 3),
            ("100% Normal Sugar", "ស្ករធម្មតា (100%)", Decimal("0.00"), 4),
        ]
        for opt_en, opt_km, price, order in sugar_options:
            session.add(ModifierOption(
                organization_id=org.id,
                business_id=biz.id,
                group_id=mod_sugar.id,
                name_en=opt_en,
                name_km=opt_km,
                price=price,
                display_order=order,
                is_default=(order == 4),
                is_active=True,
            ))

        milk_options = [
            ("Fresh Dairy Milk", "ទឹកដោះគោស្រស់", Decimal("0.00"), 1),
            ("Oat Milk (Barista Blend)", "ទឹកដោះគោអូត", Decimal("0.75"), 2),
            ("Almond Milk", "ទឹកដោះគោអាល់ម៉ុន", Decimal("0.75"), 3),
        ]
        for opt_en, opt_km, price, order in milk_options:
            session.add(ModifierOption(
                organization_id=org.id,
                business_id=biz.id,
                group_id=mod_milk.id,
                name_en=opt_en,
                name_km=opt_km,
                price=price,
                display_order=order,
                is_default=(order == 1),
                is_active=True,
            ))

        addon_options = [
            ("Extra Espresso Shot", "បន្ថែម Espresso មួយកែវ", Decimal("0.60"), 1),
            ("Coffee Jelly Pearls", "ចាហួយកាហ្វេ", Decimal("0.50"), 2),
            ("Brown Sugar Boba", "គ្រាប់គុជស្ករត្នោត", Decimal("0.50"), 3),
        ]
        for opt_en, opt_km, price, order in addon_options:
            session.add(ModifierOption(
                organization_id=org.id,
                business_id=biz.id,
                group_id=mod_addons.id,
                name_en=opt_en,
                name_km=opt_km,
                price=price,
                display_order=order,
                is_default=False,
                is_active=True,
            ))
        await session.flush()
        print("  ✓ Created Modifier Groups & Options (Sugar, Milk, Add-ons)")

        # 9. Menu Items
        menu_items_raw = [
            # 1. Signature Coffee
            {
                "cat": cat_coffee,
                "sku": "COF-001",
                "name_en": "Iced Brojane Palm Coffee",
                "name_km": "កាហ្វេទឹកត្នោតទឹកកកប្រូចេន",
                "desc_en": "Our signature cold brew sweetened with pure natural Kampong Speu palm sugar and topped with fresh cream foam.",
                "desc_km": "កាហ្វេទឹកកកពិសេសផ្សំជាមួយស្ករត្នោតធម្មជាតិខេត្តកំពង់ស្ពឺ និងក្រែមទឹកដោះគោស្រស់ឈ្ងុយឆ្ងាញ់។",
                "price": Decimal("2.80"),
                "prep": 4,
                "img": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bar.id,
                "station_name": "BAR",
                "popular": True,
                "featured": True,
                "new": False,
                "mods": [mod_sugar, mod_milk, mod_addons],
            },
            {
                "cat": cat_coffee,
                "sku": "COF-002",
                "name_en": "Hot Spanish Latte",
                "name_km": "កាហ្វេអេស្ប៉ាញក្ដៅ",
                "desc_en": "Double espresso blended with steamed milk and a touch of sweet condensed milk for rich creamy balance.",
                "desc_km": "កាហ្វេអេស្ប្រេសូពីរប្លង់ ឆុងជាមួយទឹកដោះគោក្ដៅ និងទឹកដោះគោខាប់ផ្អែមល្មមឈ្ងុយឆ្ងាញ់។",
                "price": Decimal("3.20"),
                "prep": 5,
                "img": "https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bar.id,
                "station_name": "BAR",
                "popular": True,
                "featured": False,
                "new": False,
                "mods": [mod_sugar, mod_milk],
            },
            {
                "cat": cat_coffee,
                "sku": "COF-003",
                "name_en": "Dirty Matcha Espresso",
                "name_km": "ម៉ាត់ឆាទឹកដោះគោកាហ្វេ",
                "desc_en": "Layered Kyoto ceremonial grade matcha, chilled fresh milk, and a hot float of dark espresso.",
                "desc_km": "តែបៃតងម៉ាត់ឆាជប៉ុនលំដាប់ខ្ពស់ លាយជាមួយទឹកដោះគោត្រជាក់ និងស្រោបដោយកាហ្វេអេស្ប្រេសូពីលើ។",
                "price": Decimal("3.80"),
                "prep": 6,
                "img": "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bar.id,
                "station_name": "BAR",
                "popular": False,
                "featured": True,
                "new": True,
                "mods": [mod_sugar, mod_addons],
            },
            # 2. Refreshing Tea & Drinks
            {
                "cat": cat_tea,
                "sku": "DRK-001",
                "name_en": "Peach Lemongrass Iced Tea",
                "name_km": "តែផ្លែប៉េសគល់ស្លឹកគ្រៃទឹកកក",
                "desc_en": "Infused Ceylon black tea with juicy white peach puree, fresh lemongrass stalk, and mint leaves.",
                "desc_km": "តែខ្មៅឆុងជាមួយផ្លែប៉េសស្រស់ គល់ស្លឹកគ្រៃ និងស្លឹកជីរអង្កាម ផ្តល់ភាពត្រជាក់ស្រស់ស្រាយ។",
                "price": Decimal("2.50"),
                "prep": 3,
                "img": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bar.id,
                "station_name": "BAR",
                "popular": True,
                "featured": True,
                "new": False,
                "mods": [mod_sugar],
            },
            {
                "cat": cat_tea,
                "sku": "DRK-002",
                "name_en": "Passion Fruit Mint Soda",
                "name_km": "សូដាផ្លែផាសិនជីអង្កាម",
                "desc_en": "Sparkling soda with fresh passion fruit pulp, crushed garden mint, and natural cane syrup.",
                "desc_km": "ទឹកសូដាផ្កាយលាយផ្លែផាសិនជូអែម ជីរអង្កាម និងទឹកកកឈ្ងុយត្រជាក់បំពង់ក។",
                "price": Decimal("2.75"),
                "prep": 4,
                "img": "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bar.id,
                "station_name": "BAR",
                "popular": True,
                "featured": False,
                "new": False,
                "mods": [mod_sugar],
            },
            # 3. Khmer Traditional Cuisine
            {
                "cat": cat_khmer,
                "sku": "KHM-001",
                "name_en": "Authentic Khmer Fish Amok",
                "name_km": "អាម៉ុកត្រីអន្លក់ខ្មែរបុរាណ",
                "desc_en": "Steamed Mekong river fish infused with rich lemongrass kroeung, coconut cream, and noni leaves served in banana leaf.",
                "desc_km": "សាច់ត្រីទន្លេស្រស់ៗ ចំហុយជាមួយគ្រឿងគល់ស្លឹកគ្រៃ ខ្ទិះដូង និងស្លឹកញ ស្លឹកចេកឈ្ងុយឆ្ងាញ់ពិសេស។",
                "price": Decimal("6.50"),
                "prep": 18,
                "img": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": True,
                "new": False,
                "mods": [],
            },
            {
                "cat": cat_khmer,
                "sku": "KHM-002",
                "name_en": "Beef Lok Lak with Kampot Pepper",
                "name_km": "ឡុកឡាក់សាច់គោម្រេចកំពត",
                "desc_en": "Wok-seared tender beef cubes on crisp lettuce, tomatoes, red onions, fried egg and zesty lime-Kampot pepper sauce.",
                "desc_km": "សាច់គោផុយឆាជាមួយទឹកជ្រលក់ឡុកឡាក់ អមដោយបន្លែស្រស់ ពងមាន់ចៀន និងទឹកត្រីក្រូចឆ្មាម្រេចកំពត។",
                "price": Decimal("6.00"),
                "prep": 15,
                "img": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": True,
                "new": False,
                "mods": [],
            },
            {
                "cat": cat_khmer,
                "sku": "KHM-003",
                "name_en": "Bai Sach Chrouk (Pork & Rice)",
                "name_km": "បាយសាច់ជ្រូកអាំងពិសេស",
                "desc_en": "Fragrant jasmine rice with marinated grilled sliced pork, pickled cucumbers and daikon, served with clear broth.",
                "desc_km": "បាយដំណើបផ្កាម្លិះស្រួយ សាច់ជ្រូកអាំងបន្ទះស្តើងជ្រក់ត្រសក់ការ៉ុត និងស៊ុបក្តៅៗ។",
                "price": Decimal("3.50"),
                "prep": 10,
                "img": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": False,
                "new": False,
                "mods": [],
            },
            # 4. Western & Asian Fusion
            {
                "cat": cat_fusion,
                "sku": "FUS-001",
                "name_en": "Classic Truffle Cheese Burger",
                "name_km": "ប៊ឺហ្គឺរសាច់គោឈីសត្រាហ្វល",
                "desc_en": "Juicy grilled Angus beef patty, melted cheddar, sautéed mushrooms, truffle aioli on a toasted brioche bun with fries.",
                "desc_km": "សាច់គោអាំងផុយស្រួយ ឈីសឆេដា ផ្សិតឆា ទឹកជ្រលក់ត្រាហ្វល និងដំឡូងបំពងស្រួយ។",
                "price": Decimal("7.50"),
                "prep": 16,
                "img": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": True,
                "new": True,
                "mods": [],
            },
            {
                "cat": cat_fusion,
                "sku": "FUS-002",
                "name_en": "Spaghetti Creamy Carbonara",
                "name_km": "ស្ប៉ាហ្គេតធីខាបូណារ៉ា",
                "desc_en": "Italian pasta tossed in creamy parmesan sauce, crispy smoked bacon, cracked black pepper, and egg yolk.",
                "desc_km": "មីស្ប៉ាហ្គេតធីឆាទឹកដោះគោក្រែម ឈីសផាម៉េសាន សាច់ជ្រូកបីជាន់បំពងស្រួយ និងម្រេចខ្មៅ។",
                "price": Decimal("5.50"),
                "prep": 14,
                "img": "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": False,
                "new": False,
                "mods": [],
            },
            # 5. Bakery & Desserts
            {
                "cat": cat_bakery,
                "sku": "DES-001",
                "name_en": "Warm Chocolate Lava Cake",
                "name_km": "នំខេកសូកូឡាក្តៅហៀរ",
                "desc_en": "Decadent Belgian dark chocolate cake with a molten liquid center, served with French vanilla bean ice cream.",
                "desc_km": "នំខេកសូកូឡាបែលហ្ស៊ិកដុតក្តៅៗហៀរស្នូលសូកូឡា អមដោយការ៉េមវ៉ានីឡាត្រជាក់ផ្អែមឆ្ងាញ់។",
                "price": Decimal("4.50"),
                "prep": 12,
                "img": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bakery.id,
                "station_name": "BAKERY",
                "popular": True,
                "featured": True,
                "new": False,
                "mods": [],
            },
            {
                "cat": cat_bakery,
                "sku": "DES-002",
                "name_en": "Fresh Butter Croissant",
                "name_km": "នំប៉័ងក្រូសង់ប៊ឺស្រស់",
                "desc_en": "Traditional layered French pastry baked fresh every morning with pure French butter for flaky perfection.",
                "desc_km": "នំប៉័ងក្រូសង់ដុតថ្មីៗជារៀងរាល់ព្រឹក ស្រទាប់ច្រើន ស្រួយក្រៅទន់ក្នុង ឈ្ងុយប៊ឺបារាំងពិតៗ។",
                "price": Decimal("2.20"),
                "prep": 5,
                "img": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80",
                "station_id": station_bakery.id,
                "station_name": "BAKERY",
                "popular": False,
                "featured": False,
                "new": False,
                "mods": [],
            },
            # 6. Appetizers & Snacks
            {
                "cat": cat_snacks,
                "sku": "APP-001",
                "name_en": "Crispy Golden Spring Rolls",
                "name_km": "ឆាយ៉ាបំពងស្រួយ",
                "desc_en": "Crispy golden rolls filled with seasoned minced pork, glass noodles, carrots, and wood-ear mushrooms.",
                "desc_km": "ឆាយ៉ាបំពងស្រួយស្នូលសាច់ជ្រូក មីសួ ការ៉ុត និងផ្សិតត្រចៀកកណ្តុរ ញ៉ាំជាមួយទឹកត្រីផ្អែម។",
                "price": Decimal("3.25"),
                "prep": 10,
                "img": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": False,
                "new": False,
                "mods": [],
            },
            {
                "cat": cat_snacks,
                "sku": "APP-002",
                "name_en": "Crispy Truffle Fries",
                "name_km": "ដំឡូងបារាំងបំពងក្លិនត្រាហ្វល",
                "desc_en": "Skin-on French fries tossed in fragrant white truffle oil, grated aged parmesan, and fresh chopped parsley.",
                "desc_km": "ដំឡូងបារាំងបំពងស្រួយលាយប្រេងត្រាហ្វលឈ្ងុយ ឈីសផាម៉េសាន និងស្លឹកជីរវ៉ាន់ស៊ុយ។",
                "price": Decimal("3.50"),
                "prep": 8,
                "img": "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80",
                "station_id": station_hot.id,
                "station_name": "HOT_KITCHEN",
                "popular": True,
                "featured": True,
                "new": True,
                "mods": [],
            },
        ]

        created_items = {}
        for idx, item_dict in enumerate(menu_items_raw, 1):
            m_item = MenuItem(
                organization_id=org.id,
                business_id=biz.id,
                branch_id=None,  # Master Item
                category_id=item_dict["cat"].id,
                sku=item_dict["sku"],
                name_en=item_dict["name_en"],
                name_km=item_dict["name_km"],
                description_en=item_dict["desc_en"],
                description_km=item_dict["desc_km"],
                base_price=item_dict["price"],
                currency="USD",
                image_url=item_dict["img"],
                gallery_images=[item_dict["img"]],
                prep_time_minutes=item_dict["prep"],
                kitchen_station=item_dict["station_name"],
                kitchen_station_id=item_dict["station_id"],
                is_popular=item_dict["popular"],
                is_featured=item_dict["featured"],
                is_new=item_dict["new"],
                is_active=True,
                display_order=idx,
            )
            session.add(m_item)
            created_items[item_dict["sku"]] = m_item
        await session.flush()

        # Link modifier groups to items & override to branch
        for item_dict in menu_items_raw:
            m_item = created_items[item_dict["sku"]]
            for mod_grp in item_dict["mods"]:
                session.add(MenuItemModifierGroup(
                    organization_id=org.id,
                    business_id=biz.id,
                    menu_item_id=m_item.id,
                    modifier_group_id=mod_grp.id,
                    display_order=mod_grp.display_order,
                ))

            # Publish & override to Branch
            session.add(BranchItemOverride(
                organization_id=org.id,
                business_id=biz.id,
                branch_id=branch.id,
                menu_item_id=m_item.id,
                price_override=None,
                availability_status="AVAILABLE",
                is_featured_override=m_item.is_featured,
            ))
        await session.flush()
        print(f"  ✓ Created {len(menu_items_raw)} Menu Items with Unsplash HD images & published to branch")

        # 10. Create Active Table Sessions & Live Orders for KDS, POS, and Guests
        now = datetime.now(timezone.utc)

        # Session 1: Table T-01 (Occupied, Preparing on KDS)
        sess_t01 = TableSession(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-01"].id,
            session_code="SESS-T01-101",
            session_token=secrets.token_urlsafe(24),
            guest_count=2,
            status="active",
            opened_at=now,
        )
        session.add(sess_t01)
        await session.flush()

        # Order 1: Table T-01 -> PREPARING (Shows on KDS!)
        item_palm = created_items["COF-001"]
        item_amok = created_items["KHM-001"]
        subtotal_1 = (item_palm.base_price * 2) + item_amok.base_price  # 2.80*2 + 6.50 = 12.10
        tax_1 = (subtotal_1 * Decimal("0.10")).quantize(Decimal("0.01"))
        service_1 = (subtotal_1 * Decimal("0.05")).quantize(Decimal("0.01"))
        total_1 = subtotal_1 + tax_1 + service_1

        order_1 = Order(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-01"].id,
            table_session_id=sess_t01.id,
            order_number="#101",
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.GUEST_QR,
            round_number=1,
            status=OrderStatus.PREPARING,
            subtotal_usd=subtotal_1,
            subtotal_khr=subtotal_1 * Decimal("4100"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=tax_1,
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=service_1,
            total_amount_usd=total_1,
            total_amount_khr=total_1 * Decimal("4100"),
            guest_notes="Less ice for coffee please",
        )
        session.add(order_1)
        await session.flush()

        # Order Items for Order 1
        oi_1 = OrderItem(
            order_id=order_1.id,
            menu_item_id=item_palm.id,
            item_name_en=item_palm.name_en,
            item_name_km=item_palm.name_km,
            base_unit_price=item_palm.base_price,
            unit_price=item_palm.base_price,
            quantity=2,
            subtotal_price=item_palm.base_price * 2,
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.PREPARING,
            kitchen_station_id=station_bar.id,
            special_instructions="Less ice",
        )
        oi_2 = OrderItem(
            order_id=order_1.id,
            menu_item_id=item_amok.id,
            item_name_en=item_amok.name_en,
            item_name_km=item_amok.name_km,
            base_unit_price=item_amok.base_price,
            unit_price=item_amok.base_price,
            quantity=1,
            subtotal_price=item_amok.base_price,
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.COOKING,
            kitchen_station_id=station_hot.id,
            special_instructions="Extra spicy",
        )
        session.add_all([oi_1, oi_2])

        # Session 2: Table T-02 (Occupied, Ready on KDS!)
        sess_t02 = TableSession(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-02"].id,
            session_code="SESS-T02-102",
            session_token=secrets.token_urlsafe(24),
            guest_count=3,
            status="bill_requested",
            opened_at=now,
        )
        session.add(sess_t02)
        await session.flush()

        # Order 2: Table T-02 -> READY_TO_SERVE
        item_burger = created_items["FUS-001"]
        item_tea = created_items["DRK-001"]
        subtotal_2 = item_burger.base_price + item_tea.base_price
        tax_2 = (subtotal_2 * Decimal("0.10")).quantize(Decimal("0.01"))
        service_2 = (subtotal_2 * Decimal("0.05")).quantize(Decimal("0.01"))
        total_2 = subtotal_2 + tax_2 + service_2

        order_2 = Order(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-02"].id,
            table_session_id=sess_t02.id,
            order_number="#102",
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.STAFF_POS,
            round_number=1,
            status=OrderStatus.READY_TO_SERVE,
            subtotal_usd=subtotal_2,
            subtotal_khr=subtotal_2 * Decimal("4100"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=tax_2,
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=service_2,
            total_amount_usd=total_2,
            total_amount_khr=total_2 * Decimal("4100"),
        )
        session.add(order_2)
        await session.flush()

        oi_3 = OrderItem(
            order_id=order_2.id,
            menu_item_id=item_burger.id,
            item_name_en=item_burger.name_en,
            item_name_km=item_burger.name_km,
            base_unit_price=item_burger.base_price,
            unit_price=item_burger.base_price,
            quantity=1,
            subtotal_price=item_burger.base_price,
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.READY_TO_SERVE,
            kitchen_station_id=station_hot.id,
        )
        oi_4 = OrderItem(
            order_id=order_2.id,
            menu_item_id=item_tea.id,
            item_name_en=item_tea.name_en,
            item_name_km=item_tea.name_km,
            base_unit_price=item_tea.base_price,
            unit_price=item_tea.base_price,
            quantity=1,
            subtotal_price=item_tea.base_price,
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.READY_TO_SERVE,
            kitchen_station_id=station_bar.id,
        )
        session.add_all([oi_3, oi_4])

        # Session 3: Table T-06 (Occupied, Pending order)
        sess_t06 = TableSession(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-06"].id,
            session_code="SESS-T06-103",
            session_token=secrets.token_urlsafe(24),
            guest_count=2,
            status="active",
            opened_at=now,
        )
        session.add(sess_t06)
        await session.flush()

        item_carbonara = created_items["FUS-002"]
        item_croissant = created_items["DES-002"]
        subtotal_3 = item_carbonara.base_price + item_croissant.base_price
        tax_3 = (subtotal_3 * Decimal("0.10")).quantize(Decimal("0.01"))
        service_3 = (subtotal_3 * Decimal("0.05")).quantize(Decimal("0.01"))
        total_3 = subtotal_3 + tax_3 + service_3

        order_3 = Order(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-06"].id,
            table_session_id=sess_t06.id,
            order_number="#103",
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.GUEST_QR,
            round_number=1,
            status=OrderStatus.PENDING,
            subtotal_usd=subtotal_3,
            subtotal_khr=subtotal_3 * Decimal("4100"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=tax_3,
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=service_3,
            total_amount_usd=total_3,
            total_amount_khr=total_3 * Decimal("4100"),
        )
        session.add(order_3)
        await session.flush()

        oi_5 = OrderItem(
            order_id=order_3.id,
            menu_item_id=item_carbonara.id,
            item_name_en=item_carbonara.name_en,
            item_name_km=item_carbonara.name_km,
            base_unit_price=item_carbonara.base_price,
            unit_price=item_carbonara.base_price,
            quantity=1,
            subtotal_price=item_carbonara.base_price,
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.PENDING,
            kitchen_station_id=station_hot.id,
        )
        oi_6 = OrderItem(
            order_id=order_3.id,
            menu_item_id=item_croissant.id,
            item_name_en=item_croissant.name_en,
            item_name_km=item_croissant.name_km,
            base_unit_price=item_croissant.base_price,
            unit_price=item_croissant.base_price,
            quantity=1,
            subtotal_price=item_croissant.base_price,
            course_stage=CourseStage.DESSERTS,
            status=OrderItemStatus.PENDING,
            kitchen_station_id=station_bakery.id,
        )
        session.add_all([oi_5, oi_6])

        # Completed historical order for reports / POS sales
        order_hist = Order(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-08"].id,
            order_number="#100",
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.STAFF_POS,
            round_number=1,
            status=OrderStatus.SERVED,
            subtotal_usd=Decimal("16.00"),
            subtotal_khr=Decimal("16.00") * Decimal("4100"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("1.60"),
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=Decimal("0.80"),
            total_amount_usd=Decimal("18.40"),
            total_amount_khr=Decimal("18.40") * Decimal("4100"),
        )
        session.add(order_hist)
        await session.flush()
        print("  ✓ Created Live Orders (#101 Preparing on KDS, #102 Ready to Serve, #103 Pending, #100 Served)")

        # 11. Service Requests for Service Hub
        sr_1 = ServiceRequest(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-01"].id,
            table_session_id=sess_t01.id,
            request_type=ServiceRequestType.CALL_STAFF,
            status=ServiceRequestStatus.OPEN,
            note="Request napkins and extra cutlery",
        )
        sr_2 = ServiceRequest(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-02"].id,
            table_session_id=sess_t02.id,
            request_type=ServiceRequestType.BILL,
            status=ServiceRequestStatus.OPEN,
            note="Paying with Bakong KHQR",
        )
        sr_3 = ServiceRequest(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=created_tables["T-06"].id,
            table_session_id=sess_t06.id,
            request_type=ServiceRequestType.WATER,
            status=ServiceRequestStatus.ACKNOWLEDGED,
            note="2 glasses of iced water",
        )
        session.add_all([sr_1, sr_2, sr_3])
        await session.flush()
        print("  ✓ Created Service Requests (Call Staff, Bill, Water Refill)")

        # 12. Inventory Items & Branch Stock
        inventory_data = [
            ("Mondulkiri Arabica Coffee Beans", "គ្រាប់កាហ្វេអារ៉ាប៊ីកាមណ្ឌលគិរី", "INV-COF-01", UnitOfMeasure.KG, Decimal("18.50"), Decimal("5.00"), Decimal("35.00"), Decimal("50.00")),
            ("Barista Fresh Cow Milk", "ទឹកដោះគោស្រស់បារីស្តា", "INV-MLK-01", UnitOfMeasure.LITER, Decimal("2.20"), Decimal("10.00"), Decimal("48.00"), Decimal("60.00")),
            ("Kampot Black Organic Pepper", "ម្រេចខ្មៅសរីរាង្គកំពត", "INV-PEP-01", UnitOfMeasure.KG, Decimal("14.00"), Decimal("2.00"), Decimal("12.50"), Decimal("20.00")),
            ("Malis Jasmine Rice Grade 1", "អង្ករផ្កាម្លិះលេខ១", "INV-RCE-01", UnitOfMeasure.KG, Decimal("1.20"), Decimal("20.00"), Decimal("120.00"), Decimal("150.00")),
            ("French Pure Butter (Normandy)", "ប៊ឺសុទ្ធបារាំង", "INV-BTR-01", UnitOfMeasure.KG, Decimal("9.50"), Decimal("4.00"), Decimal("18.00"), Decimal("25.00")),
            ("Belgian Dark Chocolate Callets 70%", "សូកូឡាខ្មៅបែលហ្ស៊ិក", "INV-CHO-01", UnitOfMeasure.KG, Decimal("16.00"), Decimal("3.00"), Decimal("15.00"), Decimal("25.00")),
            ("Mekong River Fish Fillet", "សាច់ត្រីទន្លេមេគង្គ", "INV-FSH-01", UnitOfMeasure.KG, Decimal("8.00"), Decimal("5.00"), Decimal("22.00"), Decimal("30.00")),
            ("Angus Beef Patty 150g", "សាច់គោអាំងប៊ឺហ្គឺរ 150g", "INV-BEEF-01", UnitOfMeasure.PIECE, Decimal("3.00"), Decimal("10.00"), Decimal("45.00"), Decimal("60.00")),
        ]

        for name_en, name_km, sku, uom, cost, reorder_lvl, current_stock, ideal_stock in inventory_data:
            inv = InventoryItem(
                organization_id=org.id,
                business_id=biz.id,
                name_en=name_en,
                name_km=name_km,
                sku=sku,
                unit_of_measure=uom,
                cost_per_unit_usd=cost,
                reorder_threshold=reorder_lvl,
                ideal_stock_quantity=ideal_stock,
                is_active=True,
            )
            session.add(inv)
            await session.flush()

            session.add(BranchStock(
                organization_id=org.id,
                business_id=biz.id,
                branch_id=branch.id,
                inventory_item_id=inv.id,
                quantity=current_stock,
                reorder_threshold=reorder_lvl,
                ideal_stock_quantity=ideal_stock,
            ))
        await session.flush()
        print(f"  ✓ Created {len(inventory_data)} Inventory Items & Branch Stock records")

        await session.commit()
        print("\n🎉 COMPLETE: All demo data successfully seeded into database for Brojane Coffee & Kitchen!")


if __name__ == "__main__":
    asyncio.run(seed())
