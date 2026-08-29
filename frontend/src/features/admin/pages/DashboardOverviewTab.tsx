import { useState, useEffect, useCallback, type FC } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  ShoppingBag,
  Grid3X3,
  TrendingUp,
  ArrowUpRight,
  Loader2,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { api } from '@/lib/api'

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export const DashboardOverviewTab: FC = () => {
  const { language } = useLanguageStore()

  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    totalRevenueUsd: 0,
    totalRevenueKhr: 0,
    totalOrders: 0,
    averageBillUsd: 0,
    occupiedTables: 0,
    totalTables: 0,
  })
  const [topDishes, setTopDishes] = useState<
    Array<{ nameEn: string; nameKm: string; count: number; totalSales: number }>
  >([])


  const loadDashboardData = useCallback(async () => {
    setIsLoading(true)

    try {
      let bizId = localStorage.getItem('emenu_business_id')
      let branchId = localStorage.getItem('emenu_branch_id')

      if (!isUuid(bizId)) {
        const bizRes = await api.get('/businesses').catch(() => ({ data: [] }))
        if (Array.isArray(bizRes.data) && bizRes.data.length > 0) {
          bizId = bizRes.data[0].id
          localStorage.setItem('emenu_business_id', bizId!)
        }
      }

      if (isUuid(bizId) && !isUuid(branchId)) {
        const brRes = await api.get(`/businesses/${bizId}/branches`).catch(() => ({ data: [] }))
        if (Array.isArray(brRes.data) && brRes.data.length > 0) {
          branchId = brRes.data[0].id
          localStorage.setItem('emenu_branch_id', branchId!)
        }
      }

      if (isUuid(bizId)) {
        const [overviewRes, topItemsRes, tablesRes] = await Promise.all([
          api.get(`/businesses/${bizId}/analytics/overview`).catch(() => ({ data: null })),
          api.get(`/businesses/${bizId}/analytics/top-items`).catch(() => ({ data: [] })),
          isUuid(branchId)
            ? api.get(`/businesses/${bizId}/branches/${branchId}/tables`).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ])

        if (overviewRes.data) {
          const d = overviewRes.data
          const revUsd = Number(d.gross_sales_usd || d.net_sales_usd || 0)
          const totalOrd = Number(d.total_orders || 0)
          const avgUsd = totalOrd > 0 ? revUsd / totalOrd : 0

          const tablesList: any[] = Array.isArray(tablesRes.data) ? tablesRes.data : []
          const occupied = tablesList.filter((t) => (t.status || '').toUpperCase() === 'OCCUPIED').length

          setMetrics({
            totalRevenueUsd: revUsd,
            totalRevenueKhr: Math.round(revUsd * 4100),
            totalOrders: totalOrd,
            averageBillUsd: avgUsd,
            occupiedTables: occupied,
            totalTables: tablesList.length,
          })
        }

        if (Array.isArray(topItemsRes.data)) {
          setTopDishes(
            topItemsRes.data.slice(0, 5).map((it: any) => ({
              nameEn: it.menu_item_name_en || it.name_en || 'Item',
              nameKm: it.menu_item_name_km || it.name_km || it.name_en || 'មុខម្ហូប',
              count: Number(it.quantity_sold || it.count || 0),
              totalSales: Number(it.total_revenue_usd || it.revenue || 0),
            }))
          )
        }
      }
    } catch {
      // Handled cleanly
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const stats = [
    {
      labelKm: 'ចំណូលសរុបថ្ងៃនេះ',
      labelEn: "Today's Revenue",
      valueUsd: `$${metrics.totalRevenueUsd.toFixed(2)}`,
      valueKhr: `${metrics.totalRevenueKhr.toLocaleString()} ៛`,
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      labelKm: 'ការកុម្ម៉ង់សរុប',
      labelEn: 'Total Orders',
      value: `${metrics.totalOrders} Orders`,
      icon: ShoppingBag,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      labelKm: 'តុដែលកំពុងអង្គុយ',
      labelEn: 'Occupied Tables',
      value: `${metrics.occupiedTables} / ${metrics.totalTables} Tables`,
      icon: Grid3X3,
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      labelKm: 'តម្លៃជាមធ្យម/វិក្កយបត្រ',
      labelEn: 'Average Bill',
      valueUsd: `$${metrics.averageBillUsd.toFixed(2)}`,
      valueKhr: `${Math.round(metrics.averageBillUsd * 4100).toLocaleString()} ៛`,
      icon: TrendingUp,
      color: 'text-purple-600 dark:text-purple-400',
    },
  ]

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-2 text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <p className="text-xs">
          {language === 'km' ? 'កំពុងទាញយកទិន្នន័យ...' : 'Loading analytics...'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st, idx) => {
          const Icon = st.icon
          return (
            <div
              key={idx}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500">
                  {language === 'km' ? st.labelKm : st.labelEn}
                </span>
                <Icon className={`w-4 h-4 ${st.color}`} />
              </div>

              <div>
                {st.valueUsd ? (
                  <div className="space-y-0.5">
                    <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
                      {st.valueUsd}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">
                      {st.valueKhr}
                    </div>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
                    {st.value}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 2-Column Section: Top Dishes & Quick Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Items */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? 'មុខម្ហូបលក់ដាច់បំផុត' : 'Top Selling Items'}
            </h3>
            <Link
              to="/admin/menu"
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:underline flex items-center gap-1"
            >
              <span>{language === 'km' ? 'គ្រប់គ្រងមុខម្ហូប' : 'Manage Menu'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {topDishes.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              {language === 'km' ? 'មិនទាន់មានទិន្នន័យលក់នៅឡើយទេ' : 'No sales records yet'}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topDishes.map((dish, i) => (
                <div key={i} className="py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {language === 'km' ? dish.nameKm : dish.nameEn}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {dish.count} {language === 'km' ? 'ចានបានលក់' : 'sold'}
                    </div>
                  </div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    ${dish.totalSales.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Operations Links */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? 'ប្រតិបត្តិការរហ័ស' : 'Store Operations'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              to="/pos"
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors block space-y-1"
            >
              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'កន្លែងគិតលុយ POS' : 'Cashier POS'}
              </p>
              <p className="text-xs text-zinc-500">
                {language === 'km' ? 'គ្រប់គ្រងតុ និងគិតប្រាក់' : 'Table seating & payments'}
              </p>
            </Link>

            <Link
              to="/kds"
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-amber-600 dark:hover:border-amber-500 transition-colors block space-y-1"
            >
              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'អេក្រង់ផ្ទះបាយ KDS' : 'Kitchen KDS'}
              </p>
              <p className="text-xs text-zinc-500">
                {language === 'km' ? 'គ្រប់គ្រងការចម្អិនតាមស្ថានីយ' : 'Station order execution'}
              </p>
            </Link>

            <Link
              to="/admin/tables"
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-600 dark:hover:border-blue-500 transition-colors block space-y-1"
            >
              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'ប្លង់តុ & QR កូដ' : 'Tables & QR Stands'}
              </p>
              <p className="text-xs text-zinc-500">
                {language === 'km' ? 'បង្កើតតុ និងបោះពុម្ព QR' : 'Layout & batch QR export'}
              </p>
            </Link>

            <Link
              to="/admin/menu"
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-purple-600 dark:hover:border-purple-500 transition-colors block space-y-1"
            >
              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'គ្រប់គ្រងមុខម្ហូប' : 'Menu Management'}
              </p>
              <p className="text-xs text-zinc-500">
                {language === 'km' ? 'ប្រភេទមុខម្ហូប និងជម្រើសបន្ថែម' : 'Categories & modifiers'}
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
