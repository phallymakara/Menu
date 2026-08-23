export type BusinessType = 'RESTAURANT' | 'CAFE' | 'BAKERY' | 'DRINK_SHOP' | 'FOOD_STALL'

export interface BusinessProfileForm {
  business_type: BusinessType
  name_en: string
  name_km: string
  logo_url?: string | null
  description?: string
  base_currency: 'USD' | 'KHR'
  exchange_rate: number
  tax_percentage: number
  is_tax_inclusive: boolean
  service_charge_percentage: number
  is_service_charge_inclusive: boolean
}

export interface BranchForm {
  name_en: string
  name_km: string
  branch_code: string
  phone: string
  address: string
  opening_time: string
  closing_time: string
  bakong_account_id: string
  bakong_merchant_name: string
  bakong_acquiring_bank: string
}

export interface DiningAreaItem {
  id: string
  name_en: string
  name_km: string
  tables_count: number
  default_capacity: number
  table_prefix: string
}

export interface GeneratedTable {
  id: string
  table_number: string
  area_name: string
  capacity: number
  qr_token: string
}
