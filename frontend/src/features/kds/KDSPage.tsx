import { useEffect, useState, useMemo, type FC } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  KDSTicket,
  KitchenStation,
} from './types/kds.types'
import { KDSHeader } from './components/KDSHeader'
import { KDSStationTabs } from './components/KDSStationTabs'
import { KDSTicketCard } from './components/KDSTicketCard'
import { KDSRecallDrawer } from './components/KDSRecallDrawer'
import { useKDSStore } from './stores/useKDSStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useWebSocket } from '@/lib/websocket'
import { playChime } from '@/lib/audio'
import { useBusinesses, useBranches } from '@/features/admin/hooks/useTenantQueries'
import {
  useKitchenStations,
  useKDSTickets,
  useBumpItemStatus,
  useBumpStationTicket,
  useUndoItemStatus,
  useRerouteItem,
  useFireCourse,
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
    setSelectedStation,
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
          evt === 'NEW_ORDER' ||
          evt === 'order.item_bumped' ||
          evt === 'order.course_fired' ||
          evt === 'order.bumped' ||
          evt === 'order.updated' ||
          evt === 'payment.completed' ||
          evt === 'ITEM_STATUS_CHANGED' ||
          evt === 'TICKET_BUMPED'
        ) {
          if ((evt === 'order.created' || evt === 'NEW_ORDER') && !isMuted) {
            playChime(587.33, 880, 0.5)
          }
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

  const handleTicketRecall = (ticket: KDSTicket) => {
    setRecalledTickets(recalledTickets.filter((t) => t.order_id !== ticket.order_id))
    queryClient.setQueryData(queryTicketsKey, (old: any) => {
      if (!old) return [ticket]
      const list = Array.isArray(old) ? old : old?.tickets || []
      return [ticket, ...list]
    })
    queryClient.invalidateQueries({ queryKey: queryTicketsKey })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-amber-500 selection:text-black">
      {/* 1. Header */}
      <KDSHeader
        storeName={language === 'km' ? storeInfo.nameKm || storeInfo.nameEn : storeInfo.nameEn || storeInfo.nameKm}
        storeLogo={storeInfo.logoUrl}
        isConnected={isConnected}
        metrics={stationMetrics}
        activeTicketsCount={tickets.length}
        onOpenRecall={() => setIsRecallOpen(true)}
        onOpenStations={() => setIsStationSettingsOpen(true)}
      />

      {/* 2. Station Switcher Tabs (Only if custom kitchen stations exist) */}
      {stations.length > 0 && (
        <KDSStationTabs
          stations={stations}
          selectedStationId={selectedStationId}
          onSelectStation={setSelectedStation}
        />
      )}

      {/* 3. Main Stage: Ticket Grid Viewport */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {isLoading ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">
              {language === 'km' ? 'កំពុងទាញយកសំបុត្រពីផ្ទះបាយ...' : 'Loading kitchen tickets...'}
            </p>
          </div>
        ) : loadError ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto">
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
          <div className="h-96 flex flex-col items-center justify-center gap-2 text-center">
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
