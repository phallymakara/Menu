import { create } from 'zustand'

interface AuthModalState {
  isRegisterOpen: boolean
  openRegisterModal: () => void
  closeRegisterModal: () => void
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isRegisterOpen: false,
  openRegisterModal: () => set({ isRegisterOpen: true }),
  closeRegisterModal: () => set({ isRegisterOpen: false }),
}))
