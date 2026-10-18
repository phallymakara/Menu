import { useMemo, useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Loader2,
  TrendingUp,
  Clock,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  Activity,
} from 'lucide-react'
import { usePlatformKPIStats } from '../hooks'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { formatUSD } from '@/lib/currency'

// Predefined color palette for plan tiers in the distribution bar using #167e61 brand tones
const TIER_COLOR_PALETTE = [
  'bg-[#167e61]',
  'bg-[#1a9573]',
  'bg-[#22ab84]',
  'bg-[#2dc498]',
]

function formatActionBadge(action: string): string {
  const act = action.toLowerCase()
  if (act.includes('create')) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
  if (act.includes('suspend') || act.includes('archive') || act.includes('delete')) return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/40'
  if (act.includes('override') || act.includes('update')) return 'bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] border-[#167e61]/20'
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
}

function formatLogTime(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return isoDate
  }
}

export const PlatformOverviewTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const navigate = useNavigate()

  // Real-time live polling every 5 seconds
  const { data, isLoading, isError } = usePlatformKPIStats()

  // Hover state for monthly chart
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null)

  // Calculate tier distribution percentage from subscription_distribution
  const distribution = useMemo(() => {
    const rawTiers = data?.subscription_distribution || []
    if (rawTiers.length === 0) return []
    return rawTiers.map((t, idx) => ({
      plan_code: t.plan_code,
      label: t.plan_name || t.plan_code.toUpperCase(),
      count: t.organization_count,
      pct: t.percentage_of_total || 0,
      bg: TIER_COLOR_PALETTE[idx % TIER_COLOR_PALETTE.length],
    }))
  }, [data?.subscription_distribution])

  // Error Banner
  if (isError) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 p-6 text-center flex flex-col items-center justify-center max-w-md mx-auto my-12 animate-in fade-in duration-200">
        <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {isKm ? 'មិនអាចទាញយកទិន្នន័យស្ថិតិបានទេ' : 'Failed to load platform KPI statistics'}
        </h3>
        <p className="text-xs text-zinc-500 mt-2 max-w-sm">
          {isKm
            ? 'សូមពិនិត្យមើលការភ្ជាប់បណ្តាញ ឬដំណើរការឡើងវិញ។'
            : 'Please verify your network connection or try refreshing.'}
        </p>
      </div>
    )
  }

  if (isLoading && !data) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-2 text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin text-[#167e61]" />
        <p className="text-xs">
          {isKm ? 'កំពុងទាញយកទិន្នន័យផ្ទាល់...' : 'Loading live metrics...'}
        </p>
      </div>
    )
  }

  const economics = data?.saas_economics
  const entities = data?.entities
  const orgs = data?.organizations
  const monthlyTrends = data?.monthly_trends || []
  const expiringTrials = data?.expiring_trials || []
  const recentAudits = data?.recent_audits || []

  const mrrVal = Number(economics?.estimated_mrr_usd || 0)
  const arrVal = Number(economics?.estimated_arr_usd || 0)
  const gmvVal = Number(economics?.total_gmv_usd || 0)
  const totalOrders = economics?.total_orders_count ?? 0
  const expiringTrialsCount = economics?.trials_expiring_soon_count ?? 0

  // Chart max value calculation for scaling
  const maxRevenue = Math.max(
    ...monthlyTrends.map((m) => Number(m.revenue_usd || 0)),
    mrrVal || 100
  )


  return (
    <div className="space-y-2 animate-in fade-in duration-200 pb-8">
      {/* ─────────────────────────────────────────────────────────────
          1. Top KPI Cards (8 Cards - Executive Overview)
      ───────────────────────────────────────────────────────────── */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
        {/* MRR */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'ចំណូលប្រចាំខែ (MRR)' : 'Monthly Recurring'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
            {formatUSD(mrrVal)}
          </div>
          <span className="text-[10px] text-zinc-400">
            {isKm ? 'ពីថ្លៃគម្រោងជាវ' : 'from active subs'}
          </span>
        </div>

        {/* ARR */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'ចំណូលប្រចាំឆ្នាំ (ARR)' : 'Annual Run Rate'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
            {formatUSD(arrVal)}
          </div>
          <span className="text-[10px] text-zinc-400">
            {isKm ? 'ប៉ាន់ស្មាន 12 ខែ' : 'annualized run rate'}
          </span>
        </div>

        {/* Platform GMV */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'តម្លៃលក់សរុប (GMV)' : 'Platform GMV'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
            {formatUSD(gmvVal)}
          </div>
          <span className="text-[10px] text-zinc-400 truncate">
            {totalOrders.toLocaleString()} {isKm ? 'ការបញ្ជាទិញ' : 'orders processed'}
          </span>
        </div>

        {/* Active Outlets */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'សាខាកំពុងដំណើរការ' : 'Active Outlets'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
            {(entities?.total_active_branches ?? 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-400">
            {(entities?.total_branches ?? 0).toLocaleString()} {isKm ? 'សាខាសរុប' : 'total locations'}
          </span>
        </div>

        {/* Registered Users */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'អ្នកប្រើប្រាស់សរុប' : 'Registered Users'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
            {(entities?.total_registered_users ?? 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-400">
            {(entities?.total_staff_memberships ?? 0).toLocaleString()} {isKm ? 'បុគ្គលិកសកម្ម' : 'staff roles'}
          </span>
        </div>

        {/* Active Tenants */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'អាជីវកម្មសកម្ម' : 'Active Tenants'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
            {(orgs?.active_organizations ?? 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-400">
            {(orgs?.total_organizations ?? 0).toLocaleString()} {isKm ? 'ហាងចុះឈ្មោះ' : 'total brands'}
          </span>
        </div>

        {/* Growth Rate */}
        <div className="p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs font-medium text-zinc-500 block truncate">
            {isKm ? 'អត្រាកំណើន 30 ថ្ងៃ' : '30-Day Growth'}
          </span>
          <div className="text-lg sm:text-xl font-semibold text-emerald-600 dark:text-emerald-400 tracking-tight mt-1 truncate flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>{(economics?.tenant_growth_percentage_30d ?? 0).toFixed(1)}%</span>
          </div>
          <span className="text-[10px] text-zinc-400">
            +{(economics?.new_tenants_last_30d ?? 0)} {isKm ? 'ហាងថ្មី' : 'new tenants'}
          </span>
        </div>

        {/* Expiring Trials Alert Card */}
        <div className={`p-3 sm:p-3.5 min-h-[96px] sm:min-h-[104px] rounded-xl border flex flex-col justify-between min-w-0 transition-all ${
          expiringTrialsCount > 0
            ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20'
            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'
        }`}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-zinc-500 block truncate">
              {isKm ? 'ជិតផុតកំណត់ Trial' : 'Trials Ending'}
            </span>
            <Clock className={`w-3.5 h-3.5 shrink-0 ${expiringTrialsCount > 0 ? 'text-amber-500' : 'text-zinc-400'}`} />
          </div>
          <div className={`text-lg sm:text-xl font-semibold tracking-tight mt-1 truncate ${
            expiringTrialsCount > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-zinc-950 dark:text-zinc-50'
          }`}>
            {expiringTrialsCount} {isKm ? 'ហាង' : 'orgs'}
          </div>
          <span className="text-[10px] text-zinc-400">
            {isKm ? 'ក្នុង ៧ ថ្ងៃខាងមុខ' : 'next 7 days'}
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. Middle Row: Subscription Distribution & Tenant Lifecycle
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-1.5">
        {/* Subscription Plan Distribution (6 cols) */}
        <div className="md:col-span-12 lg:col-span-6 p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between min-h-[210px] sm:min-h-[225px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'ការចែកចាយគម្រោង Subscription' : 'Subscription Tier Distribution'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {isKm ? 'សមាមាត្រអ្នកជាវតាមប្រភេទគម្រោង' : 'Distribution of active subscriptions by plan tier'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/plans')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline"
              >
                {isKm ? 'គ្រប់គ្រងគម្រោង' : 'Manage Plans'}
              </button>
            </div>

            {/* Distribution Visual Bar */}
            <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex overflow-hidden p-0.5 border border-zinc-200 dark:border-zinc-700 mt-2.5">
              {distribution.map((d) => {
                if (d.count === 0) return null
                return (
                  <div
                    key={d.plan_code}
                    style={{ width: `${d.pct}%` }}
                    className={`${d.bg} h-full first:rounded-l-full last:rounded-r-full transition-all`}
                    title={`${d.label}: ${d.count} (${d.pct.toFixed(1)}%)`}
                  />
                )
              })}
            </div>
          </div>

          {/* Tier Legend Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {distribution.map((d) => (
              <div
                key={d.plan_code}
                className="p-3 sm:p-3.5 rounded-xl bg-zinc-50/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 min-h-[84px] sm:min-h-[92px] flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-zinc-500 block truncate">
                    {d.label}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-medium shrink-0">
                    {d.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
                  {d.count}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tenant Lifecycle Breakdown (6 cols) */}
        <div className="md:col-span-12 lg:col-span-6 p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between min-h-[210px] sm:min-h-[225px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'វដ្តជីវិតអាជីវកម្ម' : 'Tenant Organization Lifecycle'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {isKm ? 'ស្ថានភាពសកម្ម ផ្អាក និងទុកក្នុងប័ណ្ណសារ' : 'Active, suspended, and archived tenant status'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/organizations')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline"
              >
                {isKm ? 'ពិនិត្យបញ្ជីហាង' : 'View Organizations'}
              </button>
            </div>

            {/* Visual ratio bar */}
            <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex overflow-hidden p-0.5 border border-zinc-200 dark:border-zinc-700 mt-2.5">
              <div
                style={{
                  width: `${
                    (orgs?.active_organizations ?? 0) + (orgs?.suspended_organizations ?? 0) + (orgs?.archived_organizations ?? 0) > 0
                      ? (((orgs?.active_organizations ?? 0) /
                          ((orgs?.active_organizations ?? 0) + (orgs?.suspended_organizations ?? 0) + (orgs?.archived_organizations ?? 0))) *
                        100)
                      : 0
                  }%`,
                }}
                className="bg-[#167e61] dark:bg-[#167e61] h-full rounded-full transition-all"
                title={`Active: ${orgs?.active_organizations ?? 0}`}
              />
            </div>
          </div>

          {/* Status Breakdown Grid */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {/* Active */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-zinc-50/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 min-h-[84px] sm:min-h-[92px] flex flex-col justify-between">
              <span className="text-xs font-medium text-zinc-500 block truncate">
                {isKm ? 'សកម្ម' : 'Active'}
              </span>
              <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
                {(orgs?.active_organizations ?? 0).toLocaleString()}
              </div>
            </div>

            {/* Suspended */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-zinc-50/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 min-h-[84px] sm:min-h-[92px] flex flex-col justify-between">
              <span className="text-xs font-medium text-zinc-500 block truncate">
                {isKm ? 'បានផ្អាក' : 'Suspended'}
              </span>
              <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
                {(orgs?.suspended_organizations ?? 0).toLocaleString()}
              </div>
            </div>

            {/* Archived */}
            <div className="p-3 sm:p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 min-h-[84px] sm:min-h-[92px] flex flex-col justify-between">
              <span className="text-xs font-medium text-zinc-500 block truncate">
                {isKm ? 'ប័ណ្ណសារ' : 'Archived'}
              </span>
              <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mt-1 truncate">
                {(orgs?.archived_organizations ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. Monthly Revenue & Tenant Growth Historical Chart (6 Months)
      ───────────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {isKm ? 'និន្នាការចំណូល & កំណើនហាង (៦ ខែចុងក្រោយ)' : 'Monthly Revenue & Tenant Growth (Last 6 Months)'}
            </h3>
            <p className="text-xs text-zinc-500">
              {isKm
                ? 'ប្រាក់ចំណូលជាវគម្រោងប្រចាំខែ និងចំនួនភោជនីយដ្ឋានសរុបដែលបានចុះឈ្មោះ'
                : 'Historical subscription recurring revenue and cumulative registered tenant organizations'}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#167e61]" />
              <span className="text-zinc-600 dark:text-zinc-400">
                {isKm ? 'ចំណូល ($)' : 'Monthly Revenue ($)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                {isKm ? 'ចំនួនហាងសរុប' : 'Total Tenants'}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Bar / Chart Grid */}
        <div className="pt-4 pb-2">
          <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-44 sm:h-48 border-b border-zinc-200 dark:border-zinc-800 px-2 pb-2">
            {monthlyTrends.map((metric, idx) => {
              const revNum = Number(metric.revenue_usd || 0)
              const heightPercent = maxRevenue > 0 ? Math.min(100, Math.max(12, Math.round((revNum / maxRevenue) * 100))) : 12
              const isHovered = hoveredMonthIndex === idx

              return (
                <div
                  key={metric.month_key}
                  onMouseEnter={() => setHoveredMonthIndex(idx)}
                  onMouseLeave={() => setHoveredMonthIndex(null)}
                  className="relative flex flex-col items-center h-full justify-end group cursor-pointer"
                >
                  {/* Tooltip on Hover */}
                  {isHovered && (
                    <div className="absolute -top-12 z-30 px-2.5 py-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[11px] font-semibold whitespace-nowrap shadow-lg animate-in fade-in zoom-in-95 pointer-events-none">
                      <div>{formatUSD(revNum)}</div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
                        {metric.cumulative_tenants} {isKm ? 'ហាងសរុប' : 'tenants'} (+{metric.new_tenants})
                      </div>
                    </div>
                  )}

                  {/* Revenue Bar */}
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full max-w-[48px] rounded-t-xl transition-all duration-300 relative ${
                      isHovered
                        ? 'bg-[#12674f]'
                        : 'bg-[#167e61]/80 hover:bg-[#167e61]'
                    }`}
                  >
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                      {formatUSD(revNum).replace('.00', '')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* X-Axis Month Labels */}
          <div className="grid grid-cols-6 gap-2 sm:gap-4 pt-2 px-2 text-center">
            {monthlyTrends.map((metric, idx) => (
              <div key={metric.month_key}>
                <span className={`text-xs font-semibold block transition-colors ${
                  hoveredMonthIndex === idx
                    ? 'text-[#167e61] dark:text-[#22ab84]'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}>
                  {metric.month_label}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  {metric.cumulative_tenants} {isKm ? 'ហាង' : 'orgs'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. Operational Action & Risk Feeds (Level 3)
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-1.5">
        {/* Left: Expiring Trials & Action List */}
        <div className="lg:col-span-6 p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'ហាងជិតផុតកំណត់សាកល្បង (Expiring Trials)' : 'Expiring Trials & Renewal Outreach'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/organizations')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline flex items-center gap-1"
              >
                <span>{isKm ? 'គ្រប់គ្រងហាង' : 'Manage All'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-3">
              {isKm
                ? 'បញ្ជីហាងដែលជិតផុតកំណត់សាកល្បងក្នុងរយៈពេល ៧ ថ្ងៃខាងមុខ សម្រាប់ក្រុមការងារតាមដាន'
                : 'Tenant organizations with trials ending within 7 days requiring sales or billing follow-up'}
            </p>

            {/* List */}
            {expiringTrials.length > 0 ? (
              <div className="space-y-1.5">
                {expiringTrials.map((org) => (
                  <div
                    key={org.organization_id}
                    className="p-2.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {org.organization_name}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono truncate">
                        /{org.organization_slug} • {org.plan_name}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                        {org.days_remaining === 0
                          ? isKm ? 'ផុតថ្ងៃនេះ' : 'ends today'
                          : isKm ? `នៅសល់ ${org.days_remaining} ថ្ងៃ` : `${org.days_remaining}d left`}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate('/superadmin/organizations')}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold text-[#167e61] hover:bg-[#167e61]/10 transition-colors"
                      >
                        {isKm ? 'កែប្រែ' : 'Review'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 space-y-1">
                <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isKm ? 'មិនមានហាងជិតផុតកំណត់ Trial ទេ' : 'No Critical Trial Expirations'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {isKm
                    ? 'គ្រប់ហាងទាំងអស់កំពុងដំណើរការជាធម្មតា ឬបានបង់ថ្លៃគម្រោងរួចរាល់'
                    : 'All restaurant organizations are currently active or on standard billing.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Platform Security & Audit Trail Feed */}
        <div className="lg:col-span-6 p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#167e61] shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'កំណត់ត្រាសវនកម្មចុងក្រោយ (Audit Feed)' : 'Recent Security & Audit Trail'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/audit-logs')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline flex items-center gap-1"
              >
                <span>{isKm ? 'កំណត់ត្រាទាំងអស់' : 'View Full Log'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-3">
              {isKm
                ? 'សកម្មភាពរដ្ឋបាលចុងក្រោយទូទាំងប្រព័ន្ធ រួមមានការប្តូរគម្រោង ផ្អាកហាង និងកំណត់សិទ្ធិ'
                : 'Real-time trace of administrative actions across tenants, plans, and permission changes'}
            </p>

            {/* Audit Log Feed */}
            {recentAudits.length > 0 ? (
              <div className="space-y-1.5">
                {recentAudits.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${formatActionBadge(item.action)}`}>
                        {item.action.replace('action_', '')}
                      </span>
                      <div className="truncate">
                        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {item.actor_name || item.actor_email || (isKm ? 'ប្រព័ន្ធ' : 'System')}
                          {item.organization_name && (
                            <span className="text-zinc-400 font-normal">
                              {' '}→ {item.organization_name}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono truncate">
                          {item.resource_type ? `${item.resource_type}: ` : ''}{item.resource_id || item.id.slice(0, 8)}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-400 shrink-0 font-medium">
                      {formatLogTime(item.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 space-y-1">
                <Activity className="w-8 h-8 text-[#167e61] mx-auto opacity-70" />
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isKm ? 'មិនទាន់មានកំណត់ត្រាសវនកម្មថ្មីៗ' : 'No Recent Audit Events'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {isKm
                    ? 'រាល់សកម្មភាពរដ្ឋបាលនឹងត្រូវបានកត់ត្រាដោយស្វ័យប្រវត្តិនៅទីនេះ'
                    : 'System administrative changes and overrides will automatically appear here.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

