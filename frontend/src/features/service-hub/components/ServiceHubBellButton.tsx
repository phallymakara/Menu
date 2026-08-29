import { type FC } from 'react'
import { Bell } from 'lucide-react'
import { useServiceHubStore } from '../stores/useServiceHubStore'

export const ServiceHubBellButton: FC = () => {
  const { requests, toggleDrawer } = useServiceHubStore()

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length
  const totalCount = requests.length

  return (
    <button
      onClick={toggleDrawer}
      className={`relative p-2 rounded-lg border transition-colors ${
        pendingCount > 0
          ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
      }`}
      title="Waiter Service Requests Hub"
    >
      <Bell className={`w-4 h-4 ${pendingCount > 0 ? 'animate-bounce' : ''}`} />

      {totalCount > 0 && (
        <span
          className={`absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center text-white ${
            pendingCount > 0 ? 'bg-red-600' : 'bg-zinc-600'
          }`}
        >
          {totalCount}
        </span>
      )}
    </button>
  )
}
