import { useEffect, useState, useCallback, useMemo, type FC } from 'react'
import { Utensils, RefreshCw, AlertCircle } from 'lucide-react'
import {
  KitchenStation,
  KDSTicket,
  OrderItemStatus,
} from './types/kds.types'
import { KDSHeader } from './components/KDSHeader'
import { KDSStationTabs } from './components/KDSStationTabs'
import { KDSTicketCard } from './components/KDSTicketCard'
import { KDSRecallDrawer } from './components/KDSRecallDrawer'
import { useKDSStore } from './stores/useKDSStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/lib/websocket'
import { playChime } from '@/lib/audio'

// Default Demonstration / Fallback Tickets for Live Testing
const DEMO_STATIONS: KitchenStation[] = [
  { id: 'st-grill', name: 'Grill & BBQ', station_code: 'GRILL', is_active: true, display_order: 1 },
  { id: 'st-wok', name: 'Hot Wok', station_code: 'WOK', is_active: true, display_order: 2 },
  { id: 'st-bar', name: 'Bar & Drinks', station_code: 'BAR', is_active: true, display_order: 3 },
  { id: 'st-pantry', name: 'Appetizers & Salad', station_code: 'PANTRY', is_active: true, display_order: 4 },
  { id: 'st-dessert', name: 'Desserts', station_code: 'DESSERT', is_active: true, display_order: 5 },
]

const DEMO_TICKETS: KDSTicket[] = [
  {
    order_id: 'ord-demo-1',
    order_number: 'ORD-1048',
    order_type: 'dine_in',
    round_number: 1,
    table_id: 'tbl-4',
    table_number: 'T-04',
    guest_notes: 'Allergy to peanuts, please keep clean',
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(), // 4 mins ago (Normal)
    elapsed_minutes: 4,
    max_target_prep_minutes: 15,
    is_ticket_overdue: false,
    ticket_urgency: 'normal',
    has_held_items: false,
    items: [
      {
        id: 'item-d1',
        menu_item_id: 'm1',
        item_name_en: 'Lok Lak Beef with Kampot Pepper',
        item_name_km: 'ឡុកឡាក់សាច់គោម្រេចកំពត',
        variant_name_en: 'Large',
        quantity: 2,
        course_stage: 'MAINS',
        status: 'cooking',
        kitchen_station_id: 'st-wok',
        modifiers: [{ id: 'mod1', modifier_option_id: 'o1', name_en: 'Add Fried Egg', quantity: 2 }],
        special_instructions: 'Less black pepper please',
        elapsed_minutes: 4,
        target_prep_time_minutes: 15,
        is_overdue: false,
        urgency_level: 'normal',
      },
      {
        id: 'item-d2',
        menu_item_id: 'm2',
        item_name_en: 'Traditional Tonle Sap Fish Amok',
        item_name_km: 'អាម៉ុកត្រីទន្លេសាបបុរាណ',
        quantity: 1,
        course_stage: 'MAINS',
        status: 'pending',
        kitchen_station_id: 'st-wok',
        modifiers: [],
        elapsed_minutes: 4,
        target_prep_time_minutes: 15,
        is_overdue: false,
        urgency_level: 'normal',
      },
    ],
  },
  {
    order_id: 'ord-demo-2',
    order_number: 'ORD-1047',
    order_type: 'dine_in',
    round_number: 2,
    table_id: 'tbl-2',
    table_number: 'T-02',
    created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(), // 11 mins ago (Warning)
    elapsed_minutes: 11,
    max_target_prep_minutes: 15,
    is_ticket_overdue: false,
    ticket_urgency: 'warning',
    has_held_items: false,
    items: [
      {
        id: 'item-d3',
        menu_item_id: 'm3',
        item_name_en: 'Crispy Deep-Fried Spring Rolls',
        item_name_km: 'ចៃយ៉របំពងស្រួយ (៦ ដុំ)',
        quantity: 1,
        course_stage: 'APPETIZERS',
        status: 'ready_to_serve',
        kitchen_station_id: 'st-pantry',
        modifiers: [],
        elapsed_minutes: 11,
        target_prep_time_minutes: 10,
        is_overdue: true,
        urgency_level: 'warning',
      },
      {
        id: 'item-d4',
        menu_item_id: 'm4',
        item_name_en: 'Iced Condensed Milk Coffee',
        item_name_km: 'កាហ្វេទឹកដោះគោទឹកកក',
        quantity: 2,
        course_stage: 'DRINKS',
        status: 'ready_to_serve',
        kitchen_station_id: 'st-bar',
        modifiers: [{ id: 'mod2', modifier_option_id: 'o2', name_en: '50% Sweet', quantity: 2 }],
        elapsed_minutes: 11,
        target_prep_time_minutes: 5,
        is_overdue: true,
        urgency_level: 'warning',
      },
    ],
  },
  {
    order_id: 'ord-demo-3',
    order_number: 'ORD-1045',
    order_type: 'takeaway',
    round_number: 1,
    guest_notes: 'Pack disposable utensils',
    created_at: new Date(Date.now() - 21 * 60 * 1000).toISOString(), // 21 mins ago (Critical / Overdue)
    elapsed_minutes: 21,
    max_target_prep_minutes: 15,
    is_ticket_overdue: true,
    ticket_urgency: 'critical',
    has_held_items: false,
    items: [
      {
        id: 'item-d5',
        menu_item_id: 'm5',
        item_name_en: 'Khmer Red Chicken Curry',
        item_name_km: 'ការីក្រហមសាច់មាន់នំបុ័ង',
        quantity: 3,
        course_stage: 'MAINS',
        status: 'cooking',
        kitchen_station_id: 'st-wok',
        modifiers: [],
        special_instructions: 'Extra baguette',
        elapsed_minutes: 21,
        target_prep_time_minutes: 15,
        is_overdue: true,
        urgency_level: 'critical',
      },
    ],
  },
]

