import { type FC } from 'react'
import { KitchenStation } from '../types/kds.types'

export interface KDSStationTabsProps {
  stations: KitchenStation[]
  selectedStationId: string
  onSelectStation: (stationId: string) => void
  ticketCountByStation?: Record<string, number>
}

export const KDSStationTabs: FC<KDSStationTabsProps> = ({
  stations,
  selectedStationId,
  onSelectStation,
  ticketCountByStation = {},
}) => {
  if (!stations || stations.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 min-w-max">
        {stations.map((st) => {
          const isSelected = selectedStationId === st.id
          const count = ticketCountByStation[st.id] ?? 0

          return (
            <button
              key={st.id}
              onClick={() => onSelectStation(st.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                isSelected
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <span>{st.name}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                  isSelected
                    ? 'bg-zinc-700 text-zinc-100 dark:bg-zinc-300 dark:text-zinc-900'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
