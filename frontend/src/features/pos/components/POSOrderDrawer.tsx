import { type FC } from 'react'
import {
  X,
  Plus,
  DollarSign,
  QrCode,
  Printer,
  Trash2,
  Clock,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { POSTable, POSPlacedRound, POSPlacedItem } from '../types/pos.types'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSOrderDrawerProps {
  table: POSTable | null
  rounds: POSPlacedRound[]
  onClose: () => void
  onOpenCashModal: () => void
  onOpenKHQRModal: () => void
  onOpenVoidModal: (item: POSPlacedItem) => void
  onPrintPrecheck: () => void
  onStartDirectOrder: () => void
}

export const POSOrderDrawer: FC<POSOrderDrawerProps> = ({
  table,
  rounds,
  onClose,
  onOpenCashModal,
  onOpenKHQRModal,
  onOpenVoidModal,
  onPrintPrecheck,
  onStartDirectOrder,
}) => {
  const { language } = useLanguageStore()

  if (!table) return null

  const isOccupiedOrBilling =
    table.status.toLowerCase() === 'occupied' || table.status.toLowerCase() === 'bill_requested'

  const subtotalUSD = rounds.reduce((sum, r) => sum + r.subtotal_usd, 0)
  const taxUSD = subtotalUSD * 0.1 // 10% VAT
  const totalUSD = subtotalUSD + taxUSD

  return (
    <div className="w-full lg:w-96 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 shrink-0">
      {/* 1. Header */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-base text-zinc-950 dark:text-zinc-50">
              {table.table_number}
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400">
              {table.dining_area_name || 'Main Hall'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {table.guest_count || table.capacity} {language === 'km' ? 'នាក់' : 'guests'}
            </span>
            {isOccupiedOrBilling && (
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3" />
                {table.session_elapsed_minutes || 14}m
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Placed Order Rounds Items List */}
      <div className="p-4 flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80 space-y-3">
        {rounds.length === 0 ? (
          <div className="py-20 text-center text-xs text-zinc-400 space-y-3">
            <UtensilsCrossed className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" />
            <p>
              {language === 'km'
                ? 'មិនទាន់មានការកុម្ម៉ង់សម្រាប់តុនេះនៅឡើយទេ'
                : 'No orders placed yet for this table.'}
            </p>
            <button
              onClick={onStartDirectOrder}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
            >
              {language === 'km' ? '+ កុម្ម៉ង់មុខម្ហូបថ្មី' : '+ Take New Order'}
            </button>
          </div>
        ) : (
          rounds.map((round) => (
            <div key={round.id} className="pt-3 first:pt-0 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 pb-1">
                <span>
                  {language === 'km' ? `ជុំទី #${round.round_number}` : `Round #${round.round_number}`}
                </span>
                <CurrencyDisplay amountUSD={round.subtotal_usd} className="text-zinc-700 dark:text-zinc-300" />
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                {round.items.map((item) => {
                  const displayName = language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en
                  return (
                    <div
                      key={item.id}
                      className="p-2 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-start justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span className="font-mono">{item.quantity}x</span>
                          <span className="truncate">{displayName}</span>
                        </div>

                        {item.variant_name_en && (
                          <span className="text-[11px] text-zinc-500 block">({item.variant_name_en})</span>
                        )}

                        {item.modifiers_summary && (
                          <span className="text-[11px] text-zinc-500 block">+ {item.modifiers_summary}</span>
                        )}

                        {item.special_instructions && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 italic block">
                            * {item.special_instructions}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <CurrencyDisplay amountUSD={item.subtotal_usd} className="font-bold text-xs" />
                        <button
                          onClick={() => onOpenVoidModal(item)}
                          className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                          title="Void item with Supervisor PIN"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 3. Financial Breakdown & Settlement Actions */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 space-y-3">
        {rounds.length > 0 && (
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-zinc-500">
              <span>{language === 'km' ? 'សរុបបឋម' : 'Subtotal'}:</span>
              <CurrencyDisplay amountUSD={subtotalUSD} />
            </div>

            <div className="flex justify-between text-zinc-500">
              <span>VAT (10%):</span>
              <CurrencyDisplay amountUSD={taxUSD} />
            </div>

            <div className="flex justify-between font-bold text-sm text-zinc-950 dark:text-zinc-50 pt-1 border-t border-zinc-200 dark:border-zinc-800">
              <span>{language === 'km' ? 'ទឹកប្រាក់ត្រូវទូទាត់' : 'Grand Total'}:</span>
              <CurrencyDisplay amountUSD={totalUSD} className="font-bold text-base" />
            </div>
          </div>
        )}

        {/* Action Buttons Grid */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenCashModal}
              disabled={rounds.length === 0}
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              <span>{language === 'km' ? 'សាច់ប្រាក់ (100៛)' : 'Cash (100៛)'}</span>
            </button>

            <button
              onClick={onOpenKHQRModal}
              disabled={rounds.length === 0}
              className="py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span>Bakong KHQR</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onPrintPrecheck}
              disabled={rounds.length === 0}
              className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{language === 'km' ? 'ព្រីនវិក្កយបត្រ' : 'Print Pre-check'}</span>
            </button>

            <button
              onClick={onStartDirectOrder}
              className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'km' ? '+ កុម្ម៉ង់បន្ថែម' : '+ Add Dishes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
