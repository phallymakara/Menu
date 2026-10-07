/**
 * Pure helpers for guest service requests: labels, timers, queue order, and the
 * WebSocket events that keep the service hub live.
 */
import type {
  GuestServiceRequest,
  ServiceRequestStatus,
  ServiceRequestType,
  StaffServiceRequest,
} from '../types/serviceHub.types'

/** Longest note the backend accepts, in characters. */
export const SERVICE_REQUEST_NOTE_MAX_LENGTH = 200

/** Request types in the order the guest picker shows them. */
export const SERVICE_REQUEST_TYPES: readonly ServiceRequestType[] = [
  'call_staff',
  'water',
  'cleaning',
  'bill',
  'custom',
]

/** A waiting request turns amber after this many seconds... */
export const SLA_WARNING_AFTER_SECONDS = 2 * 60
/** ...and red after this many. */
export const SLA_CRITICAL_AFTER_SECONDS = 5 * 60

export type SlaLevel = 'normal' | 'warning' | 'critical'

/** True while the request still waits on staff (open or acknowledged). */
export function isActiveServiceRequest(status: ServiceRequestStatus): boolean {
  return status === 'open' || status === 'acknowledged'
}

/** A custom request means nothing to staff without a note, so the API requires one. */
export function requiresNote(type: ServiceRequestType): boolean {
  return type === 'custom'
}

/** Trims the note and turns a blank one into `null`, as the backend does. */
export function normalizeServiceRequestNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? '').trim()
  return trimmed ? trimmed : null
}

/** Translation key of a request type's short label. */
export function serviceRequestTypeLabelKey(type: ServiceRequestType): string {
  return `serviceHub.types.${type}.label`
}

/** Translation key of the one-line hint the guest picker shows under a type. */
export function serviceRequestTypeHintKey(type: ServiceRequestType): string {
  return `serviceHub.types.${type}.hint`
}

/** Fills `{name}` placeholders in a translated template. Unknown names stay as-is. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  )
}

/** Whole seconds from `iso` until `now` (epoch ms); never negative. */
export function secondsSince(iso: string, now: number): number {
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}

/** Formats a duration as `mm:ss`; minutes keep counting past an hour. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/** How urgent a request is, from how long the guest has been waiting. */
export function getSlaLevel(createdAt: string, now: number): SlaLevel {
  const waited = secondsSince(createdAt, now)
  if (waited >= SLA_CRITICAL_AFTER_SECONDS) return 'critical'
  if (waited >= SLA_WARNING_AFTER_SECONDS) return 'warning'
  return 'normal'
}

/** Staff queue order: open before acknowledged, then oldest first. */
export function sortServiceQueue(requests: readonly StaffServiceRequest[]): StaffServiceRequest[] {
  const rank = (status: ServiceRequestStatus) => (status === 'open' ? 0 : 1)
  return [...requests].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

/**
 * Applies a request returned by a staff action to the cached queue: replaces it in
 * place, or drops it once it no longer waits on staff.
 */
export function applyStaffRequestUpdate(
  queue: readonly StaffServiceRequest[] | undefined,
  updated: StaffServiceRequest
): StaffServiceRequest[] {
  const current = queue ?? []
  if (!isActiveServiceRequest(updated.status)) {
    return current.filter((request) => request.id !== updated.id)
  }
  return current.some((request) => request.id === updated.id)
    ? current.map((request) => (request.id === updated.id ? updated : request))
    : [updated, ...current]
}

/** The request the guest banner follows: the newest one still waiting on staff. */
export function pickGuestBannerRequest(
  requests: readonly GuestServiceRequest[] | undefined
): GuestServiceRequest | null {
  let newest: GuestServiceRequest | null = null
  for (const request of requests ?? []) {
    if (!isActiveServiceRequest(request.status)) continue
    if (!newest || new Date(request.created_at) > new Date(newest.created_at)) newest = request
  }
  return newest
}

/**
 * Identifies one state of one request, so a dismissed banner comes back when the
 * request moves on (for example, from sent to staff on the way).
 */
export function bannerDismissKey(request: Pick<GuestServiceRequest, 'id' | 'status'>): string {
  return `${request.id}:${request.status}`
}

/** Translation key for why a guest's request failed, from the HTTP status. */
export function guestRequestErrorKey(status: number | undefined): string {
  if (status === 409) return 'serviceHub.guest.errorDuplicate'
  if (status === 401) return 'serviceHub.guest.errorSessionEnded'
  return 'serviceHub.guest.errorGeneric'
}

/** Translation key for why a staff action failed, from the HTTP status. */
export function staffActionErrorKey(status: number | undefined): string {
  return status === 409 ? 'serviceHub.staff.alreadyHandled' : 'serviceHub.staff.actionFailed'
}

export type ServiceHubEventName =
  | 'service_request.created'
  | 'service_request.updated'
  | 'table_session.bill_requested'

export interface ServiceHubEvent {
  name: ServiceHubEventName
  tableId: string | null
  status: ServiceRequestStatus | null
}

const SERVICE_HUB_EVENTS: ReadonlySet<string> = new Set<ServiceHubEventName>([
  'service_request.created',
  'service_request.updated',
  'table_session.bill_requested',
])

const REQUEST_STATUSES: ReadonlySet<string> = new Set<ServiceRequestStatus>([
  'open',
  'acknowledged',
  'resolved',
  'cancelled',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Reads a hub WebSocket message (`{ event, data, ... }`) and returns the service
 * hub event it carries, or `null` for any other message.
 */
export function parseServiceHubEvent(message: unknown): ServiceHubEvent | null {
  if (!isRecord(message) || typeof message.event !== 'string') return null
  if (!SERVICE_HUB_EVENTS.has(message.event)) return null
  const data = isRecord(message.data) ? message.data : {}
  const status =
    typeof data.status === 'string' && REQUEST_STATUSES.has(data.status)
      ? (data.status as ServiceRequestStatus)
      : null
  return {
    name: message.event as ServiceHubEventName,
    tableId: typeof data.table_id === 'string' ? data.table_id : null,
    status,
  }
}

/** True for `service_request.created` and `service_request.updated`. */
export function isServiceRequestEvent(event: ServiceHubEvent | null): boolean {
  return event?.name === 'service_request.created' || event?.name === 'service_request.updated'
}
