import { create } from 'zustand'
import { CartItem, CourseStage, MenuItem, ItemVariant, CartModifierSelection } from '../types/guest.types'

interface CartState {
  items: CartItem[]
  addItem: (
    item: MenuItem,
    variant: ItemVariant | null,
    modifiers: CartModifierSelection[],
    courseStage: CourseStage,
    specialInstructions: string,
    quantity: number
  ) => void
  updateQuantity: (cartItemId: string, newQuantity: number) => void
  removeItem: (cartItemId: string) => void
  clearCart: () => void
  getTotalUSD: () => number
  getTotalItemCount: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (menuItem, variant, modifiers, courseStage, specialInstructions, quantity) => {
    const basePrice = variant ? variant.price_usd : menuItem.base_price_usd
    const modifierTotal = modifiers.reduce((sum, m) => sum + m.price_adjustment_usd, 0)
    const unitPrice = basePrice + modifierTotal

    const cartItemId = `${menuItem.id}-${variant?.id || 'none'}-${modifiers.map(m => m.modifier_option_id).sort().join('-')}-${courseStage}-${specialInstructions}`

    set((state) => {
      const existingIdx = state.items.findIndex(i => i.cart_item_id === cartItemId)

      if (existingIdx >= 0) {
        const updated = [...state.items]
        const existing = updated[existingIdx]
        const newQty = existing.quantity + quantity
        updated[existingIdx] = {
          ...existing,
          quantity: newQty,
          total_price_usd: unitPrice * newQty,
        }
        return { items: updated }
      } else {
        const newItem: CartItem = {
          cart_item_id: cartItemId,
          menu_item: menuItem,
          variant,
          selected_modifiers: modifiers,
          course_stage: courseStage,
          special_instructions: specialInstructions,
          unit_price_usd: unitPrice,
          quantity,
          total_price_usd: unitPrice * quantity,
        }
        return { items: [...state.items, newItem] }
      }
    })
  },

  updateQuantity: (cartItemId, newQuantity) => {
    if (newQuantity <= 0) {
      get().removeItem(cartItemId)
      return
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.cart_item_id === cartItemId
          ? { ...i, quantity: newQuantity, total_price_usd: i.unit_price_usd * newQuantity }
          : i
      ),
    }))
  },

  removeItem: (cartItemId) => {
    set((state) => ({
      items: state.items.filter((i) => i.cart_item_id !== cartItemId),
    }))
  },

  clearCart: () => {
    set({ items: [] })
  },

  getTotalUSD: () => {
    return get().items.reduce((sum, item) => sum + item.total_price_usd, 0)
  },

  getTotalItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0)
  },
}))
