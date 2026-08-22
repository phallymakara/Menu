import { useState, useEffect, type FC } from 'react'
import { Plus, Minus } from 'lucide-react'
import { MenuItem, ItemVariant, ModifierOption, CourseStage, CartModifierSelection } from '../types/guest.types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useCartStore } from '../stores/useCartStore'
import { playSuccessSound } from '@/lib/audio'

export interface ItemCustomizerModalProps {
  item: MenuItem | null
  isOpen: boolean
  onClose: () => void
}

export const ItemCustomizerModal: FC<ItemCustomizerModalProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const { t, language } = useLanguageStore()
  const { addItem } = useCartStore()

  const [selectedVariant, setSelectedVariant] = useState<ItemVariant | null>(null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, ModifierOption[]>>({})
  const [courseStage, setCourseStage] = useState<CourseStage>('MAINS')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [quantity, setQuantity] = useState(1)

  // Initialize defaults on item open
  useEffect(() => {
    if (item) {
      // Default variant
      const defaultVar = item.variants.find((v) => v.is_default) || item.variants[0] || null
      setSelectedVariant(defaultVar)

      // Default modifiers
      const modMap: Record<string, ModifierOption[]> = {}
      item.modifier_groups.forEach((group) => {
        const defaultOpts = group.options.filter((opt) => opt.is_default)
        if (defaultOpts.length > 0) {
          modMap[group.id] = defaultOpts
        } else if (group.selection_type === 'SINGLE' && group.options.length > 0 && group.is_required) {
          modMap[group.id] = [group.options[0]]
        } else {
          modMap[group.id] = []
        }
      })
      setSelectedModifiers(modMap)

      // Default course stage
      if (item.category_id.includes('drink') || item.name_en.toLowerCase().includes('tea') || item.name_en.toLowerCase().includes('coffee')) {
        setCourseStage('DRINKS')
      } else if (item.category_id.includes('dessert')) {
        setCourseStage('DESSERTS')
      } else if (item.category_id.includes('starter') || item.category_id.includes('appetizer')) {
        setCourseStage('APPETIZERS')
      } else {
        setCourseStage('MAINS')
      }

      setQuantity(1)
      setSpecialInstructions('')
    }
  }, [item])

  if (!item) return null

  const handleModifierToggle = (groupId: string, option: ModifierOption, isSingle: boolean) => {
    setSelectedModifiers((prev) => {
      const current = prev[groupId] || []
      if (isSingle) {
        return { ...prev, [groupId]: [option] }
      } else {
        const exists = current.some((o) => o.id === option.id)
        if (exists) {
          return { ...prev, [groupId]: current.filter((o) => o.id !== option.id) }
        } else {
          return { ...prev, [groupId]: [...current, option] }
        }
      }
    })
  }

  // Calculate Unit & Total Price
  const basePrice = selectedVariant ? selectedVariant.price_usd : item.base_price_usd
  const modifierPrice = Object.values(selectedModifiers)
    .flat()
    .reduce((sum, opt) => sum + opt.price_adjustment_usd, 0)
  const unitPrice = basePrice + modifierPrice
  const totalPrice = unitPrice * quantity

  const handleAddToCart = () => {
    const flatModifiers: CartModifierSelection[] = []
    item.modifier_groups.forEach((group) => {
      const selected = selectedModifiers[group.id] || []
      selected.forEach((opt) => {
        flatModifiers.push({
          modifier_group_id: group.id,
          modifier_group_name: language === 'km' && group.name_km ? group.name_km : group.name_en,
          modifier_option_id: opt.id,
          modifier_option_name: language === 'km' && opt.name_km ? opt.name_km : opt.name_en,
          price_adjustment_usd: opt.price_adjustment_usd,
        })
      })
    })

    addItem(
      item,
      selectedVariant,
      flatModifiers,
      courseStage,
      specialInstructions,
      quantity
    )

    playSuccessSound()
    onClose()
  }

  const displayName = language === 'km' && item.name_km ? item.name_km : item.name_en

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={displayName}
      description={item.description_en || undefined}
      isBottomSheet={true}
    >
      <div className="space-y-5 pb-2">
        {/* 1. Size Variants (if present) */}
        {item.variants && item.variants.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
              {t('selectVariant')}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => {
                const isSelected = selectedVariant?.id === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                    }`}
                  >
                    <div className="font-semibold text-xs">
                      {language === 'km' && v.name_km ? v.name_km : v.name_en}
                    </div>
                    <div className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ${v.price_usd.toFixed(2)}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 2. Modifier Groups */}
        {item.modifier_groups.map((group) => {
          const isSingle = group.selection_type === 'SINGLE'
          const groupSelections = selectedModifiers[group.id] || []
          const groupName = language === 'km' && group.name_km ? group.name_km : group.name_en

          return (
            <div key={group.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {groupName}
                </span>
                {group.is_required && (
                  <span className="text-[10px] text-zinc-400 uppercase font-medium">Required</span>
                )}
              </div>

              <div className="space-y-1.5">
                {group.options.map((opt) => {
                  const isChecked = groupSelections.some((o) => o.id === opt.id)
                  const optName = language === 'km' && opt.name_km ? opt.name_km : opt.name_en

                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleModifierToggle(group.id, opt, isSingle)}
                      className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'border-emerald-600/80 bg-emerald-50/30 dark:bg-emerald-950/20'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-${isSingle ? 'full' : 'md'} border flex items-center justify-center ${
                            isChecked
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          {isChecked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="text-xs text-zinc-800 dark:text-zinc-200">{optName}</span>
                      </div>

                      {opt.price_adjustment_usd > 0 && (
                        <span className="text-xs font-mono text-zinc-500">
                          +${opt.price_adjustment_usd.toFixed(2)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* 3. Course Staging Selector */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
            {t('courseStage')}
          </span>
          <div className="grid grid-cols-4 gap-1.5 text-xs font-medium">
            {(['DRINKS', 'APPETIZERS', 'MAINS', 'DESSERTS'] as CourseStage[]).map((stage) => {
              const isActive = courseStage === stage
              return (
                <button
                  key={stage}
                  onClick={() => setCourseStage(stage)}
                  className={`py-2 px-1 text-center rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold border-transparent'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {stage === 'DRINKS' && t('drinks')}
                  {stage === 'APPETIZERS' && t('appetizers')}
                  {stage === 'MAINS' && t('mains')}
                  {stage === 'DESSERTS' && t('desserts')}
                </button>
              )
            })}
          </div>
        </div>

        {/* 4. Special Instructions */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
            {t('specialInstructions')}
          </label>
          <input
            type="text"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder={language === 'km' ? 'ឧ. ស្ករតិច មិនយកខ្ទឹមបារាំង...' : 'e.g. No onions, less ice...'}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* 5. Quantity Stepper & Add to Order Button */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          {/* Quantity Controls */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 rounded-l-lg transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-9 text-center font-mono font-semibold text-sm">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-r-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Action */}
          <Button
            onClick={handleAddToCart}
            className="flex-1 justify-between h-11"
            size="md"
          >
            <span>{t('addToCart')}</span>
            <CurrencyDisplay amountUSD={totalPrice} className="text-white font-semibold" showKHR={false} />
          </Button>
        </div>
      </div>
    </Modal>
  )
}
