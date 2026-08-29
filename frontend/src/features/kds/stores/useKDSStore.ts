import { create } from 'zustand'
import {
  KitchenStation,
  KDSTicket,
  OrderItemStatus,
  StationMetrics,
} from '../types/kds.types'

interface KDSState {
  stations: KitchenStation[]
  selectedStationId: string // 'expo' or specific station UUID
  tickets: KDSTicket[]
  recalledTickets: KDSTicket[]
  metrics: StationMetrics | null
  isMuted: boolean
  isRecallOpen: boolean
  isLoading: boolean
  error: string | null

  setStations: (stations: KitchenStation[]) => void
  setSelectedStation: (stationId: string) => void
  setTickets: (tickets: KDSTicket[]) => void
  setRecalledTickets: (recalledTickets: KDSTicket[]) => void
  setMetrics: (metrics: StationMetrics | null) => void
  setIsMuted: (isMuted: boolean) => void
  toggleMute: () => void
  setIsRecallOpen: (isOpen: boolean) => void
  toggleRecall: () => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void

  // Optimistic bump actions
  bumpItemStatus: (orderItemId: string, targetStatus: OrderItemStatus) => void
  removeTicket: (orderId: string) => void
  addTicket: (ticket: KDSTicket) => void
}

export const useKDSStore = create<KDSState>((set) => ({
  stations: [],
  selectedStationId: 'expo',
  tickets: [],
  recalledTickets: [],
  metrics: null,
  isMuted: false,
  isRecallOpen: false,
  isLoading: false,
  error: null,

  setStations: (stations) => set({ stations }),
  setSelectedStation: (selectedStationId) => set({ selectedStationId, error: null }),
  setTickets: (tickets) => set({ tickets }),
  setRecalledTickets: (recalledTickets) => set({ recalledTickets }),
  setMetrics: (metrics) => set({ metrics }),
  setIsMuted: (isMuted) => set({ isMuted }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setIsRecallOpen: (isRecallOpen) => set({ isRecallOpen }),
  toggleRecall: () => set((state) => ({ isRecallOpen: !state.isRecallOpen })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  bumpItemStatus: (orderItemId, targetStatus) =>
    set((state) => ({
      tickets: state.tickets.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.id === orderItemId ? { ...i, status: targetStatus } : i
        ),
      })),
    })),

  removeTicket: (orderId) =>
    set((state) => {
      const targetTicket = state.tickets.find((t) => t.order_id === orderId)
      return {
        tickets: state.tickets.filter((t) => t.order_id !== orderId),
        recalledTickets: targetTicket
          ? [targetTicket, ...state.recalledTickets.slice(0, 20)]
          : state.recalledTickets,
      }
    }),

  addTicket: (ticket) =>
    set((state) => {
      // Avoid duplicate tickets
      const exists = state.tickets.some((t) => t.order_id === ticket.order_id)
      if (exists) {
        return {
          tickets: state.tickets.map((t) => (t.order_id === ticket.order_id ? ticket : t)),
        }
      }
      return { tickets: [ticket, ...state.tickets] }
    }),
}))
