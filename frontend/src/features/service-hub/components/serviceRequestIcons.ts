import { Bell, Droplets, MessageSquareText, Receipt, SprayCan, type LucideIcon } from 'lucide-react'
import type { ServiceRequestType } from '../types/serviceHub.types'

/** Icon shown for each request type in the guest picker and the staff queue. */
export const SERVICE_REQUEST_TYPE_ICONS: Record<ServiceRequestType, LucideIcon> = {
  call_staff: Bell,
  water: Droplets,
  cleaning: SprayCan,
  bill: Receipt,
  custom: MessageSquareText,
}
