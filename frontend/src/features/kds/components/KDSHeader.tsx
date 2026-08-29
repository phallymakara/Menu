import { type FC } from 'react'
import { Flame, Volume2, VolumeX, History, RefreshCw, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useKDSStore } from '../stores/useKDSStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export interface KDSHeaderProps {
  branchName?: string
  isConnected: boolean
  onRefresh: () => void
  isRefreshing?: boolean
}

export const KDSHeader: FC<KDSHeaderProps> = ({
  branchName = 'Kitchen Display System',
  isConnected,
  onRefresh,
  isRefreshing = false,
}) => {
  const { language } = useLanguageStore()
  const {
    isMuted,
    toggleMute,
    toggleRecall,
    tickets,
    metrics,
  } = useKDSStore()

  const activeCount = tickets.length
  const overdueCount = metrics?.overdue_tickets ?? tickets.filter((t) => t.is_ticket_overdue).length

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
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-zinc-950 dark:text-zinc-50 leading-tight">
                  {branchName}
                </h1>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                  }`}
                  title={isConnected ? 'Live WebSocket Connected' : 'Connecting WebSocket...'}
                />
              </div>
              <span className="text-[11px] text-zinc-500 font-medium block">
                {language === 'km' ? 'ប្រព័ន្ធអេក្រង់ផ្ទះបាយ (KDS)' : 'Kitchen Display System (KDS)'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live Station Metrics Badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">{language === 'km' ? 'កំពុងរៀបចំ:' : 'Active:'}</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">{activeCount}</span>
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
              overdueCount > 0
                ? 'border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-bold'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            <span className="font-sans">{language === 'km' ? 'យឺតពេល:' : 'Overdue:'}</span>
            <span>{overdueCount}</span>
          </div>

          {metrics?.avg_prep_time_minutes !== undefined && metrics.avg_prep_time_minutes > 0 && (
            <div className="hidden md:flex px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="font-sans">{language === 'km' ? 'មធ្យម:' : 'Avg:'}</span>
              <span className="font-bold">{metrics.avg_prep_time_minutes.toFixed(1)}m</span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors disabled:opacity-50"
            title={language === 'km' ? 'ផ្ទុកឡើងវិញ' : 'Refresh Tickets'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Audio Chime Mute Toggle */}
          <button
            onClick={toggleMute}
            className={`p-2 rounded-lg border transition-colors ${
              isMuted
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
            }`}
            title={isMuted ? 'Unmute Audio Chime' : 'Mute Audio Chime'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Ticket Recall Drawer Button */}
          <button
            onClick={toggleRecall}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors"
          >
            <History className="w-4 h-4 text-zinc-500" />
            <span>{language === 'km' ? 'ប្រវត្តិសំបុត្រ' : 'Recall'}</span>
          </button>

          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
