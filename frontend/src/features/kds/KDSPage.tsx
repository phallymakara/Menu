import { useEffect, useState, useCallback, useMemo, type FC } from 'react'
import { Utensils, RefreshCw, AlertCircle } from 'lucide-react'
import {
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

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

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
          setTenantBranchId(branchId)
          localStorage.setItem('emenu_branch_id', branchId!)
        }
      } catch {
        // Handled in catch
      }
    }

    return { bizId, branchId }
  }, [tenantBizId, tenantBranchId])

  // 2. Fetch Kitchen Stations and Live Tickets for the Isolated Tenant
  const fetchKDSData = useCallback(async () => {
    setIsRefreshing(true)
    setLoadError(null)

    try {
      const { bizId, branchId } = await resolveTenantContext()

      if (!isUuid(bizId) || !isUuid(branchId)) {
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      // Fetch kitchen stations
      const stationsRes = await api.get(
        `/businesses/${bizId}/branches/${branchId}/kitchen-stations`
      ).catch(() => ({ data: [] }))

      if (Array.isArray(stationsRes.data)) {
        setStations(stationsRes.data)
      } else {
        setStations([])
      }

      // Fetch live KDS tickets
      const ticketUrl =
        selectedStationId === 'expo'
          ? `/businesses/${bizId}/branches/${branchId}/kds/expo/tickets`
          : selectedStationId && isUuid(selectedStationId)
          ? `/businesses/${bizId}/branches/${branchId}/kds/stations/${selectedStationId}/tickets`
          : `/businesses/${bizId}/branches/${branchId}/kds/expo/tickets`

      const ticketsRes = await api.get(ticketUrl).catch(() => ({ data: [] }))
      if (Array.isArray(ticketsRes.data)) {
        setTickets(ticketsRes.data)
      } else if (ticketsRes.data?.tickets && Array.isArray(ticketsRes.data.tickets)) {
        setTickets(ticketsRes.data.tickets)
      } else {
        setTickets([])
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
  }, [language, resolveTenantContext, selectedStationId, setStations, setTickets])

  useEffect(() => {
    fetchKDSData()
  }, [fetchKDSData])

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

  // Handlers for Bumping and Recalling Items/Tickets
  const handleItemStatusBump = async (
    orderItemId: string,
    targetStatus: OrderItemStatus
  ) => {
    bumpItemStatus(orderItemId, targetStatus)

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        await api.patch(
          `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/items/${orderItemId}/status`,
          { status: targetStatus }
        )
      } catch {
        // Ignore non-blocking error
      }
    }
  }

  const handleTicketBump = async (orderId: string) => {
    const targetTicket = tickets.find((t) => t.order_id === orderId)
    if (targetTicket) {
      setRecalledTickets([targetTicket, ...recalledTickets])
    }
    removeTicket(orderId)

    if (isUuid(tenantBizId) && isUuid(tenantBranchId)) {
      try {
        await api.post(
          `/businesses/${tenantBizId}/branches/${tenantBranchId}/kds/orders/${orderId}/bump`
        ).catch(() => null)
      } catch {
        // Non-blocking
      }
    }
  }

  const handleTicketRecall = (ticket: KDSTicket) => {
    setRecalledTickets(recalledTickets.filter((t) => t.order_id !== ticket.order_id))
    addTicket(ticket)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-amber-500 selection:text-black">
      {/* 1. Header */}
      <KDSHeader
        branchName="Kitchen Display System"
        isConnected={isConnected}
        onRefresh={fetchKDSData}
        isRefreshing={isRefreshing}
      />

      {/* 2. Station Switcher Tabs */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5 flex items-center justify-between gap-4">
        <KDSStationTabs
          stations={stations}
          selectedStationId={selectedStationId}
          onSelectStation={setSelectedStation}
        />

        <button
          type="button"
          onClick={fetchKDSData}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {language === 'km' ? 'ផ្ទុកឡើងវិញ' : 'Refresh'}
          </span>
        </button>
      </div>

      {/* 3. Main Stage: Ticket Grid Viewport */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {isLoading ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">
              {language === 'km' ? 'កំពុងទាញយកសំបុត្រពីផ្ទះបាយ...' : 'Loading kitchen tickets...'}
            </p>
          </div>
        ) : loadError ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto">
            <AlertCircle className="w-10 h-10 text-rose-500" />
            <p className="text-sm text-zinc-300">{loadError}</p>
            <button
              type="button"
              onClick={fetchKDSData}
              className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs uppercase tracking-wider hover:bg-amber-400"
            >
              {language === 'km' ? 'ព្យាយាមម្តងទៀត' : 'Try Again'}
            </button>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3 text-center text-zinc-600">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <Utensils className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-bold text-zinc-400">
                {language === 'km' ? 'គ្មានការកុម្ម៉ង់សកម្មក្នុងផ្ទះបាយទេ' : 'No Active Kitchen Orders'}
              </p>
              <p className="text-xs text-zinc-600 mt-1 max-w-sm">
                {language === 'km'
                  ? 'ការកុម្ម៉ង់ថ្មីដែលបានដាក់ពីតុ ឬពីផ្នែក POS នឹងបង្ហាញនៅទីនេះដោយស្វ័យប្រវត្តិ។'
                  : 'New orders placed from customer QR codes or POS will appear here automatically.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
            {filteredTickets.map((ticket) => (
              <KDSTicketCard
                key={ticket.order_id}
                ticket={ticket}
                onBumpItem={handleItemStatusBump}
                onBumpTicket={handleTicketBump}
              />
            ))}
          </div>
        )}
      </main>

      {/* 4. Recalled Orders Bottom Drawer */}
      <KDSRecallDrawer
        isOpen={isRecallOpen}
        recalledTickets={recalledTickets}
        onClose={() => setIsRecallOpen(false)}
        onRecallTicket={handleTicketRecall}
      />
    </div>
  )
}
