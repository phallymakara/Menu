import { type FC } from 'react'
import { BellRing, CheckCircle2, Clock, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import type { GuestServiceRequest } from '../types/serviceHub.types'
import { useNow } from '../hooks/useNow'
import {
  formatElapsed,
  interpolate,
  secondsSince,
  serviceRequestTypeLabelKey,
} from '../utils/serviceRequests'

export interface GuestActiveRequestBannerProps {
  /** The request to follow, usually the guest's newest one still waiting on staff. */
  request: GuestServiceRequest | null
  onDismiss: () => void
}

/** Live status strip for the guest's service request: sent, then staff on the way. */
export const GuestActiveRequestBanner: FC<GuestActiveRequestBannerProps> = ({
  request,
  onDismiss,
}) => {
  const { t } = useLanguageStore()
  const now = useNow(1000, request !== null)

  if (!request) return null

  const isAcknowledged = request.status === 'acknowledged'
  const typeLabel = t(serviceRequestTypeLabelKey(request.request_type))
  const headline = isAcknowledged
    ? t('serviceHub.guest.staffOnTheWay')
    : interpolate(t('serviceHub.guest.requestSent'), { type: typeLabel })

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-40 animate-in slide-in-from-bottom-4 duration-200"
    >
      <div
        className={`p-3 rounded-2xl border ${
          isAcknowledged
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/90 text-emerald-950 dark:text-emerald-50'
            : 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/90 text-amber-950 dark:text-amber-50'
        } flex items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isAcknowledged ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white animate-pulse'
            }`}
          >
            {isAcknowledged ? <CheckCircle2 className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
          </div>

          <div className="min-w-0">
            <div className="text-xs font-bold leading-tight truncate">{headline}</div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 font-mono">
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {formatElapsed(secondsSince(request.created_at, now))}
              </span>
              <span aria-hidden="true">•</span>
              <span className="font-sans">
                {interpolate(t('serviceHub.guest.table'), { table: request.table_number })}
              </span>
              {isAcknowledged && (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="font-sans truncate">{typeLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('serviceHub.guest.dismiss')}
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
