import { useState, type FC } from 'react'
import { Plus, Trash2, Layers, Loader2 } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import {
  useItemVariants,
  useCreateItemVariant,
  useBatchCreateItemVariants,
  useDeleteItemVariant,
} from '../../hooks/useItemVariantQueries'

interface ItemVariantsEditorProps {
  businessId: string | null
  itemId: string | null
}

const EMPTY_VARIANT_DRAFT = {
  variant_group: 'Size',
  name_en: '',
  name_km: '',
  price_adjustment: 0,
  is_default: false,
}

export const ItemVariantsEditor: FC<ItemVariantsEditorProps> = ({ businessId, itemId }) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_VARIANT_DRAFT)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: variants = [], isLoading } = useItemVariants(businessId, itemId, {
    enabled: !!businessId && !!itemId,
  })

  const createVariantMutation = useCreateItemVariant(businessId, itemId)
  const batchCreateMutation = useBatchCreateItemVariants(businessId, itemId)
  const deleteVariantMutation = useDeleteItemVariant(businessId, itemId)

  if (!itemId) {
    return (
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-xs text-zinc-400 italic">
          {isKm
            ? 'រក្សាទុកមុខម្ហូបជាមុនសិន ទើបអាចកំណត់ទំហំ ឬជម្រើសបាន។'
            : 'Save this item first to manage sizes and portion variants.'}
        </p>
      </div>
    )
  }

  const handleSaveVariant = async () => {
    const nameEn = draft.name_en.trim()
    const nameKm = draft.name_km.trim()
    if (!nameEn) {
      setErrorMsg(isKm ? 'សូមបញ្ចូលឈ្មោះទំហំមុខម្ហូប' : 'Please enter variant name.')
      return
    }

    setErrorMsg(null)
    try {
      await createVariantMutation.mutateAsync({
        variant_group: draft.variant_group || 'Size',
        name_en: nameEn,
        name_km: nameKm || undefined,
        price_adjustment: draft.price_adjustment,
        is_default: draft.is_default,
        is_active: true,
        display_order: variants.length,
      })
      setDraft(EMPTY_VARIANT_DRAFT)
      setIsAdding(false)
    } catch {
      setErrorMsg(
        isKm
          ? 'មិនអាចរក្សាទុកទំហំមុខម្ហូបបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not save variant. Please try again.'
      )
    }
  }

  const handleAddStandardSizes = async () => {
    setErrorMsg(null)
    try {
      await batchCreateMutation.mutateAsync({
        variants: [
          {
            variant_group: 'Size',
            name_en: 'Regular',
            name_km: 'ធម្មតា',
            price_adjustment: 0,
            is_default: true,
            is_active: true,
            display_order: 0,
          },
          {
            variant_group: 'Size',
            name_en: 'Large',
            name_km: 'ធំ',
            price_adjustment: 0.75,
            is_default: false,
            is_active: true,
            display_order: 1,
          },
        ],
      })
    } catch {
      setErrorMsg(
        isKm
          ? 'មិនអាចបង្កើតទំហំស្តង់ដារបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not create standard sizes. Please try again.'
      )
    }
  }

  const handleDeleteVariant = async (variantId: string) => {
    setErrorMsg(null)
    try {
      await deleteVariantMutation.mutateAsync(variantId)
    } catch {
      setErrorMsg(
        isKm
          ? 'មិនអាចលុបទំហំមុខម្ហូបបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not delete variant. Please try again.'
      )
    }
  }

  const isSubmitting =
    createVariantMutation.isPending ||
    batchCreateMutation.isPending ||
    deleteVariantMutation.isPending

  return (
    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span>{isKm ? 'ទំហំ និងប្រភេទ (Sizes & Variants)' : 'Sizes & Variants'}</span>
          {variants.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
              {variants.length}
            </span>
          )}
        </h4>

        <div className="flex items-center gap-2">
          {variants.length === 0 && !isAdding && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleAddStandardSizes}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-1 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isKm ? '+ ទំហំស្តង់ដារ' : '+ Standard Sizes'}</span>
            </button>
          )}

          {!isAdding && (
            <button
              type="button"
              onClick={() => {
                setIsAdding(true)
                setErrorMsg(null)
              }}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{isKm ? 'បន្ថែមទំហំ' : 'Add Size'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{isKm ? 'កំពុងផ្ទុកទំហំ...' : 'Loading variants...'}</span>
        </div>
      )}

      {/* Existing Variants List */}
      {variants.length > 0 && (
        <div className="space-y-1.5">
          {variants.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                  {isKm && v.name_km ? v.name_km : v.name_en}
                </span>
                {v.name_km && v.name_en && (
                  <span className="text-xs text-zinc-400 truncate">
                    ({isKm ? v.name_en : v.name_km})
                  </span>
                )}
                {v.is_default && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {isKm ? 'លំនាំដើម' : 'Default'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-semibold text-xs sm:text-sm text-zinc-700 dark:text-zinc-300">
                  {Number(v.price_adjustment) >= 0
                    ? `+$${Number(v.price_adjustment).toFixed(2)}`
                    : `-$${Math.abs(Number(v.price_adjustment)).toFixed(2)}`}
                </span>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDeleteVariant(v.id)}
                  title={isKm ? 'លុបទំហំនេះ' : 'Delete Variant'}
                  className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Variant Inline Form */}
      {isAdding && (
        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                {isKm ? 'ឈ្មោះទំហំ (EN)' : 'Size Name (EN)'} *
              </label>
              <input
                type="text"
                value={draft.name_en}
                onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
                placeholder="e.g. Regular, Large"
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                {isKm ? 'ឈ្មោះទំហំ (KM)' : 'Size Name (KM)'}
              </label>
              <input
                type="text"
                value={draft.name_km}
                onChange={(e) => setDraft({ ...draft, name_km: e.target.value })}
                placeholder="ឧទាហរណ៍ ធំ, កណ្តាល"
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                {isKm ? 'តម្លៃបន្ថែម ($)' : 'Price Delta ($)'}
              </label>
              <input
                type="number"
                step="0.05"
                value={draft.price_adjustment}
                onChange={(e) =>
                  setDraft({ ...draft, price_adjustment: parseFloat(e.target.value) || 0 })
                }
                placeholder="0.00"
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={draft.is_default}
                onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })}
                className="rounded border-zinc-300 text-emerald-600 focus:ring-0"
              />
              <span>{isKm ? 'កំណត់ជាទំហំលំនាំដើម' : 'Set as default size'}</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false)
                  setDraft(EMPTY_VARIANT_DRAFT)
                  setErrorMsg(null)
                }}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                {isKm ? 'បោះបង់' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveVariant}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>{isKm ? 'រក្សាទុក' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pure inline error text without cards or containers */}
      {errorMsg && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
