import type { components } from '@/types/api'
import type { CourseStage, OrderItemStatus } from '@/features/guest/types/guest.types'
import type { POSPlacedItem, POSPlacedRound } from '../types/pos.types'

type OrderResponse = components['schemas']['OrderResponse']
type OrderItemResponse = components['schemas']['OrderItemResponse']
type ApiCourseStage = components['schemas']['CourseStage']
type ApiOrderItemStatus = components['schemas']['OrderItemStatus']

const COURSE_STAGE: Record<ApiCourseStage, CourseStage> = {
  drinks: 'DRINKS',
  starters: 'APPETIZERS',
  mains: 'MAINS',
  desserts: 'DESSERTS',
}

const ITEM_STATUS: Record<ApiOrderItemStatus, OrderItemStatus> = {
  held: 'QUEUED',
  pending: 'QUEUED',
  confirmed: 'QUEUED',
  preparing: 'PREPARING',
  cooking: 'PREPARING',
  ready_to_serve: 'READY',
  served: 'SERVED',
  voided: 'VOIDED',
}

function toPOSItem(item: OrderItemResponse): POSPlacedItem {
  const modifierNames = (item.modifiers ?? []).map((m) => m.name_en)
  return {
    id: item.id,
    menu_item_id: item.menu_item_id,
    item_name_en: item.item_name_en,
    item_name_km: item.item_name_km ?? null,
    variant_name_en: item.variant_name_en ?? null,
    quantity: item.quantity,
    course_stage: COURSE_STAGE[item.course_stage],
    status: ITEM_STATUS[item.status],
    unit_price_usd: Number(item.unit_price),
    subtotal_usd: Number(item.subtotal_price),
    special_instructions: item.special_instructions ?? null,
    modifiers_summary: modifierNames.length > 0 ? modifierNames.join(', ') : undefined,
  }
}

/**
 * Convert a table's orders into POS order rounds for one dining session.
 * Orders from other sessions and cancelled orders are dropped, voided items are hidden,
 * and rounds are returned in the order they were placed.
 */
export function toPOSRounds(orders: OrderResponse[], sessionId: string): POSPlacedRound[] {
  return orders
    .filter((order) => order.table_session_id === sessionId && order.status !== 'cancelled')
    .sort((a, b) => a.round_number - b.round_number)
    .map((order) => ({
      id: order.id,
      order_number: order.order_number,
      round_number: order.round_number,
      created_at: order.created_at,
      subtotal_usd: Number(order.subtotal_usd),
      items: (order.items ?? []).filter((item) => item.status !== 'voided').map(toPOSItem),
    }))
}
