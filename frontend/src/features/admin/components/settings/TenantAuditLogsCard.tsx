import { useState, type FC } from 'react'
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
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-none">
      {/* Header & Filter Controls */}
      <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
            {isKm ? 'ប្រវត្តិសកម្មភាពប្រតិបត្តិការ' : 'Operational Audit Trail'}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {isKm
              ? 'កំណត់ត្រាសកម្មភាពសំខាន់ៗក្នុងប្រព័ន្ធសម្រាប់សន្តិសុខ'
              : 'Security audit trail of key operational actions and changes'}
          </p>
        </div>

        {/* Action / Resource Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-normal text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer shadow-none"
          >
            <option value="">{isKm ? 'គ្រប់សកម្មភាព' : 'All Actions'}</option>
            <option value="member.invite">member.invite</option>
            <option value="order.void">order.void</option>
            <option value="branch.switch">branch.switch</option>
            <option value="subscription.change">subscription.change</option>
          </select>

          <select
            value={resourceFilter}
            onChange={(e) => {
              setResourceFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-normal text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer shadow-none"
          >
            <option value="">{isKm ? 'គ្រប់ធនធាន' : 'All Resources'}</option>
            <option value="member">member</option>
            <option value="order">order</option>
            <option value="branch">branch</option>
            <option value="organization">organization</option>
          </select>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-4">
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
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {isKm ? 'មិនមានសកម្មភាពដែលត្រូវបង្ហាញទេ' : 'No activity logged yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/80 text-zinc-400 uppercase text-[10px]">
                  <th className="py-2.5 font-medium">{isKm ? 'សកម្មភាព' : 'Action'}</th>
                  <th className="py-2.5 font-medium">{isKm ? 'ធនធាន' : 'Resource'}</th>
                  <th className="py-2.5 font-medium">{isKm ? 'អាសយដ្ឋាន IP' : 'IP Address'}</th>
                  <th className="py-2.5 font-medium text-right">{isKm ? 'កាលបរិច្ឆេទ' : 'Timestamp'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
                {items.map((log: AuditLogResponse) => (
                  <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-normal bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-600 dark:text-zinc-400 font-normal">
                      {log.resource_type || '—'}
                    </td>
                    <td className="py-2.5 text-zinc-400 font-normal">{log.ip_address || '—'}</td>
                    <td className="py-2.5 text-right text-zinc-400 font-sans font-normal">
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
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg text-xs font-normal"
              >
                {isKm ? 'មុន' : 'Prev'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg text-xs font-normal"
              >
                {isKm ? 'បន្ទាប់' : 'Next'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
