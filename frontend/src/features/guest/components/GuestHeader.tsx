import { useState, useEffect, type FC } from 'react'
import { Store, Search, BellRing, ReceiptText } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useGuestSessionStore } from '../stores/useGuestSessionStore'
import type { Category } from '../types/guest.types'

export interface GuestHeaderProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onRequestBill: () => void
  onCallWaiter: () => void
  hasActiveOrders: boolean
  categories?: Category[]
  activeCategory?: string
  onSelectCategory?: (categoryId: string) => void
}

export const GuestHeader: FC<GuestHeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRequestBill,
  onCallWaiter,
  hasActiveOrders,
  categories,
  activeCategory = 'all',
  onSelectCategory,
}) => {
  const { language } = useLanguageStore()
  const { table } = useGuestSessionStore()
  const [logoLoadError, setLogoLoadError] = useState(false)

  useEffect(() => {
    setLogoLoadError(false)
  }, [table?.logo_url])

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-950/95 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-md">
      {/* Top Bar: Table Identifier & Actions */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-2 max-w-3xl mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Store Logo Circle */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-600 dark:bg-emerald-600/30 text-white dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
            {table?.logo_url && !logoLoadError ? (
              <img
                src={table.logo_url}
                alt={table.business_name || 'Store Logo'}
                className="w-full h-full object-cover"
                onError={() => setLogoLoadError(true)}
              />
            ) : (
              <Store className="w-4 h-4 sm:w-5 sm:h-5 text-white dark:text-emerald-400" />
            )}
          </div>

          <div className="min-w-0">
            <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate block leading-tight">
              {table?.business_name || 'Brojane Coffee & Kitchen'}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {table ? `Table ${table.table_number}` : 'Table T-01'}
              </span>
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
            aria-label={language === 'km' ? 'ហៅបុគ្គលិក' : 'Call Staff'}
            title={language === 'km' ? 'ហៅបុគ្គលិក / សេវាកម្ម' : 'Call Staff / Service'}
            className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
          >
            <BellRing className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden xs:inline">{language === 'km' ? 'ហៅបុគ្គលិក' : 'Call Staff'}</span>
          </button>

          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="px-4 pb-2 max-w-3xl mx-auto">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប ឬភេសជ្ជៈ...' : 'Search food or drinks...'}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs sm:text-sm focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Category Tab Bar (Tap Button Selection) */}
      {categories && categories.length > 0 && (
        <div className="px-4 pb-2.5 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => onSelectCategory?.('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {language === 'km' ? 'ទាំងអស់' : 'All Items'}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectCategory?.(c.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                  activeCategory === c.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {language === 'km' && c.name_km ? c.name_km : c.name_en}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
