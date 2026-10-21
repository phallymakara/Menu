import { useState, type FC } from 'react'
import {
  CreditCard,
  Plus,
  Check,
  X,
  Edit2,
  Users,
  Archive,
  Loader2,
  Building2,
  Store,
  BarChart3,
  CookingPot,
  Boxes,
  Globe,
  Sparkles,
  QrCode,
  RotateCcw,
} from 'lucide-react'
import {
  usePlatformPlans,
  usePlatformPlanDetail,
  useCreatePlatformPlan,
  useUpdatePlatformPlan,
  useArchivePlatformPlan,
  type AdminPlanListItem,
} from '../hooks'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { formatUSD } from '@/lib/currency'
import { getApiErrorMessage } from '@/lib/api-error'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

export interface FeatureFlagConfig {
  key: string
  altKeys?: string[]
  labelEn: string
  labelKm: string
  descriptionEn: string
  descriptionKm: string
  icon: typeof BarChart3
}

export const FEATURE_GATES: FeatureFlagConfig[] = [
  {
    key: 'analytics',
    altKeys: ['has_analytics'],
    labelEn: 'Advanced Analytics & Reports',
    labelKm: 'ការវិភាគកម្រិតខ្ពស់ & របាយការណ៍',
    descriptionEn: 'Full financial metrics, top-selling items, and category sales charts.',
    descriptionKm: 'របាយការណ៍លក់ ប្រាក់ចំណូល និងទំនិញលក់ដាច់បំផុត។',
    icon: BarChart3,
  },
  {
    key: 'inventory',
    altKeys: ['has_inventory'],
    labelEn: 'Multi-Branch Inventory',
    labelKm: 'គ្រប់គ្រងស្តុកតាមសាខា',
    descriptionEn: 'Live stock tracking, low-stock alerts, and manual waste adjustments.',
    descriptionKm: 'តាមដានស្តុកទំនិញជាក់ស្តែង ការជូនដំណឹងជិតអស់ស្តុក និងការកែសម្រួលស្តុក។',
    icon: Boxes,
  },
  {
    key: 'kds',
    altKeys: ['has_kds'],
    labelEn: 'Kitchen Display System (KDS)',
    labelKm: 'ប្រព័ន្ធអេក្រង់ផ្ទះបាយ (KDS)',
    descriptionEn: 'Live kitchen order station routing, ticket bumps, and cook status sync.',
    descriptionKm: 'ការបញ្ជូនវិក្កយបត្រផ្ទះបាយតាមស្ថានីយ៍ និងការបញ្ជាក់ម្ហូបឆ្អិន។',
    icon: CookingPot,
  },
  {
    key: 'qr_ordering',
    altKeys: ['has_qr_ordering'],
    labelEn: 'QR Menu & Self-Ordering',
    labelKm: 'មីនុយឌីជីថល & កុម្ម៉ង់ QR',
    descriptionEn: 'Bilingual mobile digital menu with instant table QR ordering.',
    descriptionKm: 'អតិថិជនស្កេន QR មើលមីនុយ និងកុម្ម៉ង់ផ្ទាល់ខ្លួនបានយ៉ាងរហ័ស។',
    icon: QrCode,
  },
  {
    key: 'khqr',
    altKeys: ['has_khqr'],
    labelEn: 'Bakong Dynamic KHQR Payments',
    labelKm: 'ការទូទាត់បាគង KHQR ស្វ័យប្រវត្តិ',
    descriptionEn: 'Instant bill dynamic QR generation with automatic payment verification.',
    descriptionKm: 'បង្កើតកូដ KHQR តាមវិក្កយបត្រ និងផ្ទៀងផ្ទាត់ការទូទាត់ភ្លាមៗ។',
    icon: Sparkles,
  },
  {
    key: 'multi_branch',
    altKeys: ['multi_branch_reports', 'has_multi_branch'],
    labelEn: 'Multi-Branch Network',
    labelKm: 'បណ្តាញពហុសាខា',
    descriptionEn: 'Centralized multi-outlet catalog, cross-branch roaming, and menu overrides.',
    descriptionKm: 'ការគ្រប់គ្រងសាខាច្រើន និងការប្តូរតម្លៃ ឬមុខម្ហូបតាមសាខានីមួយៗ។',
    icon: Store,
  },
  {
    key: 'api_access',
    altKeys: ['has_api_access'],
    labelEn: 'API & Webhooks Access',
    labelKm: 'ការតភ្ជាប់ API & Webhooks',
    descriptionEn: 'Direct REST API integration and automated external event dispatch.',
    descriptionKm: 'ការតភ្ជាប់ប្រព័ន្ធខាងក្រៅតាមរយៈ REST API និង Webhooks ដោយស្វ័យប្រវត្តិ។',
    icon: Globe,
  },
]

