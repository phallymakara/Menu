import { useState, useMemo, useEffect, useCallback, type FC } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Bell, Utensils, RefreshCw, AlertCircle } from 'lucide-react'
import { Category, MenuItem, PlacedOrderRound, TableContextInfo } from './types/guest.types'
import { GuestHeader } from './components/GuestHeader'
import { CategoryTabs } from './components/CategoryTabs'
import { MenuItemCard } from './components/MenuItemCard'
import { ItemCustomizerModal } from './components/ItemCustomizerModal'
import { CartFloatingBar } from './components/CartFloatingBar'
import { CartReviewSheet } from './components/CartReviewSheet'
import { OrderTimelineTracker } from './components/OrderTimelineTracker'
import { KHQRPaymentModal } from './components/KHQRPaymentModal'
import { GuestServiceRequestModal } from '@/features/service-hub/components/GuestServiceRequestModal'
import { GuestActiveRequestBanner } from '@/features/service-hub/components/GuestActiveRequestBanner'
import { ServiceRequestType, ServiceRequest } from '@/features/service-hub/types/serviceHub.types'
import { useServiceHubStore } from '@/features/service-hub/stores/useServiceHubStore'
import { useCartStore } from './stores/useCartStore'
import { useGuestSessionStore } from './stores/useGuestSessionStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playChime } from '@/lib/audio'
import { api } from '@/lib/api'
import { useWebSocket } from '@/lib/websocket'

