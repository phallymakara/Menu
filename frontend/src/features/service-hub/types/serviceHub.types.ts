export type ServiceRequestType =
  | 'WATER'
  | 'NAPKINS_UTENSILS'
  | 'REQUEST_BILL'
  | 'TABLE_CLEANING'
  | 'CALL_WAITER'

export type ServiceRequestStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export interface ServiceRequest {
  id: string
  table_id: string
  table_number: string
  dining_area_name?: string | null
  request_type: ServiceRequestType
  note?: string | null
  status: ServiceRequestStatus
  requested_at: string
  acknowledged_at?: string | null
  attended_by_name?: string | null
  elapsed_seconds?: number
}
