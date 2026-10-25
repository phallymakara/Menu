import { type FC } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useCartStore } from '../stores/useCartStore'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface CartFloatingBarProps {
  onOpenCart: () => void
}

export const CartFloatingBar: FC<CartFloatingBarProps> = ({ onOpenCart }) => {
  const { language } = useLanguageStore()
  const { getTotalItemCount } = useCartStore()

  const count = getTotalItemCount()

  if (count === 0) return null

  return (
    <div className="fixed bottom-6 inset-x-0 z-40 pointer-events-none">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 flex justify-end">
        <button
          type="button"
          onClick={onOpenCart}
          title={language === 'km' ? 'កន្ត្រកកុម្ម៉ង់ (ពិនិត្យមុខម្ហូប)' : 'View Cart Items'}
          aria-label={language === 'km' ? 'កន្ត្រកកុម្ម៉ង់' : 'View Cart Items'}
          className="pointer-events-auto relative w-14 h-14 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300/60 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer group"
        >
          <ShoppingBag className="w-6 h-6 transition-transform group-hover:scale-110" />

          {/* Item Count Badge */}
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold font-mono flex items-center justify-center border-2 border-white dark:border-zinc-950 shadow-sm animate-in scale-in duration-150">
            {count}
          </span>
        </button>
      </div>
    </div>
  )
}
