import { useState, useMemo, type FC } from 'react'
import { Search, Plus, Send, Trash2, ArrowLeft } from 'lucide-react'
import { Category, MenuItem, ItemVariant, ModifierOption, CourseStage } from '@/features/guest/types/guest.types'
import { POSCartItem, POSTable } from '../types/pos.types'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'

export interface POSMenuCatalogProps {
  categories: Category[]
  activeCart: POSCartItem[]
  selectedTable: POSTable | null
  onAddToCart: (item: POSCartItem) => void
  onUpdateCartQty: (cartItemId: string, qty: number) => void
  onRemoveFromCart: (cartItemId: string) => void
  onClearCart: () => void
  onSubmitOrder: (courseStage: CourseStage, guestNotes: string) => Promise<void>
  onBackToFloorMap: () => void
  isSubmitting?: boolean
}

export const POSMenuCatalog: FC<POSMenuCatalogProps> = ({
  categories,
  activeCart,
  selectedTable,
  onAddToCart,
  onUpdateCartQty,
  onRemoveFromCart,
  onClearCart,
  onSubmitOrder,
  onBackToFloorMap,
  isSubmitting = false,
}) => {
  const { language } = useLanguageStore()

  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<ItemVariant | null>(null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, ModifierOption[]>>({})
  const [courseStage, setCourseStage] = useState<CourseStage>('MAINS')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [guestNotes, setGuestNotes] = useState('')

  // Filter items
  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => {
        const matching = cat.items.filter((item) => {
          const matchCat = activeCategoryId === 'all' || cat.id === activeCategoryId
          const query = searchQuery.toLowerCase().trim()
          const matchSearch =
            !query ||
            item.name_en.toLowerCase().includes(query) ||
            (item.name_km && item.name_km.includes(query))
          return matchCat && matchSearch
        })
        return { ...cat, items: matching }
      })
      .filter((cat) => cat.items.length > 0)
  }, [categories, activeCategoryId, searchQuery])

  // Open item customizer
  const handleOpenItem = (item: MenuItem) => {
    setSelectedMenuItem(item)
    setSelectedVariant(item.variants.find((v) => v.is_default) || item.variants[0] || null)

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
    setQuantity(1)
    setSpecialInstructions('')

    if (item.category_id.includes('drink') || item.name_en.toLowerCase().includes('coffee')) {
      setCourseStage('DRINKS')
    } else if (item.category_id.includes('dessert')) {
      setCourseStage('DESSERTS')
    } else if (item.category_id.includes('appetizer')) {
      setCourseStage('APPETIZERS')
    } else {
      setCourseStage('MAINS')
    }
  }

  // Add customized item to cart
  const handleConfirmAdd = () => {
    if (!selectedMenuItem) return

    const basePrice = selectedVariant ? selectedVariant.price_usd : selectedMenuItem.base_price_usd
    const modTotal = Object.values(selectedModifiers)
      .flat()
      .reduce((sum, opt) => sum + opt.price_adjustment_usd, 0)
    const unitPrice = basePrice + modTotal

    const flatMods = Object.values(selectedModifiers)
      .flat()
      .map((opt) => ({
        modifier_option_id: opt.id,
        modifier_name: opt.name_en,
        unit_price: opt.price_adjustment_usd,
      }))

    const cartItemId = `${selectedMenuItem.id}-${selectedVariant?.id || 'none'}-${flatMods.map((m) => m.modifier_option_id).sort().join('-')}-${courseStage}-${specialInstructions}`

    onAddToCart({
      cart_item_id: cartItemId,
      menu_item_id: selectedMenuItem.id,
      item_name_en: selectedMenuItem.name_en,
      item_name_km: selectedMenuItem.name_km,
      variant_id: selectedVariant?.id || null,
      variant_name: selectedVariant?.name_en || null,
      quantity,
      course_stage: courseStage,
      modifiers: flatMods,
      special_instructions: specialInstructions,
      unit_price_usd: unitPrice,
      total_price_usd: unitPrice * quantity,
    })

    playSuccessSound()
    setSelectedMenuItem(null)
  }

  const cartSubtotal = activeCart.reduce((sum, item) => sum + item.total_price_usd, 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* 1. Left Catalog Area */}
      <div className="flex-1 space-y-4 w-full">
        {/* Navigation & Search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onBackToFloorMap}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{language === 'km' ? 'ត្រឡប់ទៅប្លង់តុ' : 'Back to Floor Map'}</span>
          </button>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប...' : 'Search menu item...'}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              activeCategoryId === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            {language === 'km' ? 'ទាំងអស់' : 'All'}
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                activeCategoryId === cat.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {language === 'km' && cat.name_km ? cat.name_km : cat.name_en}
            </button>
          ))}
        </div>

        {/* Dishes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredCategories.flatMap((cat) =>
            cat.items.map((item) => {
              const displayName = language === 'km' && item.name_km ? item.name_km : item.name_en
              return (
                <div
                  key={item.id}
                  onClick={() => handleOpenItem(item)}
                  className="p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer flex flex-col justify-between min-h-[110px]"
                >
                  <div>
                    <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                      {displayName}
                    </h4>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <CurrencyDisplay amountUSD={item.base_price_usd} className="font-bold text-xs" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenItem(item)
                      }}
                      className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 2. Right Cart / Ticket Summary */}
      <div className="w-full lg:w-96 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shrink-0">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
              {selectedTable ? `Table ${selectedTable.table_number}` : 'Direct Order Ticket'}
            </h3>
            <span className="text-[11px] text-zinc-500 font-medium block">
              {activeCart.length} {language === 'km' ? 'មុខម្ហូបក្នុងកន្ត្រក' : 'items in cart'}
            </span>
          </div>

          {activeCart.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-xs text-red-500 hover:underline font-medium"
            >
              {language === 'km' ? 'សម្អាត' : 'Clear'}
            </button>
          )}
        </div>

        {/* Cart Item Lines */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {activeCart.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              {language === 'km' ? 'សូមជ្រើសរើសមុខម្ហូបពីបញ្ជី' : 'Select dishes to add to order'}
            </div>
          ) : (
            activeCart.map((item) => {
              const displayName = language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en
              return (
                <div
                  key={item.cart_item_id}
                  className="p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/50 flex items-start justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate block">
                      {displayName}
                    </span>
                    {item.variant_name && (
                      <span className="text-[11px] text-zinc-500 block">({item.variant_name})</span>
                    )}
                    {item.modifiers.length > 0 && (
                      <span className="text-[11px] text-zinc-500 block">
                        + {item.modifiers.map((m) => m.modifier_name).join(', ')}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-zinc-200 dark:bg-zinc-800 inline-block mt-0.5">
                      {item.course_stage}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <button
                        onClick={() => onUpdateCartQty(item.cart_item_id, item.quantity - 1)}
                        className="px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-mono font-bold text-xs">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateCartQty(item.cart_item_id, item.quantity + 1)}
                        className="px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100"
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => onRemoveFromCart(item.cart_item_id)}
                      className="p-1 text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Guest Notes Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'km' ? 'ចំណាំរបស់ភ្ញៀវ' : 'Guest Notes (Optional)'}
          </label>
          <input
            type="text"
            value={guestNotes}
            onChange={(e) => setGuestNotes(e.target.value)}
            placeholder={language === 'km' ? 'ឧ. តុខួបកំណើត...' : 'e.g. Birthday table...'}
            className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs outline-none"
          />
        </div>

        {/* Send to Kitchen Action */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <div className="flex justify-between items-center text-sm font-bold">
            <span className="text-zinc-500">{language === 'km' ? 'សរុប' : 'Subtotal'}:</span>
            <CurrencyDisplay amountUSD={cartSubtotal} className="font-bold text-base" />
          </div>

          <button
            onClick={() => onSubmitOrder(courseStage, guestNotes)}
            disabled={activeCart.length === 0 || isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Send className="w-4 h-4" />
            <span>
              {isSubmitting
                ? (language === 'km' ? 'កំពុងបញ្ជូន...' : 'Sending to Kitchen...')
                : (language === 'km' ? 'បញ្ជូនទៅផ្ទះបាយ (Send Order)' : 'Send to Kitchen (Fire)')}
            </span>
          </button>
        </div>
      </div>

      {/* Item Customizer Modal */}
      {selectedMenuItem && (
        <Modal
          isOpen={!!selectedMenuItem}
          onClose={() => setSelectedMenuItem(null)}
          title={language === 'km' && selectedMenuItem.name_km ? selectedMenuItem.name_km : selectedMenuItem.name_en}
          isBottomSheet={true}
        >
          <div className="space-y-4 pb-2">
            {/* Variants */}
            {selectedMenuItem.variants.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">Size / Variant</span>
                <div className="grid grid-cols-2 gap-2">
                  {selectedMenuItem.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-colors ${
                        selectedVariant?.id === v.id
                          ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100 font-bold'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div>{v.name_en}</div>
                      <div className="text-emerald-600 font-mono">${v.price_usd.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Course Stage */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">Course Stage</span>
              <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
                {(['DRINKS', 'APPETIZERS', 'MAINS', 'DESSERTS'] as CourseStage[]).map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setCourseStage(stage)}
                    className={`py-2 px-1 text-center rounded-xl border transition-colors ${
                      courseStage === stage
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>

            {/* Special Instructions */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Special Notes</label>
              <input
                type="text"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g. Less ice, extra sauce..."
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs outline-none"
              />
            </div>

            {/* Add Action */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={handleConfirmAdd}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
