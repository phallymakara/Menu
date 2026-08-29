import { type FC } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  ShoppingBag,
  Grid3X3,
  TrendingUp,
  ArrowUpRight,
  Clock,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const DashboardOverviewTab: FC = () => {
  const { language } = useLanguageStore()

  const stats = [
    {
      labelKm: 'ចំណូលសរុបថ្ងៃនេះ',
      labelEn: "Today's Revenue",
      valueUsd: '$348.50',
      valueKhr: '1,428,850 ៛',
      change: '+14.2%',
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      labelKm: 'ការកុម្ម៉ង់សរុប',
      labelEn: 'Total Orders',
      value: '42 Orders',
      change: '+8 today',
      icon: ShoppingBag,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      labelKm: 'តុដែលកំពុងអង្គុយ',
      labelEn: 'Occupied Tables',
      value: '6 / 16 Tables',
      change: '38% capacity',
      icon: Grid3X3,
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      labelKm: 'តម្លៃជាមធ្យម/វិក្កយបត្រ',
      labelEn: 'Average Bill',
      valueUsd: '$8.30',
      valueKhr: '34,000 ៛',
      change: '+5.4%',
      icon: TrendingUp,
      color: 'text-purple-600 dark:text-purple-400',
    },
  ]

  const recentOrders = [
    { id: 'ORD-1048', table: 'T-04', items: 3, total: '$14.50', time: '5m ago', status: 'SERVING' },
    { id: 'ORD-1047', table: 'T-02', items: 5, total: '$28.00', time: '12m ago', status: 'KITCHEN' },
    { id: 'ORD-1046', table: 'T-08', items: 2, total: '$9.00', time: '24m ago', status: 'PAID' },
    { id: 'ORD-1045', table: 'T-11', items: 4, total: '$22.50', time: '38m ago', status: 'PAID' },
  ]

  const topDishes = [
    { nameKm: 'ឡុកឡាក់សាច់គោ', nameEn: 'Beef Lok Lok', orders: 28, revenue: '$154.00' },
    { nameKm: 'បាយសាច់ជ្រូកអាំង', nameEn: 'Grilled Pork Rice', orders: 24, revenue: '$84.00' },
    { nameKm: 'កាហ្វេទឹកដោះគោទឹកកក', nameEn: 'Iced Milk Coffee', orders: 36, revenue: '$64.80' },
    { nameKm: 'តែក្រូចឆ្មារទឹកឃ្មុំ', nameEn: 'Honey Lemon Tea', orders: 19, revenue: '$34.20' },
  ]

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid (Flat Border, Zero Shadows, Zero Background Fills) */}
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

              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {st.change}
              </div>
            </div>
          )
        })}
      </div>

      {/* 2-Column Section: Live Orders & Top Dishes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? 'ការកុម្ម៉ង់ចុងក្រោយ' : 'Recent Orders'}
            </h3>
            <Link
              to="/pos"
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:underline flex items-center gap-1"
            >
              <span>{language === 'km' ? 'មើលទាំងអស់' : 'View POS'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentOrders.map((ord) => (
              <div key={ord.id} className="py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {ord.table}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">({ord.id})</span>
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2">
                    <span>{ord.items} {language === 'km' ? 'មុខ' : 'items'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3 text-zinc-400" />
                      {ord.time}
                    </span>
                  </div>
                </div>

                <div className="text-right space-y-0.5">
                  <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {ord.total}
                  </div>
                  <div
                    className={`text-[11px] font-semibold ${
                      ord.status === 'SERVING'
                        ? 'text-amber-600 dark:text-amber-400'
                        : ord.status === 'KITCHEN'
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    ● {ord.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

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

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {topDishes.map((dish, i) => (
              <div key={i} className="py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? dish.nameKm : dish.nameEn}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {dish.orders} {language === 'km' ? 'ចានបានលក់' : 'sold today'}
                  </div>
                </div>
                <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {dish.revenue}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
