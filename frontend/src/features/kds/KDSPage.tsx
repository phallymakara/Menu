import { useEffect, useState, useCallback, useMemo, type FC } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
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
  const [loadError, setLoadError] = useState<string | null>(null)

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

  // 1. Resolve Active Business and Branch IDs dynamically
  const resolveTenantContext = useCallback(async () => {
    let bizId = tenantBizId
    let branchId = tenantBranchId

    if (!isUuid(bizId)) {
      try {
        const bizRes = await api.get('/businesses')
        if (Array.isArray(bizRes.data) && bizRes.data.length > 0) {
          const biz = bizRes.data[0]
          bizId = biz.id
          setTenantBizId(bizId)
          localStorage.setItem('emenu_business_id', bizId!)
          const nameEn = biz.name_en || ''
          const nameKm = biz.name_km || nameEn
          const logo = biz.logo_url || null
          setStoreInfo({ nameEn, nameKm, logoUrl: logo })
          if (nameEn) localStorage.setItem('emenu_business_name_en', nameEn)
          if (nameKm) localStorage.setItem('emenu_business_name_km', nameKm)
          if (logo) localStorage.setItem('emenu_business_logo', logo)
        }
      } catch {
        // Handled in catch
      }
    } else if (!storeInfo.nameEn && !storeInfo.nameKm) {
      try {
        const singleBiz = await api.get(`/businesses/${bizId}`)
        if (singleBiz.data) {
          const nameEn = singleBiz.data.name_en || ''
          const nameKm = singleBiz.data.name_km || nameEn
          const logo = singleBiz.data.logo_url || null
          setStoreInfo({ nameEn, nameKm, logoUrl: logo })
          if (nameEn) localStorage.setItem('emenu_business_name_en', nameEn)
          if (nameKm) localStorage.setItem('emenu_business_name_km', nameKm)
          if (logo) localStorage.setItem('emenu_business_logo', logo)
        }
      } catch {
        // Ignore
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
  }, [tenantBizId, tenantBranchId, storeInfo.nameEn, storeInfo.nameKm])

  // 2. Fetch Kitchen Stations and Live Tickets for the Isolated Tenant
  const fetchKDSData = useCallback(async (silent = false) => {
    setLoadError(null)

    try {
      const { bizId, branchId } = await resolveTenantContext()

      if (!isUuid(bizId) || !isUuid(branchId)) {
        setIsLoading(false)
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
      if (!silent) {
        setLoadError(
          language === 'km'
            ? 'មិនអាចទាញយកសំបុត្រពីផ្ទះបាយបានទេ។ សូមព្យាយាមម្តងទៀត។'
            : 'Could not fetch kitchen tickets. Please try again.'
        )
      }
    } finally {
      setIsLoading(false)
    }
  }, [language, resolveTenantContext, selectedStationId, setStations, setTickets])

  // Continuous real-time synchronization
  useEffect(() => {
    fetchKDSData()
    const interval = setInterval(() => {
      fetchKDSData(true)
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchKDSData])

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const newBranchId = e.detail?.branchId
      if (newBranchId) {
        setTenantBranchId(newBranchId)
        fetchKDSData(true)
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
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
          fetchKDSData(true)
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
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-amber-500 selection:text-black">
      {/* 1. Header */}
      <KDSHeader
        storeName={language === 'km' ? storeInfo.nameKm || storeInfo.nameEn : storeInfo.nameEn || storeInfo.nameKm}
        storeLogo={storeInfo.logoUrl}
        isConnected={isConnected}
      />

      {/* 2. Station Switcher Tabs (Only if custom kitchen stations exist) */}
      {stations.length > 0 && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2">
          <KDSStationTabs
            stations={stations}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStation}
          />
        </div>
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
              onClick={() => fetchKDSData()}
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
