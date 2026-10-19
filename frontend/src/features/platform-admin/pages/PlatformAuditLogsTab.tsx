import { useState, useId, type FC } from 'react'
import {
  FileText,
  Search,
  Calendar,
  Building2,
  User,
  Shield,
  Activity,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Copy,
  Check,
  Globe,
  Monitor,
  Clock,
  RotateCcw,
} from 'lucide-react'
import {
  usePlatformAuditLogs,
  usePlatformAuditLogDetail,
  usePlatformOrganizations,
  type AdminAuditLogItem,
} from '../hooks'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

function getActionColor(action: string): { bg: string; text: string; border: string } {
  const act = action.toLowerCase()
  if (act.includes('delete') || act.includes('terminate') || act.includes('revoke') || act.includes('archive')) {
    return {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-200/80 dark:border-rose-800/50',
    }
  }
  if (act.includes('create') || act.includes('activate') || act.includes('grant') || act.includes('register')) {
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200/80 dark:border-emerald-800/50',
    }
  }
  if (act.includes('update') || act.includes('override') || act.includes('reset') || act.includes('suspend')) {
    return {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200/80 dark:border-amber-800/50',
    }
  }
  return {
    bg: 'bg-[#167e61]/10',
    text: 'text-[#167e61] dark:text-[#22ab84]',
    border: 'border-[#167e61]/20 dark:border-[#167e61]/30',
  }
}

