import { type FC } from 'react'
import { Plus, Utensils } from 'lucide-react'
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
  const { items, addItem } = useCartStore()

  const displayName = language === 'km' && item.name_km ? item.name_km : item.name_en

  // Calculate current quantity in cart for this item
  const cartItemsForThis = items.filter((ci) => ci.menu_item.id === item.id)
  const totalQuantity = cartItemsForThis.reduce((sum, ci) => sum + ci.quantity, 0)

  const hasOptions =
    (item.variants && item.variants.length > 0) ||
    (item.modifier_groups && item.modifier_groups.length > 0)

  const handleCircleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (totalQuantity > 0 || hasOptions) {
      // Display the item already chosen / customize
      onSelect(item)
    } else {
      addItem(item, null, [], 'MAINS' as CourseStage, '', 1)
    }
  }

  return (
    <div
      className="group relative flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 shadow-xs transition-all duration-200 overflow-hidden"
    >
      {/* Food Photo - First Layer of Container */}
      <div className="relative w-full aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={displayName}
            className="w-full h-full object-cover"
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

      {/* Card Body - Bottom Section of Card Container */}
      <div className="p-3 sm:p-3.5 flex items-end justify-between gap-2 flex-1">
        {/* Name and Price */}
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 line-clamp-1 leading-snug">
            {displayName}
          </h4>
          <CurrencyDisplay
            amountUSD={item.base_price_usd}
            className="font-bold text-xs sm:text-[13px] text-emerald-600 dark:text-emerald-400"
          />
        </div>

        {/* Circle Add to Cart Button (Bottom Right of Card Container) */}
        <button
          type="button"
          onClick={handleCircleButtonClick}
          title={
            totalQuantity > 0
              ? (language === 'km' ? 'ពិនិត្យមុខម្ហូបដែលបានជ្រើស' : 'View chosen item')
              : (language === 'km' ? 'ដាក់ក្នុងកន្ត្រក' : 'Add to Cart')
          }
          aria-label={
            totalQuantity > 0
              ? (language === 'km' ? 'ពិនិត្យមុខម្ហូបដែលបានជ្រើស' : 'View chosen item')
              : (language === 'km' ? 'ដាក់ក្នុងកន្ត្រក' : 'Add to Cart')
          }
          className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-90 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          {totalQuantity > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold font-mono flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-xs animate-in zoom-in-75 duration-150">
              {totalQuantity}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

