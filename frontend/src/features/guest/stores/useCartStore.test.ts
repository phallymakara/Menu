import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './useCartStore'
import type { CartModifierSelection, ItemVariant, MenuItem } from '../types/guest.types'

const lokLak: MenuItem = {
  id: 'item-1',
  category_id: 'cat-1',
  name_en: 'Beef Lok Lak',
  name_km: null,
  description_en: null,
  description_km: null,
  base_price_usd: 6,
  image_url: null,
  is_available: true,
  variants: [],
  modifier_groups: [],
}

const large: ItemVariant = { id: 'var-l', name_en: 'Large', name_km: null, price_usd: 8, is_default: false }

const egg: CartModifierSelection = {
  modifier_group_id: 'grp-1',
  modifier_group_name: 'Add-ons',
  modifier_option_id: 'opt-egg',
  modifier_option_name: 'Fried egg',
  price_adjustment_usd: 0.5,
}

const cart = () => useCartStore.getState()

describe('useCartStore', () => {
  beforeEach(() => {
    cart().clearCart()
  })

  it('prices a line from the variant plus modifiers', () => {
    cart().addItem(lokLak, large, [egg], 'MAINS', '', 2)

    const [line] = cart().items
    expect(line.unit_price_usd).toBe(8.5)
    expect(line.total_price_usd).toBe(17)
    expect(cart().getTotalUSD()).toBe(17)
    expect(cart().getTotalItemCount()).toBe(2)
  })

  it('merges identical selections into one line', () => {
    cart().addItem(lokLak, null, [], 'MAINS', '', 1)
    cart().addItem(lokLak, null, [], 'MAINS', '', 2)

    expect(cart().items).toHaveLength(1)
    expect(cart().items[0].quantity).toBe(3)
    expect(cart().items[0].total_price_usd).toBe(18)
  })

  it('keeps different instructions or courses on separate lines', () => {
    cart().addItem(lokLak, null, [], 'MAINS', '', 1)
    cart().addItem(lokLak, null, [], 'MAINS', 'No onion', 1)
    cart().addItem(lokLak, null, [], 'APPETIZERS', '', 1)

    expect(cart().items).toHaveLength(3)
  })

  it('updates quantity and removes the line at zero', () => {
    cart().addItem(lokLak, null, [], 'MAINS', '', 1)
    const id = cart().items[0].cart_item_id

    cart().updateQuantity(id, 4)
    expect(cart().items[0].total_price_usd).toBe(24)

    cart().updateQuantity(id, 0)
    expect(cart().items).toHaveLength(0)
  })
})
