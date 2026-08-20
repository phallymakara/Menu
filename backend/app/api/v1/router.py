from fastapi import APIRouter

from app.api.v1.endpoints.audit_logs import router as audit_logs_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.branch_menu import router as branch_menu_router
from app.api.v1.endpoints.branches import router as branches_router
from app.api.v1.endpoints.businesses import router as businesses_router
from app.api.v1.endpoints.categories import router as categories_router
from app.api.v1.endpoints.combos import router as combos_router
from app.api.v1.endpoints.dining_areas import router as dining_areas_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.item_variants import router as item_variants_router
from app.api.v1.endpoints.media import router as media_router
from app.api.v1.endpoints.members import router as members_router
from app.api.v1.endpoints.menu_items import router as menu_items_router
from app.api.v1.endpoints.modifiers import router as modifiers_router
from app.api.v1.endpoints.orders import router as orders_router
from app.api.v1.endpoints.public_tables import router as public_tables_router
from app.api.v1.endpoints.restaurant_tables import router as restaurant_tables_router
from app.api.v1.endpoints.subscriptions import router as subscriptions_router
from app.api.v1.endpoints.table_qr import router as table_qr_router
from app.api.v1.endpoints.table_sessions import router as table_sessions_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(health_router)
api_router.include_router(public_tables_router)
api_router.include_router(businesses_router)
api_router.include_router(branches_router)
api_router.include_router(dining_areas_router)
api_router.include_router(table_qr_router)
api_router.include_router(restaurant_tables_router)
api_router.include_router(table_sessions_router)
api_router.include_router(orders_router)
api_router.include_router(categories_router)
api_router.include_router(menu_items_router)
api_router.include_router(item_variants_router)
api_router.include_router(modifiers_router)
api_router.include_router(combos_router)
api_router.include_router(branch_menu_router)
api_router.include_router(media_router)
api_router.include_router(members_router)
api_router.include_router(subscriptions_router)
api_router.include_router(audit_logs_router)