export const PlatformAuditLogsTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  // Filter States
  const [actionInput, setActionInput] = useState('')
  const [selectedResourceType, setSelectedResourceType] = useState<string>('all')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Drawer Inspection State
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [jsonCopied, setJsonCopied] = useState(false)

  // Accessible unique IDs
  const actionSearchInputId = useId()
  const resourceTypeSelectId = useId()
  const orgFilterSelectId = useId()
  const fromDateInputId = useId()
  const toDateInputId = useId()

  // Queries
  const { data: orgsData } = usePlatformOrganizations({ pageSize: 100 })
  const {
    data: logsData,
    isLoading: isLoadingLogs,
  } = usePlatformAuditLogs({
    action: actionInput.trim() || undefined,
    resource_type: selectedResourceType === 'all' ? undefined : selectedResourceType,
    organization_id: selectedOrgId === 'all' ? undefined : selectedOrgId,
    from_date: fromDate ? new Date(fromDate).toISOString() : undefined,
    to_date: toDate ? new Date(toDate).toISOString() : undefined,
    page,
    pageSize,
  })

  // Deep inspection query
  const { data: logDetail, isLoading: isLoadingDetail } = usePlatformAuditLogDetail(selectedLogId)

  // Reset all filters
  const handleResetFilters = () => {
    setActionInput('')
    setSelectedResourceType('all')
    setSelectedOrgId('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const handleCopyJson = async (data: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setJsonCopied(true)
      setTimeout(() => setJsonCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const logsList: AdminAuditLogItem[] = logsData?.items || []
  const totalLogs = logsData?.total || 0
  const totalPages = logsData?.total_pages || 1

  const hasActiveFilters =
    Boolean(actionInput) ||
    selectedResourceType !== 'all' ||
    selectedOrgId !== 'all' ||
    Boolean(fromDate) ||
    Boolean(toDate)

  return (
    <div className="space-y-6">
      {/* Multi-Field Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Action Filter / Search */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              id={actionSearchInputId}
              type="text"
              value={actionInput}
              onChange={(e) => {
                setActionInput(e.target.value)
                setPage(1)
              }}
              placeholder={isKm ? 'ស្វែងរកសកម្មភាព (ឧ. user.status, plan)...' : 'Filter action (e.g. user.status, plan)...'}
              className="w-full pl-9 pr-8 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            />
            {actionInput && (
              <button
                type="button"
                onClick={() => setActionInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Resource Type Dropdown */}
          <div className="md:col-span-3">
            <label htmlFor={resourceTypeSelectId} className="sr-only">
              {isKm ? 'ប្រភេទធនធាន' : 'Resource Type'}
            </label>
            <select
              id={resourceTypeSelectId}
              value={selectedResourceType}
              onChange={(e) => {
                setSelectedResourceType(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-2xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            >
              <option value="all">{isKm ? 'ធនធានទាំងអស់ (All Resources)' : 'All Resources'}</option>
              <option value="user">User Account</option>
              <option value="organization">Organization</option>
              <option value="subscription">Subscription</option>
              <option value="plan">Plan Tier</option>
              <option value="branch">Branch</option>
              <option value="auth">Authentication</option>
            </select>
          </div>

          {/* Tenant Organization Selector */}
          <div className="md:col-span-5">
            <label htmlFor={orgFilterSelectId} className="sr-only">
              {isKm ? 'ភោជនីយដ្ឋាន' : 'Organization'}
            </label>
            <select
              id={orgFilterSelectId}
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
        </div>

        {/* Date Range Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 items-center">
          <div className="md:col-span-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-xs text-zinc-500 shrink-0">{isKm ? 'ចាប់ពី:' : 'From:'}</span>
            <input
              id={fromDateInputId}
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setPage(1)
              }}
              className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            />
          </div>

          <div className="md:col-span-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-xs text-zinc-500 shrink-0">{isKm ? 'ដល់:' : 'To:'}</span>
            <input
              id={toDateInputId}
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setPage(1)
              }}
              className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
            />
          </div>

          <div className="md:col-span-4 flex items-center justify-end gap-2 text-xs text-zinc-400">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {isKm ? 'កំណត់ឡើងវិញ' : 'Reset'}
              </button>
            )}
            <span>{isKm ? `បង្ហាញ ${logsList.length} នៃ ${totalLogs} កំណត់ត្រា` : `Showing ${logsList.length} of ${totalLogs} events`}</span>
          </div>
        </div>
      </div>

      {/* 3. Audit Logs Data Table */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
        {isLoadingLogs ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <EmenuLoader
              size="md"
              message={isKm ? 'កំពុងទាញយកកំណត់ត្រាសវនកម្ម...' : 'Loading audit trail events...'}
            />
          </div>
        ) : logsList.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {isKm ? 'រកមិនឃើញកំណត់ត្រាសវនកម្មទេ' : 'No audit trail records found'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {isKm
                ? 'មិនមានព្រឹត្តិការណ៍សវនកម្មដែលត្រូវនឹងលក្ខខណ្ឌចម្រាញ់ដែលបានជ្រើសរើសឡើយ។'
                : 'Try clearing or widening your action search, resource type, or date range filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                  <th className="py-3.5 px-4">{isKm ? 'កាលបរិច្ឆេទ & ម៉ោង' : 'Timestamp'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'សកម្មភាព' : 'Action'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'ធនធាន' : 'Resource'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'អ្នកដំណើរការ' : 'Actor'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'ភោជនីយដ្ឋាន' : 'Organization'}</th>
                  <th className="py-3.5 px-4">{isKm ? 'អាសយដ្ឋាន IP' : 'IP Address'}</th>
                  <th className="py-3.5 px-4 text-right">{isKm ? 'ពិនិត្យ' : 'Inspect'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/60 text-sm">
                {logsList.map((log) => {
                  const style = getActionColor(log.action)
                  const dateObj = new Date(log.created_at)

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedLogId(log.id)}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-900 dark:text-zinc-100">
                          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>
                            {dateObj.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="text-zinc-400 font-mono text-[11px]">
                            {dateObj.toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border font-mono ${style.bg} ${style.text} ${style.border}`}
                        >
                          <Activity className="w-3 h-3" />
                          {log.action}
                        </span>
                      </td>

                      {/* Resource Type */}
                      <td className="py-3 px-4">
                        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 capitalize">
                          {log.resource_type}
                        </div>
                        {log.resource_id && (
                          <div className="text-[10px] text-zinc-400 font-mono truncate max-w-[120px]">
                            {log.resource_id}
                          </div>
                        )}
                      </td>

                      {/* Acting User */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-xs font-bold shrink-0">
                            {log.user_name ? log.user_name.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                              {log.user_name || (isKm ? 'ប្រព័ន្ធស្វ័យប្រវត្តិ' : 'System')}
                            </div>
                            {log.user_email && (
                              <div className="text-[11px] text-zinc-400 truncate max-w-[150px]">
                                {log.user_email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tenant Organization */}
                      <td className="py-3 px-4">
                        {log.organization_name ? (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                            <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="truncate max-w-[140px] font-medium">{log.organization_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">
                            {isKm ? 'ប្រព័ន្ធទាំងមូល' : 'Platform System'}
                          </span>
                        )}
                      </td>

                      {/* IP Address */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                          <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{log.ip_address || '—'}</span>
                        </div>
                      </td>

                      {/* Inspect Detail Button */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedLogId(log.id)}
                          title={isKm ? 'ពិនិត្យលម្អិត' : 'Inspect Audit Record'}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
                  ? `ទំព័រ ${page} នៃ ${totalPages} (${totalLogs} កំណត់ត្រា)`
                  : `Page ${page} of ${totalPages} (${totalLogs} events)`}
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
          SLIDE-OVER DRAWER: DEEP AUDIT RECORD INSPECTION & PAYLOAD DIFF
      ========================================================================== */}
      {selectedLogId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isKm ? 'ព័ត៌មានលម្អិតសវនកម្ម' : 'Audit Event Dossier'}
          className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
          onClick={() => setSelectedLogId(null)}
        >
          <div
            className="w-full max-w-xl h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden rounded-l-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                    {isKm ? 'ព័ត៌មានលម្អិតសវនកម្ម' : 'Audit Event Dossier'}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">ID: {selectedLogId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogId(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetail || !logDetail ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <EmenuLoader
                    size="sm"
                    message={isKm ? 'កំពុងទាញយកព័ត៌មានលម្អិត...' : 'Fetching audit record...'}
                  />
                </div>
              ) : (
                <>
                  {/* Event Overview Card */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border font-mono ${
                          getActionColor(logDetail.action).bg
                        } ${getActionColor(logDetail.action).text} ${getActionColor(logDetail.action).border}`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        {logDetail.action}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {new Date(logDetail.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/40 text-xs">
                      <div>
                        <span className="text-zinc-400">{isKm ? 'ប្រភេទធនធាន:' : 'Resource Type:'}</span>
                        <div className="font-bold text-zinc-800 dark:text-zinc-200 uppercase font-mono mt-0.5">
                          {logDetail.resource_type}
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-400">{isKm ? 'Resource ID:' : 'Resource ID:'}</span>
                        <div className="font-mono text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                          {logDetail.resource_id || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actor & Security Identity Dossier */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      {isKm ? 'ព័ត៌មានអ្នកដំណើរការ & បណ្តាញ' : 'Actor & Network Identity'}
                    </h4>
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" />
                          {isKm ? 'អ្នកដំណើរការ:' : 'Acting User:'}
                        </span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          {logDetail.user_name || (isKm ? 'ប្រព័ន្ធស្វ័យប្រវត្តិ' : 'System Automation')}
                        </span>
                      </div>

                      {logDetail.user_email && (
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400">{isKm ? 'អ៊ីមែល:' : 'User Email:'}</span>
                          <span className="text-zinc-700 dark:text-zinc-300">
                            {logDetail.user_email}
                          </span>
                        </div>
                      )}

                      {logDetail.organization_name && (
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5" />
                            {isKm ? 'ភោជនីយដ្ឋាន:' : 'Tenant Org:'}
                          </span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {logDetail.organization_name} ({logDetail.organization_slug})
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-200/50 dark:border-zinc-700/40">
                        <span className="text-zinc-400 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" />
                          {isKm ? 'អាសយដ្ឋាន IP:' : 'Client IP:'}
                        </span>
                        <span className="font-mono text-zinc-800 dark:text-zinc-200">
                          {logDetail.ip_address || 'Unknown'}
                        </span>
                      </div>

                      {logDetail.user_agent && (
                        <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-700/40 space-y-1">
                          <span className="text-zinc-400 flex items-center gap-1.5">
                            <Monitor className="w-3.5 h-3.5" />
                            {isKm ? 'User Agent:' : 'User Agent Browser:'}
                          </span>
                          <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 break-all bg-zinc-100 dark:bg-zinc-800/80 p-2 rounded-lg">
                            {logDetail.user_agent}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata JSON Payload Diff */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        {isKm ? 'ទិន្នន័យព្រឹត្តិការណ៍ (Event Details Payload)' : 'Event Details Payload'}
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleCopyJson(logDetail.details)}
                        className="text-xs text-[#167e61] dark:text-[#22ab84] hover:underline flex items-center gap-1"
                      >
                        {jsonCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-500">{isKm ? 'បានចម្លង' : 'Copied!'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{isKm ? 'ចម្លង JSON' : 'Copy JSON'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="rounded-xl bg-zinc-950 p-4 border border-zinc-800 overflow-x-auto">
                      <pre className="text-xs font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap">
                        {JSON.stringify(logDetail.details || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
