import { type FC } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ServiceHubBellButton } from '@/features/service-hub/components/ServiceHubBellButton'
import { usePOSStore } from '../stores/usePOSStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export interface POSHeaderProps {
  storeName?: string
  storeLogo?: string | null
  isConnected?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
}

export const POSHeader: FC<POSHeaderProps> = ({
  storeName,
  storeLogo,
  isConnected = true,
}) => {
  const { language } = useLanguageStore()
  const { tables } = usePOSStore()

  const resolvedStoreName =
    storeName ||
    (language === 'km'
      ? localStorage.getItem('emenu_business_name_km') || localStorage.getItem('emenu_business_name_en') || 'ភោជនីយដ្ឋាន'
      : localStorage.getItem('emenu_business_name_en') || localStorage.getItem('emenu_business_name_km') || 'Restaurant')

  const resolvedLogo = storeLogo !== undefined ? storeLogo : localStorage.getItem('emenu_business_logo') || null

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

          <div className="flex items-center gap-2.5">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt={resolvedStoreName}
                className="w-9 h-9 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                {resolvedStoreName.charAt(0)}
              </div>
            )}

            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 leading-tight">
                {resolvedStoreName}
              </h1>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
                title={isConnected ? 'Live WebSocket Connected' : 'Connecting WebSocket...'}
              />
            </div>
          </div>
        </div>

        {/* Center: Live Occupancy Status Badges */}
        <div className="flex items-center gap-2.5 font-mono">
          <div className="px-4 py-1.5 sm:py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-zinc-500 font-sans text-xs sm:text-sm font-medium">
              {language === 'km' ? 'មានភ្ញៀវ:' : 'Occupied:'}
            </span>
            <span className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
              {occupiedCount}
            </span>
          </div>

          {billingCount > 0 && (
            <div className="px-4 py-1.5 sm:py-2 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-center gap-2 font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="font-sans text-xs sm:text-sm font-medium">
                {language === 'km' ? 'សុំគិតប្រាក់:' : 'Billing:'}
              </span>
              <span className="font-bold text-sm sm:text-base">
                {billingCount}
              </span>
            </div>
          )}

          <div className="px-4 py-1.5 sm:py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-sans text-xs sm:text-sm font-medium">
              {language === 'km' ? 'ទំនេរ:' : 'Free:'}
            </span>
            <span className="font-bold text-sm sm:text-base">
              {availableCount}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ServiceHubBellButton />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
