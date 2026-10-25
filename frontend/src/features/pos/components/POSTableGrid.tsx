import { useState, useMemo, type FC } from 'react'
import { POSDiningZone, POSTable } from '../types/pos.types'
import { POSTableCard } from './POSTableCard'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSTableGridProps {
  zones?: POSDiningZone[]
  tables: POSTable[]
  selectedZoneId?: string
  selectedTableId?: string
  onSelectZone?: (zoneId: string) => void
  onSelectTable: (table: POSTable) => void
  onTakeOrder?: (table: POSTable) => void
  onMarkCleaned?: (tableId: string) => void
}

export const POSTableGrid: FC<POSTableGridProps> = ({
  tables,
  selectedZoneId,
  selectedTableId,
  onSelectTable,
  onTakeOrder,
  onMarkCleaned,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [selectedType, setSelectedType] = useState<string>('all')

  // Detect table type categories (e.g. Standard T, VIP, Bar BAR)
  const categories = useMemo(() => {
    const map = new Map<string, { labelEn: string; labelKm: string; count: number }>()

    tables.forEach((t) => {
      const num = t.table_number.trim().toUpperCase()
      let key = 'T'
      let labelEn = 'Standard (T)'
      let labelKm = 'តុទូទៅ (T)'

      if (num.startsWith('VIP')) {
        key = 'VIP'
        labelEn = 'VIP'
        labelKm = 'តុ VIP'
      } else if (num.startsWith('BAR')) {
        key = 'BAR'
        labelEn = 'Bar'
        labelKm = 'កៅអីបារ'
      } else if (num.includes('-')) {
        const prefix = num.split('-')[0]
        key = prefix
        labelEn = prefix === 'T' ? 'Standard (T)' : prefix
        labelKm = prefix === 'T' ? 'តុទូទៅ (T)' : prefix
      }

      const existing = map.get(key)
      if (existing) {
        existing.count += 1
      } else {
        map.set(key, { labelEn, labelKm, count: 1 })
      }
    })

    return Array.from(map.entries()).map(([id, info]) => ({
      id,
      ...info,
    }))
  }, [tables])



  // Filter tables by Zone, Type Category, and Status
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      // 1. Zone filter (if selectedZoneId provided)
      if (selectedZoneId && selectedZoneId !== 'all' && t.dining_area_id !== selectedZoneId) {
        return false
      }

      // 2. Table Type Category filter
      if (selectedType !== 'all') {
        const num = t.table_number.trim().toUpperCase()
        if (selectedType === 'VIP') {
          if (!num.startsWith('VIP')) return false
        } else if (selectedType === 'BAR') {
          if (!num.startsWith('BAR')) return false
        } else if (selectedType === 'T') {
          if (!num.startsWith('T-') && !num.startsWith('T') && (num.startsWith('VIP') || num.startsWith('BAR'))) {
            return false
          }
        } else {
          if (!num.startsWith(selectedType)) return false
        }
      }

      return true
    })
  }, [tables, selectedZoneId, selectedType])

  return (
    <div className="space-y-3.5">
      {/* Category selection tabs - styled identically to the food order page */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedType('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
            selectedType === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-800/80'
          }`}
        >
          {isKm ? 'តុទាំងអស់' : 'All Tables'}
        </button>

        {categories.map((cat) => {
          const isSelected = selectedType === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedType(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                isSelected
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-800/80'
              }`}
            >
              {isKm ? cat.labelKm : cat.labelEn}
            </button>
          )
        })}
      </div>

      {/* Grid of Tables - Dedicated Scroll Container with consistent card sizing */}
      <div className="overflow-y-auto max-h-[calc(100vh-210px)] pr-1 sm:pr-2 overscroll-contain">
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(145px,185px))] gap-2.5 sm:gap-3 pb-8">
          {filteredTables.map((table) => (
            <POSTableCard
              key={table.id}
              table={table}
              isSelected={selectedTableId === table.id}
              onSelect={onSelectTable}
              onTakeOrder={onTakeOrder}
              onMarkCleaned={onMarkCleaned}
            />
          ))}
        </div>
      </div>

      {filteredTables.length === 0 && (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            {isKm ? 'មិនមានតុនៅក្នុងប្រភេទនេះទេ' : 'No tables match the selected category.'}
          </p>
        </div>
      )}
    </div>
  )
}
