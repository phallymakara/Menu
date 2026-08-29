import { type FC } from 'react'
import { X, RotateCcw, Clock, CheckCircle2 } from 'lucide-react'
import { KDSTicket } from '../types/kds.types'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface KDSRecallDrawerProps {
  isOpen: boolean
  onClose: () => void
  recalledTickets: KDSTicket[]
  onRecallTicket: (ticket: KDSTicket) => void
}

export const KDSRecallDrawer: FC<KDSRecallDrawerProps> = ({
  isOpen,
  onClose,
  recalledTickets,
  onRecallTicket,
}) => {
  const { language } = useLanguageStore()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Body (Zero Shadow, Clean Flat Borders) */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-10 flex flex-col justify-between h-full animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'ប្រវត្តិនៃការកុម្ម៉ង់ដែលបានបញ្ចប់' : 'Completed / Bumped Orders'}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {language === 'km' ? 'សំបុត្រដែលបានបញ្ចប់ក្នុងរយៈពេលចុងក្រោយ' : 'Recently bumped tickets'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Recalled Tickets List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {recalledTickets.length === 0 ? (
            <div className="py-16 text-center text-xs text-zinc-400 space-y-2">
              <Clock className="w-6 h-6 mx-auto text-zinc-300 dark:text-zinc-700" />
              <p>{language === 'km' ? 'មិនទាន់មានសំបុត្រដែលបានបញ្ចប់នៅឡើយទេ' : 'No completed tickets yet'}</p>
            </div>
          ) : (
            recalledTickets.map((ticket) => (
              <div
                key={ticket.order_id}
                className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs pb-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {ticket.table_number ? `Table ${ticket.table_number}` : `Takeaway #${ticket.order_number.slice(-4)}`}
                  </span>

                  <button
                    onClick={() => {
                      onRecallTicket(ticket)
                      onClose()
                    }}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 text-emerald-600" />
                    <span>{language === 'km' ? 'ហៅសំបុត្រមកវិញ' : 'Recall to Screen'}</span>
                  </button>
                </div>

                {/* Items Summary */}
                <div className="space-y-1 text-xs">
                  {ticket.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>{item.quantity}x {language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
