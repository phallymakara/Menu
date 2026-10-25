import { useState, useMemo, type FC } from 'react'
import { Search, Plus, Minus, Send, Trash2, Utensils } from 'lucide-react'
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
  isSubmitting?: boolean
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
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
  isSubmitting = false,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
}) => {
  const { language } = useLanguageStore()

  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [internalSearchQuery, setInternalSearchQuery] = useState('')
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery
  const setSearchQuery = onSearchQueryChange || setInternalSearchQuery
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

  // Map of menu item id to image_url for fast cart lookup
  const itemImageMap = useMemo(() => {
    const map = new Map<string, string | null>()
    categories.forEach((cat) => {
      cat.items.forEach((item) => {
        if (item.id) {
          map.set(item.id, item.image_url || null)
        }
      })
    })
    return map
  }, [categories])

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
      image_url: selectedMenuItem.image_url || null,
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

  // Quick add or open customizer modal
  const handleQuickAddOrOpen = (item: MenuItem) => {
    const hasOptions =
      (item.variants && item.variants.length > 0) ||
      (item.modifier_groups && item.modifier_groups.length > 0)

    if (hasOptions) {
      handleOpenItem(item)
    } else {
      onAddToCart({
        cart_item_id: `${item.id}-none--MAINS-`,
        menu_item_id: item.id,
        item_name_en: item.name_en,
        item_name_km: item.name_km,
        image_url: item.image_url || null,
        variant_id: null,
        variant_name: null,
        quantity: 1,
        course_stage: 'MAINS',
        modifiers: [],
        special_instructions: '',
        unit_price_usd: item.base_price_usd,
        total_price_usd: item.base_price_usd,
      })
      playSuccessSound()
    }
  }

  const handleIncrementItem = (item: MenuItem) => {
    const hasOptions =
      (item.variants && item.variants.length > 0) ||
      (item.modifier_groups && item.modifier_groups.length > 0)

    const existing = activeCart.filter((ci) => ci.menu_item_id === item.id)
    if (hasOptions && existing.length > 1) {
      handleOpenItem(item)
    } else if (existing.length === 1) {
      onUpdateCartQty(existing[0].cart_item_id, existing[0].quantity + 1)
      playSuccessSound()
    } else {
      handleQuickAddOrOpen(item)
    }
  }

  const handleDecrementItem = (item: MenuItem) => {
    const existing = activeCart.filter((ci) => ci.menu_item_id === item.id)
    if (existing.length > 0) {
      const target = existing[existing.length - 1]
      onUpdateCartQty(target.cart_item_id, target.quantity - 1)
    }
  }

  const cartSubtotal = activeCart.reduce((sum, item) => sum + item.total_price_usd, 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* 1. Left Catalog Area */}
      <div className="flex-1 space-y-4 w-full">
        {/* Navigation & Search (only shown if not controlled by parent) */}
        {externalSearchQuery === undefined && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប...' : 'Search menu item...'}
                className="w-full pl-10 pr-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
              />
            </div>
          </div>
        )}

        {/* Category Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              activeCategoryId === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-800/80'
            }`}
          >
            {language === 'km' ? 'ទាំងអស់' : 'All'}
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeCategoryId === cat.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-800/80'
              }`}
            >
              {language === 'km' && cat.name_km ? cat.name_km : cat.name_en}
            </button>
          ))}
        </div>

        {/* Dishes Grid - Dedicated Scroll Container */}
        <div className="overflow-y-auto max-h-[calc(100vh-210px)] pr-1 sm:pr-2 overscroll-contain">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-3.5 pb-8">
            {filteredCategories.flatMap((cat) =>
              cat.items.map((item) => {
                const displayName = language === 'km' && item.name_km ? item.name_km : item.name_en
                const secondaryName = language === 'km' && item.name_km ? item.name_en : null
                const cartCount = activeCart
                  .filter((ci) => ci.menu_item_id === item.id)
                  .reduce((sum, ci) => sum + ci.quantity, 0)

                return (
                  <div
                    key={item.id}
                    className="relative flex flex-col justify-between rounded-[22px] sm:rounded-[24px] border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors duration-200 overflow-hidden"
                  >
                    <div>
                      {/* 1. Food Photo Container - Non-clickable, fits flush */}
                      <div className="relative aspect-[16/10] w-full bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800/80 overflow-hidden pointer-events-none select-none">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={displayName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800/80">
                            <Utensils className="w-7 h-7 opacity-30" />
                          </div>
                        )}

                        {/* Floating Badges */}
                        <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-none">
                          {item.is_popular && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/95 backdrop-blur-xs text-white shadow-xs">
                              {language === 'km' ? 'ពេញនិយម' : 'Popular'}
                            </span>
                          )}
                          {item.is_vegetarian && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-600/95 backdrop-blur-xs text-white shadow-xs">
                              VEG
                            </span>
                          )}
                        </div>

                        {item.spicy_level && item.spicy_level > 0 && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] bg-red-500/95 backdrop-blur-xs text-white shadow-xs pointer-events-none">
                            {'🌶️'.repeat(Math.min(item.spicy_level, 3))}
                          </span>
                        )}

                        {/* Cart Quantity Badge on Photo */}
                        {cartCount > 0 && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-black font-mono bg-emerald-600 text-white shadow-md">
                            {cartCount}x
                          </span>
                        )}
                      </div>

                      {/* 2. Card Body: Title & Stacked Price (Non-clickable) */}
                      <div className="p-2.5 sm:p-3 space-y-1.5 select-none">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2">
                              {displayName}
                            </h4>
                            {secondaryName && (
                              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate block mt-0.5 font-medium">
                                {secondaryName}
                              </span>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <CurrencyDisplay
                              amountUSD={item.base_price_usd}
                              layout="stacked"
                              className="items-end text-right"
                              usdClassName="font-extrabold text-xs sm:text-sm text-zinc-950 dark:text-zinc-50 leading-tight"
                              khrClassName="text-[10px] sm:text-[11px] text-zinc-500 font-mono font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Card Footer Action: Add Button or Stepper Controls (ONLY clickable element) */}
                    <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3 pt-0">
                      {cartCount === 0 ? (
                        <button
                          type="button"
                          onClick={() => handleQuickAddOrOpen(item)}
                          className="w-full py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{language === 'km' ? 'កុម្ម៉ង់' : 'Add to Order'}</span>
                        </button>
                      ) : (
                        <div className="flex items-center justify-between w-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-0.5 sm:p-1">
                          <button
                            type="button"
                            onClick={() => handleDecrementItem(item)}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-emerald-600 hover:text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-bold text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 px-2 min-w-[20px] text-center font-mono">
                            {cartCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleIncrementItem(item)}
                            className="w-7 h-7 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 2. Right Cart / Ticket Summary - Full height container */}
      <div className="w-full lg:w-96 rounded-[22px] sm:rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shrink-0 lg:sticky lg:top-20 h-[calc(100vh-140px)] min-h-[580px] flex flex-col justify-between shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
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
              className="text-xs text-red-500 hover:underline font-medium cursor-pointer"
            >
              {language === 'km' ? 'សម្អាត' : 'Clear'}
            </button>
          )}
        </div>

        {/* Cart Item Lines - Expands to fill available vertical space */}
        <div className="flex-1 overflow-y-auto space-y-2 py-3 pr-1 overscroll-contain">
          {activeCart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-12 text-center text-xs text-zinc-400">
              <Utensils className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 mb-2 opacity-40" />
              <p>{language === 'km' ? 'សូមជ្រើសរើសមុខម្ហូបពីបញ្ជី' : 'Select dishes to add to order'}</p>
            </div>
          ) : (
            activeCart.map((item) => {
              const displayName = language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en
              const imageUrl = item.image_url || itemImageMap.get(item.menu_item_id)
              return (
                <div
                  key={item.cart_item_id}
                  className="p-2 sm:p-2.5 rounded-2xl border border-zinc-200/90 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 flex items-center gap-2.5 text-xs transition-colors"
                >
                  {/* Product Thumbnail Photo */}
                  <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden shrink-0 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Utensils className="w-5 h-5 text-zinc-400 opacity-40" />
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <span className="font-bold text-xs text-zinc-950 dark:text-zinc-50 truncate block leading-snug">
                      {displayName}
                    </span>
                    {item.variant_name && (
                      <span className="text-[11px] text-zinc-500 block leading-tight">({item.variant_name})</span>
                    )}
                    {item.modifiers.length > 0 && (
                      <span className="text-[10px] text-zinc-400 block truncate">
                        + {item.modifiers.map((m) => m.modifier_name).join(', ')}
                      </span>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${item.total_price_usd.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Quantity Controls & Remove Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => onUpdateCartQty(item.cart_item_id, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors font-bold text-xs cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-mono font-black text-xs text-zinc-900 dark:text-zinc-100">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateCartQty(item.cart_item_id, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors font-bold text-xs cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveFromCart(item.cart_item_id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      title={language === 'km' ? 'លុប' : 'Remove'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer Area: Guest Notes & Submit Order */}
        <div className="shrink-0 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          {/* Guest Notes Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {language === 'km' ? 'ចំណាំរបស់ភ្ញៀវ' : 'Guest Notes (Optional)'}
            </label>
            <input
              type="text"
              value={guestNotes}
              onChange={(e) => setGuestNotes(e.target.value)}
              placeholder={language === 'km' ? 'បញ្ចូលចំណាំតុ...' : 'Enter table notes...'}
              className="w-full px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs outline-none transition-colors"
            />
          </div>

          <div className="flex justify-between items-center text-sm font-bold">
            <span className="text-zinc-500">{language === 'km' ? 'សរុប' : 'Subtotal'}:</span>
            <CurrencyDisplay amountUSD={cartSubtotal} className="font-bold text-base" />
          </div>

          <button
            onClick={() => onSubmitOrder(courseStage, guestNotes)}
            disabled={activeCart.length === 0 || isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
            {/* Food Photo Banner */}
            {selectedMenuItem.image_url && (
              <div className="w-full h-36 rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800">
                <img
                  src={selectedMenuItem.image_url}
                  alt={selectedMenuItem.name_en}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

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
                placeholder={language === 'km' ? 'បញ្ចូលចំណាំបន្ថែមលើមុខម្ហូប...' : 'Enter special instructions...'}
                className="w-full px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs outline-none transition-colors"
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
