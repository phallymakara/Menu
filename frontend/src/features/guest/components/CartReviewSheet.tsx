import { type FC } from 'react'
import { Trash2, Plus, Minus, SendHorizontal } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useCartStore } from '../stores/useCartStore'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface CartReviewSheetProps {
  isOpen: boolean
  onClose: () => void
  onSubmitOrder: () => void
  isSubmitting?: boolean
}

export const CartReviewSheet: FC<CartReviewSheetProps> = ({
  isOpen,
  onClose,
  onSubmitOrder,
  isSubmitting = false,
}) => {
  const { t, language } = useLanguageStore()
  const { items, updateQuantity, removeItem, getTotalUSD, clearCart } = useCartStore()

  const total = getTotalUSD()

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('cart')}
      description={language === 'km' ? 'សូមពិនិត្យមុខម្ហូបមុនពេលបញ្ជូនទៅផ្ទះបាយ' : 'Review your items before sending to the kitchen'}
      isBottomSheet={true}
    >
      <div className="space-y-4 pb-2">
        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            {language === 'km' ? 'មិនទាន់មានមុខម្ហូបក្នុងកន្ត្រកនៅឡើយទេ' : 'Your cart is empty'}
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {items.map((item) => {
              const displayName = language === 'km' && item.menu_item.name_km ? item.menu_item.name_km : item.menu_item.name_en
              const variantName = item.variant ? (language === 'km' && item.variant.name_km ? item.variant.name_km : item.variant.name_en) : null

              return (
                <div
                  key={item.cart_item_id}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {displayName}
                        </span>
                        {variantName && (
                          <span className="text-[11px] text-zinc-500 font-medium">({variantName})</span>
                        )}
                        <Badge variant="neutral" size="sm">
                          {item.course_stage}
                        </Badge>
                      </div>

                      {/* Modifier Summary */}
                      {item.selected_modifiers.length > 0 && (
                        <div className="text-[11px] text-zinc-500 space-y-0.5">
                          {item.selected_modifiers.map((m, mi) => (
                            <span key={mi} className="block">
                              + {m.modifier_option_name}
                              {m.price_adjustment_usd > 0 && ` ($${m.price_adjustment_usd.toFixed(2)})`}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Special Note */}
                      {item.special_instructions && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                          Note: "{item.special_instructions}"
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => removeItem(item.cart_item_id)}
                      className="text-zinc-400 hover:text-red-600 transition-colors p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Quantity Stepper & Subtotal */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <button
                        onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)}
                        className="p-1 px-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-l-lg transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-mono font-semibold text-xs">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)}
                        className="p-1 px-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-r-lg transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <CurrencyDisplay amountUSD={item.total_price_usd} className="font-semibold text-xs" />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Order Summary Footer */}
        {items.length > 0 && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500 font-medium">{t('subtotal')}</span>
              <CurrencyDisplay amountUSD={total} className="font-bold text-base" />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={clearCart}
                className="w-1/3"
                size="md"
              >
                {language === 'km' ? 'សម្អាត' : 'Clear'}
              </Button>

              <Button
                variant="primary"
                onClick={onSubmitOrder}
                isLoading={isSubmitting}
                className="flex-1 justify-center gap-2"
                size="md"
              >
                <SendHorizontal className="w-4 h-4" />
                <span>{t('placeOrder')}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
