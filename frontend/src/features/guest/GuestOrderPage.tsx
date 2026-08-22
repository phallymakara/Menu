import { useState, useMemo, type FC } from 'react'
import { useParams } from 'react-router-dom'
import { Bell, Utensils } from 'lucide-react'
import { Category, MenuItem, PlacedOrderRound } from './types/guest.types'
import { GuestHeader } from './components/GuestHeader'
import { CategoryTabs } from './components/CategoryTabs'
import { MenuItemCard } from './components/MenuItemCard'
import { ItemCustomizerModal } from './components/ItemCustomizerModal'
import { CartFloatingBar } from './components/CartFloatingBar'
import { CartReviewSheet } from './components/CartReviewSheet'
import { OrderTimelineTracker } from './components/OrderTimelineTracker'
import { KHQRPaymentModal } from './components/KHQRPaymentModal'
import { useCartStore } from './stores/useCartStore'
import { useGuestSessionStore } from './stores/useGuestSessionStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playChime } from '@/lib/audio'

// Rich Bilingual Demonstration Catalog
const SAMPLE_CATEGORIES: Category[] = [
  {
    id: 'cat-mains',
    name_en: 'Signature Khmer Mains',
    name_km: 'មុខម្ហូបខ្មែរពិសេសប្រចាំហាង',
    display_order: 1,
    items: [
      {
        id: 'item-1',
        category_id: 'cat-mains',
        name_en: 'Lok Lak Beef with Kampot Pepper',
        name_km: 'ឡុកឡាក់សាច់គោម្រេចកំពត',
        description_en: 'Tender wok-tossed premium beef cubed with crispy salad, steamed jasmine rice, and authentic lime pepper dip.',
        description_km: 'សាច់គោផុយឆាជាមួយទឹកជ្រលក់ម្រេចកំពតក្រូចឆ្មាពិសេស អមជាមួយបាយដំណើបក្រអូប។',
        base_price_usd: 6.50,
        image_url: null,
        is_available: true,
        is_popular: true,
        variants: [
          { id: 'v1', name_en: 'Regular', name_km: 'ធម្មតា', price_usd: 6.50, is_default: true },
          { id: 'v2', name_en: 'Large (Double Meat)', name_km: 'សាច់ទ្វេដង', price_usd: 8.50, is_default: false },
        ],
        modifier_groups: [
          {
            id: 'mg-egg',
            name_en: 'Egg Option',
            name_km: 'ជម្រើសបន្ថែមស៊ុត',
            selection_type: 'SINGLE',
            min_selections: 0,
            max_selections: 1,
            is_required: false,
            options: [
              { id: 'o-fried-egg', name_en: 'Add Fried Egg (Sunny Side Up)', name_km: 'ពងទាចៀនជ័រព្នៅ', price_adjustment_usd: 0.75, is_default: false },
              { id: 'o-steamed-egg', name_en: 'Add Steamed Egg', name_km: 'ពងទាចំហុយ', price_adjustment_usd: 0.75, is_default: false },
            ],
          },
        ],
      },
      {
        id: 'item-2',
        category_id: 'cat-mains',
        name_en: 'Traditional Tonle Sap Fish Amok',
        name_km: 'អាម៉ុកត្រីទន្លេសាបបុរាណ',
        description_en: 'Fresh river fish fillet steamed in fragrant kroeung lemongrass paste and thick rich coconut cream in a fresh banana leaf bowl.',
        description_km: 'សាច់ត្រីទន្លេសាបស្រស់ចំហុយជាមួយគ្រឿងការីខ្ទិះដូងក្រអូបឈ្ងុយឆ្ងាញ់ ខ្ចប់ក្នុងកន្ទោងស្លឹកចេក។',
        base_price_usd: 7.00,
        image_url: null,
        is_available: true,
        is_popular: true,
        variants: [],
        modifier_groups: [],
      },
      {
        id: 'item-3',
        category_id: 'cat-mains',
        name_en: 'Khmer Red Chicken Curry with Baguette',
        name_km: 'ការីក្រហមសាច់មាន់នំបុ័ង',
        description_en: 'Slow-simmered organic chicken, sweet potatoes, and green beans in mild coconut red curry with crispy warm baguette.',
        description_km: 'ការីសាច់មាន់ស្រែជាមួយដំឡូងផ្អែម និងសណ្តែកកួរ អមដោយនំបុ័ងស្រួយក្តៅៗ។',
        base_price_usd: 5.50,
        image_url: null,
        is_available: true,
        spicy_level: 1,
        variants: [],
        modifier_groups: [],
      },
    ],
  },
  {
    id: 'cat-appetizers',
    name_en: 'Appetizers & Salads',
    name_km: 'ម្ហូបញ៉ាំលេង & ញាំ',
    display_order: 2,
    items: [
      {
        id: 'item-4',
        category_id: 'cat-appetizers',
        name_en: 'Crispy Deep-Fried Spring Rolls (6 pcs)',
        name_km: 'ចៃយ៉របំពងស្រួយ (៦ ដុំ)',
        description_en: 'Minced pork, taro root, carrots, and glass noodles with sweet garlic chili fish sauce.',
        description_km: 'សាច់ជ្រូកចិញ្ច្រាំ ត្រាវ និងការ៉ុតរុំបំពងស្រួយ ជ្រលក់ទឹកត្រីផ្អែមខ្ទឹមស។',
        base_price_usd: 3.50,
        image_url: null,
        is_available: true,
        variants: [],
        modifier_groups: [],
      },
      {
        id: 'item-5',
        category_id: 'cat-appetizers',
        name_en: 'Green Mango Salad with Smoked Dried Fish',
        name_km: 'ញាំស្វាយខ្ចីត្រីឆ្អើរ',
        description_en: 'Shredded crunchy sour green mango tossed with fragrant smoked fish, fresh mint, crushed roasted peanuts, and chili lime dressing.',
        description_km: 'ស្វាយខ្ចីឈូសស្រស់ច្របល់ជាមួយត្រីឆ្អើរក្រអូប ជីរនាងវង និងសណ្តែកដីលីង។',
        base_price_usd: 4.50,
        image_url: null,
        is_available: true,
        spicy_level: 2,
        variants: [],
        modifier_groups: [],
      },
    ],
  },
  {
    id: 'cat-drinks',
    name_en: 'Signature Drinks & Coffee',
    name_km: 'ភេសជ្ជៈពិសេស & កាហ្វេ',
    display_order: 3,
    items: [
      {
        id: 'item-6',
        category_id: 'cat-drinks',
        name_en: 'Iced Condensed Milk Coffee (Cafe Teuk Doh Ko Koh)',
        name_km: 'កាហ្វេទឹកដោះគោទឹកកក',
        description_en: 'Rich dark slow-dripped Robusta coffee with sweetened condensed milk over crushed ice.',
        description_km: 'កាហ្វេដិតឈ្ងុយឆ្ងាញ់ជាមួយទឹកដោះគោខាប់ និងទឹកកកឈូស។',
        base_price_usd: 2.25,
        image_url: null,
        is_available: true,
        variants: [
          { id: 'v-coffee-reg', name_en: 'Regular', name_km: 'ធម្មតា', price_usd: 2.25, is_default: true },
          { id: 'v-coffee-lrg', name_en: 'Large', name_km: 'កែវធំ', price_usd: 2.75, is_default: false },
        ],
        modifier_groups: [
          {
            id: 'mg-sugar',
            name_en: 'Sweetness Level',
            name_km: 'កម្រិតជាតិផ្អែម',
            selection_type: 'SINGLE',
            min_selections: 1,
            max_selections: 1,
            is_required: true,
            options: [
              { id: 's-100', name_en: '100% Normal Sweet', name_km: 'ផ្អែមធម្មតា (100%)', price_adjustment_usd: 0, is_default: true },
              { id: 's-50', name_en: '50% Less Sweet', name_km: 'ផ្អែមតិច (50%)', price_adjustment_usd: 0, is_default: false },
              { id: 's-0', name_en: '0% No Sugar', name_km: 'មិនផ្អែម (0%)', price_adjustment_usd: 0, is_default: false },
            ],
          },
        ],
      },
      {
        id: 'item-7',
        category_id: 'cat-drinks',
        name_en: 'Fresh Passion Fruit Soda',
        name_km: 'ផាសិនសូដាស្រស់',
        description_en: 'Real tart passion fruit pulp with sparkling soda water and a touch of mint.',
        description_km: 'សាច់ផាសិនស្រស់ជាមួយទឹកសូដា និងជីរអង្កាមត្រជាក់ស្រស់ស្រាយ។',
        base_price_usd: 2.50,
        image_url: null,
        is_available: true,
        variants: [],
        modifier_groups: [],
      },
    ],
  },
  {
    id: 'cat-desserts',
    name_en: 'Traditional Desserts',
    name_km: 'បង្អែមខ្មែរ',
    display_order: 4,
    items: [
      {
        id: 'item-8',
        category_id: 'cat-desserts',
        name_en: 'Sweet Mango Sticky Rice',
        name_km: 'បាយដំណើបស្វាយទុំ',
        description_en: 'Warm coconut sticky rice served with sweet golden mango slices and toasted sesame seeds.',
        description_km: 'បាយដំណើបខ្ទិះដូងក្តៅៗ ទទួលទានជាមួយស្វាយទុំផ្អែម និងល្ងលីង។',
        base_price_usd: 3.50,
        image_url: null,
        is_available: true,
        is_vegetarian: true,
        variants: [],
        modifier_groups: [],
      },
    ],
  },
]

