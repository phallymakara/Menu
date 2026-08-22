import { type FC } from 'react'
import { Utensils, Search, BellRing, ReceiptText } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useGuestSessionStore } from '../stores/useGuestSessionStore'

export interface GuestHeaderProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onRequestBill: () => void
  onCallWaiter: () => void
  hasActiveOrders: boolean
}

export const GuestHeader: FC<GuestHeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRequestBill,
  onCallWaiter,
  hasActiveOrders,
}) => {
  const { language } = useLanguageStore()
  const { table } = useGuestSessionStore()

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-950/95 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-md">
      {/* Top Bar: Table Identifier & Actions */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <Utensils className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 block truncate leading-tight">
              {table?.business_name || (language === 'km' ? 'ភោជនីយដ្ឋាន' : 'Restaurant')}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {table ? `Table ${table.table_number}` : 'Table 08'}
              </span>
              {table?.dining_area_name && (
                <>
                  <span>•</span>
                  <span>{table.dining_area_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasActiveOrders && (
            <button
              onClick={onRequestBill}
              aria-label="Request Bill"
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              <ReceiptText className="w-3.5 h-3.5 text-emerald-600" />
              <span>{language === 'km' ? 'គិតប្រាក់' : 'Bill'}</span>
            </button>
          )}

          <button
            onClick={onCallWaiter}
            aria-label="Call Waiter"
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <BellRing className="w-4 h-4 text-zinc-500" />
          </button>

          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="px-4 pb-2.5 max-w-2xl mx-auto">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប ឬភេសជ្ជៈ...' : 'Search food or drinks...'}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
          />
        </div>
      </div>
    </header>
  )
}