export const KDSPage: FC = () => {
  const { language } = useLanguageStore()
  const {
    stations,
    selectedStationId,
    tickets,
    recalledTickets,
    isMuted,
    isRecallOpen,
    setStations,
    setSelectedStation,
    setTickets,
    setRecalledTickets,
    setIsRecallOpen,
    bumpItemStatus,
    removeTicket,
    addTicket,
  } = useKDSStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Context identifiers
  const tenantBizId = localStorage.getItem('emenu_business_id') || 'demo-biz'
  const tenantBranchId = localStorage.getItem('emenu_branch_id') || 'demo-branch'
  const accessToken = localStorage.getItem('emenu_access_token') || ''
  const isDemoMode = !accessToken || tenantBizId === 'demo-biz'

  // 1. Fetch Kitchen Stations and Live Tickets
  const fetchKDSData = useCallback(async () => {
    setIsRefreshing(true)
    setLoadError(null)

    if (isDemoMode) {
      setStations(DEMO_STATIONS)
      setTickets(DEMO_TICKETS)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    try {
      // Fetch stations
      const stationsRes = await api.get(
        `/businesses/${tenantBizId}/branches/${tenantBranchId}/kitchen-stations`
      ).catch(() => null)

      if (stationsRes?.data && stationsRes.data.length > 0) {
        setStations(stationsRes.data)
      } else {
        setStations(DEMO_STATIONS)
      }

      // Fetch tickets
      const ticketUrl =
        selectedStationId === 'expo'
          ? `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/expo/tickets`
          : `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/stations/${selectedStationId}/tickets`

      const ticketsRes = await api.get(ticketUrl).catch(() => null)
      if (ticketsRes?.data) {
        setTickets(ticketsRes.data)
      } else {
        setTickets(DEMO_TICKETS)
      }
    } catch {
      setLoadError(
        language === 'km'
          ? 'មិនអាចទាញយកសំបុត្រពីផ្ទះបាយបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not fetch kitchen tickets. Please try again.'
      )
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isDemoMode, language, selectedStationId, setStations, setTickets, tenantBizId, tenantBranchId])

  useEffect(() => {
    fetchKDSData()
  }, [fetchKDSData])

  // 2. Real-Time WebSocket Connection for Staff Room
  const wsRoomType = selectedStationId === 'expo' ? 'expo' : 'station'
  const wsUrl =
    !isDemoMode && accessToken
      ? `/ws/branches/${tenantBranchId}?token=${accessToken}&room_type=${wsRoomType}${
          selectedStationId !== 'expo' ? `&station_id=${selectedStationId}` : ''
        }`
      : null

  const { isConnected } = useWebSocket(wsUrl, {
    autoConnect: !!wsUrl,
    onMessage: (rawMsg) => {
      try {
        const data = typeof rawMsg === 'object' && rawMsg !== null ? (rawMsg as any) : {}
        if (data.event === 'NEW_ORDER' && data.ticket) {
          addTicket(data.ticket)
          if (!isMuted) {
            playChime(587.33, 880, 0.5)
          }
        } else if (data.event === 'ITEM_STATUS_CHANGED' && data.order_item_id && data.target_status) {
          bumpItemStatus(data.order_item_id, data.target_status)
        } else if (data.event === 'TICKET_BUMPED' && data.order_id) {
          removeTicket(data.order_id)
        }
      } catch (err) {
        console.warn('KDS WS message error', err)
      }
    },
  })

  // 3. 1-Tap Item Status Bump Action
  const handleBumpItem = async (orderItemId: string, targetStatus: OrderItemStatus) => {
    // Optimistic UI update
    bumpItemStatus(orderItemId, targetStatus)

    if (!isDemoMode) {
      await api.post(
        `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/items/${orderItemId}/bump`,
        { target_status: targetStatus }
      )
    }
  }

  // 4. 1-Tap Ticket Bump Action
  const handleBumpTicket = async (orderId: string) => {
    // Optimistic removal from active screen
    removeTicket(orderId)

    if (!isDemoMode) {
      if (selectedStationId === 'expo') {
        // Expo bump all items
        await api.post(
          `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/orders/${orderId}/bump-all`
        ).catch(() => null)
      } else {
        await api.post(
          `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/orders/${orderId}/station/${selectedStationId}/bump`,
          { target_status: 'ready_to_serve' }
        ).catch(() => null)
      }
    }
  }

  // 5. Recall Ticket to Active Screen
  const handleRecallTicket = (ticket: KDSTicket) => {
    addTicket(ticket)
    setRecalledTickets(recalledTickets.filter((t) => t.order_id !== ticket.order_id))
  }

  // Filter tickets by station if in individual station tab
  const filteredTickets = useMemo(() => {
    if (selectedStationId === 'expo') {
      return tickets
    }
    return tickets.map((t) => ({
      ...t,
      items: t.items.filter((i) => !i.kitchen_station_id || i.kitchen_station_id === selectedStationId),
    })).filter((t) => t.items.length > 0)
  }, [tickets, selectedStationId])

  // Count tickets by station
  const ticketCountByStation = useMemo(() => {
    const counts: Record<string, number> = {}
    stations.forEach((st) => {
      counts[st.id] = tickets.filter((t) =>
        t.items.some((i) => i.kitchen_station_id === st.id)
      ).length
    })
    return counts
  }, [stations, tickets])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <RefreshCw className="w-6 h-6 text-zinc-400 animate-spin" />
        <p className="text-xs text-zinc-500">
          {language === 'km' ? 'កំពុងបើកប្រព័ន្ធផ្ទះបាយ...' : 'Connecting to Kitchen Station...'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased flex flex-col justify-between">
      <div>
        {/* Sticky Header */}
        <KDSHeader
          branchName="Siem Reap Bistro"
          isConnected={isConnected || isDemoMode}
          onRefresh={fetchKDSData}
          isRefreshing={isRefreshing}
        />

        {/* Station Tabs */}
        <KDSStationTabs
          stations={stations}
          selectedStationId={selectedStationId}
          onSelectStation={setSelectedStation}
          ticketCountByStation={ticketCountByStation}
        />

        {/* Main Ticket Grid */}
        <main className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
          {/* Inline Error (Zero Shadows, Plain Red Text, No Outer Container) */}
          {loadError && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 justify-center">
              <AlertCircle className="w-4 h-4" />
              <span>{loadError}</span>
            </div>
          )}

          {filteredTickets.length === 0 ? (
            /* Empty Queue State */
            <div className="py-24 text-center space-y-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-md mx-auto p-8">
              <div className="w-12 h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                <Utensils className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                  {language === 'km' ? 'គ្មានការកុម្ម៉ង់កំពុងរង់ចាំទេ' : 'All Clear! No Pending Tickets'}
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {language === 'km'
                    ? 'ការកុម្ម៉ង់ថ្មីពីភ្ញៀវនឹងបង្ហាញនៅលើអេក្រង់នេះដោយស្វ័យប្រវត្តិ។'
                    : 'New orders from table QR scans and waiter POS will appear here instantly.'}
                </p>
              </div>
            </div>
          ) : (
            /* Responsive Multi-Column Tickets Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
              {filteredTickets.map((ticket) => (
                <KDSTicketCard
                  key={ticket.order_id}
                  ticket={ticket}
                  onBumpItem={handleBumpItem}
                  onBumpTicket={handleBumpTicket}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Recall Drawer */}
      <KDSRecallDrawer
        isOpen={isRecallOpen}
        onClose={() => setIsRecallOpen(false)}
        recalledTickets={recalledTickets}
        onRecallTicket={handleRecallTicket}
      />
    </div>
  )
}
