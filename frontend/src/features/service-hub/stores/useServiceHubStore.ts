import { create } from 'zustand'
import { ServiceRequest, ServiceRequestStatus } from '../types/serviceHub.types'

interface ServiceHubState {
  requests: ServiceRequest[]
  activeCustomerRequest: ServiceRequest | null
  isDrawerOpen: boolean
  isMuted: boolean
  isRequestModalOpen: boolean

  setRequests: (requests: ServiceRequest[]) => void
  addRequest: (request: ServiceRequest) => void
  acknowledgeRequest: (requestId: string, staffName?: string) => void
  resolveRequest: (requestId: string) => void
  setCustomerRequest: (request: ServiceRequest | null) => void
  setIsDrawerOpen: (isOpen: boolean) => void
  toggleDrawer: () => void
  setIsMuted: (isMuted: boolean) => void
  toggleMute: () => void
  openRequestModal: () => void
  closeRequestModal: () => void
}

export const useServiceHubStore = create<ServiceHubState>((set) => ({
  requests: [
    {
      id: 'req-demo-1',
      table_id: 'tbl-2',
      table_number: 'T-02',
      dining_area_name: 'Main Hall',
      request_type: 'WATER',
      note: '2 glasses with less ice please',
      status: 'PENDING',
      requested_at: new Date(Date.now() - 75 * 1000).toISOString(), // 1m 15s ago
    },
    {
      id: 'req-demo-2',
      table_id: 'tbl-3',
      table_number: 'T-03',
      dining_area_name: 'Main Hall',
      request_type: 'REQUEST_BILL',
      note: 'Ready to settle with KHQR',
      status: 'PENDING',
      requested_at: new Date(Date.now() - 220 * 1000).toISOString(), // 3m 40s ago (Warning)
    },
  ],
  activeCustomerRequest: null,
  isDrawerOpen: false,
  isMuted: false,
  isRequestModalOpen: false,

  setRequests: (requests) => set({ requests }),

  addRequest: (request) =>
    set((state) => {
      const exists = state.requests.some((r) => r.id === request.id)
      if (exists) {
        return {
          requests: state.requests.map((r) => (r.id === request.id ? request : r)),
        }
      }
      return { requests: [request, ...state.requests] }
    }),

  acknowledgeRequest: (requestId, staffName = 'Staff') =>
    set((state) => ({
      requests: state.requests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'IN_PROGRESS' as ServiceRequestStatus,
              acknowledged_at: new Date().toISOString(),
              attended_by_name: staffName,
            }
          : r
      ),
      activeCustomerRequest:
        state.activeCustomerRequest?.id === requestId
          ? {
              ...state.activeCustomerRequest,
              status: 'IN_PROGRESS',
              attended_by_name: staffName,
            }
          : state.activeCustomerRequest,
    })),

  resolveRequest: (requestId) =>
    set((state) => ({
      requests: state.requests.filter((r) => r.id !== requestId),
      activeCustomerRequest:
        state.activeCustomerRequest?.id === requestId ? null : state.activeCustomerRequest,
    })),

  setCustomerRequest: (activeCustomerRequest) => set({ activeCustomerRequest }),
  setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
  setIsMuted: (isMuted) => set({ isMuted }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  openRequestModal: () => set({ isRequestModalOpen: true }),
  closeRequestModal: () => set({ isRequestModalOpen: false }),
}))
