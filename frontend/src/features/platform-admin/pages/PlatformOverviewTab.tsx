import { useMemo, useState, useRef, useEffect, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Check,
  X,
} from 'lucide-react'
import { usePlatformKPIStats } from '../hooks'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { formatUSD } from '@/lib/currency'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

// Constant radius 40 on 100x100 viewBox gives 2 * PI * 40 = 251.327
const CIRCUMFERENCE = 251.327

// Palette for subscription plan tiers: brand emerald, sky, purple, amber, pink
const TIER_STROKE_COLORS = [
  '#167e61',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
]

export type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom'

export interface ChartBarData {
  key: string
  label: string
  fullLabel: string
  revenue: number
  tenants: number
  newTenants?: number
}

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const KM_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const PlatformOverviewTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const navigate = useNavigate()

  // Real-time live polling every 5 seconds
  const { data, isLoading, isError } = usePlatformKPIStats()

  // Time Filter & Modal States
  const [timeRange, setTimeRange] = useState<TimeRange>('year')
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isCustomRangeModalOpen, setIsCustomRangeModalOpen] = useState(false)
  const dateDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setIsFilterModalOpen(false)
        setIsCustomRangeModalOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return getLocalDateString(d)
  })
  const [customEndDate, setCustomEndDate] = useState<string>(() => getLocalDateString())
  const [tempStartDate, setTempStartDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return getLocalDateString(d)
  })
  const [tempEndDate, setTempEndDate] = useState<string>(() => getLocalDateString())
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null)

  // 1. Subscription Donut Segments
  const totalTierOrgs = useMemo(() => {
    const rawTiers = data?.subscription_distribution || []
    return rawTiers.reduce((acc, t) => acc + (t.organization_count || 0), 0)
  }, [data?.subscription_distribution])

  const subscriptionSegments = useMemo(() => {
    const rawTiers = data?.subscription_distribution || []
    if (rawTiers.length === 0) return []
    let currentOffset = 0
    return rawTiers.map((t, idx) => {
      const count = t.organization_count || 0
      const dashLength = totalTierOrgs > 0 ? (count / totalTierOrgs) * CIRCUMFERENCE : 0
      const seg = {
        key: t.plan_code,
        label: t.plan_name || t.plan_code.toUpperCase(),
        count,
        pct: t.percentage_of_total
          ? Math.round(t.percentage_of_total)
          : (totalTierOrgs > 0 ? Math.round((count / totalTierOrgs) * 100) : 0),
        stroke: TIER_STROKE_COLORS[idx % TIER_STROKE_COLORS.length],
        dasharray: `${dashLength.toFixed(1)} ${(CIRCUMFERENCE - dashLength).toFixed(1)}`,
        dashoffset: -currentOffset,
      }
      currentOffset += dashLength
      return seg
    })
  }, [data?.subscription_distribution, totalTierOrgs])

  // 2. Tenant Lifecycle Donut Segments
  const orgs = data?.organizations
  const totalLifecycle =
    (orgs?.active_organizations ?? 0) +
    (orgs?.suspended_organizations ?? 0) +
    (orgs?.archived_organizations ?? 0)

  const lifecycleSegments = useMemo(() => {
    const items = [
      {
        key: 'active',
        label: isKm ? 'សកម្ម' : 'Active',
        count: orgs?.active_organizations ?? 0,
        stroke: '#167e61',
        pct: totalLifecycle > 0 ? Math.round(((orgs?.active_organizations ?? 0) / totalLifecycle) * 100) : 0,
      },
      {
        key: 'suspended',
        label: isKm ? 'បានផ្អាក' : 'Suspended',
        count: orgs?.suspended_organizations ?? 0,
        stroke: '#f59e0b',
        pct: totalLifecycle > 0 ? Math.round(((orgs?.suspended_organizations ?? 0) / totalLifecycle) * 100) : 0,
      },
      {
        key: 'archived',
        label: isKm ? 'ប័ណ្ណសារ' : 'Archived',
        count: orgs?.archived_organizations ?? 0,
        stroke: '#71717a',
        pct: totalLifecycle > 0 ? Math.round(((orgs?.archived_organizations ?? 0) / totalLifecycle) * 100) : 0,
      },
    ]

    let currentOffset = 0
    return items.map((item) => {
      const dashLength = totalLifecycle > 0 ? (item.count / totalLifecycle) * CIRCUMFERENCE : 0
      const seg = {
        ...item,
        dasharray: `${dashLength.toFixed(1)} ${(CIRCUMFERENCE - dashLength).toFixed(1)}`,
        dashoffset: -currentOffset,
      }
      currentOffset += dashLength
      return seg
    })
  }, [orgs?.active_organizations, orgs?.suspended_organizations, orgs?.archived_organizations, totalLifecycle, isKm])

  // 3. Subscription Billing & Trial Donut Segments
  const trialCount = orgs?.trial_organizations ?? 0
  const activeCount = orgs?.active_organizations ?? 0
  const suspendedCount = orgs?.suspended_organizations ?? 0
  const paidCount = Math.max(0, activeCount - trialCount)
  const totalBilling = paidCount + trialCount + suspendedCount

  const billingSegments = useMemo(() => {
    const items = [
      {
        key: 'paid',
        label: isKm ? 'បង់ថ្លៃរួច' : 'Paid Active',
        count: paidCount,
        stroke: '#167e61',
        pct: totalBilling > 0 ? Math.round((paidCount / totalBilling) * 100) : 0,
      },
      {
        key: 'trial',
        label: isKm ? 'សាកល្បង' : 'Free Trial',
        count: trialCount,
        stroke: '#0ea5e9',
        pct: totalBilling > 0 ? Math.round((trialCount / totalBilling) * 100) : 0,
      },
      {
        key: 'suspended',
        label: isKm ? 'បានផ្អាក' : 'Suspended',
        count: suspendedCount,
        stroke: '#f43f5e',
        pct: totalBilling > 0 ? Math.round((suspendedCount / totalBilling) * 100) : 0,
      },
    ]

    let currentOffset = 0
    return items.map((item) => {
      const dashLength = totalBilling > 0 ? (item.count / totalBilling) * CIRCUMFERENCE : 0
      const seg = {
        ...item,
        dasharray: `${dashLength.toFixed(1)} ${(CIRCUMFERENCE - dashLength).toFixed(1)}`,
        dashoffset: -currentOffset,
      }
      currentOffset += dashLength
      return seg
    })
  }, [paidCount, trialCount, suspendedCount, totalBilling, isKm])

  // 4. Time Range & Metrics Calculations
  const economics = data?.saas_economics
  const entities = data?.entities
  const monthlyTrends = useMemo(() => data?.monthly_trends || [], [data?.monthly_trends])
  const mrrVal = Number(economics?.estimated_mrr_usd || 0)
  const expiringTrialsCount = economics?.trials_expiring_soon_count ?? 0

  // Chart Bars generation matching normal admin filter options
  const chartBars = useMemo<ChartBarData[]>(() => {
    const activeOrgs = orgs?.active_organizations ?? 0

    // 1. Today: Hourly bar graph (24 hours: 00:00 to 23:00)
    if (timeRange === 'today') {
      const bars: ChartBarData[] = []
      const todayStr = getLocalDateString()
      const currentHour = new Date().getHours()

      for (let h = 0; h < 24; h++) {
        const hourStr = String(h).padStart(2, '0')
        const nextHourStr = String((h + 1) % 24).padStart(2, '0')
        const isPastOrCurrent = h <= currentHour

        bars.push({
          key: `hour-${h}`,
          label: `${hourStr}:00`,
          fullLabel: `${hourStr}:00 - ${nextHourStr}:00 (${todayStr})`,
          revenue: 0,
          tenants: isPastOrCurrent ? activeOrgs : 0,
        })
      }
      return bars
    }

    // 2. Week: Day bar graph (7 days)
    if (timeRange === 'week') {
      const bars: ChartBarData[] = []
      const now = new Date()
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(now.getDate() - i)
        const dateStr = getLocalDateString(d)
        const dayName = isKm
          ? ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហ', 'សុក្រ', 'សៅរ៍'][d.getDay()]
          : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
        const monthShort = isKm ? KM_MONTHS[d.getMonth()] : EN_MONTHS[d.getMonth()]

        bars.push({
          key: `week-${dateStr}`,
          label: dayName,
          fullLabel: `${dayName}, ${d.getDate()} ${monthShort}`,
          revenue: 0,
          tenants: activeOrgs,
        })
      }
      return bars
    }

    // 3. Month: Day bar graph (Days 1 to 31)
    if (timeRange === 'month') {
      const now = new Date()
      const year = now.getFullYear()
      const monthIdx = now.getMonth()
      const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
      const currentDay = now.getDate()
      const monthLabel = isKm ? KM_MONTHS[monthIdx] : EN_MONTHS[monthIdx]

      const bars: ChartBarData[] = []
      for (let d = 1; d <= daysInMonth; d++) {
        const isPastOrCurrent = d <= currentDay
        const dayStr = String(d).padStart(2, '0')

        bars.push({
          key: `day-${d}`,
          label: `${dayStr}`,
          fullLabel: `${dayStr} ${monthLabel} ${year}`,
          revenue: 0,
          tenants: isPastOrCurrent ? activeOrgs : 0,
        })
      }
      return bars
    }

    // 4. Year: Month bar graph (12 Months: Jan to Dec)
    if (timeRange === 'year') {
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonthIdx = now.getMonth()
      const bars: ChartBarData[] = []

      EN_MONTHS.forEach((mName, idx) => {
        const monthNum = String(idx + 1).padStart(2, '0')
        const monthKey = `${currentYear}-${monthNum}`
        const monthLabel = isKm ? KM_MONTHS[idx] : mName

        const backendMetric = monthlyTrends.find(
          (mt) => mt.month_key === monthKey || mt.month_label.toLowerCase() === mName.toLowerCase()
        )

        if (backendMetric) {
          bars.push({
            key: `month-${monthKey}`,
            label: monthLabel,
            fullLabel: `${monthLabel} ${currentYear}`,
            revenue: Number(backendMetric.revenue_usd || 0),
            tenants: backendMetric.cumulative_tenants,
            newTenants: backendMetric.new_tenants,
          })
        } else {
          const isPastOrCurrent = idx <= currentMonthIdx
          bars.push({
            key: `month-${monthKey}`,
            label: monthLabel,
            fullLabel: `${monthLabel} ${currentYear}`,
            revenue: 0,
            tenants: isPastOrCurrent && idx === currentMonthIdx ? activeOrgs : 0,
          })
        }
      })
      return bars
    }

    // 5. Custom Date Range
    const s = new Date(customStartDate)
    const e = new Date(customEndDate)
    const diffDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))

    // 1 single day -> Hourly bar graph
    if (customStartDate === customEndDate || diffDays === 0) {
      const bars: ChartBarData[] = []
      const todayStr = getLocalDateString()
      const isToday = customStartDate === todayStr
      const currentHour = new Date().getHours()

      for (let h = 0; h < 24; h++) {
        const hourStr = String(h).padStart(2, '0')
        const nextHourStr = String((h + 1) % 24).padStart(2, '0')
        const isPastOrCurrent = !isToday || h <= currentHour

        bars.push({
          key: `custom-hour-${h}`,
          label: `${hourStr}:00`,
          fullLabel: `${hourStr}:00 - ${nextHourStr}:00 (${customStartDate})`,
          revenue: 0,
          tenants: isPastOrCurrent ? activeOrgs : 0,
        })
      }
      return bars
    }

    // <= 31 days -> Daily bar graph
    if (diffDays <= 31) {
      const bars: ChartBarData[] = []
      const cur = new Date(s)
      const now = new Date()

      while (cur <= e) {
        const dateStr = getLocalDateString(cur)
        const isPastOrCurrent = cur <= now
        const monthName = isKm ? KM_MONTHS[cur.getMonth()] : EN_MONTHS[cur.getMonth()]
        const dayNum = cur.getDate()

        bars.push({
          key: `custom-day-${dateStr}`,
          label: `${monthName} ${dayNum}`,
          fullLabel: dateStr,
          revenue: 0,
          tenants: isPastOrCurrent ? activeOrgs : 0,
        })
        cur.setDate(cur.getDate() + 1)
      }
      return bars
    }

    // > 31 days -> Monthly bar graph
    const bars: ChartBarData[] = []
    const cur = new Date(s.getFullYear(), s.getMonth(), 1)

    while (cur <= e) {
      const idx = cur.getMonth()
      const mName = isKm ? KM_MONTHS[idx] : EN_MONTHS[idx]
      const yNum = cur.getFullYear()
      const monthKey = `${yNum}-${String(idx + 1).padStart(2, '0')}`

      const backendMetric = monthlyTrends.find(
        (mt) => mt.month_key === monthKey || mt.month_label.toLowerCase() === EN_MONTHS[idx].toLowerCase()
      )

      bars.push({
        key: `custom-month-${monthKey}`,
        label: `${mName}`,
        fullLabel: `${mName} ${yNum}`,
        revenue: backendMetric ? Number(backendMetric.revenue_usd || 0) : 0,
        tenants: backendMetric ? backendMetric.cumulative_tenants : activeOrgs,
        newTenants: backendMetric?.new_tenants,
      })

      cur.setMonth(cur.getMonth() + 1)
    }
    return bars
  }, [timeRange, customStartDate, customEndDate, monthlyTrends, orgs?.active_organizations, isKm])

  // Current Range Display Label for trigger button
  const currentRangeLabel = useMemo(() => {
    if (timeRange === 'today') return isKm ? 'ថ្ងៃនេះ' : 'Today'
    if (timeRange === 'week') return isKm ? 'សប្តាហ៍នេះ' : 'This Week'
    if (timeRange === 'month') return isKm ? 'ខែនេះ' : 'This Month'
    if (timeRange === 'year') return isKm ? 'ឆ្នាំនេះ' : 'This Year'
    if (timeRange === 'custom') {
      if (customStartDate === customEndDate) return customStartDate
      return `${customStartDate} → ${customEndDate}`
    }
    return isKm ? 'ឆ្នាំនេះ' : 'This Year'
  }, [timeRange, customStartDate, customEndDate, isKm])

  // Scale max revenue
  const maxRevenue = useMemo(() => {
    const revs = chartBars.map((b) => b.revenue)
    return Math.max(...revs, mrrVal || 100, 10)
  }, [chartBars, mrrVal])

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
      <div className="h-96 flex flex-col items-center justify-center">
        <EmenuLoader
          size="lg"
          message={isKm ? 'កំពុងទាញយកទិន្នន័យផ្ទាល់...' : 'Loading live metrics...'}
          showBrandText
        />
      </div>
    )
  }

  const expiringTrials = data?.expiring_trials || []

  return (
    <div className="space-y-2 animate-in fade-in duration-200 pb-8">
      {/* ─────────────────────────────────────────────────────────────
          1. Top KPI Cards (6 Cards - Executive Overview)
      ───────────────────────────────────────────────────────────── */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        {/* MRR */}
        <div className="p-3.5 sm:p-4 min-h-[92px] sm:min-h-[102px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 block truncate">
            {isKm ? 'ចំណូលប្រចាំខែ (MRR)' : 'Monthly Recurring'}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight truncate">
            {formatUSD(mrrVal)}
          </div>
        </div>

        {/* Active Outlets */}
        <div className="p-3.5 sm:p-4 min-h-[92px] sm:min-h-[102px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 block truncate">
            {isKm ? 'សាខាកំពុងដំណើរការ' : 'Active Outlets'}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight truncate">
            {(entities?.total_active_branches ?? 0).toLocaleString()}
          </div>
        </div>

        {/* Registered Users */}
        <div className="p-3.5 sm:p-4 min-h-[92px] sm:min-h-[102px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 block truncate">
            {isKm ? 'អ្នកប្រើប្រាស់សរុប' : 'Registered Users'}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight truncate">
            {(entities?.total_registered_users ?? 0).toLocaleString()}
          </div>
        </div>

        {/* Active Tenants */}
        <div className="p-3.5 sm:p-4 min-h-[92px] sm:min-h-[102px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 block truncate">
            {isKm ? 'អាជីវកម្មសកម្ម' : 'Active Tenants'}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight truncate">
            {(orgs?.active_organizations ?? 0).toLocaleString()}
          </div>
        </div>

        {/* Growth Rate */}
        <div className="p-3.5 sm:p-4 min-h-[92px] sm:min-h-[102px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between min-w-0">
          <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 block truncate">
            {isKm ? 'អត្រាកំណើន 30 ថ្ងៃ' : '30-Day Growth'}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight truncate flex items-center gap-1.5">
            <TrendingUp className="w-5 h-5 shrink-0" />
            <span>{(economics?.tenant_growth_percentage_30d ?? 0).toFixed(1)}%</span>
          </div>
        </div>

        {/* Expiring Trials Alert Card */}
        <div className={`p-3.5 sm:p-4 min-h-[92px] sm:min-h-[102px] rounded-xl border flex flex-col justify-between min-w-0 transition-all ${
          expiringTrialsCount > 0
            ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20'
            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'
        }`}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 block truncate">
              {isKm ? 'ជិតផុតកំណត់ Trial' : 'Trials Ending'}
            </span>
            <Clock className={`w-4 h-4 shrink-0 ${expiringTrialsCount > 0 ? 'text-amber-500' : 'text-zinc-400'}`} />
          </div>
          <div className={`text-2xl sm:text-3xl font-bold tracking-tight truncate ${
            expiringTrialsCount > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-zinc-950 dark:text-zinc-50'
          }`}>
            {expiringTrialsCount} {isKm ? 'ហាង' : 'orgs'}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. Middle Row: Subscription Distribution & Tenant Lifecycle (Donut Charts)
      ───────────────────────────────────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────
          2. Middle Row: 3 Analytics Containers (Donut Charts)
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5">
        {/* Container 1: Subscription Plan Distribution (Donut Chart) */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0 pr-1">
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 truncate">
                  {isKm ? 'ការចែកចាយគម្រោង Subscription' : 'Subscription Tier Distribution'}
                </h3>
                <p className="text-xs text-zinc-500 truncate">
                  {isKm ? 'សមាមាត្រអ្នកជាវតាមប្រភេទគម្រោង' : 'Distribution of active subscriptions by plan tier'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/plans')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline shrink-0"
              >
                {isKm ? 'គ្រប់គ្រងគម្រោង' : 'Manage Plans'}
              </button>
            </div>

            {/* Donut Chart and Legend */}
            <div className="flex flex-col items-center gap-4 pt-3 pb-1">
              {/* Donut Graphic */}
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center my-1">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="currentColor"
                    className="text-zinc-100 dark:text-zinc-800/80"
                    strokeWidth="12"
                  />
                  {subscriptionSegments.map((seg) => (
                    seg.count > 0 && (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke={seg.stroke}
                        strokeWidth="12"
                        strokeDasharray={seg.dasharray}
                        strokeDashoffset={seg.dashoffset}
                        className="transition-all duration-500 ease-out"
                      />
                    )
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50 leading-none">
                    {totalTierOrgs}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-1 font-medium">
                    {isKm ? 'ហាងសរុប' : 'Total Brands'}
                  </span>
                </div>
              </div>

              {/* Tiers Legend List */}
              <div className="w-full space-y-1.5 min-w-0">
                {subscriptionSegments.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: d.stroke }}
                      />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {d.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-zinc-950 dark:text-zinc-50">
                        {d.count}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-medium">
                        ({d.pct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Container 2: Tenant Lifecycle Breakdown (Donut Chart) */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0 pr-1">
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 truncate">
                  {isKm ? 'វដ្តជីវិតអាជីវកម្ម' : 'Tenant Lifecycle'}
                </h3>
                <p className="text-xs text-zinc-500 truncate">
                  {isKm ? 'ស្ថានភាពសកម្ម ផ្អាក និងទុកក្នុងប័ណ្ណសារ' : 'Active, suspended, and archived status'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/organizations')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline shrink-0"
              >
                {isKm ? 'ពិនិត្យបញ្ជីហាង' : 'View Organizations'}
              </button>
            </div>

            {/* Donut Chart and Legend */}
            <div className="flex flex-col items-center gap-4 pt-3 pb-1">
              {/* Donut Graphic */}
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center my-1">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="currentColor"
                    className="text-zinc-100 dark:text-zinc-800/80"
                    strokeWidth="12"
                  />
                  {lifecycleSegments.map((seg) => (
                    seg.count > 0 && (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke={seg.stroke}
                        strokeWidth="12"
                        strokeDasharray={seg.dasharray}
                        strokeDashoffset={seg.dashoffset}
                        className="transition-all duration-500 ease-out"
                      />
                    )
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50 leading-none">
                    {totalLifecycle}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-1 font-medium">
                    {isKm ? 'ហាងទាំងអស់' : 'All Tenants'}
                  </span>
                </div>
              </div>

              {/* Status Breakdown Legend List */}
              <div className="w-full space-y-1.5 min-w-0">
                {lifecycleSegments.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: item.stroke }}
                      />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-zinc-950 dark:text-zinc-50">
                        {item.count}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-medium">
                        ({item.pct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Container 3: Subscription & Trial Conversion (Donut Chart) */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0 pr-1">
                <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 truncate">
                  {isKm ? 'ស្ថានភាពគម្រោង & សាកល្បង' : 'Subscription & Trial Status'}
                </h3>
                <p className="text-xs text-zinc-500 truncate">
                  {isKm ? 'សមាមាត្របង់ប្រាក់ សាកល្បង និងផ្អាក' : 'Paid active vs free trial & suspended'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/superadmin/organizations')}
                className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline shrink-0"
              >
                {isKm ? 'ពិនិត្យការជាវ' : 'Billing Status'}
              </button>
            </div>

            {/* Donut Chart and Legend */}
            <div className="flex flex-col items-center gap-4 pt-3 pb-1">
              {/* Donut Graphic */}
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center my-1">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="currentColor"
                    className="text-zinc-100 dark:text-zinc-800/80"
                    strokeWidth="12"
                  />
                  {billingSegments.map((seg) => (
                    seg.count > 0 && (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke={seg.stroke}
                        strokeWidth="12"
                        strokeDasharray={seg.dasharray}
                        strokeDashoffset={seg.dashoffset}
                        className="transition-all duration-500 ease-out"
                      />
                    )
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50 leading-none">
                    {totalBilling}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-1 font-medium">
                    {isKm ? 'ហាងជាវ' : 'Total Accounts'}
                  </span>
                </div>
              </div>

              {/* Status Breakdown Legend List */}
              <div className="w-full space-y-1.5 min-w-0">
                {billingSegments.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: item.stroke }}
                      />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-zinc-950 dark:text-zinc-50">
                        {item.count}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-medium">
                        ({item.pct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. Multi-Granularity Adaptive Historical Trend Chart
      ───────────────────────────────────────────────────────────── */}
      <div className="p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3.5 min-w-0">
        {/* Header Row: Title & Single Time Filter Trigger Modal Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {timeRange === 'today'
                ? (isKm ? 'និន្នាការតាមម៉ោង (ថ្ងៃនេះ)' : 'Hourly Revenue & Tenant Trend (Today)')
                : timeRange === 'week'
                ? (isKm ? 'និន្នាការប្រចាំថ្ងៃ (សប្តាហ៍នេះ)' : 'Daily Revenue & Tenant Trend (This Week)')
                : timeRange === 'month'
                ? (isKm ? 'និន្នាការប្រចាំថ្ងៃ (ខែនេះ)' : 'Daily Revenue & Tenant Trend (This Month)')
                : timeRange === 'year'
                ? (isKm ? 'និន្នាការប្រចាំខែ (ឆ្នាំនេះ)' : 'Monthly Revenue & Tenant Trend (This Year)')
                : (isKm ? `និន្នាការកាលបរិច្ឆេទផ្ទាល់ខ្លួន (${currentRangeLabel})` : `Custom Trend (${currentRangeLabel})`)}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isKm
                ? 'ប្រាក់ចំណូលជាវគម្រោងប្រចាំខែ និងចំនួនភោជនីយដ្ឋានសរុបដែលបានចុះឈ្មោះ'
                : 'Historical subscription recurring revenue and cumulative registered tenant organizations'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Trigger Button & Dropdown Modal positioned near button */}
            <div className="relative inline-block" ref={dateDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsFilterModalOpen((prev) => !prev)
                  setIsCustomRangeModalOpen(false)
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <span>{currentRangeLabel}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                    isFilterModalOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Modal appearing right near button */}
              {isFilterModalOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-84 sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 shadow-xl z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150"
                  role="dialog"
                >
                  {!isCustomRangeModalOpen ? (
                    /* View 1: Presets (Two-Column Grid) */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                          <h4 className="text-xs font-bold text-zinc-950 dark:text-zinc-50">
                            {isKm ? 'ជ្រើសរើសចន្លោះកាលបរិច្ឆេទ' : 'Select Timeframe'}
                          </h4>
                          <p className="text-[11px] text-zinc-400">
                            {isKm ? 'ជ្រើសរើសកាលវិភាគដើម្បីមើលក្រាហ្វ' : 'Choose time window for analytics'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsFilterModalOpen(false)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 2-Column Grid for the 4 presets */}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          {
                            key: 'today' as const,
                            label: isKm ? 'ថ្ងៃនេះ' : 'Today',
                            sub: isKm ? 'ក្រាហ្វតាមម៉ោង (២៤ ម៉ោង)' : 'Hourly breakdown (24h)',
                          },
                          {
                            key: 'week' as const,
                            label: isKm ? 'សប្តាហ៍នេះ' : 'This Week',
                            sub: isKm ? 'ក្រាហ្វតាមថ្ងៃ (៧ ថ្ងៃចុងក្រោយ)' : 'Daily breakdown (last 7d)',
                          },
                          {
                            key: 'month' as const,
                            label: isKm ? 'ខែនេះ' : 'This Month',
                            sub: isKm ? 'ក្រាហ្វតាមថ្ងៃ (១ ដល់ ៣១ ថ្ងៃ)' : 'Daily breakdown (1-31)',
                          },
                          {
                            key: 'year' as const,
                            label: isKm ? 'ឆ្នាំនេះ' : 'This Year',
                            sub: isKm ? 'ក្រាហ្វតាមខែ (១២ ខែ)' : 'Monthly breakdown (12m)',
                          },
                        ].map((item) => {
                          const isSelected = timeRange === item.key
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setTimeRange(item.key)
                                setIsFilterModalOpen(false)
                              }}
                              className={`flex flex-col justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-[#167e61] bg-[#167e61]/5 text-zinc-950 dark:text-zinc-50 shadow-xs'
                                  : 'border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-xs font-bold">{item.label}</span>
                                {isSelected && (
                                  <div className="w-4 h-4 rounded-full bg-[#167e61] text-white flex items-center justify-center shrink-0">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-400 mt-1 leading-snug">{item.sub}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Custom Date Range Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          setTempStartDate(customStartDate)
                          setTempEndDate(customEndDate)
                          setIsCustomRangeModalOpen(true)
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          timeRange === 'custom'
                            ? 'border-[#167e61] bg-[#167e61]/5 text-zinc-950 dark:text-zinc-50 shadow-xs'
                            : 'border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold">
                            {isKm ? 'កំណត់កាលបរិច្ឆេទផ្ទាល់ខ្លួន' : 'Custom Date Range'}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {timeRange === 'custom'
                              ? `${customStartDate} → ${customEndDate}`
                              : isKm
                              ? 'ជ្រើសរើសចន្លោះថ្ងៃចាប់ផ្តើម និងបញ្ចប់'
                              : 'Choose specific start and end dates'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          {timeRange === 'custom' && (
                            <div className="w-4 h-4 rounded-full bg-[#167e61] text-white flex items-center justify-center mr-1">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        </div>
                      </button>
                    </div>
                  ) : (
                    /* View 2: Custom Date Range Picker */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsCustomRangeModalOpen(false)}
                            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            title={isKm ? 'ត្រឡប់ក្រោយ' : 'Back'}
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <div>
                            <h4 className="text-xs font-bold text-zinc-950 dark:text-zinc-50">
                              {isKm ? 'កំណត់ចន្លោះកាលបរិច្ឆេទ' : 'Custom Date Range'}
                            </h4>
                            <p className="text-[10px] text-zinc-400">
                              {isKm ? 'ជ្រើសរើសថ្ងៃចាប់ផ្តើម និងបញ្ចប់' : 'Select start and end dates'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsFilterModalOpen(false)
                            setIsCustomRangeModalOpen(false)
                          }}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                              {isKm ? 'ចាប់ពីថ្ងៃ:' : 'From:'}
                            </label>
                            <input
                              type="date"
                              value={tempStartDate}
                              onChange={(e) => setTempStartDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-[#167e61]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                              {isKm ? 'ដល់ថ្ងៃ:' : 'To:'}
                            </label>
                            <input
                              type="date"
                              value={tempEndDate}
                              min={tempStartDate}
                              onChange={(e) => setTempEndDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-[#167e61]"
                            />
                          </div>
                        </div>

                        {/* Dynamic Preview Indicator */}
                        {(() => {
                          if (!tempStartDate || !tempEndDate) return null
                          const s = new Date(tempStartDate)
                          const e = new Date(tempEndDate)
                          const diffDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
                          const isSingleDay = tempStartDate === tempEndDate || diffDays === 0

                          return (
                            <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 space-y-0.5">
                              <div className="font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#167e61]" />
                                {isSingleDay
                                  ? (isKm ? 'បង្ហាញក្រាហ្វតាមម៉ោង (២៤ ម៉ោង)' : 'Hourly graph (24h)')
                                  : diffDays <= 31
                                  ? (isKm ? `បង្ហាញក្រាហ្វតាមថ្ងៃ (${diffDays + 1} ថ្ងៃ)` : `Daily graph (${diffDays + 1} days)`)
                                  : (isKm ? 'បង្ហាញក្រាហ្វតាមខែ' : 'Monthly graph')}
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => setIsCustomRangeModalOpen(false)}
                          className="px-2.5 py-1 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          {isKm ? 'បោះបង់' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (tempStartDate && tempEndDate) {
                              setCustomStartDate(tempStartDate)
                              setCustomEndDate(tempEndDate)
                              setTimeRange('custom')
                              setIsFilterModalOpen(false)
                              setIsCustomRangeModalOpen(false)
                            }
                          }}
                          disabled={!tempStartDate || !tempEndDate || tempStartDate > tempEndDate}
                          className="px-3 py-1 rounded-xl text-xs font-semibold bg-[#167e61] text-white hover:bg-[#126850] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
                        >
                          {isKm ? 'អនុវត្ត' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-xs font-medium pl-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#167e61]" />
                <span className="text-zinc-600 dark:text-zinc-400">
                  {isKm ? 'ចំណូល ($)' : 'Revenue ($)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-emerald-500" />
                <span className="text-zinc-600 dark:text-zinc-400">
                  {isKm ? 'ចំនួនហាងសរុប' : 'Total Tenants'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Bar / Chart Grid (Responsive & Smooth Horizontal Scroll) */}
        <div className="pt-2 pb-1">
          <div className="overflow-x-auto pb-2 scrollbar-thin">
            <div
              className={`min-w-full flex items-end h-44 sm:h-48 border-b border-zinc-200 dark:border-zinc-800 px-2 pb-2 gap-1.5 sm:gap-2 ${
                chartBars.length > 15 ? 'min-w-[720px]' : ''
              }`}
            >
              {chartBars.map((bar, idx) => {
                const revNum = Number(bar.revenue || 0)
                const heightPercent =
                  revNum > 0 && maxRevenue > 0
                    ? Math.min(100, Math.max(8, Math.round((revNum / maxRevenue) * 100)))
                    : 3
                const isHovered = hoveredBarIndex === idx
                const barWidthClass =
                  chartBars.length > 20
                    ? 'w-1 sm:w-1.5'
                    : chartBars.length > 10
                    ? 'w-1.5 sm:w-2'
                    : 'w-2.5 sm:w-3'

                return (
                  <div
                    key={bar.key}
                    onMouseEnter={() => setHoveredBarIndex(idx)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                    className="relative flex-1 min-w-[12px] sm:min-w-[16px] flex flex-col items-center h-full justify-end group cursor-pointer"
                  >
                    {/* Revenue Bar - sleek and small */}
                    <div
                      style={{ height: revNum > 0 ? `${heightPercent}%` : '4px' }}
                      className={`${barWidthClass} rounded-full transition-all duration-300 relative ${
                        revNum > 0
                          ? isHovered
                            ? 'bg-[#12674f]'
                            : 'bg-[#167e61]'
                          : isHovered
                          ? 'bg-zinc-400 dark:bg-zinc-600'
                          : 'bg-zinc-200 dark:bg-zinc-800'
                      }`}
                    >
                      {/* Top label: show amount only if revNum > 0 */}
                      {revNum > 0 && (
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {formatUSD(revNum).replace('.00', '')}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* X-Axis Labels */}
            <div
              className={`min-w-full flex items-start pt-2 px-2 text-center gap-1.5 sm:gap-2 ${
                chartBars.length > 15 ? 'min-w-[720px]' : ''
              }`}
            >
              {chartBars.map((bar, idx) => (
                <div key={bar.key} className="flex-1 min-w-[14px] sm:min-w-[18px]">
                  <span
                    className={`text-[10px] sm:text-xs font-semibold block transition-colors truncate ${
                      hoveredBarIndex === idx
                        ? 'text-[#167e61] dark:text-[#22ab84]'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {bar.label}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-zinc-400 block mt-0.5 truncate">
                    {bar.tenants} {isKm ? 'ហាង' : 'orgs'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. Operational Expiring Trials Outreach (Level 3)
      ───────────────────────────────────────────────────────────── */}
      <div className="p-3.5 sm:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 min-w-0">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {isKm ? 'ហាងជិតផុតកំណត់សាកល្បង (Expiring Trials)' : 'Expiring Trials & Renewal Outreach'}
            </h3>
            <button
              type="button"
              onClick={() => navigate('/superadmin/organizations')}
              className="text-xs font-semibold text-[#167e61] dark:text-[#22ab84] hover:underline flex items-center gap-1"
            >
              <span>{isKm ? 'គ្រប់គ្រងហាង' : 'Manage All'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-zinc-500 mb-2">
            {isKm
              ? 'បញ្ជីហាងដែលជិតផុតកំណត់សាកល្បងក្នុងរយៈពេល ៧ ថ្ងៃខាងមុខ សម្រាប់ក្រុមការងារតាមដាន'
              : 'Tenant organizations with trials ending within 7 days requiring sales or billing follow-up'}
          </p>

          {/* List */}
          {expiringTrials.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {expiringTrials.map((org) => (
                <div
                  key={org.organization_id}
                  className="py-3 sm:py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-zinc-950 dark:text-zinc-50 truncate">
                      {org.organization_name}
                    </div>
                    <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mt-0.5">
                      {org.plan_name}
                    </div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mt-0.5 truncate">
                      /{org.organization_slug}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-xs">
                      {org.days_remaining === 0
                        ? (isKm ? 'ផុតថ្ងៃនេះ' : 'ends today')
                        : (isKm ? `នៅសល់ ${org.days_remaining} ថ្ងៃ` : `${org.days_remaining}d left`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate('/superadmin/organizations')}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#167e61] hover:bg-[#12674f] transition-colors shadow-xs"
                    >
                      {isKm ? 'កែប្រែ' : 'Review'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-zinc-400 space-y-1">
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
    </div>
  )
}

