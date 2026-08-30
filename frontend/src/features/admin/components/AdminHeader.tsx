import { useState, useEffect, useCallback, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Utensils,
  LogOut,
  Menu as MenuIcon,
  Camera,
  ChevronDown,
  Plus,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { api } from '@/lib/api'

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export interface RealBranch {
  id: string
  business_id: string
  name_en: string
  name_km?: string | null
  code: string
  phone?: string | null
  address?: string | null
  is_active: boolean
}

export const AdminHeader: FC<{ onToggleSidebar?: () => void }> = ({ onToggleSidebar }) => {
  const { language } = useLanguageStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [businessName, setBusinessName] = useState({
    en: 'Restaurant Menu',
    km: 'ម៉ឺនុយភោជនីយដ្ឋាន',
  })
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [branches, setBranches] = useState<RealBranch[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)
  const [isCreateBranchModalOpen, setIsCreateBranchModalOpen] = useState(false)
  const [isCreatingBranch, setIsCreatingBranch] = useState(false)

  const [newBranchForm, setNewBranchForm] = useState({
    name_en: '',
    name_km: '',
    code: '',
    phone: '',
    address: '',
  })
  const [branchErrors, setBranchErrors] = useState<Record<string, string>>({})

  // 1. Fetch Real Business and Branches from PostgreSQL Database
  const fetchBranches = useCallback(async () => {
    setIsLoadingBranches(true)
    try {
      let bizId = businessId

      if (!isUuid(bizId)) {
        const bizRes = await api.get('/businesses').catch(() => ({ data: [] }))
        if (Array.isArray(bizRes.data) && bizRes.data.length > 0) {
          bizId = bizRes.data[0].id
          setBusinessId(bizId)
          localStorage.setItem('emenu_business_id', bizId!)
          if (bizRes.data[0].name_en) {
            setBusinessName({
              en: bizRes.data[0].name_en,
              km: bizRes.data[0].name_km || bizRes.data[0].name_en,
            })
          }
          if (bizRes.data[0].logo_url) {
            setLogoUrl(bizRes.data[0].logo_url)
          }
        }
      }

      if (isUuid(bizId)) {
        const branchRes = await api.get(`/businesses/${bizId}/branches`)
        if (Array.isArray(branchRes.data)) {
          setBranches(branchRes.data)

          const savedBranchId = localStorage.getItem('emenu_branch_id')
          const exists = branchRes.data.some((b: RealBranch) => b.id === savedBranchId)

          if (!savedBranchId || !exists) {
            if (branchRes.data.length > 0) {
              const defaultBranch = branchRes.data[0].id
              setActiveBranchId(defaultBranch)
              localStorage.setItem('emenu_branch_id', defaultBranch)
            }
          } else {
            setActiveBranchId(savedBranchId)
          }
        }
      }
    } catch {
      // Handled cleanly
    } finally {
      setIsLoadingBranches(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchBranches()

    const handleBranchesUpdated = () => {
      fetchBranches()
    }

    const handleFocus = () => {
      fetchBranches()
    }

    window.addEventListener('emenu:branches-updated', handleBranchesUpdated)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('emenu:branches-updated', handleBranchesUpdated)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchBranches])

  const currentBranch = branches.find((b) => b.id === activeBranchId) || branches[0]

  const handleSwitchBranch = (branchId: string) => {
    setActiveBranchId(branchId)
    localStorage.setItem('emenu_branch_id', branchId)
    setIsBranchDropdownOpen(false)
    // Dispatch a custom event so other components refresh their data for the new branch
    window.dispatchEvent(new CustomEvent('emenu:branch-changed', { detail: { branchId } }))
  }

  const validateNewBranch = () => {
    const errs: Record<string, string> = {}
    if (!newBranchForm.name_en.trim()) {
      errs.name_en = language === 'km' ? 'សូមបញ្ចូលឈ្មោះសាខាជាភាសាអង់គ្លេស' : 'Branch English name is required'
    }
    if (!newBranchForm.name_km.trim()) {
      errs.name_km = language === 'km' ? 'សូមបញ្ចូលឈ្មោះសាខាជាភាសាខ្មែរ' : 'Branch Khmer name is required'
    }
    if (!newBranchForm.code.trim()) {
      errs.code = language === 'km' ? 'សូមបញ្ចូលកូដសម្គាល់សាខា' : 'Branch code is required'
    }
    setBranchErrors(errs)
    return Object.keys(errs).length === 0
  }

  // 2. Create Real Branch in Database
  const handleCreateNewBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateNewBranch()) return

    if (!isUuid(businessId)) {
      alert('Business not found. Please reload.')
      return
    }

    setIsCreatingBranch(true)
    try {
      const res = await api.post(`/businesses/${businessId}/branches`, {
        name_en: newBranchForm.name_en.trim(),
        name_km: newBranchForm.name_km.trim() || newBranchForm.name_en.trim(),
        code: newBranchForm.code.trim().toUpperCase(),
        phone: newBranchForm.phone.trim() || null,
        address: newBranchForm.address.trim() || null,
      })

      if (res.data?.id) {
        setNewBranchForm({
          name_en: '',
          name_km: '',
          code: '',
          phone: '',
          address: '',
        })
        setBranchErrors({})
        setIsCreateBranchModalOpen(false)
        await fetchBranches()
        handleSwitchBranch(res.data.id)
        window.dispatchEvent(new CustomEvent('emenu:branches-updated'))
      }
    } catch {
      alert(language === 'km' ? 'មិនអាចបង្កើតសាខាបានទេ' : 'Failed to create branch')
    } finally {
      setIsCreatingBranch(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const displayBranchName =
    activeBranchId === 'all'
      ? language === 'km'
        ? 'សាខាទាំងអស់'
        : 'All Branches'
      : currentBranch
      ? language === 'km' && currentBranch.name_km
        ? currentBranch.name_km
        : currentBranch.name_en
      : language === 'km'
      ? 'ជ្រើសរើសសាខា'
      : 'Select Branch'

  return (
    <header className="bg-white dark:bg-zinc-950 sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800">
      <div className="px-3 sm:px-6 h-16 flex items-center justify-between gap-2 max-w-full">
        {/* Left: Mobile Toggle & Store Identity */}
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Utensils className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block font-bold text-sm sm:text-base tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
                  {language === 'km' ? businessName.km : businessName.en}
                </span>

                {/* Branch Switcher Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isBranchDropdownOpen) {
                        fetchBranches()
                      }
                      setIsBranchDropdownOpen(!isBranchDropdownOpen)
                    }}
                    className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <span className="max-w-[120px] sm:max-w-[200px] truncate">{displayBranchName}</span>
                    <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 shrink-0" />
                  </button>

                  {/* Branch Dropdown */}
                  {isBranchDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsBranchDropdownOpen(false)}
                      />
                      <div className="absolute left-0 mt-1.5 w-72 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 z-50 space-y-1">
                        <div className="px-3 py-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                          {language === 'km' ? 'ជ្រើសរើសសាខា' : 'Select Branch'}
                        </div>

                        {/* Option: All Branches */}
                        <button
                          type="button"
                          onClick={() => handleSwitchBranch('all')}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold text-left transition-colors ${
                            activeBranchId === 'all'
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                          }`}
                        >
                          <div>
                            <div className="leading-tight">
                              {language === 'km' ? 'សាខាទាំងអស់' : 'All Branches'}
                            </div>
                            <div className="text-xs text-zinc-400 font-normal mt-0.5">
                              {language === 'km' ? 'បង្ហាញទិន្នន័យគ្រប់សាខា' : 'View all branches'}
                            </div>
                          </div>
                          {activeBranchId === 'all' && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </button>

                        {isLoadingBranches ? (
                          <div className="p-4 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                            <span>{language === 'km' ? 'កំពុងទាញយក...' : 'Loading branches...'}</span>
                          </div>
                        ) : (
                          branches.map((b) => {
                            const isCurrent = b.id === activeBranchId
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => handleSwitchBranch(b.id)}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold text-left transition-colors ${
                                  isCurrent
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400'
                                    : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                                }`}
                              >
                                <div>
                                  <div className="leading-tight">
                                    {language === 'km' && b.name_km ? b.name_km : b.name_en}
                                  </div>
                                  <div className="text-xs text-zinc-400 font-normal font-mono mt-0.5">
                                    {b.code}
                                  </div>
                                </div>
                                {isCurrent && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                              </button>
                            )
                          })
                        )}


                        <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => {
                              setIsBranchDropdownOpen(false)
                              setIsCreateBranchModalOpen(true)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                          >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span>{language === 'km' ? 'បង្កើតសាខាថ្មី' : 'Create New Branch'}</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Language, Theme, User profile & Logout */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <LanguageSwitcher />
          <ThemeToggle />

          {/* User profile avatar & logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
            <div className="relative group/profile shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  user?.full_name?.charAt(0).toUpperCase() || 'A'
                )}
              </div>
              <button
                type="button"
                onClick={() => document.getElementById('my-profile-avatar-input')?.click()}
                title={language === 'km' ? 'ប្តូររូបភាពគណនី' : 'Upload Profile Photo'}
                className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover/profile:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                id="my-profile-avatar-input"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      const res = await api.post('/media/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                      })
                      const url = res.data?.url || res.data?.media_url
                      if (url) {
                        useAuthStore.getState().updateUser({ avatar_url: url })
                      }
                    } catch {
                      // Fallback preview
                      const url = URL.createObjectURL(file)
                      useAuthStore.getState().updateUser({ avatar_url: url })
                    }
                  }
                }}
                className="hidden"
              />
            </div>

            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {user?.full_name || 'Administrator'}
              </div>
              <div className="text-[10px] text-zinc-400 font-medium">
                {user?.email || user?.phone || 'admin@bistro.com'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title={language === 'km' ? 'ចាកចេញ' : 'Sign Out'}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Create New Branch in PostgreSQL Database */}
      {isCreateBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsCreateBranchModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បង្កើតសាខាថ្មី' : 'Create New Branch'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateBranchModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewBranch} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ឈ្មោះសាខា (ភាសាខ្មែរ)' : 'Branch Name (Khmer)'} *
                </label>
                <input
                  type="text"
                  value={newBranchForm.name_km}
                  onChange={(e) => {
                    setNewBranchForm({ ...newBranchForm, name_km: e.target.value })
                    if (branchErrors.name_km) setBranchErrors((prev) => ({ ...prev, name_km: '' }))
                  }}
                  placeholder="e.g. សាខាទួលគោក"
                  className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
                    branchErrors.name_km
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                  }`}
                />
                {branchErrors.name_km && (
                  <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                    {branchErrors.name_km}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ឈ្មោះសាខា (English)' : 'Branch Name (English)'} *
                </label>
                <input
                  type="text"
                  value={newBranchForm.name_en}
                  onChange={(e) => {
                    setNewBranchForm({ ...newBranchForm, name_en: e.target.value })
                    if (branchErrors.name_en) setBranchErrors((prev) => ({ ...prev, name_en: '' }))
                  }}
                  placeholder="e.g. Toul Kork Branch"
                  className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
                    branchErrors.name_en
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                  }`}
                />
                {branchErrors.name_en && (
                  <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                    {branchErrors.name_en}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'កូដសម្គាល់សាខា' : 'Branch Code'} *
                  </label>
                  <input
                    type="text"
                    value={newBranchForm.code}
                    onChange={(e) => {
                      setNewBranchForm({ ...newBranchForm, code: e.target.value.toUpperCase() })
                      if (branchErrors.code) setBranchErrors((prev) => ({ ...prev, code: '' }))
                    }}
                    placeholder="TK-02"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm font-mono outline-none ${
                      branchErrors.code
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {branchErrors.code && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {branchErrors.code}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'លេខទូរស័ព្ទ' : 'Phone Number'}
                  </label>
                  <input
                    type="text"
                    value={newBranchForm.phone}
                    onChange={(e) => setNewBranchForm({ ...newBranchForm, phone: e.target.value })}
                    placeholder="012 345 678"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'អាសយដ្ឋាន' : 'Address'}
                </label>
                <input
                  type="text"
                  value={newBranchForm.address}
                  onChange={(e) => setNewBranchForm({ ...newBranchForm, address: e.target.value })}
                  placeholder="e.g. St 315, Toul Kork, Phnom Penh"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreateBranchModalOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingBranch}
                  className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                >
                  {isCreatingBranch && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{language === 'km' ? 'បង្កើតសាខា' : 'Create Branch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
