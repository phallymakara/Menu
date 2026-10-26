import { useState, useMemo, useEffect, useRef, type FC } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Bell, Utensils, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import { Category, MenuItem, CourseStage, PlacedOrderRound, TableContextInfo } from './types/guest.types'
import { GuestHeader } from './components/GuestHeader'
import { MenuItemCard } from './components/MenuItemCard'
import { ItemCustomizerModal } from './components/ItemCustomizerModal'
import { CartFloatingBar } from './components/CartFloatingBar'
import { CartReviewSheet } from './components/CartReviewSheet'
import { KHQRPaymentModal } from './components/KHQRPaymentModal'
import { GuestServiceRequestModal } from '@/features/service-hub/components/GuestServiceRequestModal'
import { GuestActiveRequestBanner } from '@/features/service-hub/components/GuestActiveRequestBanner'
import type {
  GuestServiceRequest,
  ServiceRequestType,
} from '@/features/service-hub/types/serviceHub.types'
import { useServiceHubStore } from '@/features/service-hub/stores/useServiceHubStore'
import {
  serviceRequestKeys,
  useCreateGuestServiceRequest,
  useGuestServiceRequests,
} from '@/features/service-hub/hooks/useServiceRequestQueries'
import {
  bannerDismissKey,
  isServiceRequestEvent,
  parseServiceHubEvent,
  pickGuestBannerRequest,
} from '@/features/service-hub/utils/serviceRequests'
import { useCartStore } from './stores/useCartStore'
import { useGuestSessionStore } from './stores/useGuestSessionStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playChime, playSuccessSound } from '@/lib/audio'
import { useWebSocket } from '@/lib/websocket'
import {
  useVerifyTable,
  useOpenTableSession,
  useGuestCatalog,
  useGuestSessionOrders,
  useCreateGuestOrder,
  useRequestBill,
  useGuestSessionBill,
} from './hooks/useGuestOrderQueries'

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

// Demo route only: how long until the simulated staff member takes a service request
const DEMO_ACKNOWLEDGE_DELAY_MS = 5000

