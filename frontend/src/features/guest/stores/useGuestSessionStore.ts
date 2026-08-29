import { create } from 'zustand'
import { TableContextInfo, PlacedOrderRound, PlacedOrderItem, OrderItemStatus } from '../types/guest.types'

interface GuestSessionState {
  token: string | null
  table: TableContextInfo | null
  sessionId: string | null
  sessionToken: string | null
  sessionCode: string | null
  orderRounds: PlacedOrderRound[]
  isLoading: boolean
  error: string | null

  setTableContext: (
    token: string,
    table: TableContextInfo,
    sessionId?: string | null,
    sessionToken?: string | null,
    sessionCode?: string | null
  ) => void
  setSession: (sessionId: string, sessionToken: string, sessionCode?: string | null) => void
  setOrderRounds: (rounds: PlacedOrderRound[]) => void
  addOrderRound: (round: PlacedOrderRound) => void
  updateItemStatus: (itemId: string, status: OrderItemStatus) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetSession: () => void
}

export const useGuestSessionStore = create<GuestSessionState>((set) => ({
  token: null,
  table: null,
  sessionId: null,
  sessionToken: null,
  sessionCode: null,
  orderRounds: [],
  isLoading: false,
  error: null,

  setTableContext: (token, table, sessionId, sessionToken, sessionCode) => {
    set({
      token,
      table,
      sessionId: sessionId ?? null,
      sessionToken: sessionToken ?? null,
      sessionCode: sessionCode ?? null,
      error: null,
    })
  },

  setSession: (sessionId, sessionToken, sessionCode) => {
    set({ sessionId, sessionToken, sessionCode: sessionCode ?? null })
  },

  setOrderRounds: (orderRounds) => {
    set({ orderRounds })
  },

  addOrderRound: (round) => {
    set((state) => ({
      orderRounds: [round, ...state.orderRounds],
    }))
  },

  updateItemStatus: (itemId, status) => {
    set((state) => ({
      orderRounds: state.orderRounds.map((round) => ({
        ...round,
        items: round.items.map((item: PlacedOrderItem) =>
          item.id === itemId ? { ...item, status } : item
        ),
      })),
    }))
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  resetSession: () =>
    set({
      token: null,
      table: null,
      sessionId: null,
      sessionToken: null,
      sessionCode: null,
      orderRounds: [],
      error: null,
    }),
}))
