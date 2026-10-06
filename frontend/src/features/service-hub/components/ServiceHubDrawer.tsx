import { useMemo, useState, type FC } from 'react'
import { Bell, CheckCircle2, Clock, RefreshCw, Volume2, VolumeX, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'
import { getApiErrorStatus } from '@/lib/api-error'
import type { StaffServiceRequest } from '../types/serviceHub.types'
import { useServiceHubStore } from '../stores/useServiceHubStore'
import { useNow } from '../hooks/useNow'
import {
  useAcknowledgeServiceRequest,
  useBranchServiceRequests,
  useResolveServiceRequest,
} from '../hooks/useServiceRequestQueries'
import {
  formatElapsed,
  getSlaLevel,
  interpolate,
  secondsSince,
  serviceRequestTypeLabelKey,
  sortServiceQueue,
  staffActionErrorKey,
  type SlaLevel,
} from '../utils/serviceRequests'
import { SERVICE_REQUEST_TYPE_ICONS } from './serviceRequestIcons'

export interface ServiceHubDrawerProps {
  businessId: string | null
  branchId: string | null
}

const SLA_CARD_STYLES: Record<SlaLevel, string> = {
  critical: 'border-red-500 dark:border-red-600 bg-red-50/40 dark:bg-red-950/20',
  warning: 'border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/20',
  normal: 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
}

/** POS slide-over listing the branch's guest service requests, live. */
export const ServiceHubDrawer: FC<ServiceHubDrawerProps> = ({ businessId, branchId }) => {
  const isDrawerOpen = useServiceHubStore((state) => state.isDrawerOpen)
  // Mount the panel only while open, so its one-second timer does not tick in the background.
  if (!isDrawerOpen) return null
  return <ServiceHubDrawerPanel businessId={businessId} branchId={branchId} />
}

const ServiceHubDrawerPanel: FC<ServiceHubDrawerProps> = ({ businessId, branchId }) => {
  const { language, t } = useLanguageStore()
  const { toggleDrawer, isMuted, toggleMute } = useServiceHubStore()
  const { data, isLoading, isError, refetch } = useBranchServiceRequests(businessId, branchId)
  const acknowledge = useAcknowledgeServiceRequest(businessId, branchId)
  const resolve = useResolveServiceRequest(businessId, branchId)
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null)
  const now = useNow()

  const queue = useMemo(() => sortServiceQueue(data ?? []), [data])

  const runAction = (
    mutation: typeof acknowledge | typeof resolve,
    request: StaffServiceRequest
  ) => {
    setActionErrorKey(null)
    mutation.mutate(request.id, {
      onSuccess: () => {
        if (!isMuted) playSuccessSound()
      },
      onError: (err) => setActionErrorKey(staffActionErrorKey(getApiErrorStatus(err))),
    })
  }

  const isBusy = (request: StaffServiceRequest) =>
    (acknowledge.isPending && acknowledge.variables === request.id) ||
    (resolve.isPending && resolve.variables === request.id)

  const areaName = (request: StaffServiceRequest) =>
    (language === 'km' && request.dining_area_name_km) || request.dining_area_name_en || null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={toggleDrawer}
      />

      {/* Drawer body (zero shadow, clean flat borders) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-hub-title"
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-10 flex flex-col justify-between h-full animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 id="service-hub-title" className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                {t('serviceHub.staff.title')}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {interpolate(t('serviceHub.staff.activeCount'), { count: queue.length })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className={`p-1.5 rounded-lg border transition-colors ${
                isMuted
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
              title={t(isMuted ? 'serviceHub.staff.unmute' : 'serviceHub.staff.mute')}
              aria-label={t(isMuted ? 'serviceHub.staff.unmute' : 'serviceHub.staff.mute')}
              aria-pressed={isMuted}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={toggleDrawer}
              aria-label={t('serviceHub.staff.close')}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Request queue */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {actionErrorKey && (
            <p role="alert" className="text-xs text-red-500 text-center font-medium">
              {t(actionErrorKey)}
            </p>
          )}

          {isLoading ? (
            <div className="py-20 text-center text-xs text-zinc-500 space-y-2">
              <RefreshCw className="w-6 h-6 mx-auto text-zinc-400 animate-spin" />
              <p>{t('serviceHub.staff.loading')}</p>
            </div>
          ) : isError && queue.length === 0 ? (
            <div className="py-20 text-center text-xs space-y-3">
              <p className="text-red-500 font-medium">{t('serviceHub.staff.loadError')}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                {t('serviceHub.staff.retry')}
              </button>
            </div>
          ) : queue.length === 0 ? (
            <div className="py-20 text-center text-xs text-zinc-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                {t('serviceHub.staff.emptyTitle')}
              </p>
              <p>{t('serviceHub.staff.emptyBody')}</p>
            </div>
          ) : (
            queue.map((request) => {
              const Icon = SERVICE_REQUEST_TYPE_ICONS[request.request_type]
              const isAcknowledged = request.status === 'acknowledged'
              const busy = isBusy(request)
              const area = areaName(request)

              return (
                <div
                  key={request.id}
                  className={`p-3.5 rounded-2xl border ${SLA_CARD_STYLES[getSlaLevel(request.created_at, now)]} space-y-3 transition-colors`}
                >
                  {/* Card header: table and time waited */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-950 dark:text-zinc-50">
                          {interpolate(t('serviceHub.staff.table'), { table: request.table_number })}
                        </h4>
                        {area && (
                          <span className="text-[11px] text-zinc-500 font-medium block">{area}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatElapsed(secondsSince(request.created_at, now))}</span>
                    </div>
                  </div>

                  {/* Request type and note */}
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {t(serviceRequestTypeLabelKey(request.request_type))}
                    </div>
                    {request.note && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 italic break-words">
                        "{request.note}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center gap-2">
                    {isAcknowledged ? (
                      <span className="flex-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-1 flex items-center gap-1 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {request.acknowledged_by_name
                            ? interpolate(t('serviceHub.staff.takenBy'), {
                                name: request.acknowledged_by_name,
                              })
                            : t('serviceHub.staff.inProgress')}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction(acknowledge, request)}
                        className="flex-1 py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-xs font-semibold text-zinc-900 dark:text-zinc-100 transition-colors"
                      >
                        {t('serviceHub.staff.acknowledge')}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction(resolve, request)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-colors"
                    >
                      {t('serviceHub.staff.markDone')}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
