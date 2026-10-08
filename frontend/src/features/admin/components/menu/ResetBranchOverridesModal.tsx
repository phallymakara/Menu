import { useState, type FC, type FormEvent } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { Category } from '../../types/admin.types'
import type { ResetBranchOverridesRequest } from '../../hooks/useBranchMenuQueries'

interface ResetBranchOverridesModalProps {
  categories: Category[]
  isSubmitting: boolean
  onSubmit: (payload: ResetBranchOverridesRequest) => Promise<void>
  onClose: () => void
}

export const ResetBranchOverridesModal: FC<ResetBranchOverridesModalProps> = ({
  categories,
  isSubmitting,
  onSubmit,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [resetPrices, setResetPrices] = useState(true)
  const [resetAvailability, setResetAvailability] = useState(false)
  const [categoryId, setCategoryId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!resetPrices && !resetAvailability) {
      setError(
        isKm
          ? 'សូមជ្រើសរើសយ៉ាងហោចណាស់ជម្រើសមួយដើម្បីកំណត់ឡើងវិញ'
          : 'Please select at least one override type to reset'
      )
      return
    }

    setError(null)
    try {
      await onSubmit({
        reset_prices: resetPrices,
        reset_availability: resetAvailability,
        category_id: categoryId || null,
      })
      onClose()
    } catch {
      setError(
        isKm
          ? 'មិនអាចកំណត់ឡើងវិញបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to reset overrides. Please try again.'
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50">
              {isKm ? 'កំណត់ឡើងវិញដូចមេ (Reset to Master)' : 'Reset to Master Defaults'}
            </h3>
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

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {isKm
            ? 'សកម្មភាពនេះនឹងលុបការកែប្រែផ្ទាល់ខ្លួនរបស់សាខានេះ ហើយប្រើប្រាស់តម្លៃ ឬស្ថានភាពលក់ដើមពី Master HQ វិញ។'
            : 'This will revert custom branch overrides back to the HQ Central Master values.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2.5 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetPrices}
                onChange={(e) => setResetPrices(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {isKm ? 'កំណត់តម្លៃឡើងវិញដូចមេ (Reset Prices)' : 'Reset Prices to Master'}
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetAvailability}
                onChange={(e) => setResetAvailability(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {isKm ? 'កំណត់ស្ថានភាពស្តុកឡើងវិញ (Reset Availability / 86s)' : 'Reset Stock Availability'}
              </span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
              {isKm ? 'វិសាលភាពប្រភេទ (Category Scope)' : 'Filter by Category (Optional)'}
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">{isKm ? 'គ្រប់ប្រភេទទាំងអស់ (All Categories)' : 'All Categories'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {isKm && c.name_km ? c.name_km : c.name_en}
                </option>
              ))}
            </select>
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
              className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {isKm ? 'បញ្ជាក់ការកំណត់ឡើងវិញ' : 'Confirm Reset'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
