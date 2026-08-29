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

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

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
  const [branchName, setBranchName] = useState<string>('Restaurant')

  // Context identifiers
  const [tenantBizId, setTenantBizId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [tenantBranchId, setTenantBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )
  const accessToken = localStorage.getItem('emenu_access_token') || ''

  // 1. Resolve Active Business and Branch IDs dynamically
  const resolveTenantContext = useCallback(async () => {
    let bizId = tenantBizId
    let branchId = tenantBranchId

    if (!isUuid(bizId)) {
      try {
        const bizRes = await api.get('/businesses')
        if (Array.isArray(bizRes.data) && bizRes.data.length > 0) {
          bizId = bizRes.data[0].id
          setTenantBizId(bizId)
          localStorage.setItem('emenu_business_id', bizId!)
        }
      } catch {
        // Handled in catch
      }
    }

    if (isUuid(bizId) && !isUuid(branchId)) {
      try {
        const branchRes = await api.get(`/businesses/${bizId}/branches`)
        if (Array.isArray(branchRes.data) && branchRes.data.length > 0) {
          branchId = branchRes.data[0].id
          setBranchName(branchRes.data[0].name_en || 'Main Branch')
          setTenantBranchId(branchId)
          localStorage.setItem('emenu_branch_id', branchId!)
        }
      } catch {
        // Handled in catch
      }
    }

    return { bizId, branchId }
  }, [tenantBizId, tenantBranchId])

  // 2. Fetch POS Data (Zones, Tables, Categories, Items) for the Isolated Tenant
  const fetchPOSData = useCallback(async () => {
    setIsRefreshing(true)

    try {
      const { bizId, branchId } = await resolveTenantContext()

      if (!isUuid(bizId) || !isUuid(branchId)) {
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      const [zonesRes, tablesRes, catRes, itemRes] = await Promise.all([
        api.get(`/businesses/${bizId}/branches/${branchId}/dining-areas`).catch(() => ({ data: [] })),
        api.get(`/businesses/${bizId}/branches/${branchId}/tables`).catch(() => ({ data: [] })),
        api.get(`/businesses/${bizId}/categories`).catch(() => ({ data: [] })),
        api.get(`/businesses/${bizId}/items`).catch(() => ({ data: [] })),
      ])

      const rawZones: any[] = Array.isArray(zonesRes.data) ? zonesRes.data : []
      const builtZones: POSDiningZone[] = rawZones.map((z) => ({
        id: z.id,
        name_en: z.name_en,
        name_km: z.name_km || z.name_en,
      }))
      setZones(builtZones)

      const rawTables: any[] = Array.isArray(tablesRes.data) ? tablesRes.data : []
      const builtTables: POSTable[] = rawTables.map((t) => ({
        id: t.id,
        table_number: t.table_number,
        status: (t.status || 'AVAILABLE').toLowerCase(),
        capacity: t.capacity || 4,
        dining_area_id: t.dining_area_id,
        dining_area_name: t.dining_area?.name_en || 'Main Area',
        session_id: t.active_session_id || null,
        session_elapsed_minutes: 0,
        session_subtotal_usd: 0,
        guest_count: t.capacity || 2,
        active_orders_count: 0,
      }))
      setTables(builtTables)

      const rawCats: any[] = Array.isArray(catRes.data) ? catRes.data : []
      const rawItems: any[] = Array.isArray(itemRes.data)
        ? itemRes.data
        : itemRes.data?.items && Array.isArray(itemRes.data.items)
        ? itemRes.data.items
        : []

      const builtCategories: Category[] = rawCats.map((c) => ({
        id: c.id,
        name_en: c.name_en,
        name_km: c.name_km || c.name_en,
        display_order: c.display_order || 0,
        items: rawItems
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            category_id: i.category_id,
            name_en: i.name_en,
            name_km: i.name_km || i.name_en,
            description_en: i.description_en || '',
            description_km: i.description_km || '',
            base_price_usd: Number(i.base_price || i.price_usd || 0),
            image_url: i.image_url,
            is_available: i.is_active ?? i.is_available ?? true,
            variants: i.variants || [],
            modifier_groups: i.modifier_groups || [],
          })),
      }))
      setCategories(builtCategories)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [resolveTenantContext, setTables, setZones])

  useEffect(() => {
    fetchPOSData()
  }, [fetchPOSData])

  // 3. Select Table & Load its Live Order Rounds
  const handleSelectTable = useCallback((table: POSTable) => {
    setSelectedTable(table)

    if (table.session_id && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      api
        .get(`/businesses/${tenantBizId}/branches/${tenantBranchId}/table-sessions/${table.session_id}/orders`)
        .then((res) => {
          if (res.data?.orders && Array.isArray(res.data.orders)) {
            setActiveRounds(res.data.orders)
          } else if (Array.isArray(res.data)) {
            setActiveRounds(res.data)
          } else {
            setActiveRounds([])
          }
        })
        .catch(() => setActiveRounds([]))
    } else {
      setActiveRounds([])
    }
  }, [setActiveRounds, setSelectedTable, tenantBizId, tenantBranchId])

  // 4. Mark Table Cleaned Action
  const handleMarkCleaned = async (tableId: string) => {
    updateTableStatus(tableId, 'available', null)
    playSuccessSound()

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await api.patch(`/businesses/${tenantBizId}/branches/${tenantBranchId}/tables/${tableId}/status`, {
        status: 'AVAILABLE',
      }).catch(() => null)
    }
  }

  // 5. Submit Waiter Direct Order to Isolated Tenant Backend
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

    updateTableStatus(selectedTable.id, 'occupied', selectedTable.session_id || `sess-${Date.now()}`)
    setActiveRounds([...activeRounds, newRound])
    clearCart()
    setIsSubmittingOrder(false)
    setViewMode('floor_map')
    playChime(587.33, 880, 0.4)

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await api.post(`/businesses/${tenantBizId}/branches/${tenantBranchId}/orders`, {
        table_id: selectedTable.id,
        guest_notes: guestNotes,
        items: activeCart.map((c) => ({
          menu_item_id: c.menu_item_id,
          item_variant_id: c.variant_id && isUuid(c.variant_id) ? c.variant_id : null,
          quantity: c.quantity,
          course_stage: c.course_stage || courseStage,
          special_instructions: c.special_instructions,
          modifiers: c.modifiers
            .filter((m) => isUuid(m.modifier_option_id))
            .map((m) => ({ modifier_option_id: m.modifier_option_id, quantity: 1 })),
        })),
      }).catch(() => null)
    }
  }

  // 6. Settle Cash Payment
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

    if (selectedTable.session_id && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
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

  // 7. Supervisor PIN Void Handler
  const handleConfirmSupervisorVoid = async (pin: string, reason: string) => {
    if (!targetVoidItem) return

    playSuccessSound()
    const updatedRounds = activeRounds.map((r) => ({
      ...r,
      items: r.items.filter((i) => i.id !== targetVoidItem.id),
      subtotal_usd: r.items
        .filter((i) => i.id !== targetVoidItem.id)
        .reduce((sum, i) => sum + i.subtotal_usd, 0),
    })).filter((r) => r.items.length > 0)

    setActiveRounds(updatedRounds)
    closeVoidModal()

    if (selectedTable && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
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

  // 8. WebSocket Real-Time Listener for POS Room
  const wsUrl =
    accessToken && isUuid(tenantBranchId)
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
      } catch {
        // Ignore parse error
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
          branchName={branchName}
          onRefresh={fetchPOSData}
          isRefreshing={isRefreshing}
        />

        {/* Main Workspace Body */}
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {viewMode === 'direct_order' ? (
            /* Direct Waiter / Counter Order Taking Mode */
            <POSMenuCatalog
              categories={categories}
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
        merchantName={branchName}
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
        branchName={branchName}
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
