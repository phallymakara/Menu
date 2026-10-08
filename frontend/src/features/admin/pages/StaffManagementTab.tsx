import { useState, useEffect, useMemo, type FC } from 'react'
import {
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Camera,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import {
  useCurrentUser,
  useStaffMembers,
  useInviteStaffMember,
  useUpdateStaffMember,
  useRevokeStaffMember,
} from '../hooks/useStaffQueries'
import { useUploadMedia } from '../hooks/useMediaQueries'
import { useBusinesses, useBranches } from '../hooks/useTenantQueries'
import type { StaffMember, StaffPosPermissions } from '../types/admin.types'
import type { components } from '@/types/api'
import { isUuid } from '@/lib/utils'

/** The UI offers CHEF, which the backend models as the KITCHEN role. */
const toStaffRole = (role: StaffMember['role']): components['schemas']['StaffRole'] =>
  role === 'CHEF' ? 'kitchen' : (role.toLowerCase() as components['schemas']['StaffRole'])

interface BranchOption {
  id: string
  name_en: string
  name_km: string
}

export const StaffManagementTab: FC = () => {
  const { language } = useLanguageStore()

  const queryClient = useQueryClient()
  const [orgId, setOrgId] = useState<string | null>(
    localStorage.getItem('emenu_tenant_id') || localStorage.getItem('emenu_organization_id')
  )
  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return localStorage.getItem('emenu_branch_id') || 'all'
  })
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [errorMessage] = useState<string | null>(null)

  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false)
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({})
  const [selectedStaffIdForPhoto, setSelectedStaffIdForPhoto] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // 1. TanStack Query: Current User & Org
  const { data: currentUser } = useCurrentUser()
  useEffect(() => {
    const userOrg = currentUser?.memberships?.[0]?.organization_id
    if (userOrg && userOrg !== orgId) {
      setOrgId(userOrg)
      localStorage.setItem('emenu_tenant_id', userOrg)
      localStorage.setItem('emenu_organization_id', userOrg)
    }
  }, [currentUser, orgId])

  // 2. TanStack Query: Businesses & Branches
  const { data: businesses } = useBusinesses()
  useEffect(() => {
    if (!businessId && businesses && businesses.length > 0) {
      setBusinessId(businesses[0].id)
      localStorage.setItem('emenu_business_id', businesses[0].id)
    }
  }, [businesses, businessId])

  const { data: rawBranches } = useBranches(businessId)
  const branches: BranchOption[] = useMemo(() => {
    if (!rawBranches || rawBranches.length === 0) return []
    return rawBranches.map((b) => ({
      id: b.id,
      name_en: b.name_en,
      name_km: b.name_km || b.name_en,
    }))
  }, [rawBranches])

  useEffect(() => {
    if (!rawBranches || rawBranches.length === 0) return
    const stored = localStorage.getItem('emenu_branch_id')
    if (stored === 'all') {
      if (activeBranchId !== 'all') setActiveBranchId('all')
    } else if (stored && rawBranches.some((b) => b.id === stored)) {
      if (activeBranchId !== stored) setActiveBranchId(stored)
    } else if (!activeBranchId) {
      setActiveBranchId(rawBranches[0].id)
    }
  }, [rawBranches])

  // 3. TanStack Query: Staff Members
  const { data: rawStaff, isLoading: isStaffLoading } = useStaffMembers(
    orgId,
    activeBranchId && isUuid(activeBranchId) ? activeBranchId : undefined
  )
  const revokeStaffMutation = useRevokeStaffMember(orgId)
  const inviteStaffMutation = useInviteStaffMember(orgId)
  const updateStaffMutation = useUpdateStaffMember(orgId)
  const uploadMedia = useUploadMedia(isUuid(businessId) ? businessId : null)

  const staffList: StaffMember[] = useMemo(() => {
    if (!rawStaff || rawStaff.length === 0) return []
    const mapped: StaffMember[] = (rawStaff as any[]).map((m: any) => ({
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
      pos_permissions: m.pos_permissions || null,
      is_owner: m.is_owner || false,
      is_active: (m.status || '').toUpperCase() === 'ACTIVE',
      status: m.status || 'active',
      created_at: m.created_at ? m.created_at.split('T')[0] : '2026-08-01',
    }))
    return activeBranchId && isUuid(activeBranchId)
      ? mapped.filter((m) => m.branch_id === activeBranchId)
      : mapped
  }, [rawStaff, activeBranchId])

  const filteredStaffList = useMemo(() => {
    if (!searchQuery.trim()) return staffList
    const q = searchQuery.toLowerCase().trim()
    return staffList.filter((staff) => {
      const nameMatch = staff.full_name.toLowerCase().includes(q)
      const emailMatch = staff.email ? staff.email.toLowerCase().includes(q) : false
      const phoneMatch = staff.phone ? staff.phone.includes(q) : false
      const roleMatch = staff.role ? staff.role.toLowerCase().includes(q) : false
      const branchObj = branches.find((b) => b.id === staff.branch_id)
      const branchMatch = branchObj
        ? (branchObj.name_en && branchObj.name_en.toLowerCase().includes(q)) ||
          (branchObj.name_km && branchObj.name_km.includes(q))
        : false
      return nameMatch || emailMatch || phoneMatch || roleMatch || branchMatch
    })
  }, [staffList, searchQuery, branches])

  const isLoading = isSwitchingBranch || (isStaffLoading && staffList.length === 0)

  useEffect(() => {
    if (!isStaffLoading) {
      setIsSwitchingBranch(false)
    }
  }, [isStaffLoading])

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const newBranchId = e.detail?.branchId
      if (newBranchId) {
        setIsSwitchingBranch(true)
        setActiveBranchId(newBranchId)
        queryClient.invalidateQueries({ queryKey: ['staff'] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [queryClient])

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

  // POS Order Permissions Modal State
  const [permissionsStaff, setPermissionsStaff] = useState<StaffMember | null>(null)
  const [permissionsForm, setPermissionsForm] = useState<StaffPosPermissions>({
    can_void_item: false,
    can_cancel_order: false,
    can_override_price: false,
  })
  const [isSavingPermissions, setIsSavingPermissions] = useState(false)

  const handleSavePermissions = async () => {
    if (!permissionsStaff) return
    setIsSavingPermissions(true)
    try {
      await updateStaffMutation.mutateAsync({
        memberId: permissionsStaff.id,
        payload: {
          pos_permissions: permissionsForm as any,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setPermissionsStaff(null)
    } catch (err: any) {
      console.error('Failed to update permissions:', err)
      alert(language === 'km' ? 'បរាជ័យក្នុងការរក្សាទុកសិទ្ធិ' : 'Failed to save permissions')
    } finally {
      setIsSavingPermissions(false)
    }
  }

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
    if (newStaff.password.length < 8) {
      errs.password =
        language === 'km'
          ? 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ'
          : 'Password must be at least 8 characters'
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
      if (!isUuid(orgId)) {
        alert('Organization context missing')
        setIsSubmitting(false)
        return
      }

      const assignedBranch =
        (isUuid(activeBranchId) ? activeBranchId : null) ||
        (isUuid(localStorage.getItem('emenu_branch_id')) ? localStorage.getItem('emenu_branch_id') : null) ||
        (branches.length > 0 ? branches[0].id : null)

      await inviteStaffMutation.mutateAsync({
        full_name: newStaff.full_name.trim(),
        phone: newStaff.phone.trim() || null,
        email: newStaff.email.trim() || null,
        role: toStaffRole(newStaff.role),
        branch_id: assignedBranch,
        pos_pin: newStaff.pin_code.trim() || null,
        avatar_url: newStaff.avatar_url || null,
        password: newStaff.password,
      })

      queryClient.invalidateQueries({ queryKey: ['staff', orgId] })

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
    } catch {
      alert(language === 'km' ? 'មិនអាចបង្កើតបុគ្គលិកបានទេ' : 'Failed to create staff member')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4. Delete / Revoke Staff Member
  const handleDeleteStaff = async (memberId: string) => {
    if (!isUuid(memberId)) return

    if (!confirm(language === 'km' ? 'តើអ្នកប្រាកដជាចង់លុបបុគ្គលិកនេះទេ?' : 'Are you sure you want to remove this staff member?')) {
      return
    }

    try {
      if (isUuid(orgId)) {
        await revokeStaffMutation.mutateAsync(memberId)
      }
    } catch {
      alert(language === 'km' ? 'មិនអាចលុបបុគ្គលិកបានទេ' : 'Failed to delete staff member')
    }
  }

  // 5. Upload Profile Photo to Backend Media Storage
  const handleUploadPhoto = async (file: File): Promise<string | null> => {
    setIsUploadingPhoto(true)
    try {
      const { url } = await uploadMedia.mutateAsync(file)
      return url
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
        await updateStaffMutation
          .mutateAsync({ memberId: selectedStaffIdForPhoto, payload: { avatar_url: uploadedUrl } })
          .catch(() => null)
      }
      setSelectedStaffIdForPhoto(null)
    }
  }

  return (
    <div className="space-y-4 w-full max-w-5xl mx-auto">
      {/* Hidden File input for changing photo directly on row */}
      <input
        id="change-staff-avatar-input"
        type="file"
        accept="image/*"
        onChange={handleRowAvatarChange}
        className="hidden"
      />

      {/* Primary Actions & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            const currentBranch =
              (isUuid(activeBranchId) ? activeBranchId : null) ||
              (isUuid(localStorage.getItem('emenu_branch_id')) ? localStorage.getItem('emenu_branch_id') : null) ||
              (branches.length > 0 ? branches[0].id : '')
            setFormErrors({})
            setNewStaff({
              full_name: '',
              phone: '',
              email: '',
              avatar_url: null,
              role: 'WAITER',
              branch_id: currentBranch,
              pin_code: '',
              password: '',
            })
            setIsAddStaffModalOpen(true)
          }}
          className="text-xs sm:text-sm font-semibold px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-none w-fit"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
        </Button>

        {/* Search Field */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === 'km'
                ? 'ស្វែងរកបុគ្គលិក...'
                : 'Search staff...'
            }
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
          />
        </div>
      </div>

      {errorMessage && (
        <p className="text-xs font-medium text-red-500">
          {errorMessage}
        </p>
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
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center py-16">
          <p className="text-sm sm:text-base font-medium text-zinc-500">
            {language === 'km' ? 'មិនមានបុគ្គលិកនៅក្នុងសាខានេះនៅឡើយទេ' : 'No staff members in this branch yet'}
          </p>
        </div>
      ) : filteredStaffList.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center py-16">
          <p className="text-sm sm:text-base font-medium text-zinc-500">
            {language === 'km' ? 'មិនមានបុគ្គលិកត្រូវនឹងការស្វែងរកទេ' : 'No staff members match the search'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 w-full max-h-[calc(100vh-13rem)] sm:max-h-[calc(100vh-10.5rem)] overflow-y-auto overflow-x-auto pb-2 pr-1.5 sm:pr-2 scroll-smooth">
          {filteredStaffList.map((staff) => {
            const isPinVisible = !!revealedPins[staff.id]
            const branchObj = branches.find((b) => b.id === staff.branch_id)

            return (
              <div
                key={staff.id}
                className="w-full px-3 py-1 sm:px-4 sm:py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 grid grid-cols-[minmax(180px,1.4fr)_minmax(150px,1.2fr)_minmax(110px,1fr)_minmax(100px,1fr)_minmax(80px,auto)_72px] items-center gap-1.5 sm:gap-2 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-none"
              >
                {/* 1. Identity & Role under Name (Clean text, no badge container) */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative group shrink-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-700 dark:text-zinc-200 font-bold text-sm sm:text-base">
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
                      className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white cursor-pointer shadow-none"
                      title={language === 'km' ? 'ប្តូររូបថត' : 'Change photo'}
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50 truncate leading-tight">
                      {staff.full_name}
                    </div>
                    {/* Role directly as clean text without container badge */}
                    <div className="text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400 truncate leading-none">
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
                    </div>
                  </div>
                </div>

                {/* 2. Email Column - Clean text, enlarged */}
                <div className="text-base sm:text-lg text-zinc-800 dark:text-zinc-200 min-w-0 truncate font-medium">
                  {staff.email || '—'}
                </div>

                {/* 3. Phone Column - Clean text, enlarged */}
                <div className="text-sm sm:text-base text-zinc-800 dark:text-zinc-200 min-w-0 truncate font-mono">
                  {staff.phone || '—'}
                </div>

                {/* 4. Branch Assignment - Clean text, enlarged */}
                <div className="text-sm sm:text-base text-zinc-800 dark:text-zinc-200 min-w-0 truncate font-medium">
                  {branchObj ? (language === 'km' ? branchObj.name_km : branchObj.name_en) : '—'}
                </div>

                {/* 5. POS PIN Code with Reveal Toggle - Clean text, enlarged */}
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-mono font-bold tracking-widest text-zinc-800 dark:text-zinc-200">
                    {isPinVisible ? staff.pos_pin || (language === 'km' ? 'មិនទាន់កំណត់' : 'Not set') : '••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePinVisibility(staff.id)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer shadow-none"
                    title={isPinVisible ? 'Hide PIN' : 'Show PIN'}
                  >
                    {isPinVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* 6. Action: Permissions Shield & Delete Buttons */}
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPermissionsStaff(staff)
                      const isLead = staff.is_owner || staff.role === 'OWNER' || staff.role === 'MANAGER'
                      setPermissionsForm({
                        can_void_item: staff.pos_permissions?.can_void_item ?? isLead,
                        can_cancel_order: staff.pos_permissions?.can_cancel_order ?? isLead,
                        can_override_price: staff.pos_permissions?.can_override_price ?? isLead,
                      })
                    }}
                    className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer shadow-none"
                    title={language === 'km' ? 'សិទ្ធិគ្រប់គ្រងការកម្ម៉ង់ (Permissions)' : 'Order Permissions'}
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </button>
                  {!staff.is_owner ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteStaff(staff.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer shadow-none"
                      title={language === 'km' ? 'លុបគណនី' : 'Delete staff'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="w-7" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Add Staff Member */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsAddStaffModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-4 shadow-none modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
              </h2>
              <button
                type="button"
                onClick={() => setIsAddStaffModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3" autoComplete="off">
              {/* Avatar Upload Trigger */}
              <div className="flex flex-col items-center justify-center text-center py-2">
                <label
                  htmlFor="staff-avatar-upload"
                  className="relative group cursor-pointer block mb-2"
                >
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-zinc-50 dark:bg-zinc-800/60 overflow-hidden flex items-center justify-center text-zinc-400 transition-colors shrink-0 mx-auto">
                    {isUploadingPhoto ? (
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    ) : newStaff.avatar_url ? (
                      <img
                        src={newStaff.avatar_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-6 h-6 group-hover:text-emerald-600 transition-colors" />
                    )}
                  </div>
                </label>
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
                  autoComplete="off"
                  placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះពេញ' : 'Enter full name'}
                  value={newStaff.full_name}
                  onChange={(e) => {
                    setNewStaff({ ...newStaff, full_name: e.target.value })
                    if (formErrors.full_name) {
                      setFormErrors((prev) => ({ ...prev, full_name: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    formErrors.full_name ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
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
                    autoComplete="off"
                    placeholder={language === 'km' ? 'បញ្ចូលលេខទូរស័ព្ទ' : 'Enter phone number'}
                    value={newStaff.phone}
                    onChange={(e) => {
                      setNewStaff({ ...newStaff, phone: e.target.value })
                      if (formErrors.phone) {
                        setFormErrors((prev) => ({ ...prev, phone: '' }))
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border ${
                      formErrors.phone ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                    } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'អ៊ីមែល' : 'Email'}
                  </label>
                  <input
                    type="email"
                    autoComplete="off"
                    placeholder={language === 'km' ? 'បញ្ចូលអ៊ីមែល' : 'Enter email'}
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all"
                  />
                </div>
              </div>
              {formErrors.phone && <p className="text-xs text-red-500">{formErrors.phone}</p>}

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
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-emerald-600 transition-all"
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
                    autoComplete="new-password"
                    placeholder={language === 'km' ? 'បញ្ចូលកូដ PIN' : 'Enter PIN'}
                    value={newStaff.pin_code}
                    onChange={(e) => {
                      setNewStaff({ ...newStaff, pin_code: e.target.value.replace(/\D/g, '') })
                      if (formErrors.pin_code) {
                        setFormErrors((prev) => ({ ...prev, pin_code: '' }))
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border ${
                      formErrors.pin_code ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                    } bg-transparent text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-600 transition-all`}
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
                  autoComplete="new-password"
                  placeholder={language === 'km' ? 'បញ្ចូលពាក្យសម្ងាត់' : 'Enter password'}
                  value={newStaff.password}
                  required
                  minLength={8}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all"
                />
                {formErrors.password && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.password}</p>
                )}
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

      {/* Modal: Staff POS Order Permissions */}
      {permissionsStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => !isSavingPermissions && setPermissionsStaff(null)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 z-10 my-auto shadow-none">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? 'សិទ្ធិគ្រប់គ្រងការកម្ម៉ង់ (POS)' : 'Order & POS Permissions'}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {permissionsStaff.full_name} ({permissionsStaff.role})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsStaff(null)}
                disabled={isSavingPermissions}
                className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Toggle 1: can_void_item */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? 'លុបមុខម្ហូប (Void Items)' : 'Can Void Items'}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {language === 'km'
                      ? 'អនុញ្ញាតឱ្យលុបមុខម្ហូបចេញពីការកម្ម៉ង់ដែលបានផ្ញើរួច'
                      : 'Allow removing ordered items from active tickets'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPermissionsForm((prev) => ({ ...prev, can_void_item: !prev.can_void_item }))
                  }
                  className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                    permissionsForm.can_void_item ? 'bg-emerald-600 justify-end' : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-xs" />
                </button>
              </div>

              {/* Toggle 2: can_cancel_order */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? 'បោះបង់ការកម្ម៉ង់ (Cancel Orders)' : 'Can Cancel Orders'}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {language === 'km'
                      ? 'អនុញ្ញាតឱ្យលុបចោលការកម្ម៉ង់ទាំងមូល'
                      : 'Allow cancelling entire open or unpaid orders'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPermissionsForm((prev) => ({ ...prev, can_cancel_order: !prev.can_cancel_order }))
                  }
                  className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                    permissionsForm.can_cancel_order ? 'bg-emerald-600 justify-end' : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-xs" />
                </button>
              </div>

              {/* Toggle 3: can_override_price */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? 'កែប្រែតម្លៃមុខម្ហូប (Override Prices)' : 'Can Override Prices'}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {language === 'km'
                      ? 'អនុញ្ញាតឱ្យកែសម្រួលតម្លៃមុខម្ហូបដោយដៃនៅលើ POS'
                      : 'Allow manually editing item prices on POS checkout'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPermissionsForm((prev) => ({ ...prev, can_override_price: !prev.can_override_price }))
                  }
                  className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                    permissionsForm.can_override_price ? 'bg-emerald-600 justify-end' : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-xs" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-900">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSavingPermissions}
                onClick={() => setPermissionsStaff(null)}
                className="rounded-full text-xs font-medium px-4 py-2 border-zinc-200 dark:border-zinc-800"
              >
                {language === 'km' ? 'បោះបង់' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSavingPermissions}
                onClick={handleSavePermissions}
                className="rounded-full text-xs font-semibold px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSavingPermissions ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : null}
                {language === 'km' ? 'រក្សាទុកការកំណត់' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
