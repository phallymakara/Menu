import { useState, type FC } from 'react'
import { Check, Send } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'
import { getApiErrorStatus } from '@/lib/api-error'
import type { ServiceRequestType } from '../types/serviceHub.types'
import {
  SERVICE_REQUEST_NOTE_MAX_LENGTH,
  SERVICE_REQUEST_TYPES,
  guestRequestErrorKey,
  interpolate,
  normalizeServiceRequestNote,
  requiresNote,
  serviceRequestTypeHintKey,
  serviceRequestTypeLabelKey,
} from '../utils/serviceRequests'
import { SERVICE_REQUEST_TYPE_ICONS } from './serviceRequestIcons'

export interface GuestServiceRequestModalProps {
  isOpen: boolean
  onClose: () => void
  tableNumber?: string
  /**
   * Sends the request. Reject to show an error; an `ApiError` status picks the
   * message (409 duplicate, 401 session ended).
   */
  onSubmitRequest: (requestType: ServiceRequestType, note: string | null) => Promise<void>
  isSubmitting?: boolean
}

export const GuestServiceRequestModal: FC<GuestServiceRequestModalProps> = ({
  isOpen,
  onClose,
  tableNumber = '',
  onSubmitRequest,
  isSubmitting = false,
}) => {
  const { t } = useLanguageStore()

  const [selectedType, setSelectedType] = useState<ServiceRequestType>(SERVICE_REQUEST_TYPES[0])
  const [note, setNote] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const noteRequired = requiresNote(selectedType)
  const busy = isSubmitting || isSending
  const canSend = !busy && (!noteRequired || normalizeServiceRequestNote(note) !== null)

  const handleSubmit = async () => {
    if (!canSend) return
    setErrorKey(null)
    setIsSending(true)
    try {
      await onSubmitRequest(selectedType, normalizeServiceRequestNote(note))
      playSuccessSound()
      setNote('')
      onClose()
    } catch (err) {
      setErrorKey(guestRequestErrorKey(getApiErrorStatus(err)))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        tableNumber
          ? interpolate(t('serviceHub.guest.modalTitle'), { table: tableNumber })
          : t('serviceHub.guest.modalTitleNoTable')
      }
      description={t('serviceHub.guest.modalDescription')}
      isBottomSheet={true}
    >
      <div className="space-y-4 pb-2">
        {/* 1. Request type picker */}
        <div className="space-y-2">
          {SERVICE_REQUEST_TYPES.map((type) => {
            const Icon = SERVICE_REQUEST_TYPE_ICONS[type]
            const isSelected = selectedType === type
            return (
              <button
                key={type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedType(type)
                  setErrorKey(null)
                }}
                className={`w-full p-3 rounded-2xl border text-left transition-colors flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-50'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-950 dark:text-zinc-50 leading-tight">
                      {t(serviceRequestTypeLabelKey(type))}
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {t(serviceRequestTypeHintKey(type))}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
              </button>
            )
          })}
        </div>

        {/* 2. Note: optional, but required for a custom request */}
        <div className="space-y-1">
          <label
            htmlFor="service-request-note"
            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            {t(noteRequired ? 'serviceHub.guest.noteRequiredLabel' : 'serviceHub.guest.noteLabel')}
          </label>
          <input
            id="service-request-note"
            type="text"
            value={note}
            maxLength={SERVICE_REQUEST_NOTE_MAX_LENGTH}
            onChange={(e) => {
              setNote(e.target.value)
              setErrorKey(null)
            }}
            placeholder={t(
              noteRequired ? 'serviceHub.guest.customNotePlaceholder' : 'serviceHub.guest.notePlaceholder'
            )}
            className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
        </div>

        {/* Inline error (plain red text, no outer container) */}
        {errorKey && (
          <div role="alert" className="text-xs text-red-500 text-center font-medium">
            {t(errorKey)}
          </div>
        )}

        {/* 3. Send */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Send className="w-4 h-4" />
          <span>{t(busy ? 'serviceHub.guest.sending' : 'serviceHub.guest.send')}</span>
        </button>
      </div>
    </Modal>
  )
}
