import { useState, useEffect, useCallback, type FC } from 'react'
import {
  Plus,
  Trash2,
  Phone,
  Mail,
  X,
  Eye,
  EyeOff,
  Camera,
  Loader2,
  Building2,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { StaffMember } from '../types/admin.types'

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

interface BranchOption {
  id: string
  name_en: string
  name_km: string
}

export const StaffManagementTab: FC = () => {
  const { language } = useLanguageStore()

  const [orgId, setOrgId] = useState<string | null>(
    localStorage.getItem('emenu_tenant_id') || localStorage.getItem('emenu_organization_id')
  )
  const [activeBranchId, setActiveBranchId] = useState<string>(
    localStorage.getItem('emenu_branch_id') || 'all'
  )

  const [branches, setBranches] = useState<BranchOption[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false)
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({})
  const [selectedStaffIdForPhoto, setSelectedStaffIdForPhoto] = useState<string | null>(null)

  // Form State for Adding Staff
  const [newStaff, setNewStaff] = useState({
    full_name: '',
    phone: '',
    email: '',
    avatar_url: null as string | null,
    role: 'WAITER' as StaffMember['role'],
    branch_id: '',
    pin_code: '',
    password: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // 1. Resolve Organization & Branches
  const resolveTenantContext = useCallback(async () => {
    let currentOrg = orgId
    let bizId = localStorage.getItem('emenu_business_id')

    if (!isUuid(currentOrg)) {
      try {
        const meRes = await api.get('/auth/me')
        if (meRes.data?.memberships?.[0]?.organization_id) {
          currentOrg = meRes.data.memberships[0].organization_id
          setOrgId(currentOrg)
          localStorage.setItem('emenu_tenant_id', currentOrg!)
        }
      } catch {
        // Handled in catch
      }
    }

    if (!isUuid(bizId)) {
      try {
        const bizRes = await api.get('/businesses')
        if (Array.isArray(bizRes.data) && bizRes.data.length > 0) {
          bizId = bizRes.data[0].id
          localStorage.setItem('emenu_business_id', bizId!)
        }
      } catch {
        // Handled in catch
      }
    }

    if (isUuid(bizId)) {
      try {
        const branchRes = await api.get(`/businesses/${bizId}/branches`)
        if (Array.isArray(branchRes.data)) {
          setBranches(
            branchRes.data.map((b: any) => ({
              id: b.id,
              name_en: b.name_en,
              name_km: b.name_km || b.name_en,
            }))
          )
        }
      } catch {
        // Handled in catch
      }
    }

    return currentOrg
  }, [orgId])

  // 2. Fetch Isolated Staff Members
  const loadStaff = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const currentOrg = await resolveTenantContext()
      if (!isUuid(currentOrg)) {
        setIsLoading(false)
        return
      }

      const params: Record<string, string> = {}
      if (activeBranchId !== 'all' && isUuid(activeBranchId)) {
        params.branch_id = activeBranchId
      }

      const res = await api.get(`/organizations/${currentOrg}/members`, { params })
      if (Array.isArray(res.data)) {
        const mapped: StaffMember[] = res.data.map((m: any) => ({
          id: m.id,
          organization_id: m.organization_id,
          user_id: m.user_id,
          branch_id: m.branch_id,
          full_name: m.full_name,
          phone: m.phone || '',
          email: m.email || null,
          avatar_url: m.avatar_url || null,
          role: m.role || 'WAITER',
          job_title: m.job_title || null,
          pos_pin: m.pos_pin || null,
          pin_code: m.pos_pin || '••••',
          is_owner: m.is_owner || false,
          is_active: (m.status || '').toUpperCase() === 'ACTIVE',
          status: m.status || 'active',
          created_at: m.created_at ? m.created_at.split('T')[0] : '2026-08-01',
        }))
        setStaffList(mapped)
      } else {
        setStaffList([])
      }
    } catch {
      setErrorMessage(
        language === 'km'
          ? 'មិនអាចទាញយកទិន្នន័យបុគ្គលិកបានទេ។'
          : 'Unable to load staff members. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [activeBranchId, language, resolveTenantContext])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const newBranchId = e.detail?.branchId
      if (newBranchId) {
        setActiveBranchId(newBranchId)
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [])

  const togglePinVisibility = (staffId: string) => {
    setRevealedPins((prev) => ({ ...prev, [staffId]: !prev[staffId] }))
  }

  const validateForm = () => {
    const errs: Record<string, string> = {}
    if (!newStaff.full_name.trim()) {
      errs.full_name = language === 'km' ? 'សូមបញ្ចូលឈ្មោះបុគ្គលិក' : 'Staff full name is required'
    }
    if (!newStaff.phone.trim() && !newStaff.email.trim()) {
      errs.phone = language === 'km' ? 'សូមបញ្ចូលលេខទូរស័ព្ទ ឬ អ៊ីមែល' : 'Phone number or email is required'
    }
    if (newStaff.pin_code && newStaff.pin_code.length !== 4) {
      errs.pin_code = language === 'km' ? 'លេខកូដ PIN ត្រូវតែមាន ៤ ខ្ទង់' : 'PIN code must be exactly 4 digits'
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  // 3. Create Staff Member in Tenant DB
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const currentOrg = await resolveTenantContext()
      if (!isUuid(currentOrg)) {
        alert('Organization context missing')
        setIsSubmitting(false)
        return
      }

      const assignedBranch =
        newStaff.branch_id && isUuid(newStaff.branch_id)
          ? newStaff.branch_id
          : activeBranchId !== 'all' && isUuid(activeBranchId)
          ? activeBranchId
          : branches[0]?.id || null

      await api.post(`/organizations/${currentOrg}/members`, {
        full_name: newStaff.full_name.trim(),
        phone: newStaff.phone.trim() || null,
        email: newStaff.email.trim() || null,
        role: newStaff.role.toLowerCase(),
        branch_id: assignedBranch,
        pos_pin: newStaff.pin_code.trim() || null,
        avatar_url: newStaff.avatar_url || null,
        password: newStaff.password.trim() || '12345678',
      })


      setNewStaff({
        full_name: '',
        phone: '',
        email: '',
        avatar_url: null,
        role: 'WAITER',
        branch_id: '',
        pin_code: '',
        password: '',
      })
      setFormErrors({})
      setIsAddStaffModalOpen(false)
      loadStaff()
    } catch {
      alert(language === 'km' ? 'មិនអាចបង្កើតបុគ្គលិកបានទេ' : 'Failed to create staff member')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4. Delete / Revoke Staff Member
  const handleDeleteStaff = async (memberId: string) => {
    if (!isUuid(memberId)) {
      setStaffList(staffList.filter((s) => s.id !== memberId))
      return
    }

    if (!confirm(language === 'km' ? 'តើអ្នកប្រាកដជាចង់លុបបុគ្គលិកនេះទេ?' : 'Are you sure you want to remove this staff member?')) {
      return
    }

    try {
      const currentOrg = await resolveTenantContext()
      if (isUuid(currentOrg)) {
        await api.delete(`/organizations/${currentOrg}/members/${memberId}`)
      }
      setStaffList(staffList.filter((s) => s.id !== memberId))
    } catch {
      alert(language === 'km' ? 'មិនអាចលុបបុគ្គលិកបានទេ' : 'Failed to delete staff member')
    }
  }

  // 5. Upload Profile Photo to Backend Media Storage
  const handleUploadPhoto = async (file: File): Promise<string | null> => {
    setIsUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data?.url || res.data?.media_url || null
    } catch {
      alert('Failed to upload image')
      return null
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleNewStaffAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const uploadedUrl = await handleUploadPhoto(file)
      if (uploadedUrl) {
        setNewStaff((prev) => ({ ...prev, avatar_url: uploadedUrl }))
      }
    }
  }

  const handleRowAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && selectedStaffIdForPhoto) {
      const uploadedUrl = await handleUploadPhoto(file)
      if (uploadedUrl && isUuid(orgId)) {
        await api.patch(`/organizations/${orgId}/members/${selectedStaffIdForPhoto}`, {
          avatar_url: uploadedUrl,
        }).catch(() => null)

        setStaffList((prev) =>
          prev.map((s) => (s.id === selectedStaffIdForPhoto ? { ...s, avatar_url: uploadedUrl } : s))
        )
      }
      setSelectedStaffIdForPhoto(null)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Hidden File input for changing photo directly on row */}
      <input
        id="change-staff-avatar-input"
        type="file"
        accept="image/*"
        onChange={handleRowAvatarChange}
        className="hidden"
      />

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'បុគ្គលិក & សិទ្ធិ' : 'Staff & Role Permissions'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {language === 'km'
              ? 'គ្រប់គ្រងគណនីបុគ្គលិក តួនាទី រូបថត និងលេខកូដសម្ងាត់ (PIN) សម្រាប់ចូលផ្ទាំង POS'
              : 'Manage staff accounts, roles, profile photos, and 4-digit PINs for POS terminals.'}
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => {
            setFormErrors({})
            setIsAddStaffModalOpen(true)
          }}
          className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
        </Button>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-semibold">
          {errorMessage}
        </div>
      )}

      {/* Branch Isolation Filter Bar */}
      {branches.length > 0 && (
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveBranchId('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeBranchId === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            {language === 'km' ? 'សាខាទាំងអស់' : 'All Branches'}
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBranchId(b.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeBranchId === b.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <span>{language === 'km' ? b.name_km : b.name_en}</span>
            </button>
          ))}
        </div>
      )}

      {/* Single Column Row List */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-xs">
            {language === 'km' ? 'កំពុងទាញយកទិន្នន័យបុគ្គលិក...' : 'Loading staff members...'}
          </p>
        </div>
      ) : staffList.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-zinc-500">
            {language === 'km' ? 'មិនមានបុគ្គលិកនៅក្នុងសាខានេះនៅឡើយទេ' : 'No staff members in this branch yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffList.map((staff) => {
            const isPinVisible = !!revealedPins[staff.id]
            const branchObj = branches.find((b) => b.id === staff.branch_id)

            return (
              <div
                key={staff.id}
                className="p-5 sm:px-6 sm:py-4.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col lg:grid lg:grid-cols-[260px_1.2fr_1fr_1fr_120px_auto] items-start lg:items-center gap-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                {/* 1. Identity & Role under Name (No Filled Color) */}
                <div className="flex items-center gap-3.5 w-full min-w-0">
                  <div className="relative group shrink-0">
                    <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-700 dark:text-zinc-200 font-bold text-base sm:text-lg">
                      {staff.avatar_url ? (
                        <img
                          src={staff.avatar_url}
                          alt={staff.full_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        staff.full_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStaffIdForPhoto(staff.id)
                        document.getElementById('change-staff-avatar-input')?.click()
                      }}
                      className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white cursor-pointer"
                      title={language === 'km' ? 'ប្តូររូបថត' : 'Change photo'}
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 truncate">
                      {staff.full_name}
                    </div>
                    {/* Role badge placed under name without background fill */}
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 w-fit">
                      {staff.is_owner || staff.role?.toUpperCase() === 'OWNER'
                        ? language === 'km'
                          ? 'ម្ចាស់ហាង (Owner)'
                          : 'Owner'
                        : staff.role?.toUpperCase() === 'MANAGER'
                        ? language === 'km'
                          ? 'អ្នកគ្រប់គ្រង (Manager)'
                          : 'Manager'
                        : staff.role?.toUpperCase() === 'CASHIER'
                        ? language === 'km'
                          ? 'បេឡា (Cashier)'
                          : 'Cashier'
                        : staff.role?.toUpperCase() === 'WAITER'
                        ? language === 'km'
                          ? 'អ្នករត់តុ (Waiter)'
                          : 'Waiter'
                        : staff.role?.toUpperCase() === 'KITCHEN' || staff.role?.toUpperCase() === 'CHEF'
                        ? language === 'km'
                          ? 'ចុងភៅ (Kitchen)'
                          : 'Kitchen'
                        : staff.role}
                    </span>
                  </div>
                </div>

                {/* 2. Email Column */}
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 min-w-0 w-full truncate">
                  <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{staff.email || '—'}</span>
                </div>

                {/* 3. Phone Column */}
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 min-w-0 w-full truncate">
                  <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="font-mono">{staff.phone || '—'}</span>
                </div>

                {/* 4. Branch Assignment */}
                <div className="flex items-center gap-1 text-xs text-zinc-500 min-w-0">
                  {branchObj ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
                      <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{language === 'km' ? branchObj.name_km : branchObj.name_en}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </div>

                {/* 5. POS PIN Code with Reveal Toggle */}
                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono font-bold tracking-widest text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {isPinVisible ? staff.pos_pin || staff.pin_code || '1234' : '••••'}
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePinVisibility(staff.id)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    title={isPinVisible ? 'Hide PIN' : 'Show PIN'}
                  >
                    {isPinVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* 6. Action: Delete Button */}
                <div className="flex items-center justify-end w-full lg:w-auto">
                  {!staff.is_owner && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStaff(staff.id)}
                      className="p-2 text-zinc-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      title={language === 'km' ? 'លុបគណនី' : 'Delete staff'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Add Staff Member */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
              </h2>
              <button
                type="button"
                onClick={() => setIsAddStaffModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              {/* Avatar Upload Trigger */}
              <div className="flex items-center gap-4 py-1">
                <div className="w-14 h-14 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-400 shrink-0">
                  {isUploadingPhoto ? (
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  ) : newStaff.avatar_url ? (
                    <img
                      src={newStaff.avatar_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <label
                    htmlFor="staff-avatar-upload"
                    className="cursor-pointer text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline block"
                  >
                    {language === 'km' ? 'ផ្ទុកឡើងរូបថតបុគ្គលិក' : 'Upload Staff Photo'}
                  </label>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">
                    JPG, PNG or WEBP (Max 2MB)
                  </span>
                  <input
                    id="staff-avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleNewStaffAvatar}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ឈ្មោះពេញ' : 'Full Name'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sokha Makara"
                  value={newStaff.full_name}
                  onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                />
                {formErrors.full_name && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.full_name}</p>
                )}
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'លេខទូរស័ព្ទ' : 'Phone Number'}
                  </label>
                  <input
                    type="text"
                    placeholder="012 345 678"
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'អ៊ីមែល' : 'Email'}
                  </label>
                  <input
                    type="email"
                    placeholder="staff@restaurant.com"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
              {formErrors.phone && <p className="text-xs text-red-500">{formErrors.phone}</p>}

              {/* Branch Assignment */}
              {branches.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'សាខាដែលត្រូវចាត់តាំង' : 'Assigned Branch'} *
                  </label>
                  <select
                    value={newStaff.branch_id || (activeBranchId !== 'all' ? activeBranchId : branches[0]?.id || '')}
                    onChange={(e) => setNewStaff({ ...newStaff, branch_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {language === 'km' ? b.name_km : b.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Role Selection & 4-Digit POS PIN */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'តួនាទី' : 'Role'}
                  </label>
                  <select
                    value={newStaff.role}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, role: e.target.value as StaffMember['role'] })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  >
                    <option value="WAITER">{language === 'km' ? 'អ្នករត់តុ (Waiter)' : 'Waiter'}</option>
                    <option value="CASHIER">{language === 'km' ? 'បេឡា (Cashier)' : 'Cashier'}</option>
                    <option value="KITCHEN">{language === 'km' ? 'ចុងភៅ (Kitchen)' : 'Kitchen'}</option>
                    <option value="MANAGER">{language === 'km' ? 'អ្នកគ្រប់គ្រង (Manager)' : 'Manager'}</option>
                    <option value="INVENTORY">{language === 'km' ? 'ស្តុក (Inventory)' : 'Inventory'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'កូដ POS PIN (៤ ខ្ទង់)' : 'POS PIN (4 digits)'}
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="1234"
                    value={newStaff.pin_code}
                    onChange={(e) => setNewStaff({ ...newStaff, pin_code: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-600"
                  />
                  {formErrors.pin_code && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.pin_code}</p>
                  )}
                </div>
              </div>

              {/* Password for web admin login */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ពាក្យសម្ងាត់ចូលប្រើប្រព័ន្ធ' : 'Web Login Password'}
                </label>
                <input
                  type="password"
                  placeholder="Min 6 characters"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddStaffModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : language === 'km' ? (
                    'រក្សាទុក'
                  ) : (
                    'Save Staff'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
