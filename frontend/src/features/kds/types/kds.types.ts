export type CourseStage = 'drinks' | 'starters' | 'mains' | 'desserts' | 'DRINKS' | 'APPETIZERS' | 'MAINS' | 'DESSERTS'

export type OrderItemStatus =
  | 'held'
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'cooking'
  | 'ready_to_serve'
  | 'served'
  | 'voided'
  | 'QUEUED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'VOIDED'

export type UrgencyLevel = 'normal' | 'warning' | 'critical'

export interface KitchenStation {
  id: string
  name: string
  station_code: string
  color_hex?: string | null
  is_active: boolean
  display_order?: number
}

export interface KDSTicketItemModifier {
  id: string
  modifier_option_id: string
  name_en: string
  name_km?: string | null
  quantity: number
}

export interface KDSTicketItem {
  id: string
  menu_item_id: string
  item_name_en: string
  item_name_km?: string | null
  variant_name_en?: string | null
  variant_name_km?: string | null
  quantity: number
  course_stage: CourseStage
  status: OrderItemStatus
  special_instructions?: string | null
  void_reason?: string | null
  kitchen_station_id?: string | null
  station_name?: string | null
  station_code?: string | null
  modifiers: KDSTicketItemModifier[]
  fired_at?: string | null
  cooking_started_at?: string | null
  ready_at?: string | null
  served_at?: string | null
  elapsed_minutes: number
  target_prep_time_minutes: number
  is_overdue: boolean
  urgency_level: UrgencyLevel
}

export interface KDSTicket {
  order_id: string
  order_number: string
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  round_number: number
  table_id?: string | null
  table_number?: string | null
  table_session_id?: string | null
  session_code?: string | null
  guest_notes?: string | null
  created_at: string
  elapsed_minutes: number
  max_target_prep_minutes: number
  is_ticket_overdue: boolean
  ticket_urgency: UrgencyLevel
  has_held_items: boolean
  items: KDSTicketItem[]
}

export interface StationMetrics {
  station_id: string
  station_name: string
  station_code: string
  branch_id?: string
  active_tickets: number
  overdue_tickets: number
  avg_prep_time_minutes: number
}
