import { type FC } from 'react'
import { POSDiningZone, POSTable } from '../types/pos.types'
import { POSTableCard } from './POSTableCard'

export interface POSTableGridProps {
  zones?: POSDiningZone[]
  tables: POSTable[]
  selectedZoneId: string
  selectedTableId?: string
  onSelectZone?: (zoneId: string) => void
  onSelectTable: (table: POSTable) => void
  onMarkCleaned?: (tableId: string) => void
}

export const POSTableGrid: FC<POSTableGridProps> = ({
  tables,
  selectedZoneId,
  selectedTableId,
  onSelectTable,
  onMarkCleaned,
}) => {

  const filteredTables =
    selectedZoneId === 'all'
      ? tables
      : tables.filter((t) => t.dining_area_id === selectedZoneId)

  return (
    <div>
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
