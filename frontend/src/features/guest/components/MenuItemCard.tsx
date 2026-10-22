import { type FC } from 'react'
import { Plus, Minus, Utensils } from 'lucide-react'
import { MenuItem, CourseStage } from '../types/guest.types'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useCartStore } from '../stores/useCartStore'

export interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
}

export const MenuItemCard: FC<MenuItemCardProps> = ({ item, onSelect }) => {
  const { language } = useLanguageStore()
  const { items, addItem, updateQuantity } = useCartStore()

  const displayName = language === 'km' && item.name_km ? item.name_km : item.name_en

  // Calculate current quantity in cart for this item
  const cartItemsForThis = items.filter((ci) => ci.menu_item.id === item.id)
  const totalQuantity = cartItemsForThis.reduce((sum, ci) => sum + ci.quantity, 0)

  const hasOptions =
    (item.variants && item.variants.length > 0) ||
    (item.modifier_groups && item.modifier_groups.length > 0)

  const handleCardClick = () => {
    onSelect(item)
  }

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasOptions) {
      onSelect(item)
    } else {
      addItem(item, null, [], 'MAINS' as CourseStage, '', 1)
    }
  }

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasOptions && cartItemsForThis.length > 1) {
      // Multiple distinct configurations, open modal so guest can pick/customize
      onSelect(item)
    } else if (cartItemsForThis.length === 1) {
      const target = cartItemsForThis[0]
      updateQuantity(target.cart_item_id, target.quantity + 1)
    } else {
      addItem(item, null, [], 'MAINS' as CourseStage, '', 1)
    }
  }

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (cartItemsForThis.length > 0) {
      const target = cartItemsForThis[cartItemsForThis.length - 1]
      updateQuantity(target.cart_item_id, target.quantity - 1)
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className="group relative flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
    >
      {/* Food Photo on top */}
      <div className="relative w-full aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800">
            <Utensils className="w-8 h-8 opacity-40" />
          </div>
        )}

        {/* Floating Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-none">
          {item.is_popular && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 backdrop-blur-xs text-white shadow-xs">
              {language === 'km' ? 'ពេញនិយម' : 'Popular'}
            </span>
          )}
          {item.is_vegetarian && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/90 backdrop-blur-xs text-white shadow-xs">
              VEG
            </span>
          )}
        </div>

        {item.spicy_level && item.spicy_level > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/90 backdrop-blur-xs text-white shadow-xs pointer-events-none">
            {'🌶️'.repeat(Math.min(item.spicy_level, 3))}
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        {/* Name and Price */}
        <div className="space-y-1">
          <h4 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 line-clamp-1 leading-snug">
            {displayName}
          </h4>
          <CurrencyDisplay
            amountUSD={item.base_price_usd}
            className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400"
          />
        </div>

        {/* Add to Cart or Increment / Decrement Quantity Controls */}
        <div className="pt-1">
          {totalQuantity === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'km' ? 'កុម្ម៉ង់' : 'Add'}</span>
            </button>
          ) : (
            <div
              className="flex items-center justify-between w-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-0.5 sm:p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleDecrement}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-emerald-600 hover:text-white flex items-center justify-center shadow-xs transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-bold text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 px-1 sm:px-2 min-w-[20px] text-center">
                {totalQuantity}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center shadow-xs transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
