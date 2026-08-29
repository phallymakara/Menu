import { useState, useEffect, type FC } from 'react'
import {
  X,
  Droplets,
  Utensils,
  Receipt,
  Sparkles,
  Bell,
  Clock,
  CheckCircle2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { ServiceRequest, ServiceRequestType } from '../types/serviceHub.types'
import { useServiceHubStore } from '../stores/useServiceHubStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'

export const ServiceHubDrawer: FC = () => {
  const { language } = useLanguageStore()
  const {
    requests,
    isDrawerOpen,
    toggleDrawer,
    isMuted,
    toggleMute,
    acknowledgeRequest,
    resolveRequest,
  } = useServiceHubStore()

  // Live timer tick
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!isDrawerOpen) return null

  const getIconForType = (type: ServiceRequestType) => {
    switch (type) {
      case 'WATER':
        return Droplets
      case 'NAPKINS_UTENSILS':
        return Utensils
      case 'REQUEST_BILL':
        return Receipt
      case 'TABLE_CLEANING':
        return Sparkles
      default:
        return Bell
    }
  }

  const getLabelForType = (type: ServiceRequestType) => {
    switch (type) {
      case 'WATER':
        return language === 'km' ? 'សុំទឹក / ទឹកកក' : 'Water & Ice Refill'
      case 'NAPKINS_UTENSILS':
        return language === 'km' ? 'ក្រដាស / ស្លាបព្រា' : 'Napkins & Cutlery'
      case 'REQUEST_BILL':
        return language === 'km' ? 'សុំគិតប្រាក់' : 'Bill Request'
      case 'TABLE_CLEANING':
        return language === 'km' ? 'សម្អាតតុ' : 'Table Cleanup'
      default:
        return language === 'km' ? 'ហៅអ្នកបម្រើ' : 'General Server Call'
    }
  }

  const formatElapsed = (isoDate: string) => {
    const totalSecs = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000))
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const getSLAStyle = (isoDate: string) => {
    const totalMins = (Date.now() - new Date(isoDate).getTime()) / 1000 / 60
    if (totalMins >= 5) {
      return 'border-red-500 dark:border-red-600 bg-red-50/40 dark:bg-red-950/20'
    }
    if (totalMins >= 2) {
      return 'border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/20'
    }
    return 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
  }

  const handleAcknowledge = (req: ServiceRequest) => {
    acknowledgeRequest(req.id, 'Staff')
    playSuccessSound()
  }

  const handleResolve = (req: ServiceRequest) => {
    resolveRequest(req.id)
    playSuccessSound()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={toggleDrawer}
      />

      {/* Drawer Body (Zero Shadow, Clean Flat Borders) */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-10 flex flex-col justify-between h-full animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'មជ្ឈមណ្ឌលហៅអ្នកបម្រើ' : 'Waiter Service Hub'}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {requests.length} {language === 'km' ? 'សំណើកំពុងរង់ចាំ' : 'active requests in queue'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className={`p-1.5 rounded-lg border transition-colors ${
                isMuted
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
              title={isMuted ? 'Unmute Audio Chime' : 'Mute Audio Chime'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={toggleDrawer}
              className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Requests Queue */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {requests.length === 0 ? (
            <div className="py-20 text-center text-xs text-zinc-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                {language === 'km' ? 'គ្មានសំណើកំពុងរង់ចាំទេ!' : 'All Caught Up!'}
              </p>
              <p>{language === 'km' ? 'សំណើថ្មីពីភ្ញៀវនឹងបង្ហាញនៅទីនេះ' : 'Guest service calls will appear here in real time.'}</p>
            </div>
          ) : (
            requests.map((req) => {
              const Icon = getIconForType(req.request_type)
              const slaStyle = getSLAStyle(req.requested_at)
              const isInProgress = req.status === 'IN_PROGRESS'

              return (
                <div
                  key={req.id}
                  className={`p-3.5 rounded-2xl border ${slaStyle} space-y-3 transition-colors`}
                >
                  {/* Card Header: Table + Time Elapsed */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-zinc-950 dark:text-zinc-50">
                          Table {req.table_number}
                        </h4>
                        <span className="text-[11px] text-zinc-500 font-medium block">
                          {req.dining_area_name || 'Main Hall'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatElapsed(req.requested_at)}</span>
                    </div>
                  </div>

                  {/* Request Type & Notes */}
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {getLabelForType(req.request_type)}
                    </div>
                    {req.note && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 italic">
                        "{req.note}"
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center gap-2">
                    {!isInProgress ? (
                      <button
                        onClick={() => handleAcknowledge(req)}
                        className="flex-1 py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 transition-colors"
                      >
                        {language === 'km' ? 'ទទួលស្គាល់ (Acknowledge)' : 'Acknowledge'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {language === 'km' ? 'កំពុងបម្រើ' : 'In Progress'}
                      </span>
                    )}

                    <button
                      onClick={() => handleResolve(req)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                    >
                      {language === 'km' ? 'រួចរាល់ (Mark Done)' : 'Mark Done'}
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
