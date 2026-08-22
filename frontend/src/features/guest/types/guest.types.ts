export type CourseStage = 'DRINKS' | 'APPETIZERS' | 'MAINS' | 'DESSERTS' | 'DIGESTIFS'

export type OrderItemStatus = 'QUEUED' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED'

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

export interface ModifierOption {
  id: string
  name_en: string
  name_km: string | null
  price_adjustment_usd: number
  is_default: boolean
}

export interface ModifierGroup {
  id: string
  name_en: string
  name_km: string | null
  selection_type: 'SINGLE' | 'MULTI'
  min_selections: number
  max_selections: number
  is_required: boolean
  options: ModifierOption[]
}

export interface ItemVariant {
  id: string
  name_en: string
  name_km: string | null
  price_usd: number
  is_default: boolean
}

export interface MenuItem {
  id: string
  category_id: string
  name_en: string
  name_km: string | null
  description_en: string | null
  description_km: string | null
  base_price_usd: number
  image_url: string | null
  is_available: boolean
  spicy_level?: number
  is_vegetarian?: boolean
  is_popular?: boolean
  variants: ItemVariant[]
  modifier_groups: ModifierGroup[]
}

export interface Category {
  id: string
  name_en: string
  name_km: string | null
  display_order: number
  items: MenuItem[]
}

export interface CartModifierSelection {
  modifier_group_id: string
  modifier_group_name: string
  modifier_option_id: string
  modifier_option_name: string
  price_adjustment_usd: number
}

export interface CartItem {
  cart_item_id: string
  menu_item: MenuItem
  variant: ItemVariant | null
  selected_modifiers: CartModifierSelection[]
  course_stage: CourseStage
  special_instructions: string
  unit_price_usd: number
  quantity: number
  total_price_usd: number
}

export interface PlacedOrderItem {
  id: string
  item_name_en: string
  item_name_km: string | null
  variant_name_en: string | null
  quantity: number
  unit_price_usd: number
  subtotal_usd: number
  course_stage: CourseStage
  status: OrderItemStatus
  modifiers_summary?: string
}

export interface PlacedOrderRound {
  id: string
  round_number: number
  placed_at: string
  round_subtotal_usd: number
  items: PlacedOrderItem[]
}

export interface TableContextInfo {
  table_id: string
  table_number: string
  table_name: string | null
  dining_area_name: string | null
  business_id: string
  business_name: string
  branch_id: string
  branch_name: string
  exchange_rate: number
  tax_percentage: number
  is_tax_inclusive: boolean
  service_charge_percentage: number
  is_service_charge_inclusive: boolean
  bakong_account_id: string | null
  bakong_merchant_name: string | null
}
