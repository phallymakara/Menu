export type BusinessType = 'RESTAURANT' | 'CAFE' | 'BAKERY' | 'DRINK_SHOP' | 'FOOD_STALL'

export interface UserProfile {
  id: string
  full_name: string
  email: string
  phone?: string | null
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'SUPERADMIN'
  organization_id?: string | null
  created_at: string
}

export interface RegisterPayload {
  full_name: string
  email_or_phone: string
  password: string
  confirm_password?: string
}

export interface LoginPayload {
  email_or_phone: string
  password: string
  remember_me?: boolean
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: UserProfile
  needs_onboarding?: boolean
}
