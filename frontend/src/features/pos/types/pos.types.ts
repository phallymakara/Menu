import { CourseStage, OrderItemStatus } from '@/features/guest/types/guest.types'

export type TableOperationalStatus =
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'bill_requested'
  | 'dirty_cleaning'
  | 'out_of_service'
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'BILL_REQUESTED'
  | 'DIRTY_CLEANING'

export interface POSDiningZone {
  id: string
  name_en: string
  name_km?: string | null
  display_order?: number
}

export interface POSTable {
  id: string
  table_number: string
  name?: string | null
  status: TableOperationalStatus
  capacity: number
  dining_area_id?: string | null
  dining_area_name?: string | null
  session_id?: string | null
  session_token?: string | null
  session_code?: string | null
  session_opened_at?: string | null
  session_elapsed_minutes?: number
  session_subtotal_usd?: number
  guest_count?: number
  active_orders_count?: number
}

export interface POSCartModifier {
  modifier_option_id: string
  modifier_name: string
  unit_price: number
}

export interface POSCartItem {
  cart_item_id: string
  menu_item_id: string
  item_name_en: string
  item_name_km?: string | null
  variant_id?: string | null
  variant_name?: string | null
  quantity: number
  course_stage: CourseStage
  modifiers: POSCartModifier[]
  special_instructions?: string | null
  unit_price_usd: number
  total_price_usd: number
}

export interface POSPlacedItem {
  id: string
  menu_item_id: string
  item_name_en: string
  item_name_km?: string | null
  variant_name_en?: string | null
  quantity: number
  course_stage: CourseStage
  status: OrderItemStatus
  unit_price_usd: number
  subtotal_usd: number
  special_instructions?: string | null
  modifiers_summary?: string
}

export interface POSPlacedRound {
  id: string
  order_number: string
  round_number: number
  created_at: string
  subtotal_usd: number
  items: POSPlacedItem[]
}

export interface POSBillSummary {
  subtotal_usd: number
  subtotal_khr: number
  discount_usd: number
  tax_rate_percent: number
  tax_amount_usd: number
  service_charge_percent: number
  service_charge_amount_usd: number
  total_amount_usd: number
  total_amount_khr: number
  exchange_rate: number
}

export interface POSCashTenderResult {
  amount_tendered_usd: number
  amount_tendered_khr: number
  total_tendered_usd: number
  change_usd: number
  change_khr: number
  preference: 'khr' | 'usd' | 'split'
  is_exact_or_sufficient: boolean
}
