import asyncio
import io
import logging
import sys
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select

from app.db.session import AsyncSessionFactory
from app.models.business import Business
from app.models.category import Category
from app.models.enums import OrganizationStatus
from app.models.menu_item import MenuItem
from app.models.organization import Organization

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.WARNING, stream=sys.stdout)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


CATEGORIES_DATA = [
    {"name_en": "Main Dishes", "name_km": "ម្ហូបពិសេស", "display_order": 1},
    {"name_en": "Appetizers", "name_km": "អាហារសម្រន់", "display_order": 2},
    {"name_en": "Drinks & Coffee", "name_km": "ភេសជ្ជៈ & កាហ្វេ", "display_order": 3},
    {"name_en": "Desserts", "name_km": "បង្អែម", "display_order": 4},
]

ITEMS_DATA = [
    {
        "category": "Main Dishes",
        "name_en": "Beef Lok Lak",
        "name_km": "ឡុកឡាក់សាច់គោ",
        "description_en": "Tender wok-tossed beef cubes with Kampot pepper lime dip.",
        "description_km": "សាច់គោឆាម្រេចកំពត ញ៉ាំជាមួយបាយក្តៅៗ។",
        "price": Decimal("5.50"),
        "image_url": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "KITCHEN",
        "is_active": True,
    },
    {
        "category": "Main Dishes",
        "name_en": "Fish Amok Royale",
        "name_km": "អាម៉ុកត្រីបុរាណ",
        "description_en": "Traditional Khmer steamed coconut fish curry in banana leaf cup.",
        "description_km": "អាម៉ុកត្រីដុតស្លឹកចេក រសជាតិប្រណិតបែបខ្មែរបុរាណ។",
        "price": Decimal("6.00"),
        "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "KITCHEN",
        "is_active": True,
    },
    {
        "category": "Main Dishes",
        "name_en": "Khmer Red Curry Chicken",
        "name_km": "ការីក្រហមសាច់មាន់",
        "description_en": "Rich red curry with tender chicken, sweet potatoes, and crusty baguette.",
        "description_km": "ការីក្រហមសាច់មាន់រសជាតិដិត ញ៉ាំជាមួយនំប៉័ងស្រួយ។",
        "price": Decimal("5.00"),
        "image_url": "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "KITCHEN",
        "is_active": True,
    },
    {
        "category": "Appetizers",
        "name_en": "Crispy Spring Rolls (4 pcs)",
        "name_km": "ណែមបំពងស្រួយ (៤ ដុំ)",
        "description_en": "Golden crispy rolls stuffed with pork and sweet chili dip.",
        "description_km": "ណែមបំពងស្រួយក្តៅៗ ជ្រលក់ទឹកត្រីផ្អែម។",
        "price": Decimal("3.50"),
        "image_url": "https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "KITCHEN",
        "is_active": True,
    },
    {
        "category": "Drinks & Coffee",
        "name_en": "Iced Khmer Milk Coffee",
        "name_km": "កាហ្វេទឹកដោះគោទឹកកក",
        "description_en": "Slow-drip dark roast Robusta with sweet condensed milk over ice.",
        "description_km": "កាហ្វេទឹកដោះគោក្លិនឈ្ងុយ រសជាតិដិតជាប់ចិត្ត។",
        "price": Decimal("1.80"),
        "image_url": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "BAR",
        "is_active": True,
    },
    {
        "category": "Drinks & Coffee",
        "name_en": "Passion Fruit Soda",
        "name_km": "សូដាផាសិនស្រស់",
        "description_en": "Fresh passion fruit pulp with sparkling soda and chia seeds.",
        "description_km": "ផាសិនស្រស់លាយសូដា ជូរអែមត្រជាក់ស្រស់ស្រាយ។",
        "price": Decimal("2.25"),
        "image_url": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "BAR",
        "is_active": True,
    },
    {
        "category": "Drinks & Coffee",
        "name_en": "Fresh Coconut Juice",
        "name_km": "ទឹកដូងស្រស់",
        "description_en": "Chilled whole young coconut with refreshing natural water.",
        "description_km": "ទឹកដូងក្រអូបស្រស់ ត្រជាក់ផ្អែមធម្មជាតិ។",
        "price": Decimal("1.50"),
        "image_url": "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "BAR",
        "is_active": True,
    },
    {
        "category": "Desserts",
        "name_en": "Mango Sticky Rice",
        "name_km": "បាយដំណើបស្វាយទុំ",
        "description_en": "Sweet coconut sticky rice served with ripe mango slices and sesame.",
        "description_km": "បាយដំណើបខ្ទិះដូង ញ៉ាំជាមួយស្វាយទុំផ្អែមឆ្ងាញ់។",
        "price": Decimal("4.00"),
        "image_url": "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=600&auto=format&fit=crop&q=80",
        "kitchen_station": "KITCHEN",
        "is_active": True,
    },
]

