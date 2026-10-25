import { type FC } from 'react'
import { Trash2, SendHorizontal, Utensils } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useCartStore } from '../stores/useCartStore'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface CartReviewSheetProps {
  isOpen: boolean
  onClose: () => void
  onSubmitOrder: () => void
  isSubmitting?: boolean
  tableNumber?: string
  errorMessage?: string | null
}

export const CartReviewSheet: FC<CartReviewSheetProps> = ({
  isOpen,
  onClose,
  onSubmitOrder,
  isSubmitting = false,
  tableNumber,
  errorMessage,
}) => {
  const { language } = useLanguageStore()
  const { items, updateQuantity, removeItem, getTotalUSD } = useCartStore()

  const total = getTotalUSD()

  const modalTitle = tableNumber
    ? (language === 'km' ? `កន្ត្រកកុម្ម៉ង់ (តុ ${tableNumber})` : `Cart (Table ${tableNumber})`)
    : (language === 'km' ? 'កន្ត្រកកុម្ម៉ង់' : 'Cart')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      isBottomSheet={true}
    >
      <div className="space-y-3 pb-2">
        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            {language === 'km' ? 'មិនទាន់មានមុខម្ហូបក្នុងកន្ត្រកនៅឡើយទេ' : 'Your cart is empty'}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-80 overflow-y-auto pr-1">
            {items.map((item) => {
              const displayName =
                language === 'km' && item.menu_item.name_km ? item.menu_item.name_km : item.menu_item.name_en
              const variantName = item.variant
                ? language === 'km' && item.variant.name_km
                  ? item.variant.name_km
                  : item.variant.name_en
                : null
              const imageUrl = item.menu_item.image_url

              return (
                <div
                  key={item.cart_item_id}
                  className="py-3 first:pt-1 last:pb-1 flex items-center gap-3 text-xs"
                >
                  {/* Product Thumbnail Photo */}
                  <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden shrink-0 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Utensils className="w-5 h-5 text-zinc-400 opacity-40" />
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <span className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-zinc-50 truncate block leading-snug">
                      {displayName}
                    </span>
                    {variantName && (
                      <span className="text-[11px] text-zinc-500 block leading-tight">({variantName})</span>
                    )}
                    {item.selected_modifiers.length > 0 && (
                      <span className="text-[10px] text-zinc-400 block truncate">
                        + {item.selected_modifiers.map((m) => m.modifier_option_name).join(', ')}
                      </span>
                    )}
                    {item.special_instructions && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 italic truncate">
                        Note: "{item.special_instructions}"
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <CurrencyDisplay
                        amountUSD={item.unit_price_usd}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                      />
                    </div>
                  </div>

                  {/* Quantity Controls & Remove Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/80 p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-colors font-bold text-xs cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-mono font-black text-xs text-zinc-900 dark:text-zinc-100">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-colors font-bold text-xs cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.cart_item_id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      title={language === 'km' ? 'លុប' : 'Remove'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Order Summary Footer */}
        {items.length > 0 && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            {/* Total Price at Bottom */}
            <div className="flex items-center justify-between text-sm sm:text-base">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'សរុប:' : 'Total:'}
              </span>
              <CurrencyDisplay
                amountUSD={total}
                className="font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400"
              />
            </div>

            {errorMessage && (
              <p className="text-xs text-red-500 text-center font-medium bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg p-2">
                {errorMessage}
              </p>
            )}

            <Button
              variant="primary"
              onClick={onSubmitOrder}
              isLoading={isSubmitting}
              className="w-full justify-center gap-2"
              size="lg"
            >
              <SendHorizontal className="w-4 h-4" />
              <span>{language === 'km' ? 'បញ្ជូនទៅផ្ទះបាយ (Send Order)' : 'Send Order to Kitchen'}</span>
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
