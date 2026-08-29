import { useEffect, useState, useCallback, type FC } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  POSDiningZone,
  POSTable,
  POSPlacedRound,
} from './types/pos.types'
import { Category, CourseStage } from '@/features/guest/types/guest.types'
import { POSHeader } from './components/POSHeader'
import { POSTableGrid } from './components/POSTableGrid'
import { POSOrderDrawer } from './components/POSOrderDrawer'
import { POSMenuCatalog } from './components/POSMenuCatalog'
import { POSCashPaymentModal } from './components/POSCashPaymentModal'
import { POSSupervisorVoidModal } from './components/POSSupervisorVoidModal'
import { POSReceiptModal } from './components/POSReceiptModal'
import { KHQRPaymentModal } from '@/features/guest/components/KHQRPaymentModal'
import { ServiceHubDrawer } from '@/features/service-hub/components/ServiceHubDrawer'
import { usePOSStore } from './stores/usePOSStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/lib/websocket'
import { playChime, playSuccessSound } from '@/lib/audio'

// Demonstration Fallback Data
const DEMO_ZONES: POSDiningZone[] = [
  { id: 'zone-main', name_en: 'Main Hall', name_km: 'សាលធំកណ្តាល' },
  { id: 'zone-patio', name_en: 'Outdoor Patio', name_km: 'រានហាលខាងក្រៅ' },
  { id: 'zone-vip', name_en: 'VIP Lounge', name_km: 'បន្ទប់ពិសេស VIP' },
]

const DEMO_TABLES: POSTable[] = [
  { id: 'tbl-1', table_number: 'T-01', status: 'available', capacity: 4, dining_area_id: 'zone-main', dining_area_name: 'Main Hall' },
  { id: 'tbl-2', table_number: 'T-02', status: 'occupied', capacity: 4, dining_area_id: 'zone-main', dining_area_name: 'Main Hall', session_id: 'sess-2', session_elapsed_minutes: 18, session_subtotal_usd: 28.50, guest_count: 3, active_orders_count: 2 },
  { id: 'tbl-3', table_number: 'T-03', status: 'bill_requested', capacity: 2, dining_area_id: 'zone-main', dining_area_name: 'Main Hall', session_id: 'sess-3', session_elapsed_minutes: 45, session_subtotal_usd: 44.00, guest_count: 2, active_orders_count: 1 },
  { id: 'tbl-4', table_number: 'T-04', status: 'occupied', capacity: 6, dining_area_id: 'zone-main', dining_area_name: 'Main Hall', session_id: 'sess-4', session_elapsed_minutes: 8, session_subtotal_usd: 14.50, guest_count: 4, active_orders_count: 1 },
  { id: 'tbl-5', table_number: 'T-05', status: 'available', capacity: 4, dining_area_id: 'zone-main', dining_area_name: 'Main Hall' },
  { id: 'tbl-6', table_number: 'P-01', status: 'available', capacity: 4, dining_area_id: 'zone-patio', dining_area_name: 'Outdoor Patio' },
  { id: 'tbl-7', table_number: 'P-02', status: 'occupied', capacity: 2, dining_area_id: 'zone-patio', dining_area_name: 'Outdoor Patio', session_id: 'sess-7', session_elapsed_minutes: 24, session_subtotal_usd: 19.50, guest_count: 2, active_orders_count: 1 },
  { id: 'tbl-8', table_number: 'P-03', status: 'dirty_cleaning', capacity: 4, dining_area_id: 'zone-patio', dining_area_name: 'Outdoor Patio' },
  { id: 'tbl-9', table_number: 'VIP-01', status: 'occupied', capacity: 8, dining_area_id: 'zone-vip', dining_area_name: 'VIP Lounge', session_id: 'sess-9', session_elapsed_minutes: 52, session_subtotal_usd: 88.00, guest_count: 6, active_orders_count: 3 },
  { id: 'tbl-10', table_number: 'VIP-02', status: 'available', capacity: 10, dining_area_id: 'zone-vip', dining_area_name: 'VIP Lounge' },
]

