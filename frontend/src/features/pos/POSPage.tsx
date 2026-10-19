import { useEffect, useState, useMemo, useCallback, type FC } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import {
  POSDiningZone,
  POSTable,
} from './types/pos.types'
import { POSHeader } from './components/POSHeader'
import { POSTableGrid } from './components/POSTableGrid'
import { POSOrderDrawer } from './components/POSOrderDrawer'
import { POSMenuCatalog } from './components/POSMenuCatalog'
import { POSCashPaymentModal } from './components/POSCashPaymentModal'
import { POSSupervisorVoidModal } from './components/POSSupervisorVoidModal'
import { POSReceiptModal } from './components/POSReceiptModal'
import { POSKHQRModal } from './components/POSKHQRModal'
import { POSTableActionsModal } from './components/POSTableActionsModal'
import { ServiceHubDrawer } from '@/features/service-hub/components/ServiceHubDrawer'
import { serviceRequestKeys } from '@/features/service-hub/hooks/useServiceRequestQueries'
import { useServiceHubStore } from '@/features/service-hub/stores/useServiceHubStore'
import {
  isServiceRequestEvent,
  parseServiceHubEvent,
  type ServiceHubEvent,
} from '@/features/service-hub/utils/serviceRequests'
import { usePOSStore } from './stores/usePOSStore'
import {
  sessionRoundsQuery,
  useOrderDetail,
  useSettleSessionCash,
  useUpdateTableStatus,
  useVoidOrderItem,
  useCancelOrder,
  useCreateStaffOrder,
  type StaffOrderPlacementRequest,
} from './hooks/usePOSQueries'
import { usePaymentDetail } from './hooks/usePaymentQueries'
import { useVerifyManagerPin } from '@/features/admin/hooks/useStaffQueries'
import { useCategories, useMenuItems } from '@/features/admin/hooks/useMenuQueries'
import { Category, CourseStage } from '@/features/guest/types/guest.types'
import { useWebSocket } from '@/lib/websocket'
import { playSuccessSound, playChime } from '@/lib/audio'
import { useBusinesses, useBranches } from '@/features/admin/hooks/useTenantQueries'
import { useDiningAreas, useTables } from '@/features/admin/hooks/useTableQueries'
import { isUuid } from '@/lib/utils'

