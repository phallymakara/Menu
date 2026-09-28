import { useState, type FC } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import type { ModifierGroup } from '../../types/admin.types'
import { addOptionToGroups, removeOptionFromGroups } from '../../utils/menuMapping'

interface ItemOptionsEditorProps {
  modifierGroups: ModifierGroup[]
  onChange: (groups: ModifierGroup[]) => void
}

const EMPTY_DRAFT = { name_en: '', name_km: '', price_usd: '' }

/** Flat list of an item's add-on options with an inline row for adding new ones. */
export const ItemOptionsEditor: FC<ItemOptionsEditorProps> = ({ modifierGroups, onChange }) => {
  const { language } = useLanguageStore()
  const [isAddingOption, setIsAddingOption] = useState(false)
  const [newOptionDraft, setNewOptionDraft] = useState(EMPTY_DRAFT)

  const handleOpenAddOption = () => {
    setIsAddingOption(true)
    setNewOptionDraft(EMPTY_DRAFT)
  }

  const handleCancelNewOption = () => {
    setIsAddingOption(false)
    setNewOptionDraft(EMPTY_DRAFT)
  }

  const handleSaveNewOption = () => {
    const nameEn = newOptionDraft.name_en.trim()
    const nameKm = newOptionDraft.name_km.trim()
    if (!nameEn && !nameKm) return

    onChange(
      addOptionToGroups(modifierGroups, {
        // The `opt_` prefix marks options that are not saved to the backend yet.
        id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name_en: nameEn || nameKm,
        name_km: nameKm || nameEn,
        price_usd: parseFloat(newOptionDraft.price_usd) || 0,
        is_default: false,
      })
    )
    setIsAddingOption(false)
    setNewOptionDraft(EMPTY_DRAFT)
  }

  return (
                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
          <span>{language === 'km' ? 'ជម្រើសបន្ថែម' : 'Options'}</span>
        </h4>

        {/* Add Option Button */}
        {!isAddingOption && (
          <button
            type="button"
            onClick={handleOpenAddOption}
            className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'km' ? 'បន្ថែមជម្រើស' : 'Add Option'}</span>
          </button>
        )}
      </div>

      {/* Display Saved Options (Not inside input fields) */}
      {modifierGroups.flatMap((g) => g.options).length > 0 && (
        <div className="space-y-1.5">
          {modifierGroups
            .flatMap((g) => g.options)
            .map((opt) => (
              <div
                key={opt.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {language === 'km' && opt.name_km ? opt.name_km : opt.name_en}
                  </span>
                  {opt.name_km && opt.name_en && opt.name_km !== opt.name_en && (
                    <span className="text-xs text-zinc-400 truncate">
                      ({language === 'km' ? opt.name_en : opt.name_km})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono font-semibold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                    {opt.price_usd > 0 ? `+$${opt.price_usd.toFixed(2)}` : '+$0.00'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(removeOptionFromGroups(modifierGroups, opt.id))}
                    title={language === 'km' ? 'លុបជម្រើសនេះ' : 'Delete Option'}
                    className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Adding Option Draft Row with Tick & Cross icons */}
      {isAddingOption && (
        <div className="grid grid-cols-[1fr_1fr_80px_28px_28px] sm:grid-cols-[1fr_1fr_90px_32px_32px] gap-1.5 sm:gap-2 items-center w-full pt-1">
          <input
            type="text"
            autoFocus
            value={newOptionDraft.name_en}
            onChange={(e) =>
              setNewOptionDraft((prev) => ({ ...prev, name_en: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSaveNewOption()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                handleCancelNewOption()
              }
            }}
            placeholder={language === 'km' ? 'ជម្រើស (EN)' : 'Choice (EN)'}
            className="w-full min-w-0 px-3.5 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
          />
          <input
            type="text"
            value={newOptionDraft.name_km}
            onChange={(e) =>
              setNewOptionDraft((prev) => ({ ...prev, name_km: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSaveNewOption()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                handleCancelNewOption()
              }
            }}
            placeholder={language === 'km' ? 'ជម្រើស (KM)' : 'Choice (KM)'}
            className="w-full min-w-0 px-3.5 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
          />
          <div className="relative w-full min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">+$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newOptionDraft.price_usd}
              onChange={(e) =>
                setNewOptionDraft((prev) => ({ ...prev, price_usd: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSaveNewOption()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  handleCancelNewOption()
                }
              }}
              placeholder="0.00"
              className="w-full pl-6 pr-3 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors text-right"
            />
          </div>
          {/* Tick Icon to Save */}
          <button
            type="button"
            onClick={handleSaveNewOption}
            title={language === 'km' ? 'រក្សាទុកជម្រើស' : 'Save Option'}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0"
          >
            <Check className="w-4 h-4" />
          </button>
          {/* Cross Icon to Cancel */}
          <button
            type="button"
            onClick={handleCancelNewOption}
            title={language === 'km' ? 'បោះបង់' : 'Cancel'}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
