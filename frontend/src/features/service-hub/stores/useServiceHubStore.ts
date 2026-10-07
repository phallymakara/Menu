import { create } from 'zustand'

/**
 * Client-only UI state for the service hub. The requests themselves are server
 * state and live in TanStack Query (see `useServiceRequestQueries`).
 */
interface ServiceHubState {
  isDrawerOpen: boolean
  isMuted: boolean
  isRequestModalOpen: boolean

  setIsDrawerOpen: (isOpen: boolean) => void
  toggleDrawer: () => void
  setIsMuted: (isMuted: boolean) => void
  toggleMute: () => void
  openRequestModal: () => void
  closeRequestModal: () => void
}

export const useServiceHubStore = create<ServiceHubState>((set) => ({
  isDrawerOpen: false,
  isMuted: false,
  isRequestModalOpen: false,

  setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
  setIsMuted: (isMuted) => set({ isMuted }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  openRequestModal: () => set({ isRequestModalOpen: true }),
  closeRequestModal: () => set({ isRequestModalOpen: false }),
}))
