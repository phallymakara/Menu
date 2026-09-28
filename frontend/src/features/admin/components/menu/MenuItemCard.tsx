import type { FC } from 'react'
import { Edit3, MoreVertical, Trash2 } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import type { MenuItem } from '../../types/admin.types'

interface MenuItemCardProps {
  item: MenuItem
  isMenuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleAvailability: () => void
}

export const MenuItemCard: FC<MenuItemCardProps> = ({
  item,
  isMenuOpen,
  onToggleMenu,
  onEdit,
  onDelete,
  onToggleAvailability,
}) => {
  const { language } = useLanguageStore()

  return (
    <div
      className={`rounded-3xl border transition-colors flex flex-col justify-between relative overflow-hidden ${item.is_available
          ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 opacity-75'
        }`}
    >
      <div>
        {/* 1. Image */}
        {item.image_url && (
          <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-center rounded-t-3xl overflow-hidden">
            <img
              src={item.image_url}
              alt={item.name_en}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Three-dot Action Menu in corner */}
        <div className="item-action-menu absolute top-2 right-2 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleMenu()
            }}
            title="Options"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white border border-zinc-200/80 dark:border-zinc-700/80 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-8 w-36 py-1 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 z-30 animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                type="button"
                onClick={() => {
                  onEdit()
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{language === 'km' ? 'កែសម្រួល' : 'Edit Item'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete()
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{language === 'km' ? 'លុបមុខម្ហូប' : 'Delete Item'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Card Body: Title Price & Description */}
        <div className="p-4 space-y-2.5">
          {/* 2. Title & Price */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50 truncate leading-snug">
                {language === 'km' && item.name_km ? item.name_km : item.name_en}
              </h3>
              {item.name_km && language !== 'km' && (
                <p className="text-sm text-zinc-500 font-khmer truncate mt-0.5">
                  {item.name_km}
                </p>
              )}
              {item.name_en && language === 'km' && item.name_en !== item.name_km && (
                <p className="text-sm text-zinc-500 truncate mt-0.5">
                  {item.name_en}
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              <div className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50 leading-snug">
                ${item.price_usd.toFixed(2)}
              </div>
              <div className="text-xs sm:text-sm text-zinc-500 font-mono font-medium">
                {item.price_khr.toLocaleString()} ៛
              </div>
            </div>
          </div>

          {/* 3. Description */}
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
              {language === 'km' && item.description_km
                ? item.description_km
                : item.description_en || (language === 'km' ? 'គ្មានការពិពណ៌នា' : 'No description provided.')}
            </p>
          </div>

          {/* 4. Options / Modifiers Badge if configured */}
          {item.modifier_groups && item.modifier_groups.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                {language === 'km'
                  ? `មានជម្រើស (${item.modifier_groups.length})`
                  : `${item.modifier_groups.length} Option Groups`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer: Toggle Switch to Sell / Not Sell */}
      <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
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
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${item.is_available
              ? 'bg-emerald-600'
              : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${item.is_available ? 'translate-x-5' : 'translate-x-0'
              }`}
          />
        </button>
      </div>
    </div>
  )
}
