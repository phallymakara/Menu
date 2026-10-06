import { describe, expect, it } from 'vitest'
import { en, getTranslation, km } from '@/locales'
import type { GuestServiceRequest, StaffServiceRequest } from '../types/serviceHub.types'
import {
  SERVICE_REQUEST_TYPES,
  applyStaffRequestUpdate,
  bannerDismissKey,
  formatElapsed,
  getSlaLevel,
  guestRequestErrorKey,
  interpolate,
  isActiveServiceRequest,
  isServiceRequestEvent,
  normalizeServiceRequestNote,
  parseServiceHubEvent,
  pickGuestBannerRequest,
  requiresNote,
  secondsSince,
  serviceRequestTypeHintKey,
  serviceRequestTypeLabelKey,
  sortServiceQueue,
  staffActionErrorKey,
} from './serviceRequests'

const T0 = Date.parse('2026-10-05T10:00:00Z')
const at = (secondsAfterT0: number) => new Date(T0 + secondsAfterT0 * 1000).toISOString()

const staffRequest = (overrides: Partial<StaffServiceRequest> = {}): StaffServiceRequest => ({
  id: 'req-1',
  business_id: 'biz',
  branch_id: 'branch',
  table_id: 'table-1',
  table_session_id: 'session-1',
  table_number: 'T-01',
  request_type: 'water',
  status: 'open',
  created_at: at(0),
  ...overrides,
})

const guestRequest = (overrides: Partial<GuestServiceRequest> = {}): GuestServiceRequest => ({
  id: 'req-1',
  table_id: 'table-1',
  table_number: 'T-01',
  request_type: 'water',
  status: 'open',
  created_at: at(0),
  ...overrides,
})

describe('request status and note helpers', () => {
  it('treats open and acknowledged requests as still waiting on staff', () => {
    expect(isActiveServiceRequest('open')).toBe(true)
    expect(isActiveServiceRequest('acknowledged')).toBe(true)
    expect(isActiveServiceRequest('resolved')).toBe(false)
    expect(isActiveServiceRequest('cancelled')).toBe(false)
  })

  it('requires a note only for custom requests', () => {
    expect(SERVICE_REQUEST_TYPES.filter(requiresNote)).toEqual(['custom'])
  })

  it('trims notes and turns blank ones into null, like the backend', () => {
    expect(normalizeServiceRequestNote('  less ice  ')).toBe('less ice')
    expect(normalizeServiceRequestNote('   ')).toBeNull()
    expect(normalizeServiceRequestNote(undefined)).toBeNull()
  })

  it('fills named placeholders and leaves unknown ones alone', () => {
    expect(interpolate('Table {table} ({count})', { table: 'T-05', count: 2 })).toBe('Table T-05 (2)')
    expect(interpolate('Taken by {name}', {})).toBe('Taken by {name}')
  })
})

describe('timers and SLA', () => {
  it('counts whole seconds and never goes negative', () => {
    expect(secondsSince(at(0), T0 + 75_900)).toBe(75)
    expect(secondsSince(at(10), T0)).toBe(0)
    expect(secondsSince('not a date', T0)).toBe(0)
  })

  it('formats durations as mm:ss, past an hour too', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(75)).toBe('01:15')
    expect(formatElapsed(3725)).toBe('62:05')
  })

  it('turns amber at two minutes and red at five', () => {
    expect(getSlaLevel(at(0), T0 + 119_000)).toBe('normal')
    expect(getSlaLevel(at(0), T0 + 120_000)).toBe('warning')
    expect(getSlaLevel(at(0), T0 + 299_000)).toBe('warning')
    expect(getSlaLevel(at(0), T0 + 300_000)).toBe('critical')
  })
})

describe('staff queue', () => {
  it('lists open requests before acknowledged ones, oldest first', () => {
    const input = [
      staffRequest({ id: 'ack-old', status: 'acknowledged', created_at: at(0) }),
      staffRequest({ id: 'open-new', created_at: at(60) }),
      staffRequest({ id: 'open-old', created_at: at(30) }),
    ]

    expect(sortServiceQueue(input).map((r) => r.id)).toEqual(['open-old', 'open-new', 'ack-old'])
    expect(input[0].id).toBe('ack-old')
  })

  it('replaces an updated request in place and drops it once resolved', () => {
    const queue = [staffRequest({ id: 'a' }), staffRequest({ id: 'b' })]

    const acknowledged = applyStaffRequestUpdate(queue, staffRequest({ id: 'a', status: 'acknowledged' }))
    expect(acknowledged.map((r) => [r.id, r.status])).toEqual([
      ['a', 'acknowledged'],
      ['b', 'open'],
    ])

    const resolved = applyStaffRequestUpdate(queue, staffRequest({ id: 'b', status: 'resolved' }))
    expect(resolved.map((r) => r.id)).toEqual(['a'])
  })

  it('adds an active request the cache did not have yet', () => {
    expect(applyStaffRequestUpdate(undefined, staffRequest({ id: 'new' })).map((r) => r.id)).toEqual(['new'])
    expect(applyStaffRequestUpdate(undefined, staffRequest({ status: 'resolved' }))).toEqual([])
  })
})

