import type { FC } from 'react'
import { ArrowUpRight, Edit3, MoreVertical, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import type { MenuItem } from '../../types/admin.types'

interface MenuItemCardProps {
  item: MenuItem
  isMenuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleAvailability: () => void
  isBranchMode?: boolean
  onOpenOverride?: () => void
  onPromoteLocalItem?: () => void
}

export const MenuItemCard: FC<MenuItemCardProps> = ({
  item,
  isMenuOpen,
  onToggleMenu,
  onEdit,
  onDelete,
  onToggleAvailability,
  isBranchMode,
  onOpenOverride,
  onPromoteLocalItem,
}) => {
  const { language } = useLanguageStore()

  return (
    <div
      className={`rounded-[22px] sm:rounded-[26px] border transition-all flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-sm ${item.is_available
          ? 'border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900'
          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 opacity-75'
        }`}
    >
      <div>
        {/* 1. Image */}
        {item.image_url && (
          <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-center rounded-t-[21px] sm:rounded-t-[25px] overflow-hidden">
            <img
              src={item.image_url}
              alt={item.name_en}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              loading="lazy"
            />
          </div>
        )}

        {/* Three-dot Action Menu in corner */}
        <div className="item-action-menu absolute top-1.5 right-1.5 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleMenu()
            }}
            title="Options"
            className="w-6 h-6 flex items-center justify-center rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white border border-zinc-200/80 dark:border-zinc-700/80 transition-colors shadow-xs"
          >
            <MoreVertical className="w-3 h-3" />
          </button>

          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-7 w-40 py-1 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 z-30 animate-in fade-in zoom-in-95 duration-100 shadow-lg"
            >
              {isBranchMode && onOpenOverride && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenOverride()
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center gap-2 transition-colors"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{language === 'km' ? 'កែតម្លៃ/ស្តុកសាខា' : 'Branch Override'}</span>
                </button>
              )}
              {isBranchMode && item.is_local_item && onPromoteLocalItem && (
                <button
                  type="button"
                  onClick={() => {
                    onPromoteLocalItem()
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-2 transition-colors"
                >
                  <ArrowUpRight className="w-3 h-3" />
                  <span>{language === 'km' ? 'លើកជាមុខម្ហូបមេ' : 'Promote to Master'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onEdit()
                }}
                className="w-full px-3 py-1.5 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 transition-colors"
              >
                <Edit3 className="w-3 h-3" />
                <span>{language === 'km' ? 'កែសម្រួល' : 'Edit Item'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete()
                }}
                className="w-full px-3 py-1.5 text-left text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>{language === 'km' ? 'លុបមុខម្ហូប' : 'Delete Item'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Card Body: Title Price & Description */}
        <div className="p-3 sm:p-3.5 space-y-2">
          {/* 2. Title & Price */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-zinc-50 truncate leading-tight">
                {language === 'km' && item.name_km ? item.name_km : item.name_en}
              </h3>
            </div>

            <div className="text-right shrink-0">
              <div className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-zinc-50 leading-tight">
                ${item.price_usd.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono font-medium">
                {item.price_khr.toLocaleString()} ៛
              </div>
            </div>
          </div>

          {/* 3. Badges: Branch Overrides & Local Dish */}
          {(item.price_override !== null && item.price_override !== undefined || item.is_local_item) && (
            <div className="pt-0.5 flex flex-wrap gap-1">
              {item.price_override !== null && item.price_override !== undefined && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                  {language === 'km' ? 'តម្លៃសាខា' : 'Override'}
                </span>
              )}
              {item.is_local_item && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                  {language === 'km' ? 'មុខម្ហូបសាខា' : 'Local'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card Footer: Toggle Switch to Sell / Not Sell */}
      <div className="px-3 sm:px-3.5 py-2 sm:py-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
        <span className="text-[11px] sm:text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {item.is_available
            ? language === 'km' ? 'បើកលក់' : 'Available'
            : language === 'km' ? 'បិទលក់' : 'Off Sale'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={item.is_available}
          onClick={onToggleAvailability}
          title={
            item.is_available
              ? language === 'km' ? 'ចុចដើម្បីបិទការលក់' : 'Click to disable sale'
              : language === 'km' ? 'ចុចដើម្បីបើកការលក់' : 'Click to enable sale'
          }
          className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${item.is_available
              ? 'bg-emerald-600'
              : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ease-in-out ${item.is_available ? 'translate-x-3.5' : 'translate-x-0'
              }`}
          />
        </button>
      </div>
    </div>
  )
}
