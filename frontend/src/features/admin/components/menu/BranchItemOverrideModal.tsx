import { useState, type FC, type FormEvent } from 'react'
import { Loader2, RotateCcw, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { BranchMenuItemDisplayResponse } from '../../hooks/useBranchMenuQueries'

interface BranchItemOverrideModalProps {
  item: BranchMenuItemDisplayResponse
  isSubmitting: boolean
  onSubmit: (data: {
    price_override: number | null
    availability_status: 'AVAILABLE' | 'TEMPORARILY_OUT_OF_STOCK' | 'HIDDEN'
  }) => Promise<void>
  onRevertToMaster?: () => Promise<void>
  onClose: () => void
}

export const BranchItemOverrideModal: FC<BranchItemOverrideModalProps> = ({
  item,
  isSubmitting,
  onSubmit,
  onRevertToMaster,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const hasExistingPriceOverride = item.price_override !== null && item.price_override !== undefined
  const [useCustomPrice, setUseCustomPrice] = useState(hasExistingPriceOverride)
  const [customPrice, setCustomPrice] = useState<string>(
    hasExistingPriceOverride ? String(item.price_override) : String(item.master_price ?? 0)
  )
  const [availabilityStatus, setAvailabilityStatus] = useState<
    'AVAILABLE' | 'TEMPORARILY_OUT_OF_STOCK' | 'HIDDEN'
  >(
    (item.availability_status as 'AVAILABLE' | 'TEMPORARILY_OUT_OF_STOCK' | 'HIDDEN') || 'AVAILABLE'
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    let parsedPrice: number | null = null
    if (useCustomPrice) {
      parsedPrice = parseFloat(customPrice)
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        setError(isKm ? 'សូមបញ្ចូលតម្លៃដែលត្រឹមត្រូវ' : 'Please enter a valid price')
        return
      }
    }

    try {
      await onSubmit({
        price_override: parsedPrice,
        availability_status: availabilityStatus,
      })
      onClose()
    } catch {
      setError(
        isKm
          ? 'មិនអាចរក្សាទុកការកែប្រែបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to update branch override. Please try again.'
      )
    }
  }

  const handleRevert = async () => {
    if (!onRevertToMaster) return
    setError(null)
    try {
      await onRevertToMaster()
      onClose()
    } catch {
      setError(
        isKm
          ? 'មិនអាចកំណត់ឡើងវិញបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to revert override. Please try again.'
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 z-10 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50">
              {isKm ? 'ការកែប្រែតម្លៃ និងស្ថានភាពសាខា' : 'Branch Price & Stock Override'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isKm && item.name_km ? item.name_km : item.name_en}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Master Price Info */}
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {isKm ? 'តម្លៃមេដើម (Master HQ Price)' : 'HQ Master Price'}:
            </span>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              ${Number(item.master_price ?? 0).toFixed(2)}
            </span>
          </div>

          {/* Custom Price Checkbox */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCustomPrice}
                onChange={(e) => setUseCustomPrice(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {isKm ? 'កំណត់តម្លៃផ្ទាល់ខ្លួនសម្រាប់សាខានេះ' : 'Custom branch price override'}
              </span>
            </label>

            {useCustomPrice && (
              <div className="pt-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 text-sm font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Availability Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {isKm ? 'ស្ថានភាពមុខម្ហូបនៅសាខានេះ' : 'Branch Stock Status'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAvailabilityStatus('AVAILABLE')}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-colors ${
                  availabilityStatus === 'AVAILABLE'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isKm ? 'មានលក់' : 'Available'}
              </button>
              <button
                type="button"
                onClick={() => setAvailabilityStatus('TEMPORARILY_OUT_OF_STOCK')}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-colors ${
                  availabilityStatus === 'TEMPORARILY_OUT_OF_STOCK'
                    ? 'border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isKm ? 'អស់ស្តុក (86)' : 'Out of Stock'}
              </button>
              <button
                type="button"
                onClick={() => setAvailabilityStatus('HIDDEN')}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-colors ${
                  availabilityStatus === 'HIDDEN'
                    ? 'border-zinc-600 bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isKm ? 'លាក់' : 'Hidden'}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800 gap-2">
            {hasExistingPriceOverride && onRevertToMaster ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevert}
                disabled={isSubmitting}
                className="text-xs font-semibold border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                {isKm ? 'កំណត់ដូចមេ' : 'Revert to Master'}
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
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
                {isKm ? 'រក្សាទុក' : 'Save Override'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
