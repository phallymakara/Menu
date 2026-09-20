import { create } from 'zustand'
import {
  BusinessProfileForm,
  BranchForm,
  DiningAreaItem,
  GeneratedTable,
} from '../types/onboarding.types'

interface OnboardingState {
  currentStep: number // 1, 2, 3, 4
  businessProfile: BusinessProfileForm
  branch: BranchForm
  branches: BranchForm[]
  diningAreas: DiningAreaItem[]
  generatedTables: GeneratedTable[]
  isLoading: boolean
  error: string | null
  step2Errors: Record<string, string>

  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setStep2Errors: (errors: Record<string, string>) => void
  clearStep2Error: (field: string) => void
  updateBusinessProfile: (updates: Partial<BusinessProfileForm>) => void
  updateBranch: (updates: Partial<BranchForm>) => void
  switchBranch: (branchCode: string) => void
  addBranch: (newBranch: BranchForm) => void
  setDiningAreas: (areas: DiningAreaItem[]) => void
  addDiningArea: (area: DiningAreaItem) => void
  removeDiningArea: (id: string) => void
  generateTablesFromAreas: () => void
  setLoading: (loading: boolean) => void
  setError: (err: string | null) => void
  resetOnboarding: () => void
}

const initialBusinessProfile: BusinessProfileForm = {
  business_type: 'RESTAURANT',
  name_en: '',
  name_km: '',
  logo_url: null,
  description: '',
  base_currency: 'USD',
  exchange_rate: 4100,
  tax_percentage: 10,
  is_tax_inclusive: true,
  service_charge_percentage: 0,
  is_service_charge_inclusive: false,
}

const initialBranch: BranchForm = {
  name_en: '',
  name_km: '',
  branch_code: '',
  phone: '',
  address: '',
  opening_time: '',
  closing_time: '',
  bakong_account_id: '',
  bakong_merchant_name: '',
  bakong_acquiring_bank: 'ABA Bank',
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  currentStep: 1,
  businessProfile: { ...initialBusinessProfile },
  branch: { ...initialBranch },
  branches: [],


  diningAreas: [
    {
      id: 'area-1',
      name_en: 'Main Dining Hall',
      name_km: 'សាលធំ',
      tables_count: 8,
      default_capacity: 4,
      table_prefix: 'T-',
    },
    {
      id: 'area-2',
      name_en: 'Garden Terrace',
      name_km: 'ទីធ្លាសួនច្បារ',
      tables_count: 6,
      default_capacity: 2,
      table_prefix: 'G-',
    },
    {
      id: 'area-3',
      name_en: 'VIP Private Room',
      name_km: 'បន្ទប់ពិសេស',
      tables_count: 2,
      default_capacity: 8,
      table_prefix: 'VIP-',
    },
  ],

  generatedTables: [],
  isLoading: false,
  error: null,
  step2Errors: {},

  setStep: (step) => set({ currentStep: Math.min(Math.max(step, 1), 4) }),
  nextStep: () => {
    const current = get().currentStep
    if (current === 3) {
      get().generateTablesFromAreas()
    }
    set({ currentStep: Math.min(current + 1, 4) })
  },
  prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),

  setStep2Errors: (errors) => set({ step2Errors: errors }),
  clearStep2Error: (field) =>
    set((state) => {
      const next = { ...state.step2Errors }
      delete next[field]
      return { step2Errors: next }
    }),

  updateBusinessProfile: (updates) =>
    set((state) => ({
      businessProfile: { ...state.businessProfile, ...updates },
    })),

  updateBranch: (updates) =>
    set((state) => ({
      branch: { ...state.branch, ...updates },
    })),

  switchBranch: (branchCode) => {
    const found = get().branches.find((b) => b.branch_code === branchCode)
    if (found) {
      set({ branch: found })
    }
  },

  addBranch: (newBranch) => {
    set((state) => ({
      branches: [...state.branches, newBranch],
      branch: newBranch,
    }))
  },

  setDiningAreas: (diningAreas) => set({ diningAreas }),

  addDiningArea: (area) =>
    set((state) => ({
      diningAreas: [...state.diningAreas, area],
    })),

  removeDiningArea: (id) =>
    set((state) => ({
      diningAreas: state.diningAreas.filter((a) => a.id !== id),
    })),

  generateTablesFromAreas: () => {
    const areas = get().diningAreas
    const tables: GeneratedTable[] = []

    areas.forEach((area) => {
      for (let i = 1; i <= area.tables_count; i++) {
        const numStr = i < 10 ? `0${i}` : `${i}`
        const tableNum = `${area.table_prefix}${numStr}`
        tables.push({
          id: `tbl_${area.id}_${i}`,
          table_number: tableNum,
          area_name: area.name_en,
          capacity: area.default_capacity,
          qr_token: `token_${tableNum.toLowerCase().replace(/[^a-z0-9]/g, '-')}_${Date.now().toString(36)}`,
        })
      }
    })

    set({ generatedTables: tables })
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  resetOnboarding: () =>
    set({
      currentStep: 1,
      businessProfile: { ...initialBusinessProfile },
      branch: { ...initialBranch },
      branches: [],
      error: null,
      step2Errors: {},
    }),
}))
