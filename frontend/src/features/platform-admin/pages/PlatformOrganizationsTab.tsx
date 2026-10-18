import { useState, type FC } from 'react'
import {
  Building2,
  Search,
  Filter,
  CheckCircle2,
  Ban,
  Archive,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Loader2,
  User,
  Mail,
  Phone,
  Store,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react'
import {
  usePlatformOrganizations,
  usePlatformOrganizationDetail,
  useUpdateOrganizationStatus,
  useOverrideOrganizationSubscription,
  usePlatformPlans,
  type OrganizationStatus,
  type AdminOrganizationListItem,
} from '../hooks'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { formatUSD } from '@/lib/currency'
import { getApiErrorMessage } from '@/lib/api-error'

export const PlatformOrganizationsTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  // Filter & Pagination States
  const [searchInput, setSearchInput] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<OrganizationStatus | 'all'>('all')
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Drawer & Modal States
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null)
  const [statusModalOrg, setStatusModalOrg] = useState<AdminOrganizationListItem | null>(null)
  const [subModalOrg, setSubModalOrg] = useState<AdminOrganizationListItem | null>(null)

  // Form states for Status Change
  const [newStatus, setNewStatus] = useState<OrganizationStatus>('active')
  const [statusReason, setStatusReason] = useState('')
  const [statusError, setStatusError] = useState<string | null>(null)

  // Form states for Subscription Override
  const [overridePlanId, setOverridePlanId] = useState<string>('')
  const [overrideTrialEndsAt, setOverrideTrialEndsAt] = useState('')
  const [overridePeriodEndsAt, setOverridePeriodEndsAt] = useState('')
  const [overrideNotes, setOverrideNotes] = useState('')
  const [overrideError, setOverrideError] = useState<string | null>(null)

  // Queries
  const { data: plansData = [] } = usePlatformPlans(true)
  const {
    data: orgsData,
    isLoading: isLoadingOrgs,
  } = usePlatformOrganizations({
    search: searchInput.trim() || undefined,
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    plan_code: selectedPlanCode === 'all' ? undefined : selectedPlanCode,
    page,
    pageSize,
  })

  const { data: detailData, isLoading: isLoadingDetail } = usePlatformOrganizationDetail(detailOrgId)

  // Mutations
  const updateStatusMutation = useUpdateOrganizationStatus()
  const overrideSubMutation = useOverrideOrganizationSubscription()

  // Format date helper
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—'
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(isKm ? 'km-KH' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return isoString
    }
  }

  // Open Status Change Modal
  const handleOpenStatusModal = (org: AdminOrganizationListItem) => {
    setStatusModalOrg(org)
    setNewStatus(org.status)
    setStatusReason('')
    setStatusError(null)
  }

  // Submit Status Change
  const handleSubmitStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!statusModalOrg) return
    setStatusError(null)

    try {
      await updateStatusMutation.mutateAsync({
        orgId: statusModalOrg.id,
        payload: {
          status: newStatus,
          reason: statusReason.trim() || null,
        },
      })
      setStatusModalOrg(null)
    } catch (err) {
      setStatusError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការផ្លាស់ប្តូរស្ថានភាព' : 'Failed to update status'))
    }
  }

  // Open Subscription Override Modal
  const handleOpenSubModal = (org: AdminOrganizationListItem) => {
    setSubModalOrg(org)
    setOverridePlanId(org.plan_id || (plansData[0]?.id ?? ''))
    setOverrideTrialEndsAt('')
    setOverridePeriodEndsAt('')
    setOverrideNotes('')
    setOverrideError(null)
  }

  // Submit Subscription Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subModalOrg || !overridePlanId) return
    setOverrideError(null)

    try {
      await overrideSubMutation.mutateAsync({
        orgId: subModalOrg.id,
        payload: {
          plan_id: overridePlanId,
          trial_ends_at: overrideTrialEndsAt ? new Date(overrideTrialEndsAt).toISOString() : null,
          current_period_ends_at: overridePeriodEndsAt ? new Date(overridePeriodEndsAt).toISOString() : null,
          notes: overrideNotes.trim() || null,
        },
      })
      setSubModalOrg(null)
    } catch (err) {
      setOverrideError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការកែប្រែគម្រោង' : 'Failed to override subscription'))
    }
  }

  // Render Status Badge
  const renderStatusBadge = (status: OrganizationStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isKm ? 'ដំណើរការ' : 'Active'}</span>
          </span>
        )
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
            <Ban className="w-3.5 h-3.5" />
            <span>{isKm ? 'បានផ្អាក' : 'Suspended'}</span>
          </span>
        )
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
            <Archive className="w-3.5 h-3.5" />
            <span>{isKm ? 'ប័ណ្ណសារ' : 'Archived'}</span>
          </span>
        )
      default:
        return <span className="text-xs text-zinc-400 uppercase">{status}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setPage(1)
              }}
              placeholder={isKm ? 'ស្វែងរកតាមឈ្មោះហាង, slug, ឬអ៊ីមែលម្ចាស់...' : 'Search by organization name, slug, or owner email...'}
              className="w-full pl-10 pr-4 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 transition-all placeholder:text-zinc-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('')
                  setPage(1)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Plan Tier Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedPlanCode}
              onChange={(e) => {
                setSelectedPlanCode(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            >
              <option value="all">{isKm ? 'គ្រប់គម្រោងទាំងអស់' : 'All Subscription Plans'}</option>
              {plansData.map((plan) => (
                <option key={plan.id} value={plan.code}>
                  {plan.name} ({plan.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2 pt-1 overflow-x-auto text-xs">
          <span className="text-[11px] font-semibold text-zinc-400 mr-1 shrink-0">
            {isKm ? 'ស្ថានភាព:' : 'Status:'}
          </span>
          {(['all', 'active', 'suspended', 'archived'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setSelectedStatus(st)
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-2xl font-medium transition-all shrink-0 capitalize ${
                selectedStatus === st
                  ? 'bg-[#167e61] text-white shadow-xs font-semibold'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700/60'
              }`}
            >
              {st === 'all'
                ? isKm
                  ? 'ទាំងអស់'
                  : 'All'
                : st === 'active'
                ? isKm
                  ? 'ដំណើរការ'
                  : 'Active'
                : st === 'suspended'
                ? isKm
                  ? 'បានផ្អាក'
                  : 'Suspended'
                : isKm
                ? 'ប័ណ្ណសារ'
                : 'Archived'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Organizations Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                <th className="py-3.5 px-4">{isKm ? 'ហាង / អាជីវកម្ម' : 'Organization'}</th>
                <th className="py-3.5 px-4">{isKm ? 'ម្ចាស់គណនី' : 'Owner'}</th>
                <th className="py-3.5 px-4 text-center">{isKm ? 'ទំហំ & ហេដ្ឋារចនាសម្ព័ន្ធ' : 'Footprint'}</th>
                <th className="py-3.5 px-4">{isKm ? 'គម្រោង Subscription' : 'Plan'}</th>
                <th className="py-3.5 px-4">{isKm ? 'ស្ថានភាព' : 'Status'}</th>
                <th className="py-3.5 px-4">{isKm ? 'បង្កើតនៅ' : 'Created'}</th>
                <th className="py-3.5 px-4 text-right">{isKm ? 'សកម្មភាព' : 'Actions'}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/60 text-sm">
              {isLoadingOrgs ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-[#167e61]" />
                      <span>{isKm ? 'កំពុងទាញយកទិន្នន័យហាង...' : 'Loading organizations...'}</span>
                    </div>
                  </td>
                </tr>
              ) : orgsData?.items && orgsData.items.length > 0 ? (
                orgsData.items.map((org) => (
                  <tr
                    key={org.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group"
                  >
                    {/* Organization Name & Slug */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] flex items-center justify-center font-bold text-xs shrink-0 border border-[#167e61]/20 dark:border-[#167e61]/30">
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-950 dark:text-zinc-50 text-sm">
                            {org.name}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            /{org.slug}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Owner Details */}
                    <td className="py-3.5 px-4">
                      {org.owner_name || org.owner_email ? (
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
                            {org.owner_name || '—'}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {org.owner_email || org.owner_phone || '—'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>

                    {/* Infrastructure Footprint */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
                        <span title={isKm ? 'ចំនួនសាខា' : 'Branches'} className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {org.branches_count ?? 0} {isKm ? 'សាខា' : 'br'}
                        </span>
                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                        <span title={isKm ? 'ចំនួនតុ' : 'Tables'} className="text-zinc-600 dark:text-zinc-400">
                          {org.tables_count ?? 0} {isKm ? 'តុ' : 'tbl'}
                        </span>
                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                        <span title={isKm ? 'ចំនួនបុគ្គលិក' : 'Staff'} className="text-zinc-600 dark:text-zinc-400">
                          {org.staff_count ?? 0} {isKm ? 'នាក់' : 'stf'}
                        </span>
                      </div>
                    </td>

                    {/* Subscription Plan */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                        <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{org.plan_name || org.plan_code || 'Free Tier'}</span>
                      </span>
                    </td>

                    {/* Account Status */}
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(org.status)}
                    </td>

                    {/* Created Date */}
                    <td className="py-3.5 px-4 text-zinc-500 text-xs font-mono">
                      {formatDate(org.created_at)}
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Inspect Drawer */}
                        <button
                          type="button"
                          onClick={() => setDetailOrgId(org.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title={isKm ? 'មើលព័ត៌មានលម្អិត' : 'Inspect Organization Details'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Change Status */}
                        <button
                          type="button"
                          onClick={() => handleOpenStatusModal(org)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                          title={isKm ? 'ប្តូរស្ថានភាពហាង' : 'Update Lifecycle Status'}
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </button>

                        {/* Override Subscription */}
                        <button
                          type="button"
                          onClick={() => handleOpenSubModal(org)}
                          className="p-1.5 rounded-xl text-zinc-500 hover:text-[#167e61] hover:bg-[#167e61]/10 transition-colors"
                          title={isKm ? 'កែប្រែគម្រោង Subscription' : 'Override Subscription Plan'}
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-xs">
                      {isKm ? 'រកមិនឃើញទិន្នន័យហាងណាដែលត្រូវគ្នានឹងការស្វែងរកទេ' : 'No tenant organizations match the current filter.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {orgsData && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 text-xs">
            <div className="flex items-center gap-3">
              <div className="text-zinc-500 font-medium">
                {isKm ? 'ទំព័រ' : 'Page'} <strong className="text-zinc-900 dark:text-zinc-100">{orgsData.page ?? 1}</strong> {isKm ? 'នៃ' : 'of'} <strong className="text-zinc-900 dark:text-zinc-100">{orgsData.total_pages ?? 1}</strong>
              </div>

              <div className="flex items-center gap-1.5 text-zinc-400">
                <span>{isKm ? 'បង្ហាញ:' : 'Show:'}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="px-2 py-1 rounded-md text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {orgsData.total_pages && orgsData.total_pages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{isKm ? 'មុន' : 'Previous'}</span>
                </button>

                <button
                  type="button"
                  disabled={page >= orgsData.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                >
                  <span>{isKm ? 'បន្ទាប់' : 'Next'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Slide-Over Drawer: Organization Deep Inspection */}
      {detailOrgId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setDetailOrgId(null)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 h-full p-6 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 rounded-l-3xl overflow-y-auto z-10 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] flex items-center justify-center font-bold text-sm">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                    {isKm ? 'ព័ត៌មានលម្អិតនៃហាង' : 'Organization Profile'}
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    ID: {detailOrgId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailOrgId(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="py-20 text-center text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-[#167e61] mx-auto mb-2" />
                <p className="text-xs">{isKm ? 'កំពុងទាញយកព័ត៌មានលម្អិត...' : 'Loading organization profile...'}</p>
              </div>
            ) : detailData ? (
              <div className="space-y-6 text-xs">
                {/* Status & Name Card */}
                <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-extrabold text-zinc-950 dark:text-zinc-50">
                        {detailData.name}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        slug: /{detailData.slug}
                      </p>
                    </div>
                    {renderStatusBadge(detailData.status)}
                  </div>
                  <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                    {isKm ? 'កាលបរិច្ឆេទបង្កើត:' : 'Created on:'} {formatDate(detailData.created_at)}
                  </div>
                </div>

                {/* Owner Information */}
                <div className="space-y-2">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>{isKm ? 'ព័ត៌មានម្ចាស់ហាង' : 'Owner Information'}</span>
                  </h4>
                  {detailData.owner ? (
                    <div className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                      <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                        {detailData.owner.full_name}
                      </div>
                      <div className="text-zinc-500 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{detailData.owner.email || '—'}</span>
                      </div>
                      {detailData.owner.phone && (
                        <div className="text-zinc-500 flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{detailData.owner.phone}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400">
                      {isKm ? 'គ្មានព័ត៌មានម្ចាស់គណនី' : 'No owner profile recorded'}
                    </div>
                  )}
                </div>

                {/* Subscription Details */}
                <div className="space-y-2">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-zinc-400" />
                    <span>{isKm ? 'គម្រោង Subscription' : 'Active Subscription'}</span>
                  </h4>
                  {detailData.subscription ? (
                    <div className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {detailData.subscription.plan_name}
                        </span>
                        <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {detailData.subscription.plan_code}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <span>{isKm ? 'ស្ថានភាពគម្រោង:' : 'Status:'}</span>
                        <span className="font-semibold uppercase text-zinc-800 dark:text-zinc-200">
                          {detailData.subscription.status}
                        </span>
                      </div>
                      {detailData.subscription.trial_ends_at && (
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>{isKm ? 'ថ្ងៃផុតកំណត់សាកល្បង:' : 'Trial Ends:'}</span>
                          <span className="font-semibold">{formatDate(detailData.subscription.trial_ends_at)}</span>
                        </div>
                      )}
                      {detailData.subscription.current_period_ends_at && (
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>{isKm ? 'ថ្ងៃផុតកំណត់ជុំបង់ប្រាក់:' : 'Period Ends:'}</span>
                          <span className="font-semibold">{formatDate(detailData.subscription.current_period_ends_at)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400">
                      {isKm ? 'គ្មានគម្រោង Subscription' : 'No subscription active'}
                    </div>
                  )}
                </div>

                {/* Branches List */}
                <div className="space-y-2">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-zinc-400" />
                    <span>{isKm ? 'សាខាហាងទាំងអស់' : 'Physical Outlets'} ({detailData.branches?.length ?? 0})</span>
                  </h4>
                  {detailData.branches && detailData.branches.length > 0 ? (
                    <div className="space-y-2">
                      {detailData.branches.map((br) => (
                        <div
                          key={br.id}
                          className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {br.name_en}
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono">
                              code: {br.code}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            br.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                          }`}>
                            {br.is_active ? (isKm ? 'ដំណើរការ' : 'Active') : (isKm ? 'បិទ' : 'Inactive')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400">
                      {isKm ? 'មិនទាន់មានសាខាត្រូវបានបង្កើត' : 'No branches created yet'}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal 1: Update Organization Status */}
      {statusModalOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setStatusModalOrg(null)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'ប្តូរស្ថានភាពហាង' : 'Update Organization Status'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatusModalOrg(null)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitStatus} className="space-y-4">
              <div>
                <span className="text-zinc-400 text-xs block mb-1">
                  {isKm ? 'ហាងគោលដៅ:' : 'Target Organization:'}
                </span>
                <strong className="text-zinc-950 dark:text-zinc-50 text-sm">
                  {statusModalOrg.name} (/{statusModalOrg.slug})
                </strong>
              </div>

              {/* Status Radio Choices */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'ជ្រើសរើសស្ថានភាពថ្មី:' : 'Select New Status:'}
                </label>
                {(['active', 'suspended', 'archived'] as const).map((st) => (
                  <label
                    key={st}
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      newStatus === st
                        ? 'border-[#167e61] bg-[#167e61]/10 dark:bg-[#167e61]/20'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="org_status"
                        value={st}
                        checked={newStatus === st}
                        onChange={() => setNewStatus(st)}
                        className="text-[#167e61] focus:ring-[#167e61]"
                      />
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                        {st === 'active' ? (isKm ? 'ដំណើរការ (Active)' : 'Active') : st === 'suspended' ? (isKm ? 'បានផ្អាក (Suspended)' : 'Suspended') : (isKm ? 'ប័ណ្ណសារ (Archived)' : 'Archived')}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              {/* Warning on Suspend or Archive */}
              {(newStatus === 'suspended' || newStatus === 'archived') && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    {isKm
                      ? 'ការផ្អាក ឬទុកហាងក្នុងប័ណ្ណសារ នឹងរារាំងបុគ្គលិកទាំងអស់របស់ហាងនេះមិនឱ្យចូលប្រើប្រព័ន្ធ POS, KDS និងផ្ទាំងគ្រប់គ្រងជាបន្ទាន់។'
                      : 'Suspending or archiving this organization will immediately lock out all its staff, POS cashiers, and kitchen displays across all its branches.'}
                  </p>
                </div>
              )}

              {/* Reason / Notes */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'មូលហេតុ (មិនបង្ខំ):' : 'Reason / Notes (Optional):'}
                </label>
                <textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={isKm ? 'បញ្ជាក់ពីមូលហេតុនៃការផ្អាក ឬប្តូរស្ថានភាព...' : 'Record administrative rationale for this status update...'}
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 text-sm resize-none"
                />
              </div>

              {statusError && (
                <div className="text-red-600 dark:text-red-400 text-xs">
                  {statusError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setStatusModalOrg(null)}
                  className="px-4 py-2 rounded-2xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {isKm ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateStatusMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold bg-[#167e61] hover:bg-[#12674f] text-white shadow-xs disabled:opacity-50"
                >
                  {updateStatusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isKm ? 'រក្សាទុក' : 'Save Status'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Override Organization Subscription */}
      {subModalOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setSubModalOrg(null)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#167e61]" />
                <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'កែប្រែគម្រោង Subscription' : 'Override Subscription Tier'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSubModalOrg(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitOverride} className="space-y-4">
              <div>
                <span className="text-zinc-400 text-xs block mb-1">
                  {isKm ? 'ហាងគោលដៅ:' : 'Target Organization:'}
                </span>
                <strong className="text-zinc-950 dark:text-zinc-50 text-sm">
                  {subModalOrg.name} (/{subModalOrg.slug})
                </strong>
              </div>

              {/* Plan Picker */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'ជ្រើសរើសគម្រោងថ្មី:' : 'Assign Plan Tier:'}
                </label>
                <select
                  value={overridePlanId}
                  onChange={(e) => setOverridePlanId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  required
                >
                  {plansData.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatUSD(plan.price_usd_monthly)}/mo ({plan.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Trial Ends Date Picker */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'ថ្ងៃផុតកំណត់សាកល្បងថ្មី (មិនបង្ខំ):' : 'Custom Trial Expiration Date (Optional):'}
                </label>
                <input
                  type="date"
                  value={overrideTrialEndsAt}
                  onChange={(e) => setOverrideTrialEndsAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                />
              </div>

              {/* Period Ends Date Picker */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'ថ្ងៃផុតកំណត់ជុំបង់ប្រាក់ (មិនបង្ខំ):' : 'Custom Billing Cycle End Date (Optional):'}
                </label>
                <input
                  type="date"
                  value={overridePeriodEndsAt}
                  onChange={(e) => setOverridePeriodEndsAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'កំណត់សម្គាល់រដ្ឋបាល:' : 'Administrative Notes:'}
                </label>
                <textarea
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder={isKm ? 'មូលហេតុនៃការផ្តល់ជូន ឬប្តូរគម្រោង...' : 'Reason for complimentary upgrade or trial extension...'}
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 text-sm resize-none"
                />
              </div>

              {overrideError && (
                <div className="text-red-600 dark:text-red-400 text-xs">
                  {overrideError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSubModalOrg(null)}
                  className="px-4 py-2 rounded-2xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {isKm ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={overrideSubMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold bg-[#167e61] hover:bg-[#12674f] text-white shadow-xs disabled:opacity-50"
                >
                  {overrideSubMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isKm ? 'អនុវត្តការកែប្រែ' : 'Apply Override'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
