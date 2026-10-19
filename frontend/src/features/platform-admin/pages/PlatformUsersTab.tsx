import { useState, useId, type FC } from 'react'
import {
  Users,
  Search,
  CheckCircle2,
  Ban,
  ShieldCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Loader2,
  Mail,
  Phone,
  Building2,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  UserCheck,
} from 'lucide-react'
import {
  usePlatformUsers,
  usePlatformUserDetail,
  useUpdateUserStatus,
  useTogglePlatformAdmin,
  useAdminResetPassword,
  usePlatformOrganizations,
  type UserStatus,
  type AdminUserListItem,
} from '../hooks'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { getApiErrorMessage } from '@/lib/api-error'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

function generateSecurePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  let result = ''
  const array = new Uint32Array(length)
  window.crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length]
  }
  return result
}

export const PlatformUsersTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const currentUser = useAuthStore((s) => s.user)

  // Filter & Pagination States
  const [searchInput, setSearchInput] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<UserStatus | 'all'>('all')
  const [selectedPrivilege, setSelectedPrivilege] = useState<'all' | 'admin' | 'standard'>('all')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Drawer & Modal States
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [statusModalUser, setStatusModalUser] = useState<AdminUserListItem | null>(null)
  const [adminModalUser, setAdminModalUser] = useState<AdminUserListItem | null>(null)
  const [passwordModalUser, setPasswordModalUser] = useState<AdminUserListItem | null>(null)

  // Form states for Status Change
  const [newStatus, setNewStatus] = useState<UserStatus>('active')
  const [statusReason, setStatusReason] = useState('')
  const [statusError, setStatusError] = useState<string | null>(null)

  // Form states for Admin Toggle
  const [newAdminVal, setNewAdminVal] = useState<boolean>(false)
  const [adminReason, setAdminReason] = useState('')
  const [adminError, setAdminError] = useState<string | null>(null)

  // Form states for Password Reset
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null)

  // Unique element IDs for accessibility
  const userSearchInputId = useId()
  const userOrgSelectId = useId()
  const userStatusReasonId = useId()
  const userAdminReasonId = useId()
  const userNewPasswordId = useId()

  // Queries
  const { data: orgsData } = usePlatformOrganizations({ pageSize: 100 })
  const {
    data: usersData,
    isLoading: isLoadingUsers,
  } = usePlatformUsers({
    search: searchInput.trim() || undefined,
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    is_platform_admin:
      selectedPrivilege === 'admin' ? true : selectedPrivilege === 'standard' ? false : undefined,
    organization_id: selectedOrgId === 'all' ? undefined : selectedOrgId,
    page,
    pageSize,
  })

  // Deep user inspection drawer query
  const { data: userDetail, isLoading: isLoadingDetail } = usePlatformUserDetail(detailUserId)

  // Mutations
  const updateStatusMutation = useUpdateUserStatus()
  const toggleAdminMutation = useTogglePlatformAdmin()
  const resetPasswordMutation = useAdminResetPassword()

  // Handlers
  const handleOpenStatusModal = (u: AdminUserListItem) => {
    setStatusModalUser(u)
    setNewStatus(u.status)
    setStatusReason('')
    setStatusError(null)
  }

  const handleOpenAdminModal = (u: AdminUserListItem) => {
    setAdminModalUser(u)
    setNewAdminVal(!u.is_platform_admin)
    setAdminReason('')
    setAdminError(null)
  }

  const handleOpenPasswordModal = (u: AdminUserListItem) => {
    setPasswordModalUser(u)
    setNewPassword(generateSecurePassword())
    setPasswordError(null)
    setPasswordSuccessMsg(null)
    setPasswordCopied(false)
  }

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!statusModalUser) return
    setStatusError(null)

    try {
      await updateStatusMutation.mutateAsync({
        userId: statusModalUser.id,
        payload: {
          status: newStatus,
          reason: statusReason.trim() || undefined,
        },
      })
      setStatusModalUser(null)
    } catch (err) {
      setStatusError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការផ្លាស់ប្តូរស្ថានភាព' : 'Failed to update user status.'))
    }
  }

  const handleSaveAdminToggle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminModalUser) return
    setAdminError(null)

    // Safety guard against self-demotion
    if (currentUser?.id === adminModalUser.id && !newAdminVal) {
      setAdminError(
        isKm
          ? 'អ្នកមិនអាចដកហូតសិទ្ធិ Super Admin របស់ខ្លួនឯងបានទេ ដើម្បីការពារការចាក់សោរប្រព័ន្ធ។'
          : 'You cannot revoke your own Super Admin access to prevent platform lockout.'
      )
      return
    }

    try {
      await toggleAdminMutation.mutateAsync({
        userId: adminModalUser.id,
        payload: {
          is_platform_admin: newAdminVal,
          reason: adminReason.trim() || undefined,
        },
      })
      setAdminModalUser(null)
    } catch (err) {
      setAdminError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការកែប្រែសិទ្ធិ' : 'Failed to modify Super Admin privileges.'))
    }
  }

  const handleSavePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordModalUser) return
    setPasswordError(null)
    setPasswordSuccessMsg(null)

    if (newPassword.length < 8) {
      setPasswordError(
        isKm
          ? 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។'
          : 'Password must be at least 8 characters long.'
      )
      return
    }

    try {
      await resetPasswordMutation.mutateAsync({
        userId: passwordModalUser.id,
        payload: {
          new_password: newPassword,
        },
      })
      setPasswordSuccessMsg(
        isKm
          ? 'ពាក្យសម្ងាត់ត្រូវបានកំណត់ឡើងវិញដោយជោគជ័យ។'
          : 'Password has been successfully updated.'
      )
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការកំណត់ពាក្យសម្ងាត់ឡើងវិញ' : 'Failed to reset password.'))
    }
  }

  const copyPasswordToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(newPassword)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    } catch {
      // Fallback if clipboard api is blocked
    }
  }

  const usersList = usersData?.items || []
  const totalCount = usersData?.total || 0
  const totalPages = usersData?.total_pages || 1

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              id={userSearchInputId}
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setPage(1)
              }}
              placeholder={isKm ? 'ស្វែងរកតាមឈ្មោះ អ៊ីមែល ឬលេខទូរស័ព្ទ...' : 'Search by name, email, or phone...'}
              className="w-full pl-9 pr-9 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Organization Filter Dropdown */}
          <div className="md:col-span-4">
            <label htmlFor={userOrgSelectId} className="sr-only">
              {isKm ? 'ជ្រើសរើសភោជនីយដ្ឋាន' : 'Filter by Organization'}
            </label>
            <select
              id={userOrgSelectId}
              value={selectedOrgId}
              onChange={(e) => {
                setSelectedOrgId(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            >
              <option value="all">{isKm ? 'ភោជនីយដ្ឋានទាំងអស់ (All Organizations)' : 'All Tenant Organizations'}</option>
              {orgsData?.items?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.slug})
                </option>
              ))}
            </select>
          </div>

          {/* Privilege Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedPrivilege}
              onChange={(e) => {
                setSelectedPrivilege(e.target.value as 'all' | 'admin' | 'standard')
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            >
              <option value="all">{isKm ? 'សិទ្ធិទាំងអស់ (All Privileges)' : 'All Privileges'}</option>
              <option value="admin">{isKm ? 'Super Admin ប៉ុណ្ណោះ' : 'Super Admins Only'}</option>
              <option value="standard">{isKm ? 'អ្នកប្រើប្រាស់ទូទៅ' : 'Standard Users'}</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
          {(
            [
              { id: 'all', labelKm: 'ទាំងអស់', labelEn: 'All Accounts' },
              { id: 'active', labelKm: 'សកម្ម', labelEn: 'Active' },
              { id: 'suspended', labelKm: 'បានផ្អាក', labelEn: 'Suspended' },
              { id: 'terminated', labelKm: 'បានបិទ', labelEn: 'Terminated' },
            ] as const
          ).map((tab) => {
            const isActive = selectedStatus === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedStatus(tab.id)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#167e61] text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {isKm ? tab.labelKm : tab.labelEn}
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. Users Table View */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
        {isLoadingUsers ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <EmenuLoader
              size="md"
              message={isKm ? 'កំពុងទាញយកបញ្ជីអ្នកប្រើប្រាស់...' : 'Loading platform users...'}
            />
          </div>
        ) : usersList.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {isKm ? 'រកមិនឃើញអ្នកប្រើប្រាស់ទេ' : 'No user accounts found'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {isKm
                ? 'មិនមានអ្នកប្រើប្រាស់ដែលត្រូវនឹងការស្វែងរក ឬតម្រងដែលបានជ្រើសរើសឡើយ។'
                : 'Try adjusting your search query, status filters, or organization selection.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                  <th className="py-3.5 px-4">{isKm ? 'អ្នកប្រើប្រាស់' : 'User'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'សិទ្ធិប្រព័ន្ធ' : 'Platform Privilege'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'ស្ថានភាព' : 'Status'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'ភោជនីយដ្ឋាន' : 'Memberships'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'កាលបរិច្ឆេទបង្កើត' : 'Created At'}</th>
                  <th className="py-3.5 px-4 text-right">{isKm ? 'សកម្មភាព' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/60 text-sm">
                {usersList.map((user) => {
                  const initials = user.full_name
                    ? user.full_name
                        .split(' ')
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'U'

                  const isCurrentUser = currentUser?.id === user.id

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                      onClick={() => setDetailUserId(user.id)}
                    >
                      {/* User Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] font-bold text-xs flex items-center justify-center shrink-0 border border-[#167e61]/20">
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              {user.full_name}
                              {isCurrentUser && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium">
                                  {isKm ? 'អ្នក' : 'You'}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                              {user.email && (
                                <span className="flex items-center gap-1 truncate max-w-[180px]">
                                  <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                                  {user.email}
                                </span>
                              )}
                              {user.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                                  {user.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Platform Privilege */}
                      <td className="py-3.5 px-4">
                        {user.is_platform_admin ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] border border-[#167e61]/20 dark:border-[#167e61]/30">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Platform Super Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <UserCheck className="w-3.5 h-3.5 text-zinc-400" />
                            {isKm ? 'អ្នកប្រើប្រាស់ទូទៅ' : 'Tenant Member'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {user.status === 'active' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isKm ? 'សកម្ម' : 'Active'}</span>
                          </span>
                        )}
                        {user.status === 'suspended' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{isKm ? 'បានផ្អាក' : 'Suspended'}</span>
                          </span>
                        )}
                        {user.status === 'terminated' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/50">
                            <Ban className="w-3.5 h-3.5" />
                            <span>{isKm ? 'បានបិទ' : 'Terminated'}</span>
                          </span>
                        )}
                      </td>

                      {/* Organizations Count */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                          <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                          <span>
                            {user.organizations_count || 0}{' '}
                            {isKm ? 'ភោជនីយដ្ឋាន' : (user.organizations_count || 0) === 1 ? 'Org' : 'Orgs'}
                          </span>
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        {new Date(user.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Inspect Detail Drawer */}
                          <button
                            type="button"
                            onClick={() => setDetailUserId(user.id)}
                            title={isKm ? 'មើលព័ត៌មានលម្អិត' : 'Inspect Profile'}
                            className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Toggle Platform Admin Privilege */}
                          <button
                            type="button"
                            onClick={() => handleOpenAdminModal(user)}
                            title={
                              user.is_platform_admin
                                ? isKm
                                  ? 'ដកសិទ្ធិ Super Admin'
                                  : 'Revoke Super Admin'
                                : isKm
                                ? 'ដំឡើងសិទ្ធិ Super Admin'
                                : 'Grant Super Admin'
                            }
                            className="p-1.5 rounded-xl text-[#167e61] dark:text-[#22ab84] hover:bg-[#167e61]/10 transition-colors"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>

                          {/* Reset Password */}
                          <button
                            type="button"
                            onClick={() => handleOpenPasswordModal(user)}
                            title={isKm ? 'កំណត់ពាក្យសម្ងាត់ឡើងវិញ' : 'Reset Password'}
                            className="p-1.5 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* Change Account Status */}
                          <button
                            type="button"
                            onClick={() => handleOpenStatusModal(user)}
                            title={isKm ? 'ប្តូរស្ថានភាពគណនី' : 'Change Account Status'}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30">
            <div className="flex items-center gap-2">
              <span>
                {isKm
                  ? `ទំព័រ ${page} នៃ ${totalPages} (${totalCount} គណនី)`
                  : `Page ${page} of ${totalPages} (${totalCount} users)`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 enabled:hover:bg-zinc-100 dark:enabled:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 enabled:hover:bg-zinc-100 dark:enabled:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          SLIDE-OVER DRAWER: DEEP USER INSPECTION & MEMBERSHIPS
      ========================================================================== */}
      {detailUserId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isKm ? 'ព័ត៌មានលម្អិតអ្នកប្រើប្រាស់' : 'User Account Details'}
          className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
          onClick={() => setDetailUserId(null)}
        >
          <div
            className="w-full max-w-xl h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden rounded-l-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                    {isKm ? 'ព័ត៌មានលម្អិតអ្នកប្រើប្រាស់' : 'User Account Details'}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">ID: {detailUserId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailUserId(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetail || !userDetail ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <EmenuLoader
                    size="sm"
                    message={isKm ? 'កំពុងទាញយកព័ត៌មាន...' : 'Fetching user details...'}
                  />
                </div>
              ) : (
                <>
                  {/* Profile Summary Card */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#167e61] text-white font-bold text-base flex items-center justify-center shadow-md shadow-[#167e61]/20">
                          {userDetail.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                            {userDetail.full_name}
                          </h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {userDetail.email || userDetail.phone || 'No direct contact'}
                          </p>
                        </div>
                      </div>
                      {userDetail.is_platform_admin && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] border border-[#167e61]/20">
                          Super Admin
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/40 text-xs">
                      <div>
                        <span className="text-zinc-400">{isKm ? 'ស្ថានភាព:' : 'Status:'}</span>
                        <span className="ml-1.5 font-bold uppercase text-zinc-700 dark:text-zinc-300">
                          {userDetail.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400">{isKm ? 'ភាសាពេញចិត្ត:' : 'Language:'}</span>
                        <span className="ml-1.5 font-semibold text-zinc-700 dark:text-zinc-300 uppercase">
                          {userDetail.preferred_language || 'km'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Tenant Organization Memberships */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        {isKm ? 'សមាជិកភាពក្នុងភោជនីយដ្ឋាន' : 'Tenant Restaurant Memberships'} (
                        {userDetail.memberships?.length || 0})
                      </h4>
                    </div>

                    {(!userDetail.memberships || userDetail.memberships.length === 0) ? (
                      <div className="p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
                        {isKm ? 'អ្នកប្រើប្រាស់នេះមិនទាន់មានសមាជិកភាពនៅភោជនីយដ្ឋានណាមួយឡើយ' : 'User is not linked to any tenant restaurants yet.'}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {userDetail.memberships.map((membership) => (
                          <div
                            key={membership.id}
                            className="p-3.5 rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#167e61] shrink-0" />
                                <div>
                                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {membership.organization_name}
                                  </div>
                                  <div className="text-[11px] text-zinc-400 font-mono">
                                    Slug: {membership.organization_slug}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                                  membership.role === 'owner'
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/50'
                                    : 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
                                }`}
                              >
                                {membership.role}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-200/40 dark:border-zinc-700/30">
                              <span>
                                {isKm ? 'សាខា:' : 'Branch:'}{' '}
                                <strong className="text-zinc-700 dark:text-zinc-200">
                                  {membership.branch_name || (membership.is_owner ? 'All Outlets' : 'Default Branch')}
                                </strong>
                              </span>
                              <span>
                                {isKm ? 'ស្ថានភាព:' : 'Status:'}{' '}
                                <strong className="capitalize text-zinc-700 dark:text-zinc-200">
                                  {membership.status}
                                </strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Action Buttons in Drawer */}
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      {isKm ? 'សកម្មភាពរហ័ស' : 'Administrative Actions'}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const listItem: AdminUserListItem = {
                            id: userDetail.id,
                            full_name: userDetail.full_name,
                            email: userDetail.email,
                            phone: userDetail.phone,
                            status: userDetail.status,
                            is_platform_admin: userDetail.is_platform_admin,
                            created_at: userDetail.created_at,
                            updated_at: userDetail.updated_at,
                          }
                          handleOpenAdminModal(listItem)
                        }}
                        className="p-2.5 rounded-2xl border border-[#167e61]/30 bg-[#167e61]/5 text-[#167e61] dark:text-[#22ab84] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#167e61]/10 transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {userDetail.is_platform_admin
                          ? isKm
                            ? 'ដកសិទ្ធិ Admin'
                            : 'Revoke Admin'
                          : isKm
                          ? 'ដំឡើងជា Admin'
                          : 'Grant Admin'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const listItem: AdminUserListItem = {
                            id: userDetail.id,
                            full_name: userDetail.full_name,
                            email: userDetail.email,
                            phone: userDetail.phone,
                            status: userDetail.status,
                            is_platform_admin: userDetail.is_platform_admin,
                            created_at: userDetail.created_at,
                            updated_at: userDetail.updated_at,
                          }
                          handleOpenPasswordModal(listItem)
                        }}
                        className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      >
                        <KeyRound className="w-4 h-4" />
                        {isKm ? 'កំណត់ពាក្យសម្ងាត់' : 'Reset Password'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: CHANGE USER STATUS
      ========================================================================== */}
      {statusModalUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isKm ? 'ប្តូរស្ថានភាពគណនី' : 'Change Account Status'}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                    {isKm ? 'ប្តូរស្ថានភាពគណនី' : 'Change Account Status'}
                  </h3>
                  <p className="text-xs text-zinc-500">{statusModalUser.full_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatusModalUser(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {statusError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {statusError}
              </div>
            )}

            <form onSubmit={handleSaveStatus} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isKm ? 'ស្ថានភាពគណនីថ្មី' : 'Select New Status'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'active', labelKm: 'សកម្ម', labelEn: 'Active', color: 'emerald' },
                      { id: 'suspended', labelKm: 'ផ្អាក', labelEn: 'Suspended', color: 'amber' },
                      { id: 'terminated', labelKm: 'បិទចោល', labelEn: 'Terminated', color: 'rose' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setNewStatus(st.id)}
                      className={`p-2.5 rounded-2xl border text-xs font-semibold transition-all ${
                        newStatus === st.id
                          ? 'border-[#167e61] bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] ring-2 ring-[#167e61]/20'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {isKm ? st.labelKm : st.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning Notice if Suspended or Terminated */}
              {newStatus !== 'active' && (
                <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    {newStatus === 'suspended'
                      ? isKm
                        ? 'ការផ្អាកគណនីនឹងបញ្ចប់ session របស់អ្នកប្រើប្រាស់ភ្លាមៗ ហើយមិនអាចចូលប្រើប្រាស់បានទេរហូតដល់ត្រូវបានបើកដំណើរការឡើងវិញ។'
                        : 'Suspending this user will immediately terminate all active sessions and block them from logging in.'
                      : isKm
                      ? 'ការបិទគណនីជាអចិន្ត្រៃយ៍នឹងដកហូតសិទ្ធិចូលដំណើរការគ្រប់ភោជនីយដ្ឋានទាំងអស់។'
                      : 'Terminating this account permanently locks it across all tenant organizations.'}
                  </p>
                </div>
              )}

              {/* Administrative Reason Field */}
              <div className="space-y-1.5">
                <label htmlFor={userStatusReasonId} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isKm ? 'មូលហេតុ (កត់ត្រាក្នុង Audit Log)' : 'Reason (Recorded to Audit Log)'}
                </label>
                <textarea
                  id={userStatusReasonId}
                  rows={2}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={
                    isKm
                      ? 'ឧទាហរណ៍៖ សំណើពីម្ចាស់ភោជនីយដ្ឋាន ឬបំពានគោលការណ៍...'
                      : 'e.g., Requested by tenant owner, policy violation...'
                  }
                  className="w-full px-3 py-2 rounded-2xl text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setStatusModalUser(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isKm ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateStatusMutation.isPending}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold bg-[#167e61] text-white hover:bg-[#12674f] disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {updateStatusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isKm ? 'រក្សាទុក' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: TOGGLE SUPER ADMIN PRIVILEGES
      ========================================================================== */}
      {adminModalUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isKm ? 'កែប្រែសិទ្ធិ Platform Super Admin' : 'Modify Super Admin Role'}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                    {isKm ? 'កែប្រែសិទ្ធិ Super Admin' : 'Modify Super Admin Role'}
                  </h3>
                  <p className="text-xs text-zinc-500">{adminModalUser.full_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminModalUser(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adminError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {adminError}
              </div>
            )}

            <form onSubmit={handleSaveAdminToggle} className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="pr-4">
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {isKm ? 'សិទ្ធិ Platform Super Admin' : 'Platform Super Admin Privilege'}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {isKm
                        ? 'ផ្តល់សិទ្ធិចូលដំណើរការ Platform Console គ្រប់គ្រងគម្រោង SaaS និងទិន្នន័យភោជនីយដ្ឋានទាំងអស់'
                        : 'Grants root access to manage plans, tenant accounts, and platform economics.'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={newAdminVal}
                    onChange={(e) => setNewAdminVal(e.target.checked)}
                    disabled={currentUser?.id === adminModalUser.id && adminModalUser.is_platform_admin}
                    className="w-5 h-5 rounded-lg text-[#167e61] focus:ring-[#167e61] border-zinc-300 dark:border-zinc-600"
                  />
                </label>
              </div>

              {/* Self-Demotion Alert */}
              {currentUser?.id === adminModalUser.id && (
                <div className="p-3 rounded-2xl bg-[#167e61]/10 border border-[#167e61]/20 text-xs text-[#167e61] dark:text-[#22ab84] flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#167e61] dark:text-[#22ab84] shrink-0 mt-0.5" />
                  <span>
                    {isKm
                      ? 'នេះជាគណនីផ្ទាល់ខ្លួនរបស់អ្នក។ អ្នកមិនអាចដកហូតសិទ្ធិ Super Admin របស់ខ្លួនឯងបានឡើយ។'
                      : 'This is your own active account. Self-demotion is restricted to maintain platform access.'}
                  </span>
                </div>
              )}

              {/* Administrative Reason Field */}
              <div className="space-y-1.5">
                <label htmlFor={userAdminReasonId} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isKm ? 'មូលហេតុនៃការកែប្រែសិទ្ធិ' : 'Reason for Privilege Change'}
                </label>
                <textarea
                  id={userAdminReasonId}
                  rows={2}
                  value={adminReason}
                  onChange={(e) => setAdminReason(e.target.value)}
                  placeholder={
                    isKm
                      ? 'ឧទាហរណ៍៖ ការផ្ទេរតួនាទីគ្រប់គ្រងបច្ចេកវិទ្យា...'
                      : 'e.g., Assigned to technical operations team...'
                  }
                  className="w-full px-3 py-2 rounded-2xl text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAdminModalUser(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isKm ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={
                    toggleAdminMutation.isPending ||
                    (currentUser?.id === adminModalUser.id && !newAdminVal)
                  }
                  className="px-4 py-2 rounded-2xl text-xs font-semibold bg-[#167e61] text-white hover:bg-[#12674f] disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {toggleAdminMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isKm ? 'បញ្ជាក់ការកែប្រែ' : 'Confirm Privilege Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: ADMIN PASSWORD RESET
      ========================================================================== */}
      {passwordModalUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isKm ? 'កំណត់ពាក្យសម្ងាត់ថ្មី' : 'Reset User Password'}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                    {isKm ? 'កំណត់ពាក្យសម្ងាត់ថ្មី' : 'Reset User Password'}
                  </h3>
                  <p className="text-xs text-zinc-500">{passwordModalUser.full_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {passwordError}
              </div>
            )}

            {passwordSuccessMsg && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSavePasswordReset} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={userNewPasswordId} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {isKm ? 'ពាក្យសម្ងាត់ថ្មី' : 'New Temporary Password'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPassword(generateSecurePassword())
                      setPasswordCopied(false)
                    }}
                    className="text-xs text-[#167e61] dark:text-[#22ab84] hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {isKm ? 'បង្កើតពាក្យសម្ងាត់ស្វ័យប្រវត្តិ' : 'Generate New'}
                  </button>
                </div>

                <div className="relative">
                  <input
                    id={userNewPasswordId}
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full pr-10 pl-3 py-2 rounded-2xl text-sm font-mono bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  />
                  <button
                    type="button"
                    onClick={copyPasswordToClipboard}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    title={isKm ? 'ចម្លងពាក្យសម្ងាត់' : 'Copy password'}
                  >
                    {passwordCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {isKm
                    ? 'ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។ សូមចម្លងពាក្យសម្ងាត់នេះផ្ញើជូនអ្នកប្រើប្រាស់។'
                    : 'Must be at least 8 characters. Make sure to copy and deliver this password securely.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isKm ? 'បិទ' : 'Close'}
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordMutation.isPending || !newPassword}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold bg-[#167e61] text-white hover:bg-[#12674f] disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {resetPasswordMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isKm ? 'កំណត់ឡើងវិញឥឡូវនេះ' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