async def seed():
    async with AsyncSessionFactory() as session:
        # 1. Get or create Organization & Business
        biz_result = await session.execute(select(Business))
        businesses = biz_result.scalars().all()

        if not businesses:
            org = Organization(
                id=uuid4(),
                name="E-Menu Demo Restaurant Group",
                slug=f"emenu-demo-{uuid4().hex[:6]}",
                status=OrganizationStatus.ACTIVE,
                is_active=True,
            )
            session.add(org)
            await session.flush()

            biz = Business(
                id=uuid4(),
                organization_id=org.id,
                name_en="Modern Khmer Restaurant",
                name_km="ហាងម្ហូបខ្មែរទំនើប",
                business_type="restaurant",
                base_currency="USD",
                is_active=True,
            )
            session.add(biz)
            await session.flush()
            businesses = [biz]
            print(f"Created new Demo Business: {biz.id}")
        else:
            print(f"Found {len(businesses)} existing business(es).")

        for biz in businesses:
            print(f"\nSeeding menu for business: {biz.name_en} ({biz.id})")
            
            # Map existing categories
            cat_result = await session.execute(
                select(Category).where(Category.business_id == biz.id)
            )
            existing_cats = {c.name_en: c for c in cat_result.scalars().all()}
            cat_map = {}

            for cat_data in CATEGORIES_DATA:
                if cat_data["name_en"] in existing_cats:
                    cat_map[cat_data["name_en"]] = existing_cats[cat_data["name_en"]]
                else:
                    new_cat = Category(
                        id=uuid4(),
                        organization_id=biz.organization_id,
                        business_id=biz.id,
                        name_en=cat_data["name_en"],
                        name_km=cat_data["name_km"],
                        display_order=cat_data["display_order"],
                        is_active=True,
                    )
                    session.add(new_cat)
                    await session.flush()
                    cat_map[cat_data["name_en"]] = new_cat
                    print(f"  + Added Category: {new_cat.name_en} ({new_cat.name_km})")

            # Map existing items
            item_result = await session.execute(
                select(MenuItem).where(MenuItem.business_id == biz.id)
            )
            existing_items = {it.name_en: it for it in item_result.scalars().all()}

            for item_data in ITEMS_DATA:
                cat = cat_map.get(item_data["category"])
                if item_data["name_en"] not in existing_items:
                    new_item = MenuItem(
                        id=uuid4(),
                        organization_id=biz.organization_id,
                        business_id=biz.id,
                        category_id=cat.id if cat else None,
                        name_en=item_data["name_en"],
                        name_km=item_data["name_km"],
                        description_en=item_data["description_en"],
                        description_km=item_data["description_km"],
                        base_price=item_data["price"],
                        currency="USD",
                        image_url=item_data["image_url"],
                        kitchen_station=item_data["kitchen_station"],
                        is_active=item_data["is_active"],
                        display_order=len(existing_items) + 1,
                    )
                    session.add(new_item)
                    print(f"  + Added Menu Item: {new_item.name_en} (${new_item.base_price})")

        await session.commit()
        print("\nSeeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
