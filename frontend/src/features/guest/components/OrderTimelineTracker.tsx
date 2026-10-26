import { type FC } from 'react'
import { Clock, PlusCircle } from 'lucide-react'
import { PlacedOrderRound } from '../types/guest.types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface OrderTimelineTrackerProps {
  rounds: PlacedOrderRound[]
  onOrderMore: () => void
  onRequestBill: () => void
}

export const OrderTimelineTracker: FC<OrderTimelineTrackerProps> = ({
  rounds,
  onOrderMore,
  onRequestBill,
}) => {
  const { t, language } = useLanguageStore()

  if (rounds.length === 0) return null

  const totalSessionUSD = rounds.reduce((sum, r) => sum + r.round_subtotal_usd, 0)

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
            {language === 'km' ? 'ប្រវត្តិនៃការកុម្ម៉ង់ (Active Orders)' : 'Active Orders & Status'}
          </h3>
        </div>

        <span className="text-xs font-mono font-semibold text-zinc-500">
          {rounds.length} {language === 'km' ? 'ជុំកុម្ម៉ង់' : 'Rounds'}
        </span>
      </div>

      {/* Rounds List */}
      <div className="space-y-4">
        {rounds.map((round) => (
          <div
            key={round.id}
            className="p-3.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2.5"
          >
            <div className="flex items-center justify-between text-xs pb-1 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {language === 'km' ? `ជុំទី #${round.round_number}` : `Round #${round.round_number}`}
                </span>
                {round.status?.toLowerCase() === 'pending' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {language === 'km' ? 'រង់ចាំផ្ទះបាយទទួល' : 'Awaiting Kitchen'}
                  </span>
                ) : round.status?.toLowerCase() === 'cancelled' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {language === 'km' ? 'បដិសេធ' : 'Rejected'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {language === 'km' ? 'ផ្ទះបាយបានទទួល' : 'Accepted'}
                  </span>
                )}
              </div>
              <CurrencyDisplay amountUSD={round.round_subtotal_usd} className="font-bold text-xs" />
            </div>

            {round.reject_reason && round.status?.toLowerCase() === 'cancelled' && (
              <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300 font-medium border border-rose-200/60 dark:border-rose-900/40">
                {language === 'km' ? `មូលហេតុបដិសេធ៖ ${round.reject_reason}` : `Rejection reason: ${round.reject_reason}`}
              </div>
            )}


            {/* Item Lines */}
            <div className="space-y-2">
              {round.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {item.quantity}x {language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en}
                      </span>
                      {item.variant_name_en && (
                        <span className="text-[11px] text-zinc-500 font-normal">({item.variant_name_en})</span>
                      )}
                    </div>
                  </div>

                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Total & Actions */}
      <div className="pt-2 flex items-center justify-between gap-3">
        <div>
          <span className="text-xs text-zinc-500 block leading-tight">{t('total')}</span>
          <CurrencyDisplay amountUSD={totalSessionUSD} className="font-bold text-base" />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOrderMore}
            className="gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{language === 'km' ? 'កុម្ម៉ង់បន្ថែម' : 'Order More'}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onRequestBill}
          >
            {t('payNow')}
          </Button>
        </div>
      </div>
    </div>
  )
}
