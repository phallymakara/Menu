import type { FC } from 'react'
import { Building2, GitCompare, RotateCcw, Plus, Layers } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { BranchResponse } from '../../hooks/useTenantQueries'

interface BranchMenuHeaderProps {
  branches: BranchResponse[]
  selectedBranchId: string | null
  onSelectBranch: (branchId: string | null) => void
  onOpenComparison: () => void
  onOpenResetOverrides: () => void
  onOpenCategoryPublish: () => void
  onOpenAddLocalItem: () => void
}

export const BranchMenuHeader: FC<BranchMenuHeaderProps> = ({
  branches,
  selectedBranchId,
  onSelectBranch,
  onOpenComparison,
  onOpenResetOverrides,
  onOpenCategoryPublish,
  onOpenAddLocalItem,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const currentBranch = branches.find((b) => b.id === selectedBranchId)

  return (
    <div className="flex flex-col gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Branch Scope Selector */}
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider shrink-0">
            {isKm ? 'វិសាលភាពសាខា' : 'Catalog Scope'}:
          </span>
          <select
            value={selectedBranchId ?? ''}
            onChange={(e) => onSelectBranch(e.target.value ? e.target.value : null)}
            className="text-xs sm:text-sm font-medium py-1.5 px-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">
              {isKm ? '🏢 បញ្ជីមុខម្ហូបមេ (Master HQ)' : '🏢 Master Brand Catalog (HQ)'}
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                📍 {isKm && b.name_km ? b.name_km : b.name_en}
              </option>
            ))}
          </select>
        </div>

        {/* Global Catalog Comparison & Sync */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenComparison}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border-zinc-300 dark:border-zinc-700"
          >
            <GitCompare className="w-3.5 h-3.5 mr-1.5 text-zinc-600 dark:text-zinc-300" />
            {isKm ? 'ប្រៀបធៀបសាខា និងធ្វើសមកាលកម្ម' : 'Compare & Sync Branches'}
          </Button>
        </div>
      </div>

      {/* Branch Specific Mode Banner & Controls */}
      {currentBranch && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-700 dark:text-zinc-300 font-medium">
              {isKm
                ? `កំពុងមើលម៉ឺនុយជាក់ស្តែងរបស់សាខា៖ ${currentBranch.name_km || currentBranch.name_en}`
                : `Active Branch Menu: ${currentBranch.name_en} (Resolved Overrides & Local Items)`}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenCategoryPublish}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border-zinc-300 dark:border-zinc-700"
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              {isKm ? 'គ្រប់គ្រងប្រភេទ' : 'Branch Categories'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenResetOverrides}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border-zinc-300 dark:border-zinc-700 text-amber-700 dark:text-amber-400"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              {isKm ? 'កំណត់ឡើងវិញដូចមេ' : 'Reset to Master'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenAddLocalItem}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg border-emerald-600 text-emerald-700 dark:text-emerald-400"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {isKm ? 'មុខម្ហូបពិសេសសាខា' : 'Add Local Dish'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
