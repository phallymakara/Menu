import { useState, type FC } from 'react'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const AnalyticsReportsTab: FC = () => {
  const { language } = useLanguageStore()
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today')

  const summary = {
    today: {
      revenueUsd: '$348.50',
      revenueKhr: '1,428,850 ៛',
      orders: 42,
      avgTicket: '$8.30',
      avgTicketKhr: '34,000 ៛',
      netProfit: '$218.00',
    },
    week: {
      revenueUsd: '$2,450.00',
      revenueKhr: '10,045,000 ៛',
      orders: 298,
      avgTicket: '$8.22',
      avgTicketKhr: '33,700 ៛',
      netProfit: '$1,520.00',
    },
    month: {
      revenueUsd: '$10,850.00',
      revenueKhr: '44,485,000 ៛',
      orders: 1320,
      avgTicket: '$8.21',
      avgTicketKhr: '33,650 ៛',
      netProfit: '$6,750.00',
    },
  }[timeRange]

  const hourlyBreakdown = [
    { hour: '07:00 - 09:00', orders: 4, revenue: '$24.00' },
    { hour: '09:00 - 11:00', orders: 7, revenue: '$48.50' },
    { hour: '11:00 - 13:00', orders: 18, revenue: '$162.00' },
    { hour: '13:00 - 15:00', orders: 3, revenue: '$21.00' },
    { hour: '15:00 - 17:00', orders: 2, revenue: '$14.00' },
    { hour: '17:00 - 20:00', orders: 8, revenue: '$79.00' },
  ]

  const paymentBreakdown = [
    { method: 'Bakong KHQR (Dynamic)', percentage: '62%', amount: '$216.00', count: 26 },
    { method: 'Cash (USD)', percentage: '20%', amount: '$69.50', count: 9 },
    { method: 'Cash (KHR)', percentage: '14%', amount: '$49.00', count: 5 },
    { method: 'Credit/Debit Card', percentage: '4%', amount: '$14.00', count: 2 },
  ]

  return (
    <div className="space-y-6">
      {/* Header & Time Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'កំណើន & ការវិភាគចំណូល' : 'Sales & Revenue Analytics'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {language === 'km'
              ? 'របាយការណ៍លក់ ចំណូលសរុប (USD/KHR) និងស្ថិតិការទូទាត់'
              : 'Sales performance reports, dual-currency revenue, and payment method statistics.'}
          </p>
        </div>

        {/* Time Filter Buttons */}
        <div className="flex items-center gap-1 p-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setTimeRange('today')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              timeRange === 'today'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            {language === 'km' ? 'ថ្ងៃនេះ' : 'Today'}
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('week')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              timeRange === 'week'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            {language === 'km' ? 'សប្តាហ៍នេះ' : 'This Week'}
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('month')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              timeRange === 'month'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            {language === 'km' ? 'ខែនេះ' : 'This Month'}
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              {language === 'km' ? 'ចំណូលសរុប' : 'Total Revenue'}
            </span>
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
              {summary.revenueUsd}
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              {summary.revenueKhr}
            </div>
          </div>
        </div>

        {/* Total Orders */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              {language === 'km' ? 'ការកុម្ម៉ង់សរុប' : 'Total Orders'}
            </span>
            <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {summary.orders} {language === 'km' ? 'វិក្កយបត្រ' : 'Orders'}
          </div>
        </div>

        {/* Average Ticket */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              {language === 'km' ? 'មធ្យមភាគ/វិក្កយបត្រ' : 'Avg Order Value'}
            </span>
            <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
              {summary.avgTicket}
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              {summary.avgTicketKhr}
            </div>
          </div>
        </div>

        {/* Estimated Net Profit */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              {language === 'km' ? 'ប្រាក់ចំណេញសរុប (Net)' : 'Estimated Net Profit'}
            </span>
            <DollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {summary.netProfit}
          </div>
        </div>
      </div>

      {/* 2-Column Section: Hourly Breakdown & Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Distribution */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? 'ការលក់តាមម៉ោង (Rush Hours)' : 'Hourly Sales Distribution'}
            </h3>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {hourlyBreakdown.map((row, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {row.hour}
                </div>
                <div className="flex items-center gap-4 text-xs sm:text-sm">
                  <span className="text-zinc-500">{row.orders} {language === 'km' ? 'ការកុម្ម៉ង់' : 'orders'}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{row.revenue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? 'មធ្យោបាយទូទាត់ប្រាក់' : 'Payment Methods Distribution'}
            </h3>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {paymentBreakdown.map((pm, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {pm.method}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {pm.count} {language === 'km' ? 'ប្រតិបត្តិការ' : 'transactions'} ({pm.percentage})
                  </div>
                </div>
                <div className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 font-mono">
                  {pm.amount}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
