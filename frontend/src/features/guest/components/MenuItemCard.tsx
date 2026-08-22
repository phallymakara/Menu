import { type FC } from 'react'
import { Plus } from 'lucide-react'
import { MenuItem } from '../types/guest.types'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { Badge } from '@/components/ui/Badge'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
}

export const MenuItemCard: FC<MenuItemCardProps> = ({ item, onSelect }) => {
  const { language } = useLanguageStore()

  const displayName = language === 'km' && item.name_km ? item.name_km : item.name_en
  const displayDesc = language === 'km' && item.description_km ? item.description_km : item.description_en

  return (
    <div
      onClick={() => onSelect(item)}
      className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer flex gap-4 items-start"
    >
      {/* Item Details */}
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
            {displayName}
          </h4>

          {item.is_popular && (
            <Badge variant="brand" size="sm">
              {language === 'km' ? 'ពេញនិយម' : 'Popular'}
            </Badge>
          )}

          {item.is_vegetarian && (
            <Badge variant="success" size="sm">VEG</Badge>
          )}

          {item.spicy_level && item.spicy_level > 0 && (
            <Badge variant="danger" size="sm">
              {'🌶️'.repeat(Math.min(item.spicy_level, 3))}
            </Badge>
          )}
        </div>

        {displayDesc && (
          <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
            {displayDesc}
          </p>
        )}

        <div className="pt-2 flex items-center justify-between">
          <CurrencyDisplay amountUSD={item.base_price_usd} className="font-semibold" />

          {/* Quick Add Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelect(item)
            }}
            aria-label="Add item"
            className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Food Photo if available */}
      {item.image_url && (
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-800">
          <img
            src={item.image_url}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
    </div>
  )
}
