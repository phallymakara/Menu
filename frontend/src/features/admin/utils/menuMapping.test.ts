import { describe, expect, it } from 'vitest'
import type { MenuItemResponse } from '../hooks/useMenuQueries'
import type { MenuItem, ModifierOption } from '../types/admin.types'
import {
  addOptionToGroups,
  filterMenuItems,
  removeOptionFromGroups,
  toMenuItem,
  toModifierGroups,
} from './menuMapping'

const option = (id: string): ModifierOption => ({
  id,
  name_en: id,
  name_km: id,
  price_usd: 0.5,
  is_default: false,
})

describe('toMenuItem', () => {
  it('converts the decimal price string and derives KHR', () => {
    const item = toMenuItem({
      id: 'mi-1',
      organization_id: 'org',
      business_id: 'biz',
      category_id: null,
      name_en: 'Iced coffee',
      name_km: null,
      base_price: '2.50',
      kitchen_station: 'bar',
      is_active: false,
    } as MenuItemResponse)

    expect(item).toMatchObject({
      price_usd: 2.5,
      price_khr: 10_250,
      name_km: 'Iced coffee',
      category_id: '',
      is_available: false,
      kitchen_station: 'BAR',
    })
  })
})

describe('toModifierGroups', () => {
  it('maps option prices and marks groups with a minimum as required', () => {
    const [group] = toModifierGroups([
      {
        id: 'g1',
        organization_id: 'org',
        business_id: 'biz',
        name_en: 'Sugar',
        min_selections: 1,
        max_selections: 1,
        created_at: '',
        updated_at: '',
        options: [
          {
            id: 'o1',
            organization_id: 'org',
            business_id: 'biz',
            group_id: 'g1',
            name_en: 'Less sugar',
            price: '0.25',
            created_at: '',
            updated_at: '',
          },
        ],
      },
    ])

    expect(group.is_required).toBe(true)
    expect(group.options[0]).toMatchObject({ price_usd: 0.25, name_km: 'Less sugar', is_default: false })
  })
})

describe('option editing', () => {
  it('creates a default group for the first option', () => {
    const groups = addOptionToGroups([], option('opt_a'), 'mg_new')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'mg_new', name_en: 'Options', max_selections: 20 })
    expect(groups[0].options.map((o) => o.id)).toEqual(['opt_a'])
  })

  it('appends to the first existing group', () => {
    const groups = addOptionToGroups(addOptionToGroups([], option('opt_a')), option('opt_b'))
    expect(groups[0].options.map((o) => o.id)).toEqual(['opt_a', 'opt_b'])
  })

  it('removes an option and drops groups left empty', () => {
    const groups = addOptionToGroups([], option('opt_a'))
    expect(removeOptionFromGroups(groups, 'opt_a')).toEqual([])
  })
})

describe('filterMenuItems', () => {
  const items = [
    { id: '1', category_id: 'drinks', name_en: 'Iced Latte', name_km: 'កាហ្វេ' },
    { id: '2', category_id: 'mains', name_en: 'Fish Amok', name_km: 'អាម៉ុក' },
  ] as MenuItem[]

  it('filters by category and case-insensitive English name', () => {
    expect(filterMenuItems(items, 'all', 'latte').map((i) => i.id)).toEqual(['1'])
    expect(filterMenuItems(items, 'mains', '').map((i) => i.id)).toEqual(['2'])
  })

  it('matches Khmer names', () => {
    expect(filterMenuItems(items, 'all', 'អាម៉ុក').map((i) => i.id)).toEqual(['2'])
  })
})
