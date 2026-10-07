import { type FC } from 'react'
import { Bell } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useServiceHubStore } from '../stores/useServiceHubStore'
import { useBranchServiceRequests } from '../hooks/useServiceRequestQueries'

export interface ServiceHubBellButtonProps {
  businessId: string | null
  branchId: string | null
}

/** POS header bell: counts the branch's waiting requests and opens the service hub. */
export const ServiceHubBellButton: FC<ServiceHubBellButtonProps> = ({ businessId, branchId }) => {
  const { t } = useLanguageStore()
  const toggleDrawer = useServiceHubStore((state) => state.toggleDrawer)
  const { data: requests = [] } = useBranchServiceRequests(businessId, branchId)

  const openCount = requests.filter((request) => request.status === 'open').length
  const totalCount = requests.length
  const label = t('serviceHub.staff.bellLabel')

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      className={`relative p-2 rounded-lg border transition-colors ${
        openCount > 0
          ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
      }`}
      title={label}
      aria-label={totalCount > 0 ? `${label} (${totalCount})` : label}
    >
      <Bell className={`w-4 h-4 ${openCount > 0 ? 'animate-bounce' : ''}`} />

      {totalCount > 0 && (
        <span
          className={`absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center text-white ${
            openCount > 0 ? 'bg-red-600' : 'bg-zinc-600'
          }`}
        >
          {totalCount}
        </span>
      )}
    </button>
  )
}
