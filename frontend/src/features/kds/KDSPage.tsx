import { useEffect, useState, useMemo, useCallback, type FC } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import { useUserRoleAccess } from '@/features/auth/hooks/useUserRoleAccess'
import {
  KDSTicket,
  KitchenStation,
} from './types/kds.types'
import { KDSHeader } from './components/KDSHeader'
import { KDSTicketCard } from './components/KDSTicketCard'
import { KDSRecallDrawer } from './components/KDSRecallDrawer'
import { useKDSStore } from './stores/useKDSStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useWebSocket } from '@/lib/websocket'
import { playKitchenOrderChime } from '@/lib/audio'
import { useBusinesses, useBranches } from '@/features/admin/hooks/useTenantQueries'
import { useStaffMembers, useVerifyStaffPin } from '@/features/admin/hooks/useStaffQueries'
import { POSCashierPinScreen, type POSStaffMember } from '@/features/pos/components/POSCashierPinScreen'
import {
  useKitchenStations,
  useKDSTickets,
  useBumpItemStatus,
  useBumpStationTicket,
  useUndoItemStatus,
  useRerouteItem,
  useFireCourse,
  useAcceptKDSOrder,
  useRejectKDSOrder,
  useStationRecallTickets,
  useStationMetrics,
} from './hooks/useKDSQueries'
import { KitchenStationSettingsModal } from './components/KitchenStationSettingsModal'
import { isUuid } from '@/lib/utils'

