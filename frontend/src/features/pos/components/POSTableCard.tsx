import { type FC } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import { POSTable } from '../types/pos.types'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSTableCardProps {
  table: POSTable
  isSelected: boolean
  onSelect: (table: POSTable) => void
  onTakeOrder?: (table: POSTable) => void
  onMarkCleaned?: (tableId: string) => void
}

export const POSTableCard: FC<POSTableCardProps> = ({
  table,
  isSelected,
  onSelect,
  onTakeOrder,
  onMarkCleaned: _onMarkCleaned,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const st = table.status.toLowerCase()
  const isAvailable = st === 'available'
  const isOccupied = st === 'occupied'
  const isBilling = st === 'bill_requested'
  const isCleaning = st === 'dirty_cleaning'

  // Top banner background & border colors based on status
  let topBannerBg = 'bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800/90 text-zinc-900 dark:text-zinc-50'
  let borderColor = 'border-zinc-200/90 dark:border-zinc-800'

  if (isOccupied) {
    topBannerBg = 'bg-gradient-to-br from-red-50/80 to-red-100/60 dark:from-red-950/40 dark:to-zinc-900 text-red-950 dark:text-red-100'
    borderColor = 'border-red-200 dark:border-red-900/60'
  } else if (isBilling) {
    topBannerBg = 'bg-gradient-to-br from-amber-50/80 to-amber-100/60 dark:from-amber-950/40 dark:to-zinc-900 text-amber-950 dark:text-amber-100'
    borderColor = 'border-amber-200 dark:border-amber-900/60'
  } else if (isCleaning) {
    topBannerBg = 'bg-gradient-to-br from-purple-50/80 to-purple-100/60 dark:from-purple-950/40 dark:to-zinc-900 text-purple-950 dark:text-purple-100'
    borderColor = 'border-purple-200 dark:border-purple-900/60'
  }

  // Modern vibrant selection style based on status
  let selectedStyle = ''
  if (isSelected) {
    if (isOccupied) {
      selectedStyle =
        'border-red-500 dark:border-red-500 ring-2 ring-red-500/40 dark:ring-red-400/50 shadow-md shadow-red-500/10'
    } else if (isBilling) {
      selectedStyle =
        'border-amber-500 dark:border-amber-500 ring-2 ring-amber-500/40 dark:ring-amber-400/50 shadow-md shadow-amber-500/10'
    } else if (isCleaning) {
      selectedStyle =
        'border-purple-500 dark:border-purple-500 ring-2 ring-purple-500/40 dark:ring-purple-400/50 shadow-md shadow-purple-500/10'
    } else {
      selectedStyle =
        'border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/40 dark:ring-emerald-400/50 shadow-md shadow-emerald-500/10'
    }
  }

  return (
    <div
      className={`relative flex flex-col justify-between rounded-[18px] sm:rounded-[20px] border ${
        isSelected ? selectedStyle : `${borderColor} shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700`
      } bg-white dark:bg-zinc-900 transition-all duration-200 overflow-hidden select-none`}
    >
      <div>
        {/* 1. Top Visual Container - compact aspect-[16/8.5] */}
        <div
          onClick={() => onSelect(table)}
          className={`relative aspect-[16/8.5] w-full border-b border-zinc-100 dark:border-zinc-800/80 overflow-hidden cursor-pointer transition-colors ${topBannerBg}`}
        >
          {/* Centered Table Number */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight drop-shadow-xs">
              {table.table_number}
            </span>
          </div>

          {/* Floating Top-Right Badges: Billing or Cleaning alerts only */}
          {(isBilling || isCleaning) && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1 pointer-events-none">
              {isBilling ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/95 backdrop-blur-xs text-white text-[9.5px] font-bold shadow-xs animate-pulse">
                  <AlertTriangle className="w-2.5 h-2.5 text-white" />
                  <span>{isKm ? 'សុំគិតប្រាក់' : 'Billing'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/95 backdrop-blur-xs text-white text-[9.5px] font-bold shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>{isKm ? 'ត្រូវសម្អាត' : 'Cleaning'}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Card Footer Action: Compact Button */}
      <div className="p-2 sm:p-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (onTakeOrder) {
              onTakeOrder(table)
            } else {
              onSelect(table)
            }
          }}
          className={`w-full py-1.5 px-2 rounded-lg sm:rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-[0.98] shadow-xs ${
            isAvailable
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : isOccupied
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900'
          }`}
        >
          <Plus className="w-3 h-3" />
          <span>
            {isAvailable
              ? (isKm ? '+ កុម្ម៉ង់ម្ហូប' : '+ Take Order')
              : (isKm ? '+ កុម្ម៉ង់បន្ថែម' : '+ Add Items')}
          </span>
        </button>
      </div>
    </div>
  )
}