export const GuestOrderPage: FC = () => {
  const { qr_token } = useParams<{ qr_token: string }>()
  const { language } = useLanguageStore()
  const { items: cartItems, clearCart } = useCartStore()
  const { orderRounds, addOrderRound, updateItemStatus } = useGuestSessionStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [isPaymentSettled, setIsPaymentSettled] = useState(false)
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null)

  // Filter items by category & search
  const filteredCategories = useMemo(() => {
    return SAMPLE_CATEGORIES.map((cat) => {
      const matchingItems = cat.items.filter((item) => {
        const matchesCategory = activeCategoryId === 'all' || cat.id === activeCategoryId
        const query = searchQuery.toLowerCase().trim()
        const matchesSearch =
          !query ||
          item.name_en.toLowerCase().includes(query) ||
          (item.name_km && item.name_km.includes(query)) ||
          (item.description_en && item.description_en.toLowerCase().includes(query))
        return matchesCategory && matchesSearch
      })
      return { ...cat, items: matchingItems }
    }).filter((cat) => cat.items.length > 0)
  }, [activeCategoryId, searchQuery])

  // Handle Order Round Submission
  const handlePlaceOrder = () => {
    if (cartItems.length === 0) return

    const newRound: PlacedOrderRound = {
      id: `round-${Date.now()}`,
      round_number: orderRounds.length + 1,
      placed_at: new Date().toISOString(),
      round_subtotal_usd: cartItems.reduce((sum, i) => sum + i.total_price_usd, 0),
      items: cartItems.map((c, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        item_name_en: c.menu_item.name_en,
        item_name_km: c.menu_item.name_km,
        variant_name_en: c.variant?.name_en || null,
        quantity: c.quantity,
        unit_price_usd: c.unit_price_usd,
        subtotal_usd: c.total_price_usd,
        course_stage: c.course_stage,
        status: 'QUEUED',
        modifiers_summary: c.selected_modifiers.map(m => m.modifier_option_name).join(', '),
      })),
    }

    addOrderRound(newRound)
    clearCart()
    setIsCartOpen(false)

    // Alert toast
    playChime(587.33, 880, 0.4)
    setNotificationMsg(language === 'km' ? 'បានបញ្ជូនការកុម្ម៉ង់ទៅផ្ទះបាយ!' : 'Order submitted to kitchen!')
    setTimeout(() => setNotificationMsg(null), 4000)

    // Simulate kitchen status progression
    setTimeout(() => {
      newRound.items.forEach((item) => updateItemStatus(item.id, 'PREPARING'))
    }, 4000)

    setTimeout(() => {
      newRound.items.forEach((item) => updateItemStatus(item.id, 'READY'))
      playChime(880, 1174.66, 0.5) // Item ready sound
    }, 10000)
  }

  const handleCallWaiter = () => {
    playChime(659.25, 880, 0.3)
    setNotificationMsg(language === 'km' ? 'បានជូនដំណឹងទៅបុគ្គលិករួចរាល់!' : 'Staff notified! Someone will assist you shortly.')
    setTimeout(() => setNotificationMsg(null), 3000)
  }

  const totalSessionUSD = orderRounds.reduce((sum, r) => sum + r.round_subtotal_usd, 0)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased pb-24">
      {/* Toast Notification Banner */}
      {notificationMsg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Bell className="w-3.5 h-3.5 text-emerald-400" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Sticky Header */}
      <GuestHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRequestBill={() => setIsPayModalOpen(true)}
        onCallWaiter={handleCallWaiter}
        hasActiveOrders={orderRounds.length > 0}
      />

      {/* Category Tabs */}
      <CategoryTabs
        categories={SAMPLE_CATEGORIES}
        activeCategoryId={activeCategoryId}
        onSelectCategory={setActiveCategoryId}
      />

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Active Order Tracker (if orders exist) */}
        {orderRounds.length > 0 && (
          <OrderTimelineTracker
            rounds={orderRounds}
            onOrderMore={() => {
              const menuElem = document.getElementById('menu-items-catalog')
              menuElem?.scrollIntoView({ behavior: 'smooth' })
            }}
            onRequestBill={() => setIsPayModalOpen(true)}
          />
        )}

        {/* Catalog Items by Category */}
        <div id="menu-items-catalog" className="space-y-8">
          {filteredCategories.map((cat) => (
            <div key={cat.id} className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-zinc-200 dark:border-zinc-800">
                <Utensils className="w-3.5 h-3.5 text-emerald-600" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {language === 'km' && cat.name_km ? cat.name_km : cat.name_en}
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {cat.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onSelect={setSelectedMenuItem}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Item Customizer Modal */}
      <ItemCustomizerModal
        item={selectedMenuItem}
        isOpen={!!selectedMenuItem}
        onClose={() => setSelectedMenuItem(null)}
      />

      {/* Floating Bottom Cart Bar */}
      <CartFloatingBar
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Slide-Up Cart Review Sheet */}
      <CartReviewSheet
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onSubmitOrder={handlePlaceOrder}
      />

      {/* Bakong KHQR Payment Modal */}
      <KHQRPaymentModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        totalUSD={totalSessionUSD}
        tableNumber={qr_token?.replace('table-', '') || '08'}
        isSettled={isPaymentSettled}
        onSimulateSettlement={() => setIsPaymentSettled(true)}
      />
    </div>
  )
}
