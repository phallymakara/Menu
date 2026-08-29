export interface Category {
  id: string
  name_en: string
  name_km: string
  display_order: number
  is_active: boolean
  items_count?: number
}

export interface ModifierOption {
  id: string
  name_en: string
  name_km: string
  price_usd: number
  is_default: boolean
}

export interface ModifierGroup {
  id: string
  name_en: string
  name_km: string
  is_required: boolean
  min_selections: number
  max_selections: number
  options: ModifierOption[]
}

export interface MenuItem {
  id: string
  category_id: string
  name_en: string
  name_km: string
  description_en?: string
  description_km?: string
  image_url?: string | null
  price_usd: number
  price_khr: number
  is_available: boolean
  kitchen_station?: 'KITCHEN' | 'BAR' | 'BAKERY' | 'GRILL'
  modifier_groups?: ModifierGroup[]
}

export interface DiningZone {
  id: string
  name_en: string
  name_km: string
  tables_count: number
}

export interface DiningTable {
  id: string
  table_number: string
  zone_id: string
  zone_name: string
  capacity: number
  qr_token: string
  status: 'AVAILABLE' | 'OCCUPIED' | 'BILLING'
}

export interface StaffMember {
  id: string
  organization_id?: string
  user_id?: string
  branch_id?: string | null
  full_name: string
  phone?: string | null
  email?: string | null
  avatar_url?: string | null
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'CHEF' | 'INVENTORY' | 'MENU_EDITOR' | 'REPORT_VIEWER'
  job_title?: string | null
  pos_pin?: string | null
  pin_code?: string | null
  is_owner?: boolean
  is_active: boolean
  status?: string
  created_at: string
}

