import { useState, type FC } from 'react'
import { CheckCircle2, ArrowRight, Loader2, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import {
  useTenantSubscription,
  usePublicPlans,
  useChangeTenantPlan,
  type PlanResponse,
} from '../../hooks/useSubscriptionQueries'

interface TenantSubscriptionCardProps {
  orgId: string | null
}

export const TenantSubscriptionCard: FC<TenantSubscriptionCardProps> = ({ orgId }) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const { data: subscription, isLoading, error } = useTenantSubscription(orgId)
  const { data: plans } = usePublicPlans()
  const changePlanMutation = useChangeTenantPlan(orgId)

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleOpenPlanModal = () => {
    setSelectedPlanCode(subscription?.plan?.code || 'starter')
    setBillingCycle((subscription?.billing_cycle as 'monthly' | 'annual') || 'monthly')
    setErrorMessage(null)
    setIsPlanModalOpen(true)
  }

  const handleChangePlan = async () => {
    if (!selectedPlanCode) return
    setErrorMessage(null)
    try {
      await changePlanMutation.mutateAsync({
        plan_code: selectedPlanCode,
        billing_cycle: billingCycle,
      })
      setIsPlanModalOpen(false)
    } catch {
      setErrorMessage(
        isKm ? 'មិនអាចផ្លាស់ប្តូរគម្រោងបានទេ។ សូមព្យាយាមម្តងទៀត។' : 'Failed to change subscription plan.'
      )
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex justify-center py-12">
        <EmenuLoader />
      </div>
    )
  }

  if (error || !subscription) {
    return null
  }

  const plan = subscription.plan
  const isTrial = subscription.status === 'trial'

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-none">
      {/* Card Header */}
      <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {plan?.name || 'Subscription'}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                subscription.status === 'active'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : isTrial
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {subscription.status}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {isKm ? 'ព័ត៌មានលម្អិតអំពីគម្រោងសេវាកម្ម និងកម្រិតប្រើប្រាស់' : 'Subscription tier and resource limits'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenPlanModal}
          className="rounded-xl text-xs font-medium px-4 py-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-none"
        >
          {isKm ? 'ប្តូរគម្រោង (Change Plan)' : 'Change Plan'}
        </Button>
      </div>

      <div className="p-5 sm:p-6 space-y-4">
        {/* Trial Alert Banner if in trial */}
        {isTrial && (
          <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-300">
            <span>
              {isKm
                ? `អ្នកកំពុងស្ថិតក្នុងការសាកល្បងឥតគិតថ្លៃ។ នៅសល់ ${subscription.days_remaining_in_trial ?? 0} ថ្ងៃទៀត។`
                : `You are on free trial. ${subscription.days_remaining_in_trial ?? 0} days remaining.`}
            </span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Branches Limit */}
          <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-2">
            <div className="text-zinc-500 text-xs font-medium">
              {isKm ? 'សាខា (Branches)' : 'Branches'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {subscription.current_branch_count}
              </span>
              <span className="text-xs text-zinc-400">
                / {plan?.max_branches ?? '∞'} {isKm ? 'សាខា' : 'allowed'}
              </span>
            </div>
          </div>

          {/* Staff Limit */}
          <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-2">
            <div className="text-zinc-500 text-xs font-medium">
              {isKm ? 'បុគ្គលិក (Staff)' : 'Staff Members'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {subscription.current_staff_count}
              </span>
              <span className="text-xs text-zinc-400">
                / {plan?.max_staff ?? '∞'} {isKm ? 'នាក់' : 'allowed'}
              </span>
            </div>
          </div>

          {/* Renewal / Period End Date */}
          <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-2">
            <div className="text-zinc-500 text-xs font-medium">
              {isKm ? 'កាលបរិច្ឆេទបន្ត' : 'Renewal Date'}
            </div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate pt-0.5">
              {subscription.current_period_ends_at
                ? new Date(subscription.current_period_ends_at).toLocaleDateString()
                : (isKm ? 'មិនមាន' : 'N/A')}
            </div>
          </div>
        </div>
      </div>

      {/* Plan Selection Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsPlanModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-none modal-dialog-animate z-10 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
                  {isKm ? 'ជ្រើសរើសគម្រោងសេវាកម្ម' : 'Select Subscription Plan'}
                </h2>
                <p className="text-xs text-zinc-500">
                  {isKm
                    ? 'ជ្រើសរើសគម្រោងដែលស័ក្តិសមបំផុតសម្រាប់អាជីវកម្មរបស់អ្នក'
                    : 'Choose the best plan tier for your restaurant growth'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center">
              <div className="flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {isKm ? 'ប្រចាំខែ' : 'Monthly'}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition-all ${
                    billingCycle === 'annual'
                      ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {isKm ? 'ប្រចាំឆ្នាំ (សន្សំ ២០%)' : 'Annual (Save 20%)'}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400">
                {errorMessage}
              </div>
            )}

            {/* Plans List */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(plans || []).map((p: PlanResponse) => {
                const isSelected = selectedPlanCode === p.code
                const price =
                  billingCycle === 'annual'
                    ? parseFloat(p.price_usd_annually || '0')
                    : parseFloat(p.price_usd_monthly || '0')

                return (
                  <div
                    key={p.code}
                    onClick={() => setSelectedPlanCode(p.code)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{p.name}</h4>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
                    <div className="mb-2">
                      <span className="text-xl font-bold text-zinc-950 dark:text-zinc-50 font-mono">
                        ${price.toFixed(0)}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        /{billingCycle === 'annual' ? 'yr' : 'mo'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mb-3 min-h-[28px]">{p.description}</p>
                    <div className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                      <div>
                        Max Branches: <strong>{p.max_branches}</strong>
                      </div>
                      <div>
                        Max Staff: <strong>{p.max_staff}</strong>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPlanModalOpen(false)}
                className="rounded-full text-xs px-4"
              >
                {isKm ? 'បោះបង់' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={changePlanMutation.isPending || selectedPlanCode === subscription.plan?.code}
                onClick={handleChangePlan}
                className="rounded-full text-xs font-semibold px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {changePlanMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                )}
                {isKm ? 'បញ្ជាក់ការផ្លាស់ប្តូរ' : 'Confirm Change'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
