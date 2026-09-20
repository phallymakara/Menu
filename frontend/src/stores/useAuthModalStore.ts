import { create } from 'zustand'

interface AuthModalState {
  isRegisterOpen: boolean
  isLoginOpen: boolean
  openRegisterModal: () => void
  closeRegisterModal: () => void
  openLoginModal: () => void
  closeLoginModal: () => void
  switchToLogin: () => void
  switchToRegister: () => void
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isRegisterOpen: false,
  isLoginOpen: false,
  openRegisterModal: () => set({ isRegisterOpen: true, isLoginOpen: false }),
  closeRegisterModal: () => set({ isRegisterOpen: false }),
  openLoginModal: () => set({ isLoginOpen: true, isRegisterOpen: false }),
  closeLoginModal: () => set({ isLoginOpen: false }),
  switchToLogin: () => set({ isRegisterOpen: false, isLoginOpen: true }),
  switchToRegister: () => set({ isLoginOpen: false, isRegisterOpen: true }),
}))
