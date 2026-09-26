import { useState, useEffect, useMemo, type FC } from 'react'
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
import { useBusinesses, useBranches } from '../hooks/useTenantQueries'
import { useSalesOverview, useTopSellingItems } from '../hooks/useAnalyticsQueries'
import { useTables } from '../hooks/useTableQueries'

export const DashboardOverviewTab: FC = () => {
  const { language } = useLanguageStore()

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [branchId, setBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )

  const { data: businesses = [] } = useBusinesses()
  useEffect(() => {
    if (!businessId && businesses.length > 0) {
      setBusinessId(businesses[0].id)
      localStorage.setItem('emenu_business_id', businesses[0].id)
    }
  }, [businesses, businessId])

  const { data: branches = [] } = useBranches(businessId)
  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchId(branches[0].id)
      localStorage.setItem('emenu_branch_id', branches[0].id)
    }
  }, [branches, branchId])

  const { data: overviewData, isLoading: isOverviewLoading } = useSalesOverview(businessId, branchId)
  const { data: topItemsData = [], isLoading: isTopItemsLoading } = useTopSellingItems(businessId, branchId)
  const { data: tablesData = [], isLoading: isTablesLoading } = useTables(businessId, branchId)

  const isLoading = (isOverviewLoading || isTopItemsLoading || isTablesLoading) && !overviewData

  const metrics = useMemo(() => {
    const revUsd = Number(overviewData?.total_gross_sales_usd || overviewData?.total_net_revenue_usd || 0)
    const revKhr = Number(overviewData?.total_net_revenue_khr || Math.round(revUsd * 4100))
    const totalOrd = Number(overviewData?.total_completed_orders || 0)
    const avgUsd = Number(overviewData?.average_order_value_usd || (totalOrd > 0 ? revUsd / totalOrd : 0))
    const occupied = tablesData.filter((t) => (t.status || '').toUpperCase() === 'OCCUPIED').length

    return {
      totalRevenueUsd: revUsd,
      totalRevenueKhr: revKhr,
      totalOrders: totalOrd,
      averageBillUsd: avgUsd,
      occupiedTables: occupied,
      totalTables: tablesData.length,
    }
  }, [overviewData, tablesData])

  const topDishes = useMemo(() => {
    return (topItemsData as any[]).slice(0, 5).map((it: any) => ({
      nameEn: it.menu_item_name_en || it.name_en || 'Item',
      nameKm: it.menu_item_name_km || it.name_km || it.name_en || 'មុខម្ហូប',
      count: Number(it.quantity_sold || it.count || 0),
      totalSales: Number(it.total_revenue_usd || it.revenue || 0),
    }))
  }, [topItemsData])

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
