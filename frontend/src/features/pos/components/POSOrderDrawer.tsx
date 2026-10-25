import { type FC } from 'react'
import {
  X,
  DollarSign,
  QrCode,
  Printer,
  UtensilsCrossed,
  ArrowLeftRight,
} from 'lucide-react'
import { POSTable, POSPlacedRound, POSPlacedItem } from '../types/pos.types'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSOrderDrawerProps {
  table: POSTable | null
  rounds: POSPlacedRound[]
  isLoading?: boolean
  onClose: () => void
  onOpenCashModal: () => void
  onOpenKHQRModal: () => void
  onOpenVoidModal?: (item: POSPlacedItem) => void
  onPrintPrecheck: () => void
  onStartDirectOrder?: () => void
  onOpenTableActions?: () => void
  onCancelRound?: (orderId: string) => void
}

export const POSOrderDrawer: FC<POSOrderDrawerProps> = ({
  table,
  rounds,
  isLoading = false,
  onClose,
  onOpenCashModal,
  onOpenKHQRModal,
  onOpenVoidModal: _onOpenVoidModal,
  onPrintPrecheck,
  onStartDirectOrder: _onStartDirectOrder,
  onOpenTableActions,
  onCancelRound: _onCancelRound,
}) => {
  const { language } = useLanguageStore()

  if (!table) return null

  const subtotalUSD = rounds.reduce((sum, r) => sum + r.subtotal_usd, 0)
  const taxUSD = subtotalUSD * 0.1 // 10% VAT
  const totalUSD = subtotalUSD + taxUSD

  return (
    <div className="w-full lg:w-96 rounded-[22px] sm:rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shrink-0 lg:sticky lg:top-20 h-[calc(100vh-140px)] min-h-[580px] flex flex-col justify-between shadow-xs">
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <h3 className="font-extrabold text-base text-zinc-950 dark:text-zinc-50">
            {table.table_number}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {onOpenTableActions && (
            <button
              onClick={onOpenTableActions}
              title={language === 'km' ? 'សកម្មភាពតុ' : 'Table Actions'}
              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Placed Order Rounds Items List */}
      <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 overscroll-contain divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center py-10 text-center text-xs text-zinc-400 space-y-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-medium text-zinc-400 dark:text-zinc-500">
              {language === 'km' ? 'កំពុងទាញយកការកុម្ម៉ង់...' : 'Loading orders...'}
            </p>
          </div>
        ) : rounds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-10 text-center text-xs text-zinc-400 space-y-2">
            <UtensilsCrossed className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 opacity-40" />
            <p className="font-medium text-zinc-400 dark:text-zinc-500">
              {language === 'km' ? 'មិនទាន់មានការកុម្ម៉ង់' : 'No order yet'}
            </p>
          </div>
        ) : (
          rounds.map((round) => (
            <div key={round.id} className="pt-2 first:pt-0 space-y-1.5">
              {/* Items */}
              <div className="space-y-1.5">
                {round.items.map((item) => {
                  const displayName = language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en
                  return (
                    <div
                      key={item.id}
                      className="py-2 flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/60 last:border-b-0"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span className="font-mono text-zinc-500 dark:text-zinc-400 shrink-0">{item.quantity}x</span>
                          <span className="truncate">{displayName}</span>
                        </div>

                        {item.variant_name_en && (
                          <span className="text-[11px] text-zinc-500 block">({item.variant_name_en})</span>
                        )}

                        {item.modifiers_summary && (
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block leading-relaxed">
                            + {item.modifiers_summary}
                          </span>
                        )}

                        {item.special_instructions && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 italic block">
                            * {item.special_instructions}
                          </span>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <CurrencyDisplay amountUSD={item.subtotal_usd} className="font-bold text-xs" />
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
      <div className="shrink-0 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
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
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <DollarSign className="w-4 h-4" />
              <span>{language === 'km' ? 'សាច់ប្រាក់ Cash' : 'Cash'}</span>
            </button>

            <button
              onClick={onOpenKHQRModal}
              disabled={rounds.length === 0}
              className="py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <QrCode className="w-4 h-4" />
              <span>Bakong KHQR</span>
            </button>
          </div>

          <div>
            <button
              onClick={onPrintPrecheck}
              disabled={rounds.length === 0}
              className="w-full py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{language === 'km' ? 'ព្រីនវិក្កយបត្រ' : 'Print Pre-check'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
