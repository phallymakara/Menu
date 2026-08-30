import { type FC } from 'react'
import { LayoutGrid, UtensilsCrossed, ArrowLeft, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ServiceHubBellButton } from '@/features/service-hub/components/ServiceHubBellButton'
import { usePOSStore } from '../stores/usePOSStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export interface POSHeaderProps {
  branchName?: string
  onRefresh: () => void
  isRefreshing?: boolean
}

export const POSHeader: FC<POSHeaderProps> = ({
  branchName = 'Cashier & POS Terminal',
  onRefresh,
  isRefreshing = false,
}) => {
  const { language } = useLanguageStore()
  const { tables, viewMode, setViewMode } = usePOSStore()

  const occupiedCount = tables.filter(
    (t) => t.status.toLowerCase() === 'occupied' || t.status.toLowerCase() === 'bill_requested'
  ).length
  const billingCount = tables.filter((t) => t.status.toLowerCase() === 'bill_requested').length
  const availableCount = tables.filter((t) => t.status.toLowerCase() === 'available').length

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Branding & Back Link */}
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors"
            title={language === 'km' ? 'ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង' : 'Back to Dashboard'}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-sm text-zinc-950 dark:text-zinc-50 leading-tight">
                {branchName}
              </h1>
              <span className="text-[11px] text-zinc-500 font-medium block">
                {language === 'km' ? 'ផ្ទាំងគិតប្រាក់ និងប្លង់តុ (POS)' : 'Cashier & Table Floor Map (POS)'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: View Mode Toggle Tabs & Occupancy Status */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold">
            <button
              onClick={() => setViewMode('floor_map')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'floor_map'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 font-bold'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{language === 'km' ? 'ប្លង់តុ' : 'Floor Map'}</span>
            </button>
            <button
              onClick={() => setViewMode('direct_order')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'direct_order'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 font-bold'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{language === 'km' ? 'កុម្ម៉ង់ផ្ទាល់' : 'Quick Order'}</span>
            </button>
          </div>

          {/* Occupancy Counters */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono">
            <div className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-zinc-500 font-sans">{language === 'km' ? 'មានភ្ញៀវ:' : 'Occupied:'}</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100">{occupiedCount}</span>
            </div>

            {billingCount > 0 && (
              <div className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-center gap-1.5 font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-sans">{language === 'km' ? 'សុំគិតប្រាក់:' : 'Billing:'}</span>
                <span>{billingCount}</span>
              </div>
            )}

            <div className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-sans">{language === 'km' ? 'ទំនេរ:' : 'Free:'}</span>
              <span className="font-bold">{availableCount}</span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ServiceHubBellButton />

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors disabled:opacity-50"
            title={language === 'km' ? 'ផ្ទុកឡើងវិញ' : 'Refresh POS'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
