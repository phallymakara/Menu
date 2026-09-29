import { describe, expect, it } from 'vitest'
import type { components } from '@/types/api'
import { toPOSRounds } from './orderMapping'

type OrderResponse = components['schemas']['OrderResponse']
type OrderItemResponse = components['schemas']['OrderItemResponse']

const item = (overrides: Partial<OrderItemResponse> = {}): OrderItemResponse => ({
  id: 'oi-1',
  menu_item_id: 'mi-1',
  item_name_en: 'Amok',
  base_unit_price: '5.00',
  unit_price: '5.50',
  quantity: 2,
  subtotal_price: '11.00',
  course_stage: 'mains',
  status: 'preparing',
  created_at: '2026-09-28T10:00:00Z',
  modifiers: [],
  ...overrides,
})

const order = (overrides: Partial<OrderResponse> = {}): OrderResponse => ({
  id: 'order-1',
  organization_id: 'org',
  business_id: 'biz',
  branch_id: 'branch',
  table_id: 'table-1',
  table_session_id: 'session-1',
  order_number: 'A-001',
  order_type: 'dine_in',
  order_source: 'guest_qr',
  round_number: 1,
  status: 'confirmed',
  subtotal_usd: '11.00',
  subtotal_khr: '45100',
  tax_rate_percent: '10',
  tax_amount_usd: '1.10',
  service_charge_percent: '0',
  service_charge_amount_usd: '0',
  total_amount_usd: '12.10',
  total_amount_khr: '49600',
  items: [item()],
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z',
  ...overrides,
})

describe('toPOSRounds', () => {
  it('maps API orders to POS rounds with numeric prices and UI enums', () => {
    const [round] = toPOSRounds(
      [order({ items: [item({ modifiers: [{ id: 'm', modifier_option_id: 'o', name_en: 'Extra rice', unit_price: '0.50', quantity: 1 }] })] })],
      'session-1'
    )

    expect(round).toMatchObject({ id: 'order-1', order_number: 'A-001', subtotal_usd: 11 })
    expect(round.items[0]).toMatchObject({
      unit_price_usd: 5.5,
      subtotal_usd: 11,
      course_stage: 'MAINS',
      status: 'PREPARING',
      modifiers_summary: 'Extra rice',
    })
  })

  it('keeps only the requested session and drops cancelled orders', () => {
    const rounds = toPOSRounds(
      [
        order({ id: 'current' }),
        order({ id: 'old-session', table_session_id: 'session-0' }),
        order({ id: 'cancelled', status: 'cancelled' }),
      ],
      'session-1'
    )

    expect(rounds.map((r) => r.id)).toEqual(['current'])
  })

  it('hides voided items and sorts rounds in placement order', () => {
    const rounds = toPOSRounds(
      [
        order({ id: 'second', round_number: 2 }),
        order({ id: 'first', round_number: 1, items: [item(), item({ id: 'void', status: 'voided' })] }),
      ],
      'session-1'
    )

    expect(rounds.map((r) => r.id)).toEqual(['first', 'second'])
    expect(rounds[0].items.map((i) => i.id)).toEqual(['oi-1'])
  })

  it('maps backend course names to the POS labels', () => {
    const [round] = toPOSRounds([order({ items: [item({ course_stage: 'starters', status: 'ready_to_serve' })] })], 'session-1')
    expect(round.items[0].course_stage).toBe('APPETIZERS')
    expect(round.items[0].status).toBe('READY')
  })
})