export const KDSPage: FC = () => {
  const { language } = useLanguageStore()
  const {
    selectedStationId,
    recalledTickets,
    isMuted,
    isRecallOpen,
    setRecalledTickets,
    setIsRecallOpen,
  } = useKDSStore()

  const queryClient = useQueryClient()
  const [loadError] = useState<string | null>(null)
  const [isStationSettingsOpen, setIsStationSettingsOpen] = useState(false)

  // Context identifiers
  const [tenantBizId, setTenantBizId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [tenantBranchId, setTenantBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )
  const [storeInfo, setStoreInfo] = useState({
    nameEn: localStorage.getItem('emenu_business_name_en') || '',
    nameKm: localStorage.getItem('emenu_business_name_km') || '',
    logoUrl: localStorage.getItem('emenu_business_logo') || null,
  })
  const accessToken = localStorage.getItem('emenu_access_token') || ''
  const tenantOrgId =
    localStorage.getItem('emenu_tenant_id') ||
    localStorage.getItem('emenu_organization_id') ||
    null

  // Staff & KDS PIN security queries
  const { data: rawStaff, isLoading: isStaffLoading } = useStaffMembers(
    tenantOrgId,
    tenantBranchId && isUuid(tenantBranchId) ? tenantBranchId : undefined
  )
  const verifyStaffPinMutation = useVerifyStaffPin(tenantOrgId)

  // Active kitchen staff session - strictly requires PIN each time KDS is entered/visited
  const [activeStaff, setActiveStaff] = useState<POSStaffMember | null>(null)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false)

  // Ensure lock state is reset on mount and on unmount
  useEffect(() => {
    sessionStorage.removeItem('emenu_kds_unlocked')
    sessionStorage.removeItem('emenu_kds_active_staff')
    return () => {
      sessionStorage.removeItem('emenu_kds_unlocked')
      sessionStorage.removeItem('emenu_kds_active_staff')
    }
  }, [])

  const staffMembersList = useMemo<POSStaffMember[]>(() => {
    if (!rawStaff || !Array.isArray(rawStaff)) return []
    return (rawStaff as any[]).map((m) => ({
      id: m.id,
      full_name: m.full_name || 'Staff',
      role: m.role || 'kitchen',
      avatar_url: m.avatar_url || null,
      pos_pin: m.pos_pin || null,
      is_owner: m.is_owner || false,
    }))
  }, [rawStaff])

  // Check if user has added staff belonging to KDS (kitchen / chef) and assigned them a PIN code
  const hasKDSStaffWithPin = useMemo(() => {
    return staffMembersList.some((m) => {
      const role = (m.role || '').toLowerCase()
      const isKDSRole = role === 'kitchen' || role === 'chef'
      return isKDSRole && !!m.pos_pin && m.pos_pin.trim().length > 0
    })
  }, [staffMembersList])

  const handleUnlock = useCallback((staff: POSStaffMember) => {
    setActiveStaff(staff)
    setIsUnlocked(true)
  }, [])

  const handleLock = useCallback(() => {
    sessionStorage.removeItem('emenu_kds_unlocked')
    sessionStorage.removeItem('emenu_kds_active_staff')
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
          terminal_type: 'kds',
        })
        if (res.valid && res.full_name) {
          const staffObj: POSStaffMember = {
            id: res.member_id || undefined,
            full_name: res.full_name,
            role: res.role || 'kitchen',
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
    if (!tenantBranchId && branches && branches.length > 0) {
      const b = branches[0]
      setTenantBranchId(b.id)
      localStorage.setItem('emenu_branch_id', b.id)
    }
  }, [branches, tenantBranchId])

  // 2. Fetch Kitchen Stations and Live Tickets via TanStack Query
  const { data: rawStations, isLoading: isStationsLoading } = useKitchenStations(tenantBizId, tenantBranchId)
  const { data: rawTickets, isLoading: isTicketsLoading } = useKDSTickets(tenantBizId, tenantBranchId, selectedStationId)

  // Purely derived stations list (0 effects, 0 risk of infinite re-renders)
  const stations: KitchenStation[] = useMemo(() => {
    if (!rawStations || rawStations.length === 0) return []
    return rawStations.map((station) => ({
      id: station.id,
      name: station.name_en,
      name_km: station.name_km,
      station_code: station.code,
      color_hex: station.color_hex,
      is_active: station.is_active,
      display_order: station.display_order,
    }))
  }, [rawStations])

  // Purely derived tickets list (0 effects, 0 risk of infinite re-renders)
  const tickets: KDSTicket[] = useMemo(() => {
    if (!rawTickets) return []
    const ticketList = Array.isArray(rawTickets)
      ? (rawTickets as any[])
      : (rawTickets as any)?.tickets && Array.isArray((rawTickets as any).tickets)
      ? (rawTickets as any).tickets
      : []
    return ticketList as KDSTicket[]
  }, [rawTickets])

  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)
  const isLoading = isSwitchingBranch || ((isStationsLoading || isTicketsLoading) && tickets.length === 0)

  const bumpItemMutation = useBumpItemStatus(tenantBizId, tenantBranchId)
  const bumpStationTicketMutation = useBumpStationTicket(tenantBizId, tenantBranchId)
  const undoItemMutation = useUndoItemStatus(tenantBizId, tenantBranchId)
  const rerouteItemMutation = useRerouteItem(tenantBizId, tenantBranchId)
  const fireCourseMutation = useFireCourse(tenantBizId, tenantBranchId)
  const acceptOrderMutation = useAcceptKDSOrder(tenantBizId, tenantBranchId)
  const rejectOrderMutation = useRejectKDSOrder(tenantBizId, tenantBranchId)

  const activeStationId = selectedStationId !== 'expo' && selectedStationId ? selectedStationId : null
  const { data: stationMetrics } = useStationMetrics(tenantBizId, tenantBranchId, activeStationId)
  const { data: serverRecalledTickets } = useStationRecallTickets(tenantBizId, tenantBranchId, activeStationId)

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const newBranchId = e.detail?.branchId
      if (newBranchId) {
        setIsSwitchingBranch(true)
        const target = newBranchId === 'all' ? (branches && branches[0]?.id ? branches[0].id : null) : newBranchId
        setTenantBranchId(target)
        queryClient.invalidateQueries({ queryKey: ['kds'] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [branches, queryClient])

  useEffect(() => {
    if (!isStationsLoading && !isTicketsLoading) {
      setIsSwitchingBranch(false)
    }
  }, [isStationsLoading, isTicketsLoading])

  // 3. Real-Time WebSocket Connection for Staff Room
  const wsRoomType = selectedStationId === 'expo' ? 'expo' : 'station'
  const wsUrl =
    accessToken && isUuid(tenantBranchId)
      ? `/ws/branches/${tenantBranchId}?token=${accessToken}&room_type=${wsRoomType}${
          selectedStationId !== 'expo' && isUuid(selectedStationId) ? `&station_id=${selectedStationId}` : ''
        }`
      : null

  const { isConnected } = useWebSocket(wsUrl, {
    autoConnect: !!wsUrl,
    onMessage: (rawMsg) => {
      try {
        const data = typeof rawMsg === 'object' && rawMsg !== null ? (rawMsg as any) : {}
        const evt = data.event || data.type || ''

        if (
          evt === 'order.created' ||
          evt === 'order.placed' ||
          evt === 'NEW_ORDER' ||
          evt === 'order.item_bumped' ||
          evt === 'order.course_fired' ||
          evt === 'order.bumped' ||
          evt === 'order.updated' ||
          evt === 'payment.completed' ||
          evt === 'ITEM_STATUS_CHANGED' ||
          evt === 'TICKET_BUMPED'
        ) {
          if ((evt === 'order.created' || evt === 'order.placed' || evt === 'NEW_ORDER') && !isMuted) {
            playKitchenOrderChime()
          }
          queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', tenantBizId, tenantBranchId] })
        } else if (evt === 'menu.updated') {
          queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', tenantBizId, tenantBranchId] })
        }
      } catch {
        // Ignore parse error
      }
    },
  })

  // Filter tickets by selected station tab
  const filteredTickets = useMemo(() => {
    if (!tickets || tickets.length === 0) return []
    if (selectedStationId === 'expo') {
      return tickets
    }
    return tickets
      .map((t) => ({
        ...t,
        items: t.items.filter((item) => item.kitchen_station_id === selectedStationId),
      }))
      .filter((t) => t.items.length > 0)
  }, [tickets, selectedStationId])

  // Query key for real-time ticket cache
  const queryTicketsKey = ['kds', 'tickets', tenantBizId, tenantBranchId, selectedStationId]

  // Handlers for Bumping and Recalling Items/Tickets
  const handleItemStatusBump = async (
    orderItemId: string,
    targetStatus: any
  ) => {
    // Optimistically update query cache
    queryClient.setQueryData(queryTicketsKey, (old: any) => {
      if (!old) return old
      const list = Array.isArray(old) ? old : old?.tickets || []
      return list.map((t: any) => ({
        ...t,
        items: (t.items || []).map((item: any) =>
          item.id === orderItemId ? { ...item, status: targetStatus } : item
        ),
      }))
    })

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        await bumpItemMutation.mutateAsync({
          orderItemId,
          status: targetStatus,
        })
      } catch {
        queryClient.invalidateQueries({ queryKey: queryTicketsKey })
      }
    }
  }

  const handleTicketBump = async (orderId: string) => {
    const targetTicket = tickets.find((t) => t.order_id === orderId)
    if (targetTicket) {
      setRecalledTickets([targetTicket, ...recalledTickets])
    }

    // Optimistically remove ticket from query cache
    queryClient.setQueryData(queryTicketsKey, (old: any) => {
      if (!old) return old
      const list = Array.isArray(old) ? old : old?.tickets || []
      return list.filter((t: any) => t.order_id !== orderId)
    })

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        if (isUuid(selectedStationId)) {
          await bumpStationTicketMutation.mutateAsync({ orderId, stationId: selectedStationId })
        } else if (targetTicket) {
          // Expo has no order-level bump route: mark each remaining item as served.
          const pendingItems = targetTicket.items.filter(
            (item) => !['served', 'voided', 'SERVED', 'VOIDED'].includes(item.status)
          )
          await Promise.all(
            pendingItems.map((item) =>
              bumpItemMutation.mutateAsync({ orderItemId: item.id, status: 'served' })
            )
          )
        }
      } catch {
        queryClient.invalidateQueries({ queryKey: queryTicketsKey })
      }
    }
  }

  const handleItemUndo = async (orderItemId: string) => {
    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        await undoItemMutation.mutateAsync(orderItemId)
      } catch {
        // non-blocking
      }
    }
  }

  const handleFireCourse = async (orderId: string) => {
    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        await fireCourseMutation.mutateAsync({ orderId })
      } catch {
        // non-blocking
      }
    }
  }

  const handleRerouteItem = async (orderItemId: string, targetStationId: string) => {
    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        await rerouteItemMutation.mutateAsync({ orderItemId, targetStationId })
      } catch {
        // non-blocking
      }
    }
  }

  const handleAcceptOrder = async (orderId: string) => {
    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await acceptOrderMutation.mutateAsync(orderId)
    }
  }

  const handleRejectOrder = async (orderId: string, reason?: string) => {
    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      await rejectOrderMutation.mutateAsync({ orderId, reason })
    }
  }

  const handleTicketRecall = (ticket: KDSTicket) => {
    setRecalledTickets(recalledTickets.filter((t) => t.order_id !== ticket.order_id))
    queryClient.setQueryData(queryTicketsKey, (old: any) => {
      if (!old) return [ticket]
      const list = Array.isArray(old) ? old : old?.tickets || []
      return [ticket, ...list]
    })
    queryClient.invalidateQueries({ queryKey: queryTicketsKey })
  }

  const resolvedStoreName =
    language === 'km'
      ? storeInfo.nameKm || storeInfo.nameEn || 'ហាងរបស់ខ្ញុំ'
      : storeInfo.nameEn || storeInfo.nameKm || 'Store'

  const { isCashierOnly, canAccessAdmin } = useUserRoleAccess()

  if (isCashierOnly) {
    return <Navigate to="/pos" replace />
  }

  if (isLoading || (isStaffLoading && staffMembersList.length === 0 && !isUnlocked)) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <EmenuLoader
          size="lg"
          message={language === 'km' ? 'កំពុងទាញយកទិន្នន័យផ្ទះបាយ KDS...' : 'Loading Kitchen Screen...'}
          showBrandText
        />
      </div>
    )
  }

  // KDS PIN Lock Check:
  // If there are staff belonging to KDS with a PIN configured, and terminal is not yet unlocked in this session:
  const requiresPinLock = hasKDSStaffWithPin && !isUnlocked

  if (requiresPinLock) {
    return (
      <POSCashierPinScreen
        storeName={resolvedStoreName}
        storeLogo={storeInfo.logoUrl}
        titleKm="ចូលប្រើប្រព័ន្ធផ្ទះបាយ KDS"
        titleEn="Kitchen Display System (KDS)"
        subtitleKm="សូមបញ្ចូលលេខកូដសម្ងាត់បុគ្គលិក (PIN ៤ ខ្ទង់)"
        subtitleEn="Enter your 4-digit staff PIN to unlock KDS"
        canAccessAdmin={canAccessAdmin}
        onVerifyPin={handleVerifyBackendPin}
      />
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-amber-500 selection:text-black">
      {/* 1. Header */}
      <KDSHeader
        storeName={resolvedStoreName}
        storeLogo={storeInfo.logoUrl}
        isConnected={isConnected}
        metrics={stationMetrics}
        activeTicketsCount={tickets.length}
        activeStaff={activeStaff}
        onLock={hasKDSStaffWithPin ? handleLock : undefined}
        canAccessAdmin={canAccessAdmin}
        onOpenRecall={() => setIsRecallOpen(true)}
        onOpenStations={() => setIsStationSettingsOpen(true)}
      />

      {/* 2. Main Stage: Ticket Grid Viewport */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col">
        {isLoading ? (
          <div className="flex-1 min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
            <EmenuLoader
              size="lg"
              message={language === 'km' ? 'កំពុងទាញយកសំបុត្រពីផ្ទះបាយ...' : 'Loading kitchen tickets...'}
              showBrandText
            />
          </div>
        ) : loadError ? (
          <div className="flex-1 min-h-[calc(100vh-200px)] flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto">
            <AlertCircle className="w-10 h-10 text-rose-500" />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{loadError}</p>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['kds'] })}
              className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs uppercase tracking-wider hover:bg-amber-400 cursor-pointer"
            >
              {language === 'km' ? 'ព្យាយាមម្តងទៀត' : 'Try Again'}
            </button>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex-1 min-h-[calc(100vh-200px)] flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-base font-bold text-zinc-800 dark:text-zinc-200">
              {language === 'km' ? 'គ្មានការកុម្ម៉ង់សកម្មក្នុងផ្ទះបាយទេ' : 'No Active Kitchen Orders'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              {language === 'km'
                ? 'ការកុម្ម៉ង់ថ្មីដែលបានដាក់ពីតុ ឬពីផ្នែក POS នឹងបង្ហាញនៅទីនេះដោយស្វ័យប្រវត្តិ។'
                : 'New orders placed from customer QR codes or POS will appear here automatically.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
            {filteredTickets.map((ticket) => (
              <KDSTicketCard
                key={ticket.order_id}
                ticket={ticket}
                onBumpItem={handleItemStatusBump}
                onBumpTicket={handleTicketBump}
                onUndoItem={handleItemUndo}
                onFireCourse={handleFireCourse}
                onRerouteItem={handleRerouteItem}
                onAcceptOrder={handleAcceptOrder}
                onRejectOrder={handleRejectOrder}
                stations={stations}
              />
            ))}
          </div>
        )}
      </main>

      {/* 4. Recalled Orders Bottom Drawer */}
      <KDSRecallDrawer
        isOpen={isRecallOpen}
        recalledTickets={
          serverRecalledTickets && serverRecalledTickets.length > 0
            ? (serverRecalledTickets as any[])
            : recalledTickets
        }
        onClose={() => setIsRecallOpen(false)}
        onRecallTicket={handleTicketRecall}
      />

      {/* 5. Kitchen Station Settings Modal */}
      <KitchenStationSettingsModal
        isOpen={isStationSettingsOpen}
        onClose={() => setIsStationSettingsOpen(false)}
        businessId={tenantBizId}
        branchId={tenantBranchId}
      />
    </div>
  )
}
