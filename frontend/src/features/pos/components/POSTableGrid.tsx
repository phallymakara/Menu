import { type FC } from 'react'
import { POSDiningZone, POSTable } from '../types/pos.types'
import { POSTableCard } from './POSTableCard'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface POSTableGridProps {
  zones: POSDiningZone[]
  tables: POSTable[]
  selectedZoneId: string
  selectedTableId?: string
  onSelectZone: (zoneId: string) => void
  onSelectTable: (table: POSTable) => void
  onMarkCleaned?: (tableId: string) => void
}

export const POSTableGrid: FC<POSTableGridProps> = ({
  zones,
  tables,
  selectedZoneId,
  selectedTableId,
  onSelectZone,
  onSelectTable,
  onMarkCleaned,
}) => {
  const { language } = useLanguageStore()

  const filteredTables =
    selectedZoneId === 'all'
      ? tables
      : tables.filter((t) => t.dining_area_id === selectedZoneId)

  return (
    <div className="space-y-4">
      {/* Zone Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => onSelectZone('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
            selectedZoneId === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'គ្រប់តំបន់ (All Zones)' : 'All Zones'} ({tables.length})
        </button>

        {zones.map((zone) => {
          const zoneCount = tables.filter((t) => t.dining_area_id === zone.id).length
          const isSelected = selectedZoneId === zone.id
          const displayName = language === 'km' && zone.name_km ? zone.name_km : zone.name_en

          return (
            <button
              key={zone.id}
              onClick={() => onSelectZone(zone.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <span>{displayName}</span>
              <span className="text-[10px] opacity-70">({zoneCount})</span>
            </button>
          )
        })}
      </div>

      {/* Grid of Tables */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
        {filteredTables.map((table) => (
          <POSTableCard
            key={table.id}
            table={table}
            isSelected={selectedTableId === table.id}
            onSelect={onSelectTable}
            onMarkCleaned={onMarkCleaned}
          />
        ))}
      </div>
    </div>
  )
}
