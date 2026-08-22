import { type FC } from 'react'
import { ArrowRight } from 'lucide-react'
import { useCartStore } from '../stores/useCartStore'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface CartFloatingBarProps {
  onOpenCart: () => void
}

export const CartFloatingBar: FC<CartFloatingBarProps> = ({ onOpenCart }) => {
  const { language } = useLanguageStore()
  const { getTotalUSD, getTotalItemCount } = useCartStore()

  const count = getTotalItemCount()
  const total = getTotalUSD()

  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-0 right-0 z-30 px-4 max-w-lg mx-auto animate-in slide-in-from-bottom duration-200">
      <button
        onClick={onOpenCart}
        className="w-full p-3.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200 flex items-center justify-between transition-transform active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-mono font-bold text-xs">
            {count}
          </div>
          <div className="text-left">
            <span className="font-semibold text-xs block leading-tight">
              {language === 'km' ? 'កន្ត្រកកុម្ម៉ង់' : 'View Order Cart'}
            </span>
            <span className="text-[11px] opacity-70 block font-normal leading-tight">
              {count} {language === 'km' ? 'មុខម្ហូប' : 'items'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono font-semibold text-sm">
          <CurrencyDisplay
            amountUSD={total}
            className="text-inherit font-semibold text-sm"
            usdClassName="text-inherit"
            khrClassName="opacity-80"
          />
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  )
}