// Fallback Rich Bilingual Demonstration Catalog for Demo & Sandbox
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
    id: 'cat-drinks',
    name_en: 'Signature Drinks & Coffee',
    name_km: 'ភេសជ្ជៈពិសេស & កាហ្វេ',
    display_order: 2,
    items: [
      {
        id: 'item-6',
        category_id: 'cat-drinks',
        name_en: 'Iced Condensed Milk Coffee',
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
]

export const GuestOrderPage: FC = () => {
  const { branch_id: routeBranchId, qr_token } = useParams<{ branch_id?: string; qr_token?: string }>()
  const [searchParams] = useSearchParams()
  const tableIdParam = searchParams.get('table')
  const tokenParam = searchParams.get('token')

  const { language } = useLanguageStore()
  const { items: cartItems, clearCart } = useCartStore()
  const {
    table,
    sessionId,
    sessionToken,
    orderRounds,
    setTableContext,
    addOrderRound,
    setOrderRounds,
    updateItemStatus,
  } = useGuestSessionStore()

  // State
  const [categories, setCategories] = useState<Category[]>(SAMPLE_CATEGORIES)
  const [isLoading, setIsLoading] = useState(true)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [isPaymentSettled, setIsPaymentSettled] = useState(false)
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null)

  // Determine Branch ID, Table ID, and Token from route or query params
  const effectiveBranchId = routeBranchId || searchParams.get('branch_id')
  const effectiveTableId = tableIdParam
  const effectiveToken = tokenParam || qr_token
  const isDemo = !effectiveBranchId || effectiveToken?.includes('demo')

  // 1. Table Verification & Session Initialization
  const initializeTableSession = useCallback(async () => {
    setIsLoading(true)
    setVerifyError(null)

    if (isDemo) {
      // Demo Table Fallback
      const demoTableContext: TableContextInfo = {
        table_id: 'demo-table-08',
        table_number: '08',
        table_name: 'Terrace Table 08',
        dining_area_name: 'Outdoor Patio',
        business_id: 'demo-biz',
        business_name: 'Siem Reap Bistro',
        branch_id: 'demo-branch',
        branch_name: 'Main Branch',
        exchange_rate: 4100,
        tax_percentage: 10,
        is_tax_inclusive: false,
        service_charge_percentage: 0,
        is_service_charge_inclusive: false,
        bakong_account_id: 'bistro_sr@aclb',
        bakong_merchant_name: 'Siem Reap Bistro',
      }
      setTableContext('demo-token', demoTableContext, 'demo-session-1', 'demo-session-token-1', 'DEMO-8')
      setCategories(SAMPLE_CATEGORIES)
      setIsLoading(false)
      return
    }

    try {
      // Verify Table QR
      const verifyRes = await api.get('/public/tables/verify', {
        params: {
          branch_id: effectiveBranchId,
          table_id: effectiveTableId,
          token: effectiveToken,
        },
      })

      const verifyData = verifyRes.data
      const tableContext: TableContextInfo = {
        table_id: verifyData.table_id,
        table_number: verifyData.table_number,
        table_name: verifyData.table_name,
        dining_area_name: language === 'km' && verifyData.dining_area_name_km ? verifyData.dining_area_name_km : verifyData.dining_area_name_en,
        business_id: verifyData.business_id,
        business_name: verifyData.business_name_en,
        branch_id: verifyData.branch_id,
        branch_name: verifyData.branch_name_en,
        exchange_rate: 4100,
        tax_percentage: 10,
        is_tax_inclusive: false,
        service_charge_percentage: 0,
        is_service_charge_inclusive: false,
        bakong_account_id: null,
        bakong_merchant_name: verifyData.business_name_en,
      }

      // Open or Connect to Active Table Session
      const sessionRes = await api.post(
        '/public/tables/sessions/open',
        { guest_count: 2 },
        {
          params: {
            branch_id: effectiveBranchId,
            table_id: effectiveTableId,
            token: effectiveToken,
          },
        }
      )

      const sessionData = sessionRes.data
      setTableContext(
        effectiveToken || '',
        tableContext,
        sessionData.id,
        sessionData.session_token,
        sessionData.session_code || sessionData.id?.slice(0, 6)
      )

      // Fetch Live Catalog
      const [catRes, itemRes] = await Promise.all([
        api.get(`/businesses/${verifyData.business_id}/categories`).catch(() => ({ data: [] })),
        api.get(`/businesses/${verifyData.business_id}/items`).catch(() => ({ data: [] })),
      ])

      const rawCats: Array<{ id: string; name_en: string; name_km: string | null; display_order: number }> = catRes.data || []
      const rawItems: Array<{
        id: string
        category_id: string
        name_en: string
        name_km: string | null
        description_en: string | null
        description_km: string | null
        base_price_usd: number
        image_url: string | null
        is_available: boolean
        spicy_level?: number
        is_vegetarian?: boolean
        variants?: Array<{ id: string; name_en: string; name_km: string | null; price_usd: number; is_default: boolean }>
        modifier_groups?: Array<any>
      }> = itemRes.data || []

      if (rawCats.length > 0 || rawItems.length > 0) {
        const builtCategories: Category[] = rawCats.map((c) => ({
          id: c.id,
          name_en: c.name_en,
          name_km: c.name_km,
          display_order: c.display_order,
          items: rawItems
            .filter((i) => i.category_id === c.id)
            .map((i) => ({
              id: i.id,
              category_id: i.category_id,
              name_en: i.name_en,
              name_km: i.name_km,
              description_en: i.description_en,
              description_km: i.description_km,
              base_price_usd: Number(i.base_price_usd) || 0,
              image_url: i.image_url,
              is_available: i.is_available ?? true,
              spicy_level: i.spicy_level,
              is_vegetarian: i.is_vegetarian,
              variants: (i.variants || []).map((v) => ({
                id: v.id,
                name_en: v.name_en,
                name_km: v.name_km,
                price_usd: Number(v.price_usd) || 0,
                is_default: v.is_default ?? false,
              })),
              modifier_groups: i.modifier_groups || [],
            })),
        }))
        setCategories(builtCategories)
      } else {
        setCategories([])
      }

      // Fetch existing session orders if any
      const ordersRes = await api.get('/public/tables/sessions/orders', {
        params: {
          branch_id: effectiveBranchId,
          table_id: effectiveTableId,
          token: effectiveToken,
        },
      }).catch(() => null)

      if (ordersRes?.data?.orders) {
        const formattedRounds: PlacedOrderRound[] = ordersRes.data.orders.map((o: any, idx: number) => ({
          id: o.id || `order-${idx}`,
          round_number: o.round_number || idx + 1,
          placed_at: o.created_at || new Date().toISOString(),
          round_subtotal_usd: Number(o.subtotal_usd) || 0,
          items: (o.items || []).map((it: any) => ({
            id: it.id,
            item_name_en: it.item_name_en,
            item_name_km: it.item_name_km,
            variant_name_en: it.variant_name_en,
            quantity: it.quantity,
            unit_price_usd: Number(it.unit_price) || 0,
            subtotal_usd: Number(it.subtotal_price) || 0,
            course_stage: it.course_stage || 'MAINS',
            status: it.status || 'QUEUED',
            modifiers_summary: (it.modifiers || []).map((m: any) => m.name_en).join(', '),
          })),
        }))
        setOrderRounds(formattedRounds)
      }
    } catch (err: any) {
      const msg =
        language === 'km'
          ? 'មិនអាចស្វែងរកតុនេះបានទេ។ សូមទាក់ទងបុគ្គលិកដើម្បីទទួលបាន QR កូដត្រឹមត្រូវ។'
          : 'Could not verify table QR code. Please ask our staff for assistance.'
      setVerifyError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [effectiveBranchId, effectiveTableId, effectiveToken, isDemo, language, setOrderRounds, setTableContext])

  useEffect(() => {
    initializeTableSession()
  }, [initializeTableSession])

  // 2. Real-Time WebSocket Listener
  const wsUrl = sessionId && sessionToken ? `/ws/sessions/${sessionId}?session_token=${sessionToken}` : null
  useWebSocket(wsUrl, {
    autoConnect: !!wsUrl,
    onMessage: (rawMsg) => {
      try {
        const data = typeof rawMsg === 'object' && rawMsg !== null ? (rawMsg as any) : {}
        if (data.event === 'order_status_update' && data.item_id && data.status) {
          updateItemStatus(data.item_id, data.status)
        } else if (data.event === 'payment_confirmed') {
          setIsPaymentSettled(true)
          playChime(880, 1174.66, 0.5)
        } else if (data.event === 'bill_ack') {
          setNotificationMsg(language === 'km' ? 'បុគ្គលិកកំពុងមកគិតប្រាក់ជូនលោកអ្នក' : 'Staff is coming to your table.')
          setTimeout(() => setNotificationMsg(null), 4000)
        }
      } catch (err) {
        console.warn('WS message parse error', err)
      }
    },
  })

  // Filter items by category & search
  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => {
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
      })
      .filter((cat) => cat.items.length > 0)
  }, [categories, activeCategoryId, searchQuery])

  // 3. Handle Order Submission to Backend
  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return
    setIsSubmittingOrder(true)
    setOrderError(null)

    if (isDemo) {
      // Demo Order Submission
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
          modifiers_summary: c.selected_modifiers.map((m) => m.modifier_option_name).join(', '),
        })),
      }

      addOrderRound(newRound)
      clearCart()
      setIsCartOpen(false)
      setIsSubmittingOrder(false)

      playChime(587.33, 880, 0.4)
      setNotificationMsg(language === 'km' ? 'បានបញ្ជូនការកុម្ម៉ង់ទៅផ្ទះបាយ!' : 'Order submitted to kitchen!')
      setTimeout(() => setNotificationMsg(null), 4000)

      setTimeout(() => {
        newRound.items.forEach((item) => updateItemStatus(item.id, 'PREPARING'))
      }, 4000)
      setTimeout(() => {
        newRound.items.forEach((item) => updateItemStatus(item.id, 'READY'))
        playChime(880, 1174.66, 0.5)
      }, 10000)
      return
    }

    try {
      const orderPayload = {
        guest_notes: '',
        items: cartItems.map((c) => ({
          menu_item_id: c.menu_item.id,
          item_variant_id: c.variant?.id || null,
          quantity: c.quantity,
          course_stage: c.course_stage,
          special_instructions: c.special_instructions || null,
          modifiers: c.selected_modifiers.map((m) => ({
            modifier_option_id: m.modifier_option_id,
            quantity: 1,
          })),
        })),
      }

      const res = await api.post('/public/tables/orders', orderPayload, {
        params: {
          branch_id: effectiveBranchId,
          table_id: effectiveTableId,
          token: effectiveToken,
        },
      })

      const placedOrder = res.data
      const newRound: PlacedOrderRound = {
        id: placedOrder.id,
        round_number: placedOrder.round_number || orderRounds.length + 1,
        placed_at: placedOrder.created_at || new Date().toISOString(),
        round_subtotal_usd: Number(placedOrder.subtotal_usd) || cartItems.reduce((sum, i) => sum + i.total_price_usd, 0),
        items: (placedOrder.items || []).map((it: any) => ({
          id: it.id,
          item_name_en: it.item_name_en,
          item_name_km: it.item_name_km,
          variant_name_en: it.variant_name_en,
          quantity: it.quantity,
          unit_price_usd: Number(it.unit_price) || 0,
          subtotal_usd: Number(it.subtotal_price) || 0,
          course_stage: it.course_stage || 'MAINS',
          status: it.status || 'QUEUED',
          modifiers_summary: (it.modifiers || []).map((m: any) => m.name_en).join(', '),
        })),
      }

      addOrderRound(newRound)
      clearCart()
      setIsCartOpen(false)

      playChime(587.33, 880, 0.4)
      setNotificationMsg(language === 'km' ? 'បានបញ្ជូនការកុម្ម៉ង់ទៅផ្ទះបាយ!' : 'Order submitted to kitchen!')
      setTimeout(() => setNotificationMsg(null), 4000)
    } catch (err: any) {
      setOrderError(
        language === 'km'
          ? 'មិនអាចបញ្ជូនការកុម្ម៉ង់បានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not submit your order. Please try again.'
      )
    } finally {
      setIsSubmittingOrder(false)
    }
  }

  // 4. Handle Request Bill
  const handleRequestBill = async () => {
    if (!isDemo && effectiveBranchId && effectiveTableId && effectiveToken) {
      await api.post(
        '/public/tables/sessions/request-bill',
        {},
        {
          params: {
            branch_id: effectiveBranchId,
            table_id: effectiveTableId,
            token: effectiveToken,
          },
        }
      ).catch(() => null)
    }
    setIsPayModalOpen(true)
  }

  // Service Hub Store
  const {
    isRequestModalOpen,
    openRequestModal,
    closeRequestModal,
    activeCustomerRequest,
    setCustomerRequest,
    addRequest,
  } = useServiceHubStore()

  // 5. Handle Call Waiter / Service Request Trigger
  const handleCallWaiter = () => {
    openRequestModal()
  }

  const handleSendServiceRequest = async (requestType: ServiceRequestType, note: string) => {
    const newReq: ServiceRequest = {
      id: `req-${Date.now()}`,
      table_id: table?.table_id || 'tbl-demo',
      table_number: table?.table_number || '08',
      dining_area_name: table?.dining_area_name || 'Main Hall',
      request_type: requestType,
      note: note || null,
      status: 'PENDING',
      requested_at: new Date().toISOString(),
    }

    setCustomerRequest(newReq)
    addRequest(newReq)
    playChime(659.25, 880, 0.3)

    if (effectiveToken && effectiveTableId) {
      await api.post(
        '/public/tables/sessions/call-waiter',
        {
          request_type: requestType,
          note: note || null,
        },
        {
          params: {
            branch_id: effectiveBranchId,
            table_id: effectiveTableId,
            token: effectiveToken,
          },
        }
      ).catch(() => null)
    }
  }

  const totalSessionUSD = orderRounds.reduce((sum, r) => sum + r.round_subtotal_usd, 0)
  const totalItemsCount = categories.reduce((sum, c) => sum + c.items.length, 0)

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <RefreshCw className="w-6 h-6 text-zinc-400 animate-spin" />
        <p className="text-xs text-zinc-500">
          {language === 'km' ? 'កំពុងភ្ជាប់ទៅកាន់តុ...' : 'Connecting to your table...'}
        </p>
      </div>
    )
  }

  // Verification Error Screen (No Technical Words, No Colored Outer Box, Clean Inline Text)
  if (verifyError) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-sm mx-auto">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {language === 'km' ? 'មិនអាចបើកម៉ឺនុយបានទេ' : 'Unable to Open Menu'}
          </h2>
          <p className="text-xs text-red-500 leading-relaxed">
            {verifyError}
          </p>
        </div>
        <button
          onClick={initializeTableSession}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
        >
          {language === 'km' ? 'ព្យាយាមម្តងទៀត' : 'Try Again'}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased pb-24">
      {/* Toast Notification Banner */}
      {notificationMsg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold border border-zinc-800 dark:border-zinc-200 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Bell className="w-3.5 h-3.5 text-emerald-400" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Sticky Header */}
      <GuestHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRequestBill={handleRequestBill}
        onCallWaiter={handleCallWaiter}
        hasActiveOrders={orderRounds.length > 0}
      />

      {/* Category Tabs (if items exist) */}
      {totalItemsCount > 0 && (
        <CategoryTabs
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />
      )}

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Inline Order Placement Error (No Outer Box Container, Plain Red Text) */}
        {orderError && (
          <p className="text-xs text-red-500 text-center font-medium">
            {orderError}
          </p>
        )}

        {/* Active Order Tracker (if orders exist) */}
        {orderRounds.length > 0 && (
          <OrderTimelineTracker
            rounds={orderRounds}
            onOrderMore={() => {
              const menuElem = document.getElementById('menu-items-catalog')
              menuElem?.scrollIntoView({ behavior: 'smooth' })
            }}
            onRequestBill={handleRequestBill}
          />
        )}

        {/* Empty Catalog State Banner (Zero Shadow, Clean Flat Minimalist) */}
        {totalItemsCount === 0 ? (
          <div className="p-8 text-center space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="w-12 h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
              <Utensils className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'ម៉ឺនុយកំពុងរៀបចំ' : 'Menu is Being Prepared'}
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                {language === 'km'
                  ? 'ភោជនីយដ្ឋានមិនទាន់បានបញ្ចូលមុខម្ហូបនៅឡើយទេ។ សូមទាក់ទងបុគ្គលិកបម្រើផ្ទាល់។'
                  : 'No items are available right now. Please ask our staff for assistance.'}
              </p>
            </div>
            <button
              onClick={handleCallWaiter}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
            >
              {language === 'km' ? '🔔 ហៅបុគ្គលិកបម្រើ' : '🔔 Call Staff'}
            </button>
          </div>
        ) : (
          /* Catalog Items by Category */
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
        )}
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
        isSubmitting={isSubmittingOrder}
      />

      {/* Bakong KHQR Payment Modal */}
      <KHQRPaymentModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        totalUSD={totalSessionUSD}
        tableNumber={table?.table_number || '08'}
        merchantName={table?.bakong_merchant_name || table?.business_name || 'Bistro'}
        isSettled={isPaymentSettled}
        onSimulateSettlement={() => setIsPaymentSettled(true)}
      />

      {/* Guest Active Service Request Status Banner */}
      <GuestActiveRequestBanner
        request={activeCustomerRequest}
        onDismiss={() => setCustomerRequest(null)}
      />

      {/* Guest Service Request Modal */}
      <GuestServiceRequestModal
        isOpen={isRequestModalOpen}
        onClose={closeRequestModal}
        tableNumber={table?.table_number || '08'}
        onSubmitRequest={handleSendServiceRequest}
      />
    </div>
  )
}