describe('guest banner', () => {
  it('follows the newest request still waiting on staff', () => {
    const requests = [
      guestRequest({ id: 'water', created_at: at(0) }),
      guestRequest({ id: 'bill', request_type: 'bill', status: 'acknowledged', created_at: at(30) }),
      guestRequest({ id: 'done', status: 'resolved', created_at: at(90) }),
    ]

    expect(pickGuestBannerRequest(requests)?.id).toBe('bill')
    expect(pickGuestBannerRequest([guestRequest({ status: 'resolved' })])).toBeNull()
    expect(pickGuestBannerRequest(undefined)).toBeNull()
  })

  it('brings a dismissed banner back when the request moves on', () => {
    const sent = bannerDismissKey(guestRequest({ status: 'open' }))
    const onTheWay = bannerDismissKey(guestRequest({ status: 'acknowledged' }))

    expect(sent).not.toBe(onTheWay)
  })
})

describe('parseServiceHubEvent', () => {
  it('reads service request and bill events from the hub envelope', () => {
    const created = parseServiceHubEvent({
      event: 'service_request.created',
      branch_id: 'branch',
      data: { id: 'req-1', table_id: 'table-1', status: 'open' },
    })
    expect(created).toEqual({ name: 'service_request.created', tableId: 'table-1', status: 'open' })
    expect(isServiceRequestEvent(created)).toBe(true)

    const bill = parseServiceHubEvent({
      event: 'table_session.bill_requested',
      data: { table_id: 'table-2', table_number: 'T-02' },
    })
    expect(bill).toEqual({ name: 'table_session.bill_requested', tableId: 'table-2', status: null })
    expect(isServiceRequestEvent(bill)).toBe(false)
  })

  it('ignores unrelated or malformed messages', () => {
    expect(parseServiceHubEvent({ event: 'order.created', data: {} })).toBeNull()
    expect(parseServiceHubEvent('pong')).toBeNull()
    expect(parseServiceHubEvent(null)).toBeNull()
    expect(parseServiceHubEvent({ event: 'service_request.updated' })).toEqual({
      name: 'service_request.updated',
      tableId: null,
      status: null,
    })
    expect(isServiceRequestEvent(null)).toBe(false)
  })
})

describe('error messages', () => {
  it('maps guest failures to duplicate, session ended, or generic', () => {
    expect(guestRequestErrorKey(409)).toBe('serviceHub.guest.errorDuplicate')
    expect(guestRequestErrorKey(401)).toBe('serviceHub.guest.errorSessionEnded')
    expect(guestRequestErrorKey(500)).toBe('serviceHub.guest.errorGeneric')
    expect(guestRequestErrorKey(undefined)).toBe('serviceHub.guest.errorGeneric')
  })

  it('maps staff conflicts to "already handled"', () => {
    expect(staffActionErrorKey(409)).toBe('serviceHub.staff.alreadyHandled')
    expect(staffActionErrorKey(403)).toBe('serviceHub.staff.actionFailed')
  })
})

describe('service hub translations', () => {
  const flattenKeys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) =>
          flattenKeys(child, prefix ? `${prefix}.${key}` : key)
        )
      : [prefix]

  it('has the same keys in English and Khmer', () => {
    expect(flattenKeys(km.serviceHub).sort()).toEqual(flattenKeys(en.serviceHub).sort())
  })

  it('has a label, a hint, and every error message in both languages', () => {
    const keys = [
      ...SERVICE_REQUEST_TYPES.flatMap((type) => [
        serviceRequestTypeLabelKey(type),
        serviceRequestTypeHintKey(type),
      ]),
      guestRequestErrorKey(409),
      guestRequestErrorKey(401),
      guestRequestErrorKey(500),
      staffActionErrorKey(409),
      staffActionErrorKey(500),
    ]
    for (const key of keys) {
      // getTranslation returns the key itself when nothing matches.
      expect(getTranslation('en', key)).not.toBe(key)
      expect(getTranslation('km', key)).not.toBe(key)
      expect(getTranslation('km', key)).not.toBe(getTranslation('en', key))
    }
  })
})
