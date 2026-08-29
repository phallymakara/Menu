import { type FC } from 'react'
import { Clock, Users, Check, AlertTriangle, Sparkles } from 'lucide-react'
import { POSTable } from '../types/pos.types'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSTableCardProps {
  table: POSTable
  isSelected: boolean
  onSelect: (table: POSTable) => void
  onMarkCleaned?: (tableId: string) => void
}

export const POSTableCard: FC<POSTableCardProps> = ({
  table,
  isSelected,
  onSelect,
  onMarkCleaned,
}) => {
  const { language } = useLanguageStore()

  const st = table.status.toLowerCase()
  const isAvailable = st === 'available'
  const isOccupied = st === 'occupied'
  const isBilling = st === 'bill_requested'
  const isCleaning = st === 'dirty_cleaning'

  // Card Border Styling (Zero Shadows)
  const borderColor = isSelected
    ? 'border-zinc-950 dark:border-zinc-100 ring-2 ring-zinc-950 dark:ring-zinc-100'
    : isBilling
    ? 'border-amber-400 dark:border-amber-600'
    : isOccupied
    ? 'border-blue-300 dark:border-blue-800'
    : isCleaning
    ? 'border-purple-300 dark:border-purple-800'
    : 'border-zinc-200 dark:border-zinc-800'

  const statusBadge = isBilling ? (
    <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1 animate-pulse">
      <AlertTriangle className="w-3 h-3" />
      {language === 'km' ? 'សុំគិតប្រាក់' : 'BILLING'}
    </span>
  ) : isOccupied ? (
    <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 text-[10px] font-bold">
      {language === 'km' ? 'មានភ្ញៀវ' : 'OCCUPIED'}
    </span>
  ) : isCleaning ? (
    <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 text-[10px] font-bold">
      {language === 'km' ? 'ត្រូវសម្អាត' : 'CLEANING'}
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
      {language === 'km' ? 'ទំនេរ' : 'AVAILABLE'}
    </span>
  )

  return (
    <div
      onClick={() => onSelect(table)}
      className={`p-4 rounded-2xl border ${borderColor} bg-white dark:bg-zinc-900 transition-all cursor-pointer flex flex-col justify-between min-h-[140px] hover:border-zinc-400 dark:hover:border-zinc-600`}
    >
      {/* 1. Header: Table Number & Status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-base text-zinc-950 dark:text-zinc-50">
            {table.table_number}
          </h3>
          {table.dining_area_name && (
            <span className="text-[11px] text-zinc-500 font-medium block">
              {table.dining_area_name}
            </span>
          )}
        </div>

        {statusBadge}
      </div>

      {/* 2. Middle Details: Guests count / Active Timer / Subtotal */}
      <div className="py-2 space-y-1">
        {isOccupied || isBilling ? (
          <div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500 flex items-center gap-1 font-sans">
                <Clock className="w-3 h-3 text-zinc-400" />
                {table.session_elapsed_minutes || 12}m
              </span>
              <CurrencyDisplay
                amountUSD={table.session_subtotal_usd || 0}
                className="font-bold text-sm"
              />
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
              <Users className="w-3 h-3" />
              <span>{table.guest_count || table.capacity} {language === 'km' ? 'នាក់' : 'guests'}</span>
            </div>
          </div>
        ) : isCleaning ? (
          <div className="pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkCleaned?.(table.id)
              }}
              className="w-full py-1.5 px-2 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{language === 'km' ? 'ចុចសម្អាតរួច' : 'Mark Cleaned'}</span>
            </button>
          </div>
        ) : (
          <div className="text-xs text-zinc-400 flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{table.capacity} {language === 'km' ? 'កៅអី' : 'seats'}</span>
          </div>
        )}
      </div>

      {/* 3. Footer Action Hint */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] font-medium text-zinc-500 flex items-center justify-between">
        {isAvailable ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            {language === 'km' ? '+ បើកតុ / កុម្ម៉ង់' : '+ Open / Order'}
          </span>
        ) : isOccupied || isBilling ? (
          <span>
            {table.active_orders_count || 1} {language === 'km' ? 'ជុំកុម្ម៉ង់' : 'rounds'}
          </span>
        ) : (
          <span>{language === 'km' ? 'តុត្រូវការសម្អាត' : 'Needs cleaning'}</span>
        )}

        <Check className={`w-3.5 h-3.5 ${isSelected ? 'text-zinc-950 dark:text-zinc-100' : 'opacity-0'}`} />
      </div>
    </div>
  )
}
