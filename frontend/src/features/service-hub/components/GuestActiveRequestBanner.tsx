import { useEffect, useState, type FC } from 'react'
import { BellRing, CheckCircle2, Clock, X } from 'lucide-react'
import { ServiceRequest } from '../types/serviceHub.types'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface GuestActiveRequestBannerProps {
  request: ServiceRequest | null
  onDismiss: () => void
}

export const GuestActiveRequestBanner: FC<GuestActiveRequestBannerProps> = ({
  request,
  onDismiss,
}) => {
  const { language } = useLanguageStore()

  const [elapsedSecs, setElapsedSecs] = useState(0)

  useEffect(() => {
    if (!request) return
    const startTime = new Date(request.requested_at).getTime()
    const timer = setInterval(() => {
      setElapsedSecs(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [request])

  if (!request) return null

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const isInProgress = request.status === 'IN_PROGRESS'

  return (
    <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-40 animate-in slide-in-from-bottom-4 duration-200">
      <div
        className={`p-3 rounded-2xl border ${
          isInProgress
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/90 text-emerald-950 dark:text-emerald-50'
            : 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/90 text-amber-950 dark:text-amber-50'
        } flex items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isInProgress ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white animate-pulse'
            }`}
          >
            {isInProgress ? <CheckCircle2 className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold leading-tight truncate">
              <span>
                {isInProgress
                  ? language === 'km'
                    ? `បុគ្គលិក ${request.attended_by_name || ''} កំពុងធ្វើដំណើរមក!`
                    : `Server ${request.attended_by_name || 'Staff'} is on the way!`
                  : language === 'km'
                  ? 'បានបញ្ជូនសំណើទៅអ្នកបម្រើរួចរាល់...'
                  : 'Request sent to server...'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 font-mono">
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {formatTimer(elapsedSecs)}
              </span>
              <span>•</span>
              <span className="font-sans">
                {language === 'km' ? `តុ ${request.table_number}` : `Table ${request.table_number}`}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