export const GuestOrderPage: FC = () => {
  const { branch_id: routeBranchId, qr_token } = useParams<{ branch_id?: string; qr_token?: string }>()
  const [searchParams] = useSearchParams()
  const tableIdParam = searchParams.get('table')
  const tokenParam = searchParams.get('token')

  const { language, t } = useLanguageStore()
  const { items: cartItems, clearCart } = useCartStore()
  const {
    table,
    sessionId,
    sessionToken,
    sessionCode,
    orderRounds,
    setTableContext,
    addOrderRound,
    setOrderRounds,
    updateItemStatus,
    updateRoundStatus,
  } = useGuestSessionStore()

  // State
  const [categories, setCategories] = useState<Category[]>(SAMPLE_CATEGORIES)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [isPaymentSettled, setIsPaymentSettled] = useState(false)
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null)
  const [notificationType, setNotificationType] = useState<'info' | 'success' | 'error'>('info')

  // Determine Branch ID, Table ID, and Token from route or query params
  const effectiveBranchId = routeBranchId || searchParams.get('branch_id')
  const effectiveTableId = tableIdParam
  const effectiveToken = tokenParam || qr_token
  const isDemo = !effectiveBranchId || effectiveToken?.includes('demo')

  const queryClient = useQueryClient()
  const tokenVal = !isDemo && effectiveToken ? effectiveToken : null

  // 1. TanStack Query Hooks
  const {
    data: verifyData,
    isLoading: isVerifyLoading,
    error: verifyQueryError,
  } = useVerifyTable(
    !isDemo ? effectiveBranchId : null,
    !isDemo ? effectiveTableId : null,
    tokenVal
  )

  const openSessionMutation = useOpenTableSession()
  const createGuestOrderMutation = useCreateGuestOrder()
  const requestBillMutation = useRequestBill()

  const activeBusinessId = !isDemo ? (verifyData?.business_id || table?.business_id || null) : null
  const { data: catalogData, isLoading: isCatalogLoading } = useGuestCatalog(
    activeBusinessId,
    !isDemo ? effectiveBranchId : null,
    !isDemo ? effectiveTableId : null,
    tokenVal
  )

  const { data: sessionOrdersData } = useGuestSessionOrders(
    !isDemo ? effectiveBranchId : null,
    !isDemo ? effectiveTableId : null,
    tokenVal
  )
  const { data: sessionBillData } = useGuestSessionBill(!isDemo ? sessionToken : null)

  // Service hub: live requests of this table session. Works whether table is in-use or free.
  const guestTableSession = {
    branchId: !isDemo ? effectiveBranchId : null,
    tableId: !isDemo ? effectiveTableId : null,
    sessionId: !isDemo ? sessionId : null,
    sessionToken: !isDemo ? sessionToken : null,
    qrToken: !isDemo ? effectiveToken : null,
  }
  const { data: guestServiceRequests } = useGuestServiceRequests(guestTableSession)
  const createServiceRequestMutation = useCreateGuestServiceRequest(guestTableSession)
  const [demoServiceRequest, setDemoServiceRequest] = useState<GuestServiceRequest | null>(null)
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null)

  const isLoading = !isDemo && (isVerifyLoading || isCatalogLoading) && categories.length === 0
  const verifyError = !isDemo && verifyQueryError
    ? (language === 'km'
        ? 'មិនអាចស្វែងរកតុនេះបានទេ។ សូមទាក់ទងបុគ្គលិកដើម្បីទទួលបាន QR កូដត្រឹមត្រូវ។'
        : 'Could not verify table QR code. Please ask our staff for assistance.')
    : null

  // Initialize Demo Session
  useEffect(() => {
    if (isDemo) {
      const demoTableContext: TableContextInfo = {
        table_id: 'demo-table-01',
        table_number: 'T-01',
        table_name: 'Table T-01',
        dining_area_name: 'Main Indoor Hall',
        business_id: 'demo-biz',
        business_name: 'Brojane Coffee & Kitchen',
        branch_id: 'demo-branch',
        branch_name: 'Main Branch',
        exchange_rate: 4100,
        tax_percentage: 10,
        is_tax_inclusive: false,
        service_charge_percentage: 0,
        is_service_charge_inclusive: false,
        bakong_account_id: 'brojane@aclb',
        bakong_merchant_name: 'Brojane Coffee & Kitchen',
      }
      setTableContext('demo-token', demoTableContext, 'demo-session-1', 'demo-session-token-1', 'DEMO-8')
      setCategories(SAMPLE_CATEGORIES)
    }
  }, [isDemo, setTableContext])

  // Demo route only: a staff member "takes" the request after a few seconds
  useEffect(() => {
    if (!demoServiceRequest || demoServiceRequest.status !== 'open') return
    const timer = window.setTimeout(() => {
      setDemoServiceRequest((current) =>
        current && current.id === demoServiceRequest.id
          ? { ...current, status: 'acknowledged', acknowledged_at: new Date().toISOString() }
          : current
      )
    }, DEMO_ACKNOWLEDGE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [demoServiceRequest])

  const isOpeningSessionRef = useRef(false)

  // Sync Live Table Context & Open Session
  useEffect(() => {
    if (!isDemo && verifyData) {
      const resolvedLogo =
        (verifyData as any)?.logo_url ||
        catalogData?.store?.logo_url ||
        table?.logo_url ||
        null

      const tableContext: TableContextInfo = {
        table_id: verifyData.table_id,
        table_number: verifyData.table_number,
        table_name: verifyData.table_name || null,
        dining_area_name:
          (language === 'km' && verifyData.dining_area_name_km
            ? verifyData.dining_area_name_km
            : verifyData.dining_area_name_en) || null,
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
        logo_url: resolvedLogo,
      }

      if (sessionId && table && resolvedLogo && table.logo_url !== resolvedLogo) {
        setTableContext(
          effectiveToken || '',
          { ...table, logo_url: resolvedLogo },
          sessionId,
          sessionToken,
          sessionCode
        )
      }

      if (!sessionId && effectiveBranchId && effectiveTableId && effectiveToken && !isOpeningSessionRef.current) {
        isOpeningSessionRef.current = true
        openSessionMutation
          .mutateAsync({
            branchId: effectiveBranchId,
            tableId: effectiveTableId,
            token: effectiveToken,
            guestCount: 2,
          })
          .then((sessionData) => {
            setTableContext(
              effectiveToken || '',
              tableContext,
              sessionData.id,
              sessionData.session_token,
              sessionData.session_code || sessionData.id?.slice(0, 6)
            )
          })
          .catch((err) => {
            console.warn('Could not auto-open session', err)
          })
          .finally(() => {
            isOpeningSessionRef.current = false
          })
      }
    }
  }, [
    isDemo,
    verifyData,
    sessionId,
    effectiveBranchId,
    effectiveTableId,
    effectiveToken,
    language,
    openSessionMutation,
    setTableContext,
  ])

  // Sync Live Catalog into Category state
  useEffect(() => {
    if (!isDemo && catalogData) {
      const rawCats = catalogData.categories || []
      const rawItems = catalogData.items || []

      if (rawCats.length > 0 || rawItems.length > 0) {
        const builtCategories: Category[] = rawCats.map((c: any) => ({
          id: c.id,
          name_en: c.name_en,
          name_km: c.name_km || c.name_en,
          display_order: c.display_order ?? 0,
          items: rawItems
            .filter((i: any) => i.category_id === c.id)
            .map((i: any) => ({
              id: i.id,
              category_id: i.category_id,
              name_en: i.name_en,
              name_km: i.name_km || i.name_en,
              description_en: i.description_en || '',
              description_km: i.description_km || '',
              base_price_usd: Number(i.base_price ?? i.base_price_usd ?? i.price ?? 0),
              image_url: i.image_url || null,
              is_available: i.is_available ?? true,
              spicy_level: i.spicy_level,
              is_popular: i.is_popular,
              is_vegetarian: i.is_vegetarian,
              variants: (i.variants || []).map((v: any) => ({
                id: v.id,
                name_en: v.name_en,
                name_km: v.name_km,
                price_usd: Number(v.price ?? v.price_usd ?? v.price_adjustment ?? 0),
                is_default: v.is_default ?? false,
              })),
              modifier_groups: i.modifier_groups || [],
            })),
        }))
        setCategories(builtCategories)
      } else {
        // Fallback to SAMPLE_CATEGORIES so food container never disappears
        setCategories(SAMPLE_CATEGORIES)
      }
    }
  }, [isDemo, catalogData])

  // Sync Live Session Orders
  useEffect(() => {
    if (!isDemo && sessionOrdersData?.orders) {
      const formattedRounds: PlacedOrderRound[] = sessionOrdersData.orders.map((o: any, idx: number) => ({
        id: o.id || `order-${idx}`,
        round_number: o.round_number || idx + 1,
        placed_at: o.created_at || new Date().toISOString(),
        round_subtotal_usd: Number(o.subtotal_usd) || 0,
        status: o.status,
        reject_reason: o.reject_reason || null,
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
  }, [isDemo, sessionOrdersData, setOrderRounds])

  const orderRoundsCountRef = useRef(orderRounds.length)
  useEffect(() => {
    orderRoundsCountRef.current = orderRounds.length
  }, [orderRounds.length])

  // Revert table status to available if guest leaves the food menu view without ordering
  useEffect(() => {
    if (isDemo || !effectiveBranchId || !effectiveTableId || !effectiveToken) return

    const sendLeaveBeacon = () => {
      if (orderRoundsCountRef.current === 0) {
        const url = `/api/v1/public/tables/sessions/leave?branch_id=${effectiveBranchId}&table_id=${effectiveTableId}&token=${encodeURIComponent(effectiveToken)}${sessionId ? `&session_id=${sessionId}` : ''}`
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url)
        } else {
          fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
        }
      }
    }

    window.addEventListener('pagehide', sendLeaveBeacon)
    window.addEventListener('beforeunload', sendLeaveBeacon)

    return () => {
      window.removeEventListener('pagehide', sendLeaveBeacon)
      window.removeEventListener('beforeunload', sendLeaveBeacon)
      sendLeaveBeacon()
    }
  }, [isDemo, effectiveBranchId, effectiveTableId, effectiveToken, sessionId])

  // 2. Real-Time WebSocket Listener
  const wsUrl = sessionId && sessionToken ? `/ws/sessions/${sessionId}?session_token=${sessionToken}` : null
  useWebSocket(wsUrl, {
    autoConnect: !!wsUrl,
    onMessage: (rawMsg) => {
      if (isServiceRequestEvent(parseServiceHubEvent(rawMsg))) {
        queryClient.invalidateQueries({ queryKey: serviceRequestKeys.guest(sessionId) })
        return
      }
      try {
        const data = typeof rawMsg === 'object' && rawMsg !== null ? (rawMsg as any) : {}
        const evt = String(data.event || data.type || '').toLowerCase()

        if (evt === 'menu.updated' || evt === 'category.updated') {
          queryClient.invalidateQueries({ queryKey: ['guest', 'catalog'] })
          queryClient.invalidateQueries({ queryKey: ['guest-catalog'] })
        } else if (evt === 'store.updated') {
          queryClient.invalidateQueries({ queryKey: ['table-verify'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'catalog'] })
          if (data?.logo_url && table) {
            setTableContext(
              effectiveToken || '',
              { ...table, logo_url: data.logo_url },
              sessionId,
              sessionToken,
              sessionCode
            )
          }
        } else if (evt === 'order.accepted') {
          if (data?.order_id) {
            updateRoundStatus(data.order_id, 'preparing')
          }
          queryClient.invalidateQueries({ queryKey: ['guest', 'session-orders'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'orders'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'bill'] })
          playSuccessSound()
          setNotificationType('success')
          setNotificationMsg(
            language === 'km'
              ? (data?.message_km || 'ផ្ទះបាយបានទទួលការកុម្ម៉ង់របស់អ្នកហើយ! កំពុងចាប់ផ្តើមរៀបចំជូនលោកអ្នក...')
              : (data?.message_en || 'The kitchen has accepted your order! We are preparing your food...')
          )
          setTimeout(() => setNotificationMsg(null), 7000)
        } else if (evt === 'order.rejected') {
          if (data?.order_id) {
            updateRoundStatus(data.order_id, 'cancelled', data?.reason)
          }
          queryClient.invalidateQueries({ queryKey: ['guest', 'session-orders'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'orders'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'bill'] })
          playChime(350, 220, 0.5)
          setNotificationType('error')
          const baseMsg = language === 'km'
            ? (data?.message_km || 'សូមអភ័យទោស ការកុម្ម៉ង់របស់អ្នកត្រូវបានបដិសេធពីផ្ទះបាយ។')
            : (data?.message_en || 'Sorry, your order was rejected by the kitchen.')
          const reasonNote = data?.reason
            ? (language === 'km' ? ` (មូលហេតុ៖ ${data.reason})` : ` (Reason: ${data.reason})`)
            : ''
          setNotificationMsg(`${baseMsg}${reasonNote}`)
          setTimeout(() => setNotificationMsg(null), 9000)
        } else if (
          evt === 'order.created' ||
          evt === 'order.placed' ||
          evt === 'order_status_update' ||
          evt === 'order.item_bumped' ||
          evt === 'order.bumped' ||
          evt === 'order.course_fired'
        ) {
          queryClient.invalidateQueries({ queryKey: ['guest', 'session-orders'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'orders'] })
          queryClient.invalidateQueries({ queryKey: ['guest', 'bill'] })

          const itemId = data.order_item_id || data.item_id
          const rawStatus = String(data.status || data.target_status || '').toUpperCase()
          if (itemId && rawStatus) {
            updateItemStatus(itemId, rawStatus as any)
          }

          const itemName = language === 'km' && data.item_name_km ? data.item_name_km : (data.item_name_en || '')
          if (rawStatus === 'PREPARING' || rawStatus === 'IN_PREP') {
            playChime(587.33, 880, 0.45)
            setNotificationMsg(
              language === 'km'
                ? `ផ្ទះបាយបានទទួល ${itemName ? `"${itemName}" ` : ''}ហើយកំពុងរៀបចំជូនលោកអ្នក`
                : `Kitchen received ${itemName ? `"${itemName}" ` : 'your order'} and is preparing it`
            )
            setTimeout(() => setNotificationMsg(null), 5000)
          } else if (rawStatus === 'READY') {
            playSuccessSound()
            setNotificationMsg(
              language === 'km'
                ? `មុខម្ហូប ${itemName ? `"${itemName}" ` : ''}រួចរាល់ហើយ! បុគ្គលិកកំពុងយកមកជូនលោកអ្នក`
                : `${itemName ? `"${itemName}" ` : 'Your order '}is ready! Staff is bringing it to your table`
            )
            setTimeout(() => setNotificationMsg(null), 6000)
          } else if (rawStatus === 'SERVED') {
            setNotificationMsg(
              language === 'km'
                ? `បានជូនមុខម្ហូប ${itemName ? `"${itemName}"` : ''} ពិសាដោយរីករាយ!`
                : `${itemName ? `"${itemName}"` : 'Your item'} has been served. Enjoy!`
            )
            setTimeout(() => setNotificationMsg(null), 4000)
          }
        } else if (evt === 'payment_confirmed' || evt === 'payment.settled') {
          setIsPaymentSettled(true)
          playChime(880, 1174.66, 0.5)
        } else if (evt === 'bill_ack') {
          setNotificationMsg(language === 'km' ? 'បុគ្គលិកកំពុងមកគិតប្រាក់ជូនលោកអ្នក' : 'Staff is coming to your table.')
          setTimeout(() => setNotificationMsg(null), 4000)
        }
      } catch (err) {
        console.warn('WS message parse error', err)
      }
    },
  })

  // Filter items by category and search
  const displayedItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const targetCats = categories.filter(
      (c) => activeCategory === 'all' || c.id === activeCategory
    )

    const items: MenuItem[] = []
    for (const cat of targetCats) {
      for (const item of cat.items) {
        if (!query) {
          items.push(item)
        } else {
          const match =
            item.name_en.toLowerCase().includes(query) ||
            (item.name_km && item.name_km.includes(query)) ||
            (item.description_en && item.description_en.toLowerCase().includes(query))
          if (match) {
            items.push(item)
          }
        }
      }
    }
    return items
  }, [categories, activeCategory, searchQuery])

const toBackendCourseStage = (stage?: CourseStage | string): 'drinks' | 'starters' | 'mains' | 'desserts' => {
  switch (stage) {
    case 'DRINKS':
      return 'drinks'
    case 'APPETIZERS':
      return 'starters'
    case 'DESSERTS':
    case 'DIGESTIFS':
      return 'desserts'
    case 'MAINS':
    default:
      return 'mains'
  }
}

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
          course_stage: toBackendCourseStage(c.course_stage),
          special_instructions: c.special_instructions || null,
          modifiers: c.selected_modifiers.map((m) => ({
            modifier_option_id: m.modifier_option_id,
            quantity: 1,
          })),
        })),
      }

      const placedOrder = await createGuestOrderMutation.mutateAsync({
        branchId: effectiveBranchId!,
        tableId: effectiveTableId!,
        token: effectiveToken!,
        payload: orderPayload as any,
      })
      const newRound: PlacedOrderRound = {
        id: placedOrder.id,
        round_number: placedOrder.round_number || orderRounds.length + 1,
        placed_at: placedOrder.created_at || new Date().toISOString(),
        round_subtotal_usd: Number(placedOrder.subtotal_usd) || cartItems.reduce((sum, i) => sum + i.total_price_usd, 0),
        status: placedOrder.status || 'pending',
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
      console.error('Order submission error:', err)
      const detailMsg =
        typeof err?.detail === 'string'
          ? err.detail
          : typeof err?.message === 'string'
          ? err.message
          : null
      setOrderError(
        detailMsg ||
        (language === 'km'
          ? 'មិនអាចបញ្ជូនការកុម្ម៉ង់បានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not submit your order. Please try again.')
      )
    } finally {
      setIsSubmittingOrder(false)
    }
  }

  // 4. Handle Request Bill
  const handleRequestBill = async () => {
    if (!isDemo && effectiveBranchId && effectiveTableId && effectiveToken) {
      await requestBillMutation
        .mutateAsync({
          branchId: effectiveBranchId,
          tableId: effectiveTableId,
          token: effectiveToken,
        })
        .catch(() => null)
    }
    setIsPayModalOpen(true)
  }

  // Service Hub Store (UI state only; requests come from the API)
  const { isRequestModalOpen, openRequestModal, closeRequestModal } = useServiceHubStore()

  // 5. Handle Call Waiter / Service Request Trigger
  const handleCallWaiter = () => {
    openRequestModal()
  }

  // Rejections reach the request modal, which shows the matching message.
  const handleSendServiceRequest = async (requestType: ServiceRequestType, note: string | null) => {
    if (isDemo) {
      setDemoServiceRequest({
        id: `demo-request-${Date.now()}`,
        table_id: table?.table_id || 'demo-table',
        table_number: table?.table_number || '08',
        request_type: requestType,
        note,
        status: 'open',
        created_at: new Date().toISOString(),
        acknowledged_at: null,
        resolved_at: null,
      })
      return
    }
    await createServiceRequestMutation.mutateAsync({ request_type: requestType, note })
  }

  // The banner follows the newest request still waiting on staff until the guest dismisses it.
  const bannerRequest = pickGuestBannerRequest(
    isDemo ? (demoServiceRequest ? [demoServiceRequest] : []) : guestServiceRequests
  )
  const visibleBannerRequest =
    bannerRequest && bannerDismissKey(bannerRequest) !== dismissedBannerKey ? bannerRequest : null

  const totalSessionUSD = orderRounds.reduce((sum, r) => sum + r.round_subtotal_usd, 0)
  const totalItemsCount = categories.reduce((sum, c) => sum + c.items.length, 0)

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <EmenuLoader
          size="lg"
          message={language === 'km' ? 'កំពុងភ្ជាប់ទៅកាន់តុ...' : 'Connecting to your table...'}
          showBrandText
        />
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
          onClick={() => queryClient.invalidateQueries({ queryKey: ['guest'] })}
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
        <div
          className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 shadow-xl max-w-[92vw] animate-in fade-in slide-in-from-top-2 duration-200 ${
            notificationType === 'error'
              ? 'bg-rose-950 text-rose-100 border border-rose-800/80 shadow-rose-950/30'
              : notificationType === 'success'
              ? 'bg-emerald-950 text-emerald-100 border border-emerald-800/80 shadow-emerald-950/30'
              : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200'
          }`}
        >
          {notificationType === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : notificationType === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="truncate">{notificationMsg}</span>
        </div>
      )}

      {/* Sticky Header with Category Tabs */}
      <GuestHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRequestBill={handleRequestBill}
        onCallWaiter={handleCallWaiter}
        hasActiveOrders={orderRounds.length > 0}
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
      />

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Inline Order Placement Error (No Outer Box Container, Plain Red Text) */}
        {orderError && (
          <p className="text-xs text-red-500 text-center font-medium">
            {orderError}
          </p>
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
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              {t('serviceHub.guest.callStaff')}
            </button>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              {language === 'km' ? 'រកមិនឃើញមុខម្ហូបទេ' : 'No menu items found'}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {language === 'km'
                ? 'សូមសាកល្បងជ្រើសរើសប្រភេទផ្សេង ឬស្វែងរកពាក្យថ្មី'
                : 'Try selecting another category or clear your search'}
            </p>
          </div>
        ) : (
          /* Catalog Items Grid */
          <div id="menu-items-catalog" className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {displayedItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onSelect={setSelectedMenuItem}
              />
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
        tableNumber={table?.table_number}
        errorMessage={orderError}
      />

      {/* Bakong KHQR Payment Modal */}
      <KHQRPaymentModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        totalUSD={Number(sessionBillData?.financials?.grand_total_usd) || totalSessionUSD}
        tableNumber={table?.table_number || '08'}
        merchantName={table?.bakong_merchant_name || table?.business_name || 'Bistro'}
        isSettled={isPaymentSettled}
        onSimulateSettlement={() => setIsPaymentSettled(true)}
      />

      {/* Guest Active Service Request Status Banner */}
      <GuestActiveRequestBanner
        request={visibleBannerRequest}
        onDismiss={() => {
          if (bannerRequest) setDismissedBannerKey(bannerDismissKey(bannerRequest))
        }}
      />

      {/* Guest Service Request Modal */}
      <GuestServiceRequestModal
        isOpen={isRequestModalOpen}
        onClose={closeRequestModal}
        tableNumber={table?.table_number}
        onSubmitRequest={handleSendServiceRequest}
        isSubmitting={createServiceRequestMutation.isPending}
      />
    </div>
  )
}
