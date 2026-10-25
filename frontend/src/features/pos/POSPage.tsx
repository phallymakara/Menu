import { useEffect, useState, useMemo, useCallback, type FC } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowLeft, Search, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useUserRoleAccess } from '@/features/auth/hooks/useUserRoleAccess'
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
import { useVerifyManagerPin, useStaffMembers, useVerifyStaffPin } from '@/features/admin/hooks/useStaffQueries'
import { POSCashierPinScreen, type POSStaffMember } from './components/POSCashierPinScreen'
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
  const [menuSearchQuery, setMenuSearchQuery] = useState('')
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
  const verifyStaffPinMutation = useVerifyStaffPin(tenantOrgId)
  const accessToken = localStorage.getItem('emenu_access_token') || ''

  // Staff & Cashier PIN security queries
  const { data: rawStaff, isLoading: isStaffLoading } = useStaffMembers(
    tenantOrgId,
    tenantBranchId && isUuid(tenantBranchId) ? tenantBranchId : undefined
  )

  // Active cashier session - strictly requires PIN each time POS is entered/visited
  const [activeStaff, setActiveStaff] = useState<POSStaffMember | null>(null)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false)

  // Ensure lock state is reset on mount and on unmount
  useEffect(() => {
    sessionStorage.removeItem('emenu_pos_unlocked')
    sessionStorage.removeItem('emenu_pos_active_staff')
    return () => {
      sessionStorage.removeItem('emenu_pos_unlocked')
      sessionStorage.removeItem('emenu_pos_active_staff')
    }
  }, [])

  const staffMembersList = useMemo<POSStaffMember[]>(() => {
    if (!rawStaff || !Array.isArray(rawStaff)) return []
    return (rawStaff as any[]).map((m) => ({
      id: m.id,
      full_name: m.full_name || 'Staff',
      role: m.role || 'staff',
      avatar_url: m.avatar_url || null,
      pos_pin: m.pos_pin || null,
      is_owner: m.is_owner || false,
    }))
  }, [rawStaff])

  // Check if user has added staff belonging to POS (cashier) and assigned them a PIN code
  const hasPOSStaffWithPin = useMemo(() => {
    return staffMembersList.some((m) => {
      const role = (m.role || '').toLowerCase()
      const isPOSRole = role === 'cashier'
      return isPOSRole && !!m.pos_pin && m.pos_pin.trim().length > 0
    })
  }, [staffMembersList])

  const handleUnlock = useCallback((staff: POSStaffMember) => {
    setActiveStaff(staff)
    setIsUnlocked(true)
  }, [])

  const handleLock = useCallback(() => {
    sessionStorage.removeItem('emenu_pos_unlocked')
    sessionStorage.removeItem('emenu_pos_active_staff')
    setActiveStaff(null)
    setIsUnlocked(false)
  }, [])

  const handleVerifyBackendPin = useCallback(
    async (pin: string) => {
      if (!tenantOrgId) return { valid: false }
      try {
        const res = await verifyStaffPinMutation.mutateAsync({
          pin_code: pin,
          branch_id: tenantBranchId && isUuid(tenantBranchId) ? tenantBranchId : undefined,
          terminal_type: 'pos',
        })
        if (res.valid && res.full_name) {
          const staffObj: POSStaffMember = {
            id: res.member_id || undefined,
            full_name: res.full_name,
            role: res.role || 'cashier',
            avatar_url: res.avatar_url || null,
          }
          handleUnlock(staffObj)
          return { valid: true }
        }
        return { valid: false }
      } catch {
        return { valid: false }
      }
    },
    [tenantOrgId, tenantBranchId, verifyStaffPinMutation, handleUnlock]
  )

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
        .map((i) => {
          const basePrice = Number(i.base_price ?? i.base_price_usd ?? i.price_usd) || 0
          return {
            id: i.id,
            category_id: i.category_id,
            name_en: i.name_en,
            name_km: i.name_km || i.name_en,
            description_en: i.description_en || '',
            description_km: i.description_km || '',
            base_price_usd: basePrice,
            image_url: i.image_url || null,
            is_available: i.is_available ?? true,
            spicy_level: i.spicy_level ?? (i.spice_level ?? 0),
            is_popular: i.is_popular ?? false,
            is_vegetarian: i.is_vegetarian ?? false,
            variants: (i.variants || []).map((v: any) => ({
              id: v.id,
              name_en: v.name_en,
              name_km: v.name_km,
              price_usd: v.price_usd != null ? Number(v.price_usd) : (basePrice + (Number(v.price_adjustment) || 0)),
              is_default: v.is_default ?? false,
            })),
            modifier_groups: i.modifier_groups || [],
          }
        }),
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

  const [isLoadingRounds, setIsLoadingRounds] = useState(false)

  useEffect(() => {
    if (!rawTables) return
    const safeAreas = rawAreas || []
    const builtTables: POSTable[] = rawTables.map((t) => {
      const isAvailable = (t.status || 'AVAILABLE').toLowerCase() === 'available'
      return {
        id: t.id,
        table_number: t.table_number,
        status: (t.status || 'AVAILABLE').toLowerCase() as any,
        capacity: t.max_capacity || 4,
        dining_area_id: t.dining_area_id,
        dining_area_name: safeAreas.find((a) => a.id === t.dining_area_id)?.name_en || 'Main Area',
        session_id: isAvailable ? null : ((t as any).active_session_id || null),
        session_elapsed_minutes: isAvailable ? 0 : ((t as any).session_elapsed_minutes ?? 0),
        session_subtotal_usd: isAvailable ? 0 : ((t as any).session_subtotal_usd ?? 0),
        guest_count: t.max_capacity || 2,
        active_orders_count: isAvailable ? 0 : ((t as any).active_orders_count ?? 0),
      }
    })
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

    if (table.status === 'available' || !table.session_id) {
      setActiveRounds([])
      setIsLoadingRounds(false)
      return
    }

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      setIsLoadingRounds(true)
      queryClient
        .fetchQuery(sessionRoundsQuery(tenantBizId, tenantBranchId, table.id, table.session_id))
        .then((rounds) => {
          setActiveRounds(rounds)
          setIsLoadingRounds(false)
        })
        .catch(() => {
          setActiveRounds([])
          setIsLoadingRounds(false)
        })
    } else {
      setActiveRounds([])
      setIsLoadingRounds(false)
    }
  }, [queryClient, setActiveRounds, setSelectedTable, tenantBizId, tenantBranchId])

  // 3b. Take Order directly on Table
  const handleTakeOrder = useCallback((table: POSTable) => {
    handleSelectTable(table)
    setViewMode('direct_order')
  }, [handleSelectTable, setViewMode])

  // 4. Mark Table Cleaned Action
  const handleMarkCleaned = async (tableId: string) => {
    const targetTable =
      tables.find((t) => t.id === tableId) || (selectedTable?.id === tableId ? selectedTable : null)
    const hasUnpaid =
      targetTable &&
      ((targetTable.active_orders_count !== undefined && targetTable.active_orders_count > 0) ||
        (targetTable.session_subtotal_usd !== undefined && targetTable.session_subtotal_usd > 0))

    if (hasUnpaid) {
      alert(
        language === 'km'
          ? 'មិនអាចដោះលែងតុនេះបានទេ ដោយសារមានការកុម្ម៉ង់ដែលមិនទាន់ទូទាត់។ សូមទូទាត់ប្រាក់ជាមុនសិន (សាច់ប្រាក់ ឬ KHQR)។'
          : 'Cannot free table with unpaid orders. Settle bill via Cash or KHQR first.'
      )
      return
    }

    updateTableStatus(tableId, 'available', null)
    if (selectedTable && selectedTable.id === tableId) {
      setSelectedTable({
        ...selectedTable,
        status: 'available',
        session_id: null,
        session_subtotal_usd: 0,
        active_orders_count: 0,
      })
      setActiveRounds([])
    }
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
        const evt = String(data.event || data.type || '').toLowerCase()

        if (evt === 'order.created' || evt === 'order.placed' || evt === 'new_order') {
          if (data.table_id) {
            updateTableStatus(data.table_id, 'occupied', data.order_id)
          }
          fetchPOSData()
          queryClient.invalidateQueries({ queryKey: ['dining-areas'] })
          queryClient.invalidateQueries({ queryKey: ['tables'] })
          queryClient.invalidateQueries({ queryKey: ['pos', 'rounds'] })
          queryClient.invalidateQueries({ queryKey: ['orders'] })

          if (selectedTable && (selectedTable.id === data.table_id || selectedTable.session_id === data.table_session_id)) {
            const sid = data.table_session_id || selectedTable.session_id
            if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
              queryClient
                .fetchQuery(sessionRoundsQuery(tenantBizId, tenantBranchId, selectedTable.id, sid))
                .then(setActiveRounds)
                .catch(() => {})
            }
          }
          playChime(587.33, 880, 0.4)
        } else if (
          evt === 'order.item_bumped' ||
          evt === 'order.bumped' ||
          evt === 'order_status_update' ||
          evt === 'order.course_fired'
        ) {
          fetchPOSData()
          queryClient.invalidateQueries({ queryKey: ['pos', 'rounds'] })
          queryClient.invalidateQueries({ queryKey: ['orders'] })
          if (selectedTable && isUuid(tenantBizId) && isUuid(tenantBranchId)) {
            queryClient
              .fetchQuery(sessionRoundsQuery(tenantBizId, tenantBranchId, selectedTable.id, selectedTable.session_id))
              .then(setActiveRounds)
              .catch(() => {})
          }
        } else if (evt === 'table_session.opened' || evt === 'table.session.opened') {
          if (data.table_id) {
            updateTableStatus(data.table_id, 'occupied')
          }
          fetchPOSData()
        } else if (evt === 'table_status_changed' || evt === 'table.status.changed' || evt === 'table.updated') {
          if (data.table_id && data.status) {
            updateTableStatus(data.table_id, data.status)
          }
          fetchPOSData()
        } else if (evt === 'payment_settled' || evt === 'payment.settled' || evt === 'payment.completed') {
          if (data.table_id) {
            updateTableStatus(data.table_id, 'dirty_cleaning')
          }
          fetchPOSData()
          queryClient.invalidateQueries({ queryKey: ['pos', 'rounds'] })
          playSuccessSound()
        } else if (evt === 'menu.updated' || evt === 'category.updated') {
          queryClient.invalidateQueries({ queryKey: ['categories'] })
          queryClient.invalidateQueries({ queryKey: ['menu-items'] })
          queryClient.invalidateQueries({ queryKey: ['item-variants'] })
        } else if (evt === 'store.updated') {
          queryClient.invalidateQueries({ queryKey: ['business'] })
          queryClient.invalidateQueries({ queryKey: ['store-settings'] })
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

  const { isKitchenOnly, canAccessAdmin } = useUserRoleAccess()

  if (isKitchenOnly) {
    return <Navigate to="/kds" replace />
  }

  if (isLoading || (isStaffLoading && staffMembersList.length === 0 && !isUnlocked)) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <EmenuLoader
          size="lg"
          message={language === 'km' ? 'កំពុងទាញយកទិន្នន័យ POS...' : 'Loading POS Terminal...'}
          showBrandText
        />
      </div>
    )
  }

  // Cashier PIN Lock Check:
  // If there are staff/cashiers belonging to POS with a PIN configured, and terminal is not yet unlocked in this session:
  const requiresPinLock = hasPOSStaffWithPin && !isUnlocked

  if (requiresPinLock) {
    return (
      <POSCashierPinScreen
        storeName={resolvedStoreName}
        storeLogo={storeInfo.logoUrl}
        canAccessAdmin={canAccessAdmin}
        onVerifyPin={handleVerifyBackendPin}
      />
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
          activeStaff={activeStaff}
          onLock={hasPOSStaffWithPin ? handleLock : undefined}
          canAccessAdmin={canAccessAdmin}
        />

        {/* Main Workspace Body */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 max-w-[1600px] w-full mx-auto space-y-3 sm:space-y-4">
          {/* Header / Mode Indicator (Only if in direct order menu catalog mode) */}
          {viewMode === 'direct_order' && (
            <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap pb-1">
              <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-[280px]">
                {viewMode === 'direct_order' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('floor_map')
                      setMenuSearchQuery('')
                    }}
                    className="shrink-0 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-2 text-zinc-800 dark:text-zinc-200 transition-colors shadow-xs"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{language === 'km' ? 'ត្រឡប់ទៅប្លង់តុ' : 'Back to Floor Map'}</span>
                  </button>
                ) : null}

                {/* Search input on the same row as the back button */}
                {viewMode === 'direct_order' && (
                  <div className="relative flex-1 max-w-sm sm:max-w-md">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={menuSearchQuery}
                      onChange={(e) => setMenuSearchQuery(e.target.value)}
                      placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប...' : 'Search menu item...'}
                      className="w-full pl-10 pr-8 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs focus:ring-1 focus:ring-emerald-500 outline-none transition-colors shadow-xs"
                    />
                    {menuSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setMenuSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>


            </div>
          )}

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
                searchQuery={menuSearchQuery}
                onSearchQueryChange={setMenuSearchQuery}
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
                  onTakeOrder={handleTakeOrder}
                  onMarkCleaned={handleMarkCleaned}
                />
              </div>

              {/* Side Drawer for Selected Table */}
              {selectedTable && (
                <POSOrderDrawer
                  table={selectedTable}
                  rounds={activeRounds}
                  isLoading={isLoadingRounds}
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
