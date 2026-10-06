import { useEffect, useState, useCallback, type FC } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguageStore } from '@/stores/useLanguageStore'
import {
  POSDiningZone,
  POSTable,
} from './types/pos.types'
import { POSHeader } from './components/POSHeader'
import { POSTableGrid } from './components/POSTableGrid'
import { POSOrderDrawer } from './components/POSOrderDrawer'
import { POSCashPaymentModal } from './components/POSCashPaymentModal'
import { POSSupervisorVoidModal } from './components/POSSupervisorVoidModal'
import { POSReceiptModal } from './components/POSReceiptModal'
import { KHQRPaymentModal } from '@/features/guest/components/KHQRPaymentModal'
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
  useSettleSessionCash,
  useUpdateTableStatus,
  useVoidOrderItem,
} from './hooks/usePOSQueries'
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
  } = usePOSStore()
  const { language } = useLanguageStore()

  const [storeInfo, setStoreInfo] = useState({
    nameEn: localStorage.getItem('emenu_business_name_en') || '',
    nameKm: localStorage.getItem('emenu_business_name_km') || '',
    logoUrl: localStorage.getItem('emenu_business_logo') || null,
  })

  // Context identifiers
  const queryClient = useQueryClient()
  const [tenantBizId, setTenantBizId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [tenantBranchId, setTenantBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )
  const updateTableStatusMutation = useUpdateTableStatus(tenantBizId, tenantBranchId)
  const settleCashMutation = useSettleSessionCash(tenantBizId, tenantBranchId)
  const voidItemMutation = useVoidOrderItem(tenantBizId, tenantBranchId)
  const accessToken = localStorage.getItem('emenu_access_token') || ''

  // 1. Resolve Active Business and Branch IDs dynamically via TanStack Query
  const { data: businesses = [] } = useBusinesses()
  useEffect(() => {
    if (!tenantBizId && businesses.length > 0) {
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

  const { data: branches = [] } = useBranches(tenantBizId)
  useEffect(() => {
    if (!tenantBranchId && branches.length > 0) {
      const b = branches[0]
      setTenantBranchId(b.id)
      localStorage.setItem('emenu_branch_id', b.id)
    }
  }, [branches, tenantBranchId])

  // 2. Fetch Dining Areas and Tables via TanStack Query
  const { data: rawAreas = [], isLoading: isAreasLoading } = useDiningAreas(tenantBizId, tenantBranchId)
  const { data: rawTables = [], isLoading: isTablesLoading } = useTables(tenantBizId, tenantBranchId)

  const isLoading = (isAreasLoading || isTablesLoading) && tables.length === 0

  useEffect(() => {
    if (rawAreas.length > 0) {
      const builtZones: POSDiningZone[] = rawAreas.map((z) => ({
        id: z.id,
        name_en: z.name_en,
        name_km: z.name_km || z.name_en,
      }))
      setZones(builtZones)
    }
  }, [rawAreas, setZones])

  useEffect(() => {
    if (rawTables.length > 0) {
      const builtTables: POSTable[] = rawTables.map((t) => ({
        id: t.id,
        table_number: t.table_number,
        status: (t.status || 'AVAILABLE').toLowerCase() as any,
        capacity: t.max_capacity || 4,
        dining_area_id: t.dining_area_id,
        dining_area_name: rawAreas.find((a) => a.id === t.dining_area_id)?.name_en || 'Main Area',
        session_id: (t as any).active_session_id || null,
        session_elapsed_minutes: 0,
        session_subtotal_usd: 0,
        guest_count: t.max_capacity || 2,
        active_orders_count: 0,
      }))
      setTables(builtTables)
    }
  }, [rawTables, rawAreas, setTables])

  const fetchPOSData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dining-areas', tenantBizId, tenantBranchId] })
    queryClient.invalidateQueries({ queryKey: ['tables', tenantBizId, tenantBranchId] })
  }, [queryClient, tenantBizId, tenantBranchId])

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
  const handleConfirmSupervisorVoid = async (_pin: string, reason: string) => {
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

    // The void route takes the parent order ID; each POS round is one order.
    const parentOrder = activeRounds.find((r) => r.items.some((i) => i.id === targetVoidItem.id))
    if (parentOrder && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      // The backend void endpoint has no supervisor PIN check yet, so the PIN is not sent.
      await voidItemMutation
        .mutateAsync({ orderId: parentOrder.id, itemId: targetVoidItem.id, reason })
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

  const resolvedStoreName =
    language === 'km'
      ? storeInfo.nameKm || storeInfo.nameEn || 'ភោជនីយដ្ឋាន'
      : storeInfo.nameEn || storeInfo.nameKm || 'Restaurant'

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
          storeName={resolvedStoreName}
          storeLogo={storeInfo.logoUrl}
          isConnected={isConnected}
          businessId={tenantBizId}
          branchId={tenantBranchId}
        />

        {/* Main Workspace Body */}
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
          {/* Floor Map Grid & Active Table Drawer */}
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
                onPrintPrecheck={() => openReceiptModal('PRECHECK')}
              />
            )}
          </div>
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
        merchantName={resolvedStoreName}
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
        branchName={resolvedStoreName}
        totalUSD={totalUSD}
        totalKHR={totalKHR}
        subtotalUSD={subtotalUSD}
        taxUSD={taxUSD}
      />

      {/* Waiter Service Requests Hub Slide-Over Drawer */}
      <ServiceHubDrawer businessId={tenantBizId} branchId={tenantBranchId} />
    </div>
  )
}
