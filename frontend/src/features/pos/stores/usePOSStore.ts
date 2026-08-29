import { create } from 'zustand'
import {
  POSTable,
  POSDiningZone,
  POSPlacedRound,
  POSPlacedItem,
  POSCartItem,
  POSBillSummary,
  POSCashTenderResult,
} from '../types/pos.types'

/**
 * Cambodian 100-Riel rounding calculation helper.
 * Rounds to nearest 100 Riel (e.g. 26,740 -> 26,700; 26,750 -> 26,800).
 */
export function roundToNearest100Riel(amount: number): number {
  return Math.round(amount / 100) * 100
}

export function calculateCashChange(
  grandTotalUSD: number,
  exchangeRate: number,
  tenderedUSD: number,
  tenderedKHR: number,
  preference: 'khr' | 'usd' | 'split' = 'khr'
): POSCashTenderResult {
  const totalTenderedUSD = tenderedUSD + tenderedKHR / exchangeRate
  const diffUSD = totalTenderedUSD - grandTotalUSD

  if (diffUSD < -0.005) {
    return {
      amount_tendered_usd: tenderedUSD,
      amount_tendered_khr: tenderedKHR,
      total_tendered_usd: totalTenderedUSD,
      change_usd: 0,
      change_khr: 0,
      preference,
      is_exact_or_sufficient: false,
    }
  }

  if (Math.abs(diffUSD) < 0.005) {
    return {
      amount_tendered_usd: tenderedUSD,
      amount_tendered_khr: tenderedKHR,
      total_tendered_usd: totalTenderedUSD,
      change_usd: 0,
      change_khr: 0,
      preference,
      is_exact_or_sufficient: true,
    }
  }

  if (preference === 'usd') {
    const wholeUSD = Math.floor(diffUSD)
    const remUSD = diffUSD - wholeUSD
    const changeKHR = roundToNearest100Riel(remUSD * exchangeRate)
    return {
      amount_tendered_usd: tenderedUSD,
      amount_tendered_khr: tenderedKHR,
      total_tendered_usd: totalTenderedUSD,
      change_usd: wholeUSD,
      change_khr: changeKHR,
      preference,
      is_exact_or_sufficient: true,
    }
  }

  // Preference KHR
  const changeKHR = roundToNearest100Riel(diffUSD * exchangeRate)
  return {
    amount_tendered_usd: tenderedUSD,
    amount_tendered_khr: tenderedKHR,
    total_tendered_usd: totalTenderedUSD,
    change_usd: 0,
    change_khr: changeKHR,
    preference,
    is_exact_or_sufficient: true,
  }
}

interface POSState {
  zones: POSDiningZone[]
  tables: POSTable[]
  selectedTable: POSTable | null
  activeRounds: POSPlacedRound[]
  billSummary: POSBillSummary | null
  activeCart: POSCartItem[]
  viewMode: 'floor_map' | 'direct_order'
  selectedZoneId: string
  exchangeRate: number
  taxPercentage: number

  // Modal controls
  isCashModalOpen: boolean
  isKHQRModalOpen: boolean
  isVoidModalOpen: boolean
  isReceiptModalOpen: boolean
  lastPaymentId: string | null
  targetVoidItem: POSPlacedItem | null

  // Actions
  setZones: (zones: POSDiningZone[]) => void
  setTables: (tables: POSTable[]) => void
  setSelectedTable: (table: POSTable | null) => void
  setActiveRounds: (rounds: POSPlacedRound[]) => void
  setBillSummary: (summary: POSBillSummary | null) => void
  setViewMode: (mode: 'floor_map' | 'direct_order') => void
  setSelectedZoneId: (zoneId: string) => void
  setExchangeRate: (rate: number) => void

  // Cart actions
  addToCart: (item: POSCartItem) => void
  updateCartQuantity: (cartItemId: string, quantity: number) => void
  removeFromCart: (cartItemId: string) => void
  clearCart: () => void

  // Modal openers
  openCashModal: () => void
  closeCashModal: () => void
  openKHQRModal: () => void
  closeKHQRModal: () => void
  openVoidModal: (item: POSPlacedItem) => void
  closeVoidModal: () => void
  openReceiptModal: (paymentId: string) => void
  closeReceiptModal: () => void

  // Optimistic table update
  updateTableStatus: (tableId: string, status: POSTable['status'], sessionId?: string | null) => void
}

export const usePOSStore = create<POSState>((set) => ({
  zones: [],
  tables: [],
  selectedTable: null,
  activeRounds: [],
  billSummary: null,
  activeCart: [],
  viewMode: 'floor_map',
  selectedZoneId: 'all',
  exchangeRate: 4100,
  taxPercentage: 10,

  isCashModalOpen: false,
  isKHQRModalOpen: false,
  isVoidModalOpen: false,
  isReceiptModalOpen: false,
  lastPaymentId: null,
  targetVoidItem: null,

  setZones: (zones) => set({ zones }),
  setTables: (tables) => set({ tables }),
  setSelectedTable: (selectedTable) => set({ selectedTable }),
  setActiveRounds: (activeRounds) => set({ activeRounds }),
  setBillSummary: (billSummary) => set({ billSummary }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedZoneId: (selectedZoneId) => set({ selectedZoneId }),
  setExchangeRate: (exchangeRate) => set({ exchangeRate }),

  addToCart: (item) =>
    set((state) => {
      const idx = state.activeCart.findIndex((i) => i.cart_item_id === item.cart_item_id)
      if (idx >= 0) {
        const updated = [...state.activeCart]
        const existing = updated[idx]
        const newQty = existing.quantity + item.quantity
        updated[idx] = {
          ...existing,
          quantity: newQty,
          total_price_usd: existing.unit_price_usd * newQty,
        }
        return { activeCart: updated }
      }
      return { activeCart: [...state.activeCart, item] }
    }),

  updateCartQuantity: (cartItemId, quantity) =>
    set((state) => ({
      activeCart:
        quantity <= 0
          ? state.activeCart.filter((i) => i.cart_item_id !== cartItemId)
          : state.activeCart.map((i) =>
              i.cart_item_id === cartItemId
                ? { ...i, quantity, total_price_usd: i.unit_price_usd * quantity }
                : i
            ),
    })),

  removeFromCart: (cartItemId) =>
    set((state) => ({
      activeCart: state.activeCart.filter((i) => i.cart_item_id !== cartItemId),
    })),

  clearCart: () => set({ activeCart: [] }),

  openCashModal: () => set({ isCashModalOpen: true }),
  closeCashModal: () => set({ isCashModalOpen: false }),
  openKHQRModal: () => set({ isKHQRModalOpen: true }),
  closeKHQRModal: () => set({ isKHQRModalOpen: false }),
  openVoidModal: (item) => set({ isVoidModalOpen: true, targetVoidItem: item }),
  closeVoidModal: () => set({ isVoidModalOpen: false, targetVoidItem: null }),
  openReceiptModal: (paymentId) => set({ isReceiptModalOpen: true, lastPaymentId: paymentId }),
  closeReceiptModal: () => set({ isReceiptModalOpen: false }),

  updateTableStatus: (tableId, status, sessionId) =>
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, status, session_id: sessionId !== undefined ? sessionId : t.session_id } : t
      ),
      selectedTable:
        state.selectedTable?.id === tableId
          ? {
              ...state.selectedTable,
              status,
              session_id: sessionId !== undefined ? sessionId : state.selectedTable.session_id,
            }
          : state.selectedTable,
    })),
}))
