import { useState, type FC, type FormEvent } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { Category } from '../../types/admin.types'

interface BranchCategoryPublishModalProps {
  categories: Category[]
  currentAssignedCategoryIds: string[]
  isSubmitting: boolean
  onSubmit: (categoryIds: string[]) => Promise<void>
  onClose: () => void
}

export const BranchCategoryPublishModal: FC<BranchCategoryPublishModalProps> = ({
  categories,
  currentAssignedCategoryIds,
  isSubmitting,
  onSubmit,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [selectedIds, setSelectedIds] = useState<string[]>(
    currentAssignedCategoryIds.length > 0
      ? currentAssignedCategoryIds
      : categories.map((c) => c.id)
  )
  const [error, setError] = useState<string | null>(null)

  const toggleCategory = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const selectAll = () => setSelectedIds(categories.map((c) => c.id))
  const deselectAll = () => setSelectedIds([])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await onSubmit(selectedIds)
      onClose()
    } catch {
      setError(
        isKm
          ? 'មិនអាចរក្សាទុកប្រភេទសាខាបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to update branch categories. Please try again.'
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50">
              {isKm ? 'គ្រប់គ្រងប្រភេទបង្ហាញនៅសាខា' : 'Branch Category Publishing'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isKm
                ? 'ជ្រើសរើសប្រភេទមុខម្ហូបដែលត្រូវដាក់លក់នៅសាខានេះ'
                : 'Select which categories should be active for this branch.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        {/* Quick select buttons */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-zinc-500">
            {isKm
              ? `បានជ្រើសរើស ${selectedIds.length} ក្នុងចំណោម ${categories.length}`
              : `${selectedIds.length} of ${categories.length} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-emerald-600 hover:underline font-medium"
            >
              {isKm ? 'ជ្រើសរើសទាំងអស់' : 'Select All'}
            </button>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-zinc-500 hover:underline font-medium"
            >
              {isKm ? 'ដោះចេញទាំងអស់' : 'Clear All'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-zinc-100 dark:divide-zinc-800 pr-1">
            {categories.map((cat) => {
              const checked = selectedIds.includes(cat.id)
              return (
                <div
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className="flex items-center justify-between py-2 px-1 cursor-pointer select-none hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-xl"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {isKm && cat.name_km ? cat.name_km : cat.name_en}
                    </p>
                    {isKm && cat.name_en !== cat.name_km && (
                      <p className="text-2xs text-zinc-400 truncate">{cat.name_en}</p>
                    )}
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                      checked
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-zinc-100 dark:border-zinc-800 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs font-semibold border-zinc-300 dark:border-zinc-700"
            >
              {isKm ? 'បោះបង់' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {isKm ? 'រក្សាទុកការជ្រើសរើស' : 'Save Assignments'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