const DEMO_ROUNDS: Record<string, POSPlacedRound[]> = {
  'tbl-2': [
    {
      id: 'r1',
      order_number: 'ORD-1047',
      round_number: 1,
      created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      subtotal_usd: 24.00,
      items: [
        { id: 'it-1', menu_item_id: 'm1', item_name_en: 'Lok Lak Beef with Kampot Pepper', item_name_km: 'ឡុកឡាក់សាច់គោម្រេចកំពត', quantity: 2, course_stage: 'MAINS', status: 'SERVED', unit_price_usd: 6.50, subtotal_usd: 13.00, modifiers_summary: 'Add Fried Egg' },
        { id: 'it-2', menu_item_id: 'm2', item_name_en: 'Traditional Tonle Sap Fish Amok', item_name_km: 'អាម៉ុកត្រីទន្លេសាបបុរាណ', quantity: 1, course_stage: 'MAINS', status: 'SERVED', unit_price_usd: 7.00, subtotal_usd: 7.00 },
      ],
    },
    {
      id: 'r2',
      order_number: 'ORD-1048',
      round_number: 2,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      subtotal_usd: 4.50,
      items: [
        { id: 'it-3', menu_item_id: 'm6', item_name_en: 'Iced Condensed Milk Coffee', item_name_km: 'កាហ្វេទឹកដោះគោទឹកកក', quantity: 2, course_stage: 'DRINKS', status: 'PREPARING', unit_price_usd: 2.25, subtotal_usd: 4.50, modifiers_summary: '50% Sweet' },
      ],
    },
  ],
  'tbl-3': [
    {
      id: 'r3',
      order_number: 'ORD-1040',
      round_number: 1,
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      subtotal_usd: 44.00,
      items: [
        { id: 'it-4', menu_item_id: 'm1', item_name_en: 'Lok Lak Beef with Kampot Pepper', quantity: 4, course_stage: 'MAINS', status: 'SERVED', unit_price_usd: 8.50, subtotal_usd: 34.00, variant_name_en: 'Large' },
        { id: 'it-5', menu_item_id: 'm7', item_name_en: 'Fresh Passion Fruit Soda', quantity: 4, course_stage: 'DRINKS', status: 'SERVED', unit_price_usd: 2.50, subtotal_usd: 10.00 },
      ],
    },
  ],
}