export const POSPage: FC = () => {
  const {
    tables,
    selectedTable,
    activeRounds,
    selectedZoneId,
    exchangeRate,
    isCashModalOpen,
    isKHQRModalOpen,
    isVoidModalOpen,
    isReceiptModalOpen,
    lastPaymentId,
    targetVoidItem,
    setZones,
    setTables,
    setSelectedTable,
    setActiveRounds,
    openCashModal,
    closeCashModal,
    openKHQRModal,
    closeKHQRModal,
    openVoidModal,
    closeVoidModal,
    openReceiptModal,
    closeReceiptModal,
    updateTableStatus,
    activeCart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    viewMode,
    setViewMode,
  } = usePOSStore()
  const { language } = useLanguageStore()

  const [isTableActionsModalOpen, setIsTableActionsModalOpen] = useState(false)
  const [storeInfo, setStoreInfo] = useState({
    nameEn: localStorage.getItem('emenu_business_name_en') || '',
    nameKm: localStorage.getItem('emenu_business_name_km') || '',
    logoUrl: localStorage.getItem('emenu_business_logo') || null,
  })

  // Context identifiers
  const queryClient = useQueryClient()
  const tenantOrgId =
    localStorage.getItem('emenu_tenant_id') ||
    localStorage.getItem('emenu_organization_id') ||
    null
  const [tenantBizId, setTenantBizId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [tenantBranchId, setTenantBranchId] = useState<string | null>(() => {
    const saved = localStorage.getItem('emenu_branch_id')
    return saved && saved !== 'all' && isUuid(saved) ? saved : null
  })
  const updateTableStatusMutation = useUpdateTableStatus(tenantBizId, tenantBranchId)
  const settleCashMutation = useSettleSessionCash(tenantBizId, tenantBranchId)
  const voidItemMutation = useVoidOrderItem(tenantBizId, tenantBranchId)
  const cancelOrderMutation = useCancelOrder(tenantBizId, tenantBranchId)
  const createStaffOrderMutation = useCreateStaffOrder(tenantBizId, tenantBranchId)
  const verifyManagerPinMutation = useVerifyManagerPin(tenantOrgId)
  const accessToken = localStorage.getItem('emenu_access_token') || ''

  // Single entity REST drilldowns for active order and completed payment
  const primaryOrderId =
    activeRounds[0]?.id && isUuid(activeRounds[0].id) ? activeRounds[0].id : null
  const { data: directOrderDetail } = useOrderDetail(tenantBizId, tenantBranchId, primaryOrderId)

  const paymentUuid = lastPaymentId && isUuid(lastPaymentId) ? lastPaymentId : null
  const { data: directPaymentDetail } = usePaymentDetail(tenantBizId, tenantBranchId, paymentUuid)

  useEffect(() => {
    if (directOrderDetail && selectedTable) {
      // Sync active order detail if needed
    }
  }, [directOrderDetail, selectedTable])

  useEffect(() => {
    if (directPaymentDetail && isReceiptModalOpen) {
      // Sync active payment detail if needed
    }
  }, [directPaymentDetail, isReceiptModalOpen])

  // Menu catalog queries for direct POS ordering
  const { data: rawCategories } = useCategories(tenantBizId)
  const { data: rawMenuItems } = useMenuItems(tenantBizId)

  const catalogCategories = useMemo<Category[]>(() => {
    if (!rawCategories || !rawMenuItems) return []
    const items = rawMenuItems as any[]
    return rawCategories.map((c) => ({
      id: c.id,
      name_en: c.name_en,
      name_km: c.name_km || c.name_en,
      display_order: c.display_order ?? 0,
      items: items
        .filter((i) => i.category_id === c.id)
        .map((i) => ({
          id: i.id,
          category_id: i.category_id,
          name_en: i.name_en,
          name_km: i.name_km || i.name_en,
          description_en: i.description_en || '',
          description_km: i.description_km || '',
          base_price_usd: Number(i.base_price_usd) || 0,
          image_url: i.image_url || null,
          is_available: i.is_available ?? true,
          spicy_level: i.spicy_level,
          is_popular: i.is_popular,
          is_vegetarian: i.is_vegetarian,
          variants: (i.variants || []).map((v: any) => ({
            id: v.id,
            name_en: v.name_en,
            name_km: v.name_km,
            price_usd: Number(v.price_usd) || 0,
            is_default: v.is_default ?? false,
          })),
          modifier_groups: i.modifier_groups || [],
        })),
    }))
  }, [rawCategories, rawMenuItems])

  // 1. Resolve Active Business and Branch IDs dynamically via TanStack Query
  const { data: businesses } = useBusinesses()
  useEffect(() => {
    if (!tenantBizId && businesses && businesses.length > 0) {
      const biz = businesses[0]
      setTenantBizId(biz.id)
      localStorage.setItem('emenu_business_id', biz.id)
      const nameEn = biz.name_en || ''
      const nameKm = biz.name_km || nameEn
      const logo = biz.logo_url || null
      setStoreInfo({ nameEn, nameKm, logoUrl: logo })
      if (nameEn) localStorage.setItem('emenu_business_name_en', nameEn)
      if (nameKm) localStorage.setItem('emenu_business_name_km', nameKm)
      if (logo) localStorage.setItem('emenu_business_logo', logo)
    }
  }, [businesses, tenantBizId])

  const { data: branches } = useBranches(tenantBizId)
  useEffect(() => {
    if ((!tenantBranchId || tenantBranchId === 'all' || !isUuid(tenantBranchId)) && branches && branches.length > 0) {
      const b = branches[0]
      setTenantBranchId(b.id)
      localStorage.setItem('emenu_branch_id', b.id)
    }
  }, [branches, tenantBranchId])

  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)

  // 2. Fetch Dining Areas and Tables via TanStack Query
  const { data: rawAreas, isLoading: isAreasLoading } = useDiningAreas(tenantBizId, tenantBranchId)
  const { data: rawTables, isLoading: isTablesLoading } = useTables(tenantBizId, tenantBranchId)

  const isLoading = isSwitchingBranch || ((isAreasLoading || isTablesLoading) && tables.length === 0)

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const branchId = e.detail?.branchId
      if (branchId) {
        const target = branchId === 'all' ? (branches?.[0]?.id || null) : branchId
        setIsSwitchingBranch(true)
        setTenantBranchId(target)
        setSelectedTable(null)
        setActiveRounds([])
        setTables([])
        setZones([])
        queryClient.invalidateQueries({ queryKey: ['tables'] })
        queryClient.invalidateQueries({ queryKey: ['dining-areas'] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [branches, queryClient, setSelectedTable, setActiveRounds, setTables, setZones])

  useEffect(() => {
    if (!rawAreas) return
    const builtZones: POSDiningZone[] = rawAreas.map((z) => ({
      id: z.id,
      name_en: z.name_en,
      name_km: z.name_km || z.name_en,
    }))
    setZones(builtZones)
  }, [rawAreas, setZones])

  useEffect(() => {
    if (!rawTables) return
    const safeAreas = rawAreas || []
    const builtTables: POSTable[] = rawTables.map((t) => ({
      id: t.id,
      table_number: t.table_number,
      status: (t.status || 'AVAILABLE').toLowerCase() as any,
      capacity: t.max_capacity || 4,
      dining_area_id: t.dining_area_id,
      dining_area_name: safeAreas.find((a) => a.id === t.dining_area_id)?.name_en || 'Main Area',
      session_id: (t as any).active_session_id || null,
      session_elapsed_minutes: 0,
      session_subtotal_usd: 0,
      guest_count: t.max_capacity || 2,
      active_orders_count: 0,
    }))
    setTables(builtTables)
    setIsSwitchingBranch(false)
  }, [rawTables, rawAreas, setTables])

  const fetchPOSData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dining-areas'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  }, [queryClient])

  // 3. Select Table & Load its Live Order Rounds
  const handleSelectTable = useCallback((table: POSTable) => {
    setSelectedTable(table)

    if (table.session_id && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      queryClient
        .fetchQuery(sessionRoundsQuery(tenantBizId, tenantBranchId, table.id, table.session_id))
        .then(setActiveRounds)
        .catch(() => setActiveRounds([]))
    } else {
      setActiveRounds([])
    }
  }, [queryClient, setActiveRounds, setSelectedTable, tenantBizId, tenantBranchId])

  // 4. Mark Table Cleaned Action
  const handleMarkCleaned = async (tableId: string) => {
    updateTableStatus(tableId, 'available', null)
    playSuccessSound()

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await updateTableStatusMutation
        .mutateAsync({ tableId, status: 'available' })
        .catch(() => null)
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
      await settleCashMutation
        .mutateAsync({
          sessionId: selectedTable.session_id,
          payload: {
            amount_tendered_usd: result.tenderedUSD,
            amount_tendered_khr: result.tenderedKHR,
            preferred_change_currency: 'khr',
          },
        })
        .catch(() => null)
    }
  }

  // 7. Supervisor PIN Void Handler
  const handleConfirmSupervisorVoid = async (pin: string, reason: string) => {
    if (!targetVoidItem) return

    // 1. Verify Manager/Supervisor PIN with backend
    if (tenantOrgId) {
      const pinResult = await verifyManagerPinMutation.mutateAsync({
        pin_code: pin,
        required_permission: 'can_void_item',
        branch_id: isUuid(tenantBranchId) ? tenantBranchId : undefined,
      })
      if (!pinResult.valid) {
        throw new Error(
          language === 'km'
            ? 'លេខកូដសម្ងាត់អ្នកគ្រប់គ្រងមិនត្រឹមត្រូវ ឬគ្មានសិទ្ធិ។'
            : 'Invalid supervisor PIN or unauthorized role.'
        )
      }
    }

    // 2. The void route takes the parent order ID; each POS round is one order.
    const parentOrder = activeRounds.find((r) => r.items.some((i) => i.id === targetVoidItem.id))
    if (parentOrder && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await voidItemMutation.mutateAsync({
        orderId: parentOrder.id,
        itemId: targetVoidItem.id,
        reason,
      })
    }

    playSuccessSound()
    const updatedRounds = activeRounds
      .map((r) => ({
        ...r,
        items: r.items.filter((i) => i.id !== targetVoidItem.id),
        subtotal_usd: r.items
          .filter((i) => i.id !== targetVoidItem.id)
          .reduce((sum, i) => sum + i.subtotal_usd, 0),
      }))
      .filter((r) => r.items.length > 0)

    setActiveRounds(updatedRounds)
    closeVoidModal()
  }

  // 8. Staff Order Placement Handler
  const handleSubmitOrder = async (courseStage: CourseStage, guestNotes: string) => {
    if (!tenantBizId || !tenantBranchId || activeCart.length === 0) return

    const toBackendStage = (stage?: CourseStage | string): 'drinks' | 'starters' | 'mains' | 'desserts' => {
      const s = String(stage || 'MAINS').toLowerCase()
      if (s === 'appetizers' || s === 'starters') return 'starters'
      if (s === 'drinks') return 'drinks'
      if (s === 'desserts' || s === 'digestifs') return 'desserts'
      return 'mains'
    }

    const payload: StaffOrderPlacementRequest = {
      table_id: selectedTable?.id || undefined,
      table_session_id: selectedTable?.session_id || undefined,
      order_type: selectedTable ? 'dine_in' : 'takeaway',
      guest_notes: guestNotes.trim() || undefined,
      items: activeCart.map((item) => ({
        menu_item_id: item.menu_item_id,
        item_variant_id: item.variant_id || undefined,
        quantity: item.quantity,
        course_stage: toBackendStage(item.course_stage || courseStage),
        special_instructions: item.special_instructions || undefined,
        modifiers: (item.modifiers || []).map((m) => ({
          modifier_option_id: m.modifier_option_id,
          quantity: 1,
        })),
      })),
    }

    await createStaffOrderMutation.mutateAsync(payload)
    clearCart()
    setViewMode('floor_map')
    playSuccessSound()
    if (selectedTable?.session_id) {
      queryClient.invalidateQueries({
        queryKey: ['pos', 'rounds', tenantBizId, tenantBranchId, selectedTable.session_id],
      })
    }
  }

  const handleCancelRound = async (roundId: string) => {
    const confirmMsg =
      language === 'km'
        ? 'តើអ្នកពិតជាចង់លុបចោលជុំកុម្ម៉ង់នេះមែនទេ?'
        : 'Are you sure you want to cancel this entire order round?'
    if (!window.confirm(confirmMsg)) return

    playSuccessSound()
    setActiveRounds(activeRounds.filter((r) => r.id !== roundId))

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await cancelOrderMutation
        .mutateAsync({
          orderId: roundId,
          cancelReasonCode: 'guest_changed_mind',
          cancelReason: 'Cashier cancelled round',
        })
        .catch(() => null)
    }
  }

  // 8. Service hub events: refresh the request queue, and flag tables that asked for the bill
  const handleServiceHubEvent = useCallback(
    (event: ServiceHubEvent) => {
      const { isMuted } = useServiceHubStore.getState()
      if (isServiceRequestEvent(event)) {
        queryClient.invalidateQueries({
          queryKey: serviceRequestKeys.branch(tenantBizId, tenantBranchId),
        })
        if (event.name === 'service_request.created' && !isMuted) playChime(659.25, 880, 0.3)
        return
      }
      // table_session.bill_requested
      if (event.tableId) updateTableStatus(event.tableId, 'bill_requested')
      fetchPOSData()
      if (!isMuted) playChime(659.25, 880, 0.4)
    },
    [queryClient, tenantBizId, tenantBranchId, updateTableStatus, fetchPOSData]
  )

  // 9. WebSocket Real-Time Listener for POS Room
  const wsUrl =
    accessToken && isUuid(tenantBranchId)
      ? `/ws/branches/${tenantBranchId}?token=${accessToken}&room_type=pos`
      : null

  const { isConnected } = useWebSocket(wsUrl, {
    autoConnect: !!wsUrl,
    onMessage: (rawMsg) => {
      const hubEvent = parseServiceHubEvent(rawMsg)
      if (hubEvent) {
        handleServiceHubEvent(hubEvent)
        return
      }
      try {
        const data = typeof rawMsg === 'object' && rawMsg !== null ? (rawMsg as any) : {}
        if (data.event === 'TABLE_STATUS_CHANGED') {
          updateTableStatus(data.table_id, data.status)
          fetchPOSData()
        } else if (data.event === 'PAYMENT_SETTLED') {
          updateTableStatus(data.table_id, 'dirty_cleaning')
          fetchPOSData()
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

  const rawStoreName =
    language === 'km'
      ? storeInfo.nameKm || storeInfo.nameEn || 'ហាងរបស់ខ្ញុំ'
      : storeInfo.nameEn || storeInfo.nameKm || 'Store'

  const resolvedStoreName =
    rawStoreName
      .replace(/'s\s+restaurant$/i, '')
      .replace(/\s+restaurant$/i, '')
      .trim() || rawStoreName

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <EmenuLoader
          size="lg"
          message={language === 'km' ? 'កំពុងទាញយកប្លង់តុ និង POS...' : 'Loading Floor Map & POS...'}
          showBrandText
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased flex flex-col justify-between">
      <div>
        {/* Sticky POS Header */}
        <POSHeader
          storeName={resolvedStoreName}
          storeLogo={storeInfo.logoUrl}
          isConnected={isConnected}
          businessId={tenantBizId}
          branchId={tenantBranchId}
        />

        {/* Main Workspace Body */}
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
          {/* Header / Mode Indicator */}
          <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              {viewMode === 'direct_order' ? (
                <button
                  type="button"
                  onClick={() => setViewMode('floor_map')}
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-2 text-zinc-800 dark:text-zinc-200 transition-colors shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{language === 'km' ? 'ត្រឡប់ទៅប្លង់តុ' : 'Back to Floor Map'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {language === 'km' ? 'ប្លង់តុភោជនីយដ្ឋាន' : 'Floor Map Overview'}
                  </span>
                </div>
              )}
            </div>

            {selectedTable && (
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-900 dark:text-zinc-100">
                  {language === 'km' ? 'តុ' : 'Table'}: {selectedTable.table_number}
                </span>
                {viewMode === 'floor_map' && (
                  <button
                    type="button"
                    onClick={() => setViewMode('direct_order')}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors"
                  >
                    {language === 'km' ? '+ កុម្ម៉ង់ម្ហូប' : '+ Take Order'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* View Mode: Floor Map vs Direct Order Menu Catalog */}
          {viewMode === 'direct_order' ? (
            <div className="w-full">
              <POSMenuCatalog
                categories={catalogCategories}
                activeCart={activeCart}
                selectedTable={selectedTable}
                onAddToCart={addToCart}
                onUpdateCartQty={updateCartQuantity}
                onRemoveFromCart={removeFromCart}
                onClearCart={clearCart}
                onSubmitOrder={handleSubmitOrder}
                isSubmitting={createStaffOrderMutation.isPending}
              />
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1 w-full">
                <POSTableGrid
                  tables={tables}
                  selectedZoneId={selectedZoneId}
                  selectedTableId={selectedTable?.id}
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
                  onCancelRound={handleCancelRound}
                  onPrintPrecheck={() => openReceiptModal('PRECHECK')}
                  onOpenTableActions={() => setIsTableActionsModalOpen(true)}
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

      {/* Dynamic Bakong KHQR Settlement Modal */}
      <POSKHQRModal
        isOpen={isKHQRModalOpen}
        onClose={closeKHQRModal}
        businessId={tenantBizId}
        branchId={tenantBranchId}
        sessionId={selectedTable?.session_id}
        tableNumber={selectedTable?.table_number || 'T-01'}
        totalUSD={totalUSD}
        onSuccessPayment={() => {
          playSuccessSound()
          if (selectedTable) {
            updateTableStatus(selectedTable.id, 'dirty_cleaning', null)
          }
          setActiveRounds([])
          openReceiptModal(`PAY-${Date.now()}`)
        }}
      />

      {/* Table Seating, Transfer, and Merge Actions Modal */}
      <POSTableActionsModal
        isOpen={isTableActionsModalOpen}
        onClose={() => setIsTableActionsModalOpen(false)}
        table={selectedTable}
        allTables={tables}
        businessId={tenantBizId}
        branchId={tenantBranchId}
        onSuccessAction={() => {
          fetchPOSData()
          if (selectedTable?.session_id && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
            queryClient.invalidateQueries({
              queryKey: ['pos', 'rounds', tenantBizId, tenantBranchId, selectedTable.session_id],
            })
          }
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
        branchName={resolvedStoreName}
        totalUSD={totalUSD}
        totalKHR={totalKHR}
        subtotalUSD={subtotalUSD}
        taxUSD={taxUSD}
        businessId={tenantBizId}
        branchId={tenantBranchId}
        sessionId={selectedTable?.session_id}
      />

      {/* Waiter Service Requests Hub Slide-Over Drawer */}
      <ServiceHubDrawer businessId={tenantBizId} branchId={tenantBranchId} />
    </div>
  )
}
