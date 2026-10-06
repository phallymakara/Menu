import type { components } from '@/types/api'

/** What a guest is asking staff for. */
export type ServiceRequestType = components['schemas']['ServiceRequestType']

/** Lifecycle of a request: open, then acknowledged, then resolved (or cancelled). */
export type ServiceRequestStatus = components['schemas']['ServiceRequestStatus']

/** A request as the guest who raised it sees it (no staff identities). */
export type GuestServiceRequest = components['schemas']['GuestServiceRequestResponse']

/** Body the guest sends to raise a request. */
export type GuestServiceRequestCreate = components['schemas']['GuestServiceRequestCreate']

/** A request as staff see it in the POS service hub. */
export type StaffServiceRequest = components['schemas']['ServiceRequestResponse']
