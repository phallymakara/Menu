import { useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Utensils, LogOut, Menu as MenuIcon, Camera, ChevronDown, Plus, Check, X } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'
import type { BranchForm } from '@/features/onboarding/types/onboarding.types'

export const AdminHeader: FC<{ onToggleSidebar?: () => void }> = ({ onToggleSidebar }) => {
  const { language } = useLanguageStore()
  const { user, logout } = useAuthStore()
  const { businessProfile, branch, branches, switchBranch, addBranch } = useOnboardingStore()
  const navigate = useNavigate()

  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)
  const [isCreateBranchModalOpen, setIsCreateBranchModalOpen] = useState(false)

  const [newBranchForm, setNewBranchForm] = useState<BranchForm>({
    name_en: '',
    name_km: '',
    branch_code: '',
    phone: '',
    address: '',
    opening_time: '07:00',
    closing_time: '22:00',
    bakong_account_id: branch.bakong_account_id || '',
    bakong_merchant_name: branch.bakong_merchant_name || '',
    bakong_acquiring_bank: branch.bakong_acquiring_bank || 'ABA Bank',
  })
  const [branchErrors, setBranchErrors] = useState<Record<string, string>>({})

  const validateNewBranch = () => {
    const errs: Record<string, string> = {}
    if (!newBranchForm.name_km.trim()) {
      errs.name_km = language === 'km' ? 'សូមបញ្ចូលឈ្មោះសាខាជាភាសាខ្មែរ' : 'Branch Khmer name is required'
    }
    if (!newBranchForm.name_en.trim()) {
      errs.name_en = language === 'km' ? 'សូមបញ្ចូលឈ្មោះសាខាជាភាសាអង់គ្លេស' : 'Branch English name is required'
    }
    if (!newBranchForm.branch_code.trim()) {
      errs.branch_code = language === 'km' ? 'សូមបញ្ចូលកូដសម្គាល់សាខា' : 'Branch code is required'
    }
    if (!newBranchForm.phone.trim()) {
      errs.phone = language === 'km' ? 'សូមបញ្ចូលលេខទូរស័ព្ទ' : 'Phone number is required'
    }
    setBranchErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleCreateNewBranch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateNewBranch()) return

    addBranch({
      ...newBranchForm,
      bakong_merchant_name: newBranchForm.bakong_merchant_name || newBranchForm.name_en.toUpperCase(),
    })

    setNewBranchForm({
      name_en: '',
      name_km: '',
      branch_code: '',
      phone: '',
      address: '',
      opening_time: '07:00',
      closing_time: '22:00',
      bakong_account_id: branch.bakong_account_id || '',
      bakong_merchant_name: '',
      bakong_acquiring_bank: 'ABA Bank',
    })
    setBranchErrors({})
    setIsCreateBranchModalOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const branchName = language === 'km' && branch.name_km ? branch.name_km : branch.name_en

  return (
    <header className="bg-white dark:bg-zinc-950 sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800">
      <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Mobile Toggle & Store Identity */}
        <div className="flex items-center gap-3.5">
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
              {businessProfile.logo_url ? (
                <img
                  src={businessProfile.logo_url}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Utensils className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight text-zinc-950 dark:text-zinc-50 block leading-tight">
                  {language === 'km' && businessProfile.name_km ? businessProfile.name_km : businessProfile.name_en}
                </span>

                {/* Branch Switcher Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <span>{branchName}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
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
                        {branches.map((b) => {
                          const isCurrent = b.branch_code === branch.branch_code
                          return (
                            <button
                              key={b.branch_code}
                              type="button"
                              onClick={() => {
                                switchBranch(b.branch_code)
                                setIsBranchDropdownOpen(false)
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold text-left transition-colors ${
                                isCurrent
                                  ? 'bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400'
                                  : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                              }`}
                            >
                              <div>
                                <div className="leading-tight">{language === 'km' && b.name_km ? b.name_km : b.name_en}</div>
                                <div className="text-xs text-zinc-400 font-normal font-mono mt-0.5">{b.branch_code}</div>
                              </div>
                              {isCurrent && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                            </button>
                          )
                        })}

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
        <div className="flex items-center gap-2 sm:gap-3">
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
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const url = URL.createObjectURL(file)
                    useAuthStore.getState().updateUser({ avatar_url: url })
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

      {/* Modal: Create New Branch */}
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
                    value={newBranchForm.branch_code}
                    onChange={(e) => {
                      setNewBranchForm({ ...newBranchForm, branch_code: e.target.value.toUpperCase() })
                      if (branchErrors.branch_code) setBranchErrors((prev) => ({ ...prev, branch_code: '' }))
                    }}
                    placeholder="TK-02"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm font-mono outline-none ${
                      branchErrors.branch_code
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {branchErrors.branch_code && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {branchErrors.branch_code}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'លេខទូរស័ព្ទ' : 'Phone Number'} *
                  </label>
                  <input
                    type="text"
                    value={newBranchForm.phone}
                    onChange={(e) => {
                      setNewBranchForm({ ...newBranchForm, phone: e.target.value })
                      if (branchErrors.phone) setBranchErrors((prev) => ({ ...prev, phone: '' }))
                    }}
                    placeholder="012 345 678"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
                      branchErrors.phone
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {branchErrors.phone && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {branchErrors.phone}
                    </div>
                  )}
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
                  className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {language === 'km' ? 'បង្កើតសាខា' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