export function checkFeatureFlag(
  flags: Record<string, any> | undefined | null,
  gate: FeatureFlagConfig
): boolean {
  if (!flags) return false
  if (typeof flags[gate.key] === 'boolean') return flags[gate.key]
  if (gate.altKeys) {
    for (const alt of gate.altKeys) {
      if (typeof flags[alt] === 'boolean') return flags[alt]
    }
  }
  return false
}

export const PlatformPlansTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [includeInactive, setIncludeInactive] = useState(true)
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null)
  const [togglingGateKey, setTogglingGateKey] = useState<string | null>(null)

  // Plan Form Modal State (Create or Edit)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<AdminPlanListItem | null>(null)

  // Form Fields
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPriceMonthly, setFormPriceMonthly] = useState('0.00')
  const [formPriceAnnually, setFormPriceAnnually] = useState('0.00')
  const [formMaxBranches, setFormMaxBranches] = useState('1')
  const [formMaxStaff, setFormMaxStaff] = useState('5')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formIsPublic, setFormIsPublic] = useState(true)
  const [formFeatureFlags, setFormFeatureFlags] = useState<Record<string, boolean>>({
    analytics: true,
    inventory: false,
    kds: false,
    qr_ordering: true,
    khqr: true,
    multi_branch: false,
    api_access: false,
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Archive Confirmation Modal State
  const [archiveTargetPlan, setArchiveTargetPlan] = useState<AdminPlanListItem | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  // Queries & Mutations
  const { data: plans = [], isLoading: isLoadingPlans } = usePlatformPlans(includeInactive)
  const { data: planDetail, isLoading: isLoadingDetail } = usePlatformPlanDetail(detailPlanId)
  const createPlanMutation = useCreatePlatformPlan()
  const updatePlanMutation = useUpdatePlatformPlan()
  const archivePlanMutation = useArchivePlatformPlan()

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPlan(null)
    setFormCode('')
    setFormName('')
    setFormDescription('')
    setFormPriceMonthly('19.00')
    setFormPriceAnnually('190.00')
    setFormMaxBranches('1')
    setFormMaxStaff('5')
    setFormIsActive(true)
    setFormIsPublic(true)
    setFormFeatureFlags({
      analytics: true,
      inventory: false,
      kds: false,
      qr_ordering: true,
      khqr: true,
      multi_branch: false,
      api_access: false,
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEditModal = (plan: AdminPlanListItem) => {
    setEditingPlan(plan)
    setFormCode(plan.code)
    setFormName(plan.name)
    setFormDescription(plan.description || '')
    setFormPriceMonthly(String(plan.price_usd_monthly))
    setFormPriceAnnually(String(plan.price_usd_annually))
    setFormMaxBranches(String(plan.max_branches ?? 1))
    setFormMaxStaff(String(plan.max_staff ?? 5))
    setFormIsActive(plan.is_active ?? true)
    setFormIsPublic(plan.is_public ?? true)

    const existingFlags = (plan.feature_flags as Record<string, boolean>) || {}
    const flagsState: Record<string, boolean> = {}
    FEATURE_GATES.forEach((g) => {
      flagsState[g.key] = checkFeatureFlag(existingFlags, g)
    })
    setFormFeatureFlags(flagsState)
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Direct toggle on card: Check / Uncheck Feature Gate with instant update
  const handleToggleGate = async (plan: AdminPlanListItem, gate: FeatureFlagConfig) => {
    const currentVal = checkFeatureFlag(plan.feature_flags as any, gate)
    const newVal = !currentVal
    const gateId = `${plan.id}_${gate.key}`
    setTogglingGateKey(gateId)

    try {
      const updatedFlags: Record<string, boolean> = {
        ...((plan.feature_flags as Record<string, boolean>) || {}),
        [gate.key]: newVal,
      }
      if (gate.altKeys) {
        gate.altKeys.forEach((k) => {
          updatedFlags[k] = newVal
        })
      }

      await updatePlanMutation.mutateAsync({
        planId: plan.id,
        payload: {
          feature_flags: updatedFlags,
        },
      })
    } catch (err) {
      console.error('Failed to toggle feature gate', err)
    } finally {
      setTogglingGateKey(null)
    }
  }

  // Direct Reactivate an archived plan
  const handleReactivatePlan = async (plan: AdminPlanListItem) => {
    try {
      await updatePlanMutation.mutateAsync({
        planId: plan.id,
        payload: { is_active: true },
      })
    } catch (err) {
      console.error('Failed to reactivate plan', err)
    }
  }

  // Submit Plan Form (Create or Update)
  const handleSubmitPlanForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const monthlyNum = parseFloat(formPriceMonthly) || 0
    const annuallyNum = parseFloat(formPriceAnnually) || 0
    const maxBranchesNum = parseInt(formMaxBranches, 10) || 1
    const maxStaffNum = parseInt(formMaxStaff, 10) || 5

    // Build complete feature flags dictionary supporting both standard and legacy keys
    const mergedFlags: Record<string, boolean> = { ...formFeatureFlags }
    FEATURE_GATES.forEach((g) => {
      const val = !!formFeatureFlags[g.key]
      mergedFlags[g.key] = val
      if (g.altKeys) {
        g.altKeys.forEach((alt) => {
          mergedFlags[alt] = val
        })
      }
    })

    try {
      if (editingPlan) {
        // Update existing plan
        await updatePlanMutation.mutateAsync({
          planId: editingPlan.id,
          payload: {
            name: formName.trim(),
            description: formDescription.trim() || null,
            price_usd_monthly: monthlyNum,
            price_usd_annually: annuallyNum,
            max_branches: maxBranchesNum,
            max_staff: maxStaffNum,
            feature_flags: mergedFlags,
            is_active: formIsActive,
            is_public: formIsPublic,
          },
        })
      } else {
        // Create new plan
        if (!formCode.trim()) {
          setFormError(isKm ? 'សូមបញ្ចូលកូដសម្គាល់គម្រោង' : 'Plan code is required.')
          return
        }
        await createPlanMutation.mutateAsync({
          code: formCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
          name: formName.trim(),
          description: formDescription.trim() || null,
          price_usd_monthly: monthlyNum,
          price_usd_annually: annuallyNum,
          max_branches: maxBranchesNum,
          max_staff: maxStaffNum,
          feature_flags: mergedFlags,
          is_active: formIsActive,
          is_public: formIsPublic,
        })
      }
      setIsFormModalOpen(false)
    } catch (err) {
      setFormError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការរក្សាទុកគម្រោង' : 'Failed to save plan tier'))
    }
  }

  // Handle Archive Plan
  const handleConfirmArchive = async () => {
    if (!archiveTargetPlan) return
    setArchiveError(null)

    try {
      await archivePlanMutation.mutateAsync(archiveTargetPlan.id)
      setArchiveTargetPlan(null)
    } catch (err) {
      setArchiveError(getApiErrorMessage(err, isKm ? 'បរាជ័យក្នុងការផ្អាកគម្រោង' : 'Failed to archive plan tier'))
    }
  }

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—'
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(isKm ? 'km-KH' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <div className="flex items-center justify-end gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded-lg border-zinc-300 dark:border-zinc-700 text-[#167e61] focus:ring-[#167e61]"
          />
          <span>{isKm ? 'បង្ហាញគម្រោងអសកម្ម' : 'Show Inactive Tiers'}</span>
        </label>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#167e61] hover:bg-[#12674f] text-white shadow-xs transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{isKm ? 'បង្កើតគម្រោងថ្មី' : 'Create Plan Tier'}</span>
        </button>
      </div>

      {/* Plan Cards Grid - Scaled to compact size */}
      {isLoadingPlans ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <EmenuLoader
            size="lg"
            message={isKm ? 'កំពុងទាញយកគម្រោង Subscription...' : 'Loading subscription plans...'}
            showBrandText
          />
        </div>
      ) : plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isArchived = !plan.is_active

            return (
              <div
                key={plan.id}
                className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 sm:p-4.5 shadow-xs flex flex-col justify-between transition-all ${
                  isArchived
                    ? 'border-zinc-200 dark:border-zinc-800 opacity-60'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-[#167e61]/50'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header: Name, Code & Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">
                          {plan.name}
                        </h3>
                        {plan.code === 'growth' && (
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        {plan.code}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        plan.is_active
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                      }`}>
                        {plan.is_active ? (isKm ? 'ដំណើរការ' : 'Active') : (isKm ? 'ប័ណ្ណសារ' : 'Archived')}
                      </span>

                      {!plan.is_public && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                          {isKm ? 'លាក់' : 'Private'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                      {plan.description}
                    </p>
                  )}

                  {/* Pricing Display */}
                  <div className="p-2.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/80">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-zinc-950 dark:text-zinc-50">
                        {formatUSD(plan.price_usd_monthly)}
                      </span>
                      <span className="text-[11px] text-zinc-400">/{isKm ? 'ខែ' : 'mo'}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      {formatUSD(plan.price_usd_annually)} /{isKm ? 'ឆ្នាំ' : 'yr billed annually'}
                    </div>
                  </div>

                  {/* Subscribers Metric Pill */}
                  <div className="flex items-center justify-between text-[11px] py-1 px-2.5 rounded-lg bg-[#167e61]/10 border border-[#167e61]/20 dark:border-[#167e61]/30">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                      {isKm ? 'អតិថិជនប្រើប្រាស់:' : 'Subscribers:'}
                    </span>
                    <span className="font-bold text-[#167e61] dark:text-[#22ab84]">
                      {plan.active_subscribers_count ?? 0} {isKm ? 'ហាង' : 'orgs'}
                    </span>
                  </div>

                  {/* Entitlement Limits */}
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                      {isKm ? 'កម្រិតកំណត់ (Limits):' : 'Entitlement Limits:'}
                    </span>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-400 block">{isKm ? 'សាខាអតិបរមា:' : 'Max Branches:'}</span>
                        <strong className="text-zinc-900 dark:text-zinc-100 text-[11px]">
                          {plan.max_branches === -1 ? (isKm ? 'គ្មានកំណត់' : 'Unlimited') : plan.max_branches}
                        </strong>
                      </div>

                      <div className="p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-400 block">{isKm ? 'បុគ្គលិកអតិបរមា:' : 'Max Staff:'}</span>
                        <strong className="text-zinc-900 dark:text-zinc-100 text-[11px]">
                          {plan.max_staff === -1 ? (isKm ? 'គ្មានកំណត់' : 'Unlimited') : plan.max_staff}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Feature Gates Checklist (Check / Uncheck directly on Card) */}
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                        {isKm ? 'មុខងារដែលបានបើក (Feature Gates):' : 'Feature Gates:'}
                      </span>
                      <span className="text-[9px] text-zinc-400 font-normal">
                        {isKm ? 'ចុចដើម្បី បើក/បិទ' : 'Click to toggle'}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {FEATURE_GATES.map((gate) => {
                        const isEnabled = checkFeatureFlag(plan.feature_flags as any, gate)
                        const isToggling = togglingGateKey === `${plan.id}_${gate.key}`
                        const GateIcon = gate.icon

                        return (
                          <button
                            key={gate.key}
                            type="button"
                            onClick={() => handleToggleGate(plan, gate)}
                            disabled={isToggling}
                            title={
                              isKm
                                ? `${isEnabled ? 'បិទមុខងារ' : 'បើកមុខងារ'} ${gate.labelKm}`
                                : `${isEnabled ? 'Revoke' : 'Grant'} access to ${gate.labelEn}`
                            }
                            className={`w-full flex items-center justify-between gap-1.5 py-1 px-1.5 rounded-lg transition-all cursor-pointer text-left border ${
                              isEnabled
                                ? 'bg-emerald-500/10 dark:bg-emerald-950/20 border-emerald-500/25 text-zinc-900 dark:text-zinc-100 hover:bg-emerald-500/15'
                                : 'bg-zinc-50/50 dark:bg-zinc-950/20 border-zinc-200/50 dark:border-zinc-800/50 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 opacity-70'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <GateIcon
                                className={`w-3 h-3 shrink-0 ${
                                  isEnabled ? 'text-[#167e61] dark:text-[#22ab84]' : 'text-zinc-400'
                                }`}
                              />
                              <span className={`text-[10px] truncate ${isEnabled ? 'font-semibold' : 'line-through'}`}>
                                {isKm ? gate.labelKm : gate.labelEn}
                              </span>
                            </div>

                            <div className="shrink-0 flex items-center">
                              {isToggling ? (
                                <Loader2 className="w-3 h-3 text-[#167e61] animate-spin" />
                              ) : isEnabled ? (
                                <div className="w-3.5 h-3.5 rounded bg-[#167e61] text-white flex items-center justify-center shadow-xs">
                                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                                </div>
                              ) : (
                                <div className="w-3.5 h-3.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer: Full CRUD controls */}
                <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailPlanId(plan.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Users className="w-3 h-3 text-zinc-400" />
                    <span>{isKm ? 'អ្នកជាវ' : 'Subscribers'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {/* Edit Plan Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(plan)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#167e61]/10 text-[#167e61] hover:bg-[#167e61]/20 dark:text-[#22ab84] transition-colors"
                      title={isKm ? 'កែប្រែគម្រោង' : 'Edit Plan Configuration'}
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>{isKm ? 'កែប្រែ' : 'Edit'}</span>
                    </button>

                    {plan.is_active ? (
                      <button
                        type="button"
                        onClick={() => {
                          setArchiveTargetPlan(plan)
                          setArchiveError(null)
                        }}
                        className="p-1 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title={isKm ? 'ផ្អាក / ទុកក្នុងប័ណ្ណសារ' : 'Archive Plan'}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivatePlan(plan)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 transition-colors"
                        title={isKm ? 'បើកដំណើរការឡើងវិញ' : 'Reactivate Plan'}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{isKm ? 'បើកវិញ' : 'Restore'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center text-zinc-400 space-y-3">
          <CreditCard className="w-10 h-10 mx-auto opacity-40 text-[#167e61]" />
          <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
            {isKm ? 'មិនទាន់មានគម្រោង Subscription ទេ' : 'No Subscription Plans Configured'}
          </h3>
          <p className="text-xs max-w-sm mx-auto">
            {isKm
              ? 'បង្កើតគម្រោងដំបូងដើម្បីកំណត់តម្លៃ និងដែនកំណត់សម្រាប់ហាងអាហារក្នុងប្រព័ន្ធ។'
              : 'Create your first subscription tier to define pricing, limits, and feature gates.'}
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold bg-[#167e61] text-white hover:bg-[#12674f] shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{isKm ? 'បង្កើតគម្រោងឥឡូវនេះ' : 'Create First Plan Tier'}</span>
          </button>
        </div>
      )}

      {/* Slide-Over Drawer: Plan Subscribers Details */}
      {detailPlanId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setDetailPlanId(null)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 h-full p-6 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 rounded-l-3xl overflow-y-auto z-10 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#167e61]/10 text-[#167e61] dark:text-[#22ab84] flex items-center justify-center font-bold text-sm">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                    {planDetail ? planDetail.name : isKm ? 'ព័ត៌មានគម្រោង' : 'Plan Profile'}
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {planDetail?.code}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailPlanId(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <EmenuLoader
                  size="sm"
                  message={isKm ? 'កំពុងទាញយកបញ្ជីអ្នកជាវ...' : 'Loading subscribers roster...'}
                />
              </div>
            ) : planDetail ? (
              <div className="space-y-6 text-xs">
                {/* Plan Summary Card */}
                <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-950 dark:text-zinc-50 text-sm">
                      {formatUSD(planDetail.price_usd_monthly)}/mo
                    </span>
                    <span className="font-semibold text-zinc-400">
                      {formatUSD(planDetail.price_usd_annually)}/yr
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {isKm ? 'ចំនួនអតិថិជនជាវសរុប:' : 'Active Subscribers:'}{' '}
                    <strong className="text-zinc-900 dark:text-zinc-100">
                      {planDetail.subscribers?.length ?? 0} {isKm ? 'ហាង' : 'organizations'}
                    </strong>
                  </div>
                </div>

                {/* Subscribed Organizations Roster */}
                <div className="space-y-2">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-zinc-400" />
                    <span>{isKm ? 'បញ្ជីហាងដែលកំពុងជាវគម្រោងនេះ' : 'Subscribed Organizations'}</span>
                  </h4>

                  {planDetail.subscribers && planDetail.subscribers.length > 0 ? (
                    <div className="space-y-2">
                      {planDetail.subscribers.map((sub) => (
                        <div
                          key={sub.organization_id}
                          className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-zinc-950 dark:text-zinc-50 text-xs">
                                {sub.organization_name}
                              </div>
                              <div className="text-[11px] text-zinc-400 font-mono">
                                /{sub.organization_slug}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                              {sub.subscription_status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                            <span>{isKm ? 'វដ្តវិក្កយបត្រ:' : 'Cycle:'} <strong className="capitalize">{sub.billing_cycle}</strong></span>
                            {sub.trial_ends_at && (
                              <span>{isKm ? 'សាកល្បងដល់:' : 'Trial:'} {formatDate(sub.trial_ends_at)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 text-xs">
                      {isKm ? 'មិនទាន់មានហាងណាជាវគម្រោងនេះនៅឡើយទេ' : 'No tenant organizations currently subscribed to this tier.'}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal: Create & Edit Subscription Plan */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsFormModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl z-10 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#167e61]" />
                <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                  {editingPlan
                    ? isKm
                      ? 'កែប្រែគម្រោង Subscription'
                      : 'Edit Plan Configuration'
                    : isKm
                    ? 'បង្កើតគម្រោង Subscription ថ្មី'
                    : 'Create New Subscription Plan Tier'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPlanForm} className="space-y-4">
              {/* Code & Name Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {isKm ? 'កូដសម្គាល់គម្រោង (Code):' : 'Plan Code:'}
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    disabled={!!editingPlan}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. enterprise_tier"
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 disabled:opacity-50"
                  />
                  <span className="text-[11px] text-zinc-400 mt-1 block">
                    {editingPlan ? (isKm ? 'កូដមិនអាចប្តូរបានទេ' : 'Code cannot be changed') : (isKm ? 'អក្សរតូច គ្មានដកឃ្លា' : 'lowercase alphanumeric with underscores')}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {isKm ? 'ឈ្មោះគម្រោង (Display Name):' : 'Plan Name:'}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Enterprise Tier"
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {isKm ? 'ការពិពណ៌នាគម្រោង:' : 'Description:'}
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={isKm ? 'រៀបរាប់អំពីគោលដៅនៃគម្រោងនេះ...' : 'Summary of who this tier is designed for...'}
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30 resize-none"
                />
              </div>

              {/* Pricing Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {isKm ? 'តម្លៃប្រចាំខែ ($ USD):' : 'Monthly Price ($ USD):'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPriceMonthly}
                    onChange={(e) => setFormPriceMonthly(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {isKm ? 'តម្លៃប្រចាំឆ្នាំ ($ USD):' : 'Annual Price ($ USD):'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPriceAnnually}
                    onChange={(e) => setFormPriceAnnually(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  />
                </div>
              </div>

              {/* Quotas Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {isKm ? 'ចំនួនសាខា (-1 គ្មានកំណត់):' : 'Max Branches (-1 for unlimited):'}
                  </label>
                  <input
                    type="number"
                    value={formMaxBranches}
                    onChange={(e) => setFormMaxBranches(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {isKm ? 'ចំនួនបុគ្គលិក (-1 គ្មានកំណត់):' : 'Max Staff (-1 for unlimited):'}
                  </label>
                  <input
                    type="number"
                    value={formMaxStaff}
                    onChange={(e) => setFormMaxStaff(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#167e61]/30"
                  />
                </div>
              </div>

              {/* Feature Gates Checklist */}
              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                  {isKm ? 'មុខងារដែលបានបើកសម្រាប់គម្រោងនេះ:' : 'Feature Capabilities Included:'}
                </label>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {FEATURE_GATES.map((gate) => {
                    const isChecked = !!formFeatureFlags[gate.key]
                    const GateIcon = gate.icon

                    return (
                      <label
                        key={gate.key}
                        className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                          isChecked
                            ? 'border-[#167e61]/40 bg-[#167e61]/5 dark:bg-[#167e61]/15 text-[#167e61]'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setFormFeatureFlags((prev) => ({
                              ...prev,
                              [gate.key]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 rounded-lg border-zinc-300 dark:border-zinc-700 text-[#167e61] focus:ring-[#167e61]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            <GateIcon className="w-4 h-4 text-zinc-500" />
                            <span>{isKm ? gate.labelKm : gate.labelEn}</span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {isKm ? gate.descriptionKm : gate.descriptionEn}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Availability Options */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsPublic}
                    onChange={(e) => setFormIsPublic(e.target.checked)}
                    className="rounded-lg border-zinc-300 dark:border-zinc-700 text-[#167e61] focus:ring-[#167e61]"
                  />
                  <div>
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 block">
                      {isKm ? 'បង្ហាញជាសាធារណៈ' : 'Publicly Selectable'}
                    </span>
                    <span className="text-xs text-zinc-400 block mt-0.5">
                      {isKm ? 'បង្ហាញលើ Landing Page' : 'Visible on Landing Page'}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded-lg border-zinc-300 dark:border-zinc-700 text-[#167e61] focus:ring-[#167e61]"
                  />
                  <div>
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 block">
                      {isKm ? 'ស្ថានភាពសកម្ម' : 'Active Status'}
                    </span>
                    <span className="text-xs text-zinc-400 block mt-0.5">
                      {isKm ? 'អនុញ្ញាតឱ្យប្រើប្រាស់' : 'Usable by restaurants'}
                    </span>
                  </div>
                </label>
              </div>

              {formError && (
                <div className="text-red-600 dark:text-red-400 text-xs p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
                  {formError}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-2xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isKm ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold bg-[#167e61] hover:bg-[#12674f] text-white shadow-xs disabled:opacity-50 transition-colors"
                >
                  {(createPlanMutation.isPending || updatePlanMutation.isPending) && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>
                    {editingPlan
                      ? isKm
                        ? 'រក្សាទុកការកែប្រែ'
                        : 'Save Changes'
                      : isKm
                      ? 'បង្កើតគម្រោង'
                      : 'Create Plan Tier'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Soft-Archive Plan */}
      {archiveTargetPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setArchiveTargetPlan(null)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'ផ្អាក / ទុកគម្រោងក្នុងប័ណ្ណសារ' : 'Archive Subscription Plan'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setArchiveTargetPlan(null)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {isKm
                  ? `តើអ្នកប្រាកដជាចង់ផ្អាកគម្រោង "${archiveTargetPlan.name}" មែនទេ? គម្រោងនេះនឹងត្រូវកំណត់ជាអសកម្ម និងមិនបង្ហាញជាសាធារណៈសម្រាប់អតិថិជនថ្មីទេ ប៉ុន្តែហាងដែលកំពុងជាវនឹងមិនត្រូវបានរំខានឡើយ។`
                  : `Are you sure you want to archive the plan "${archiveTargetPlan.name}"? It will be marked inactive and hidden from new subscribers, while existing customers will remain uninterrupted.`}
              </p>

              {archiveError && (
                <div className="text-red-600 dark:text-red-400 text-xs p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
                  {archiveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setArchiveTargetPlan(null)}
                  className="px-4 py-2 rounded-2xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isKm ? 'បោះបង់' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmArchive}
                  disabled={archivePlanMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white shadow-xs disabled:opacity-50 transition-colors"
                >
                  {archivePlanMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isKm ? 'ផ្អាកគម្រោង' : 'Confirm Archive'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