export const POSPage: FC = () => {
  const {
    zones,
    tables,
    selectedTable,
    activeRounds,
    activeCart,
    viewMode,
    selectedZoneId,
    exchangeRate,
    isCashModalOpen,
    isKHQRModalOpen,
    isVoidModalOpen,
    isReceiptModalOpen,
    targetVoidItem,
    setZones,
    setTables,
    setSelectedTable,
    setActiveRounds,
    setViewMode,
    setSelectedZoneId,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    openCashModal,
    closeCashModal,
    openKHQRModal,
    closeKHQRModal,
    openVoidModal,
    closeVoidModal,
    openReceiptModal,
    closeReceiptModal,
    updateTableStatus,
  } = usePOSStore()

  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  // Context identifiers
  const tenantBizId = localStorage.getItem('emenu_business_id') || 'demo-biz'
  const tenantBranchId = localStorage.getItem('emenu_branch_id') || 'demo-branch'
  const accessToken = localStorage.getItem('emenu_access_token') || ''
  const isDemoMode = !accessToken || tenantBizId === 'demo-biz'

  // 1. Fetch POS Data (Zones, Tables, Catalog)
  const fetchPOSData = useCallback(async () => {
    setIsRefreshing(true)

    if (isDemoMode) {
      setZones(DEMO_ZONES)
      setTables(DEMO_TABLES)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    try {
      const [zonesRes, tablesRes, catRes, itemRes] = await Promise.all([
        api.get(`/businesses/${tenantBizId}/branches/${tenantBranchId}/dining-areas`).catch(() => null),
        api.get(`/businesses/${tenantBizId}/branches/${tenantBranchId}/tables`).catch(() => null),
        api.get(`/businesses/${tenantBizId}/categories`).catch(() => null),
        api.get(`/businesses/${tenantBizId}/items`).catch(() => null),
      ])

      if (zonesRes?.data) setZones(zonesRes.data)
      if (tablesRes?.data) setTables(tablesRes.data)

      const rawCats: any[] = catRes?.data || []
      const rawItems: any[] = itemRes?.data || []
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
            variants: i.variants || [],
            modifier_groups: i.modifier_groups || [],
          })),
      }))
      setCategories(builtCategories)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isDemoMode, setTables, setZones, tenantBizId, tenantBranchId])

  useEffect(() => {
    fetchPOSData()
  }, [fetchPOSData])

  // 2. Select Table & Load its Placed Order Rounds
  const handleSelectTable = useCallback((table: POSTable) => {
    setSelectedTable(table)

    if (isDemoMode) {
      const rounds = DEMO_ROUNDS[table.id] || []
      setActiveRounds(rounds)
      return
    }

    if (table.session_id) {
      api
        .get(`/businesses/${tenantBizId}/branches/${tenantBranchId}/table-sessions/${table.session_id}/orders`)
        .then((res) => {
          if (res.data?.orders) {
            setActiveRounds(res.data.orders)
          }
        })
        .catch(() => setActiveRounds([]))
    } else {
      setActiveRounds([])
    }
  }, [isDemoMode, setActiveRounds, setSelectedTable, tenantBizId, tenantBranchId])

  // 3. Mark Table Cleaned Action
  const handleMarkCleaned = async (tableId: string) => {
    updateTableStatus(tableId, 'available', null)
    playSuccessSound()

    if (!isDemoMode) {
      await api.patch(`/businesses/${tenantBizId}/branches/${tenantBranchId}/tables/${tableId}`, {
        status: 'available',
      }).catch(() => null)
    }
  }

  // 4. Submit Waiter Direct Order
  const handleSubmitDirectOrder = async (courseStage: CourseStage, guestNotes: string) => {
    if (activeCart.length === 0 || !selectedTable) return
    setIsSubmittingOrder(true)

    const cartSubtotal = activeCart.reduce((sum, item) => sum + item.total_price_usd, 0)
    const newRound: POSPlacedRound = {
      id: `r-${Date.now()}`,
      order_number: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      round_number: activeRounds.length + 1,
      created_at: new Date().toISOString(),
      subtotal_usd: cartSubtotal,
      items: activeCart.map((c, idx) => ({
        id: `it-${Date.now()}-${idx}`,
        menu_item_id: c.menu_item_id,
        item_name_en: c.item_name_en,
        item_name_km: c.item_name_km,
        variant_name_en: c.variant_name,
        quantity: c.quantity,
        course_stage: c.course_stage || courseStage,
        status: 'PREPARING',
        unit_price_usd: c.unit_price_usd,
        subtotal_usd: c.total_price_usd,
        special_instructions: c.special_instructions,
        modifiers_summary: c.modifiers.map((m) => m.modifier_name).join(', '),
      })),
    }

    // Update table status to occupied
    updateTableStatus(selectedTable.id, 'occupied', selectedTable.session_id || `sess-${Date.now()}`)
    setActiveRounds([...activeRounds, newRound])
    clearCart()
    setIsSubmittingOrder(false)
    setViewMode('floor_map')
    playChime(587.33, 880, 0.4)

    if (!isDemoMode) {
      await api.post(`/businesses/${tenantBizId}/branches/${tenantBranchId}/orders`, {
        table_id: selectedTable.id,
        guest_notes: guestNotes,
        items: activeCart.map((c) => ({
          menu_item_id: c.menu_item_id,
          item_variant_id: c.variant_id,
          quantity: c.quantity,
          course_stage: c.course_stage,
          special_instructions: c.special_instructions,
          modifiers: c.modifiers.map((m) => ({ modifier_option_id: m.modifier_option_id, quantity: 1 })),
        })),
      }).catch(() => null)
    }
  }

  // 5. Settle Cash Payment
  const handleConfirmCashSettlement = async (result: {
    tenderedUSD: number
    tenderedKHR: number
    changeUSD: number
    changeKHR: number
  }) => {
    if (!selectedTable) return

    playSuccessSound()
    updateTableStatus(selectedTable.id, 'dirty_cleaning', null)
    setActiveRounds([])
    closeCashModal()
    openReceiptModal(`PAY-${Date.now()}`)

    if (!isDemoMode && selectedTable.session_id) {
      await api.post(
        `/businesses/${tenantBizId}/branches/${tenantBranchId}/table-sessions/${selectedTable.session_id}/payments/cash`,
        {
          amount_tendered_usd: result.tenderedUSD,
          amount_tendered_khr: result.tenderedKHR,
          change_currency_preference: 'khr',
        }
      ).catch(() => null)
    }
  }

  // 6. Supervisor PIN Void Handler
  const handleConfirmSupervisorVoid = async (pin: string, reason: string) => {
    if (!targetVoidItem) return

    playSuccessSound()
    // Optimistic removal of item from round
    const updatedRounds = activeRounds.map((r) => ({
      ...r,
      items: r.items.filter((i) => i.id !== targetVoidItem.id),
      subtotal_usd: r.items
        .filter((i) => i.id !== targetVoidItem.id)
        .reduce((sum, i) => sum + i.subtotal_usd, 0),
    })).filter((r) => r.items.length > 0)

    setActiveRounds(updatedRounds)
    closeVoidModal()

    if (!isDemoMode && selectedTable) {
      await api.post(
        `/businesses/${tenantBizId}/branches/${tenantBranchId}/orders/void-item`,
        {
          order_item_id: targetVoidItem.id,
          supervisor_pin: pin,
          void_reason: reason,
        }
      ).catch(() => null)
    }
  }

  // 7. WebSocket Real-Time Listener for POS Room
  const wsUrl =
    !isDemoMode && accessToken
      ? `/ws/branches/${tenantBranchId}?token=${accessToken}&room_type=pos`
      : null

  useWebSocket(wsUrl, {
    autoConnect: !!wsUrl,
    onMessage: (rawMsg) => {
      try {
        const data = typeof rawMsg === 'object' && rawMsg !== null ? (rawMsg as any) : {}
        if (data.event === 'TABLE_STATUS_CHANGED') {
          updateTableStatus(data.table_id, data.status)
        } else if (data.event === 'BILL_REQUESTED') {
          updateTableStatus(data.table_id, 'bill_requested')
          playChime(659.25, 880, 0.4)
        } else if (data.event === 'PAYMENT_SETTLED') {
          updateTableStatus(data.table_id, 'dirty_cleaning')
          playSuccessSound()
        }
      } catch (err) {
        console.warn('POS WS message error', err)
      }
    },
  })

  const subtotalUSD = activeRounds.reduce((sum, r) => sum + r.subtotal_usd, 0)
  const taxUSD = subtotalUSD * 0.1
  const totalUSD = subtotalUSD + taxUSD
  const totalKHR = Math.round(totalUSD * exchangeRate)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <RefreshCw className="w-6 h-6 text-zinc-400 animate-spin" />
        <p className="text-xs text-zinc-500">Loading Floor Map & POS...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased flex flex-col justify-between">
      <div>
        {/* Sticky POS Header */}
        <POSHeader
          branchName="Siem Reap Bistro"
          onRefresh={fetchPOSData}
          isRefreshing={isRefreshing}
        />

        {/* Main Workspace Body */}
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {viewMode === 'direct_order' ? (
            /* Direct Waiter / Counter Order Taking Mode */
            <POSMenuCatalog
              categories={categories.length > 0 ? categories : [
                { id: 'cat-1', name_en: 'Khmer Mains', name_km: 'ម្ហូបខ្មែរ', display_order: 1, items: [
                  { id: 'm1', category_id: 'cat-1', name_en: 'Lok Lak Beef', name_km: 'ឡុកឡាក់សាច់គោ', description_en: '', description_km: '', base_price_usd: 6.50, image_url: null, is_available: true, variants: [], modifier_groups: [] },
                  { id: 'm2', category_id: 'cat-1', name_en: 'Fish Amok', name_km: 'អាម៉ុកត្រី', description_en: '', description_km: '', base_price_usd: 7.00, image_url: null, is_available: true, variants: [], modifier_groups: [] },
                ]},
                { id: 'cat-2', name_en: 'Beverages', name_km: 'ភេសជ្ជៈ', display_order: 2, items: [
                  { id: 'm3', category_id: 'cat-2', name_en: 'Iced Milk Coffee', name_km: 'កាហ្វេទឹកដោះគោ', description_en: '', description_km: '', base_price_usd: 2.25, image_url: null, is_available: true, variants: [], modifier_groups: [] },
                  { id: 'm4', category_id: 'cat-2', name_en: 'Passion Fruit Soda', name_km: 'ផាសិនសូដា', description_en: '', description_km: '', base_price_usd: 2.50, image_url: null, is_available: true, variants: [], modifier_groups: [] },
                ]}
              ]}
              activeCart={activeCart}
              selectedTable={selectedTable}
              onAddToCart={addToCart}
              onUpdateCartQty={updateCartQuantity}
              onRemoveFromCart={removeFromCart}
              onClearCart={clearCart}
              onSubmitOrder={handleSubmitDirectOrder}
              onBackToFloorMap={() => setViewMode('floor_map')}
              isSubmitting={isSubmittingOrder}
            />
          ) : (
            /* Floor Map Grid & Active Table Drawer */
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1 w-full">
                <POSTableGrid
                  zones={zones}
                  tables={tables}
                  selectedZoneId={selectedZoneId}
                  selectedTableId={selectedTable?.id}
                  onSelectZone={setSelectedZoneId}
                  onSelectTable={handleSelectTable}
                  onMarkCleaned={handleMarkCleaned}
                />
              </div>

              {/* Side Drawer for Selected Table */}
              {selectedTable && (
                <POSOrderDrawer
                  table={selectedTable}
                  rounds={activeRounds}
                  onClose={() => setSelectedTable(null)}
                  onOpenCashModal={openCashModal}
                  onOpenKHQRModal={openKHQRModal}
                  onOpenVoidModal={openVoidModal}
                  onPrintPrecheck={() => openReceiptModal('PRECHECK')}
                  onStartDirectOrder={() => setViewMode('direct_order')}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 100-Riel Cash Settlement Modal */}
      <POSCashPaymentModal
        isOpen={isCashModalOpen}
        onClose={closeCashModal}
        totalUSD={totalUSD}
        exchangeRate={exchangeRate}
        tableNumber={selectedTable?.table_number || 'T-01'}
        onConfirmSettlement={handleConfirmCashSettlement}
      />

      {/* Bakong KHQR Settlement Modal */}
      <KHQRPaymentModal
        isOpen={isKHQRModalOpen}
        onClose={closeKHQRModal}
        totalUSD={totalUSD}
        tableNumber={selectedTable?.table_number || 'T-01'}
        merchantName="Siem Reap Bistro"
        isSettled={false}
        onSimulateSettlement={() => {
          handleConfirmCashSettlement({
            tenderedUSD: totalUSD,
            tenderedKHR: 0,
            changeUSD: 0,
            changeKHR: 0,
          })
          closeKHQRModal()
        }}
      />

      {/* Supervisor PIN Void Authorization Modal */}
      <POSSupervisorVoidModal
        isOpen={isVoidModalOpen}
        onClose={closeVoidModal}
        item={targetVoidItem}
        onConfirmVoid={handleConfirmSupervisorVoid}
      />

      {/* Dual-Language Thermal Receipt Modal */}
      <POSReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={closeReceiptModal}
        tableNumber={selectedTable?.table_number || 'T-01'}
        branchName="Siem Reap Bistro"
        totalUSD={totalUSD}
        totalKHR={totalKHR}
        subtotalUSD={subtotalUSD}
        taxUSD={taxUSD}
      />

      {/* Waiter Service Requests Hub Slide-Over Drawer */}
      <ServiceHubDrawer />
    </div>
  )
}
