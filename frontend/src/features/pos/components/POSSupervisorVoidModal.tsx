import { useState, type FC } from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { POSPlacedItem } from '../types/pos.types'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSSupervisorVoidModalProps {
  isOpen: boolean
  onClose: () => void
  item: POSPlacedItem | null
  onConfirmVoid: (pin: string, reason: string) => Promise<void>
  isSubmitting?: boolean
}

export const POSSupervisorVoidModal: FC<POSSupervisorVoidModalProps> = ({
  isOpen,
  onClose,
  item,
  onConfirmVoid,
  isSubmitting = false,
}) => {
  const { language } = useLanguageStore()

  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('CUSTOMER_CANCELLED')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!item) return null

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length < 4) {
      setErrorMsg(
        language === 'km'
          ? 'សូមបញ្ចូលលេខកូដសម្ងាត់អ្នកគ្រប់គ្រង ៤ ខ្ទង់។'
          : 'Please enter a valid 4-digit supervisor PIN.'
      )
      return
    }

    try {
      await onConfirmVoid(pin, reason)
      setPin('')
      setErrorMsg(null)
      onClose()
    } catch {
      setErrorMsg(
        language === 'km'
          ? 'លេខកូដសម្ងាត់មិនត្រឹមត្រូវ ឬគ្មានសិទ្ធិលុបការកុម្ម៉ង់។'
          : 'Invalid supervisor PIN or unauthorized action.'
      )
    }
  }

  const reasons = [
    { code: 'CUSTOMER_CANCELLED', labelKm: 'អតិថិជនសុំលុបចោល', labelEn: 'Customer Cancelled' },
    { code: 'KITCHEN_MISTAKE', labelKm: 'ផ្ទះបាយធ្វើខុសការកុម្ម៉ង់', labelEn: 'Kitchen Mistake / Wrong Item' },
    { code: 'QUALITY_DEFECT', labelKm: 'បញ្ហាគុណភាពម្ហូប', labelEn: 'Quality Defect / Spoilage' },
    { code: 'DUPLICATE_ORDER', labelKm: 'កុម្ម៉ង់ស្ទួន', labelEn: 'Duplicate Order Entry' },
  ]

  const itemName = language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'km' ? 'ផ្ទៀងផ្ទាត់សិទ្ធិលុបមុខម្ហូប (Supervisor Void)' : 'Supervisor Authorization Required'}
      description={language === 'km' ? 'តម្រូវឱ្យមានលេខកូដអ្នកគ្រប់គ្រងដើម្បីលុបមុខម្ហូបដែលបានបញ្ជូនទៅផ្ទះបាយ' : 'Requires supervisor 4-digit PIN for waste auditing'}
    >
      <form onSubmit={handleVoid} className="space-y-4 pb-2">
        {/* Item Summary */}
        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs">
          <span className="text-zinc-500 block">Item to Void:</span>
          <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
            {item.quantity}x {itemName}
          </div>
          <div className="text-zinc-500 font-mono mt-0.5">${item.subtotal_usd.toFixed(2)}</div>
        </div>

        {/* Reason Code Dropdown */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'km' ? 'មូលហេតុនៃការលុប (Audit Reason)' : 'Void Reason Code'}:
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs outline-none focus:ring-1 focus:ring-red-500"
          >
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>
                {language === 'km' ? r.labelKm : r.labelEn}
              </option>
            ))}
          </select>
        </div>

        {/* 4-Digit Supervisor PIN Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{language === 'km' ? 'លេខកូដអ្នកគ្រប់គ្រង ៤ ខ្ទង់ (Supervisor PIN)' : 'Supervisor 4-Digit PIN'}:</span>
          </label>
          <input
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setErrorMsg(null)
            }}
            placeholder="••••"
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center font-mono font-bold text-lg tracking-widest outline-none focus:ring-1 focus:ring-red-500"
            autoFocus
          />
        </div>

        {/* Inline Error Message (Clean Red Text, No Outer Container) */}
        {errorMsg && (
          <p className="text-xs text-red-500 text-center font-medium">
            {errorMsg}
          </p>
        )}

        {/* Confirm Void Button */}
        <button
          type="submit"
          disabled={pin.length < 4 || isSubmitting}
          className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>
            {isSubmitting
              ? (language === 'km' ? 'កំពុងលុប...' : 'Authorizing...')
              : (language === 'km' ? 'អនុញ្ញាតលុបមុខម្ហូប (Authorize Void)' : 'Authorize & Void Item')}
          </span>
        </button>
      </form>
    </Modal>
  )
}
