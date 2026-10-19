import { useState, type FC } from 'react'
import { History, Filter, ChevronLeft, ChevronRight, Activity } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import { useTenantAuditLogs, type AuditLogResponse } from '../../hooks/useSubscriptionQueries'

interface TenantAuditLogsCardProps {
  orgId: string | null
}

export const TenantAuditLogsCard: FC<TenantAuditLogsCardProps> = ({ orgId }) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [resourceFilter, setResourceFilter] = useState<string>('')

  const { data: auditData, isLoading, error } = useTenantAuditLogs(orgId, {
    page,
    page_size: 8,
    action: actionFilter || undefined,
    resource_type: resourceFilter || undefined,
  })

  if (!orgId) return null

  const items = auditData?.items || []
  const totalPages = auditData?.total_pages || 1

  return (
    <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
              {isKm ? 'ប្រវត្តិសកម្មភាពប្រតិបត្តិការ' : 'Operational Audit Trail'}
            </h3>
            <p className="text-xs text-zinc-500">
              {isKm
                ? 'កំណត់ត្រាសកម្មភាពសំខាន់ៗក្នុងប្រព័ន្ធសម្រាប់សន្តិសុខ'
                : 'Security audit trail of key operational actions and changes'}
            </p>
          </div>
        </div>

        {/* Action / Resource Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
              className="bg-transparent text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="">{isKm ? 'គ្រប់សកម្មភាព' : 'All Actions'}</option>
              <option value="member.invite">member.invite</option>
              <option value="order.void">order.void</option>
              <option value="branch.switch">branch.switch</option>
              <option value="subscription.change">subscription.change</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs">
            <select
              value={resourceFilter}
              onChange={(e) => {
                setResourceFilter(e.target.value)
                setPage(1)
              }}
              className="bg-transparent text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="">{isKm ? 'គ្រប់ធនធាន' : 'All Resources'}</option>
              <option value="member">member</option>
              <option value="order">order</option>
              <option value="branch">branch</option>
              <option value="organization">organization</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Container */}
      {isLoading ? (
        <div className="py-12 flex justify-center items-center">
          <EmenuLoader />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-xs text-rose-500">
          {isKm ? 'មិនអាចទាញយកកំណត់ត្រាបានទេ' : 'Unable to load audit logs'}
        </p>
      ) : items.length === 0 ? (
        <div className="py-10 text-center space-y-1">
          <Activity className="w-6 h-6 text-zinc-400 mx-auto mb-1" />
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            {isKm ? 'មិនមានសកម្មភាពដែលត្រូវបង្ហាញទេ' : 'No activity logged yet'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 uppercase text-[10px]">
                <th className="py-2.5 font-semibold">{isKm ? 'សកម្មភាព' : 'Action'}</th>
                <th className="py-2.5 font-semibold">{isKm ? 'ធនធាន' : 'Resource'}</th>
                <th className="py-2.5 font-semibold">{isKm ? 'អាសយដ្ឋាន IP' : 'IP Address'}</th>
                <th className="py-2.5 font-semibold text-right">{isKm ? 'កាលបរិច្ឆេទ' : 'Timestamp'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
              {items.map((log: AuditLogResponse) => (
                <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-2.5 font-sans">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-600 dark:text-zinc-400">
                    {log.resource_type || '—'}
                  </td>
                  <td className="py-2.5 text-zinc-400">{log.ip_address || '—'}</td>
                  <td className="py-2.5 text-right text-zinc-400 font-sans">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
          <span>
            {isKm ? 'ទំព័រ' : 'Page'} {page} {isKm ? 'នៃ' : 'of'} {totalPages} ({auditData?.total ?? 0}{' '}
            {isKm ? 'កំណត់ត្រា' : 'records'})
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg text-xs"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
