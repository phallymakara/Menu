import { useState, useEffect, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Step1BusinessTypeProfile } from './components/Step1BusinessTypeProfile'
import { Step2BranchSetup } from './components/Step2BranchSetup'
import { Step3VerifyInformation } from './components/Step3VerifyInformation'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from './stores/useOnboardingStore'
import { api } from '@/lib/api'
import { useBusinesses, useBranches } from '@/features/admin/hooks/useTenantQueries'
import { useQueryClient } from '@tanstack/react-query'

export const OnboardingWizardPage: FC = () => {
  const { language } = useLanguageStore()
  const {
    currentStep,
    nextStep,
    prevStep,
    setStep,
    businessProfile,
    branch,
    setStep2Errors,
  } = useOnboardingStore()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { data: businesses = [] } = useBusinesses()
  const activeBizId = localStorage.getItem('emenu_business_id') || (businesses.length > 0 ? businesses[0].id : null)
  const { data: branches = [] } = useBranches(activeBizId)

  // Redirect existing user who already finished onboarding or has an active store session
  useEffect(() => {
    const isCompleted = localStorage.getItem('emenu_onboarding_completed') === 'true'
    const token = localStorage.getItem('emenu_access_token')
    if (token && isCompleted) {
      navigate('/admin', { replace: true })
    }
  }, [navigate])

  const stepTitles = [
    {
      titleKm: '',
      titleEn: '',
      subtitleKm: '',
      subtitleEn: '',
    },
    {
      titleKm: '',
      titleEn: '',
      subtitleKm: '',
      subtitleEn: '',
    },
    {
      titleKm: '',
      titleEn: '',
      subtitleKm: '',
      subtitleEn: '',
    },
  ]

  const stepsMeta = [
    { num: 1, labelKm: 'ប្រភេទអាជីវកម្ម', labelEn: 'Business Type' },
    { num: 2, labelKm: 'ព័ត៌មានហាង & សាខា', labelEn: 'Store & Branch' },
    { num: 3, labelKm: 'ផ្ទៀងផ្ទាត់ព័ត៌មាន', labelEn: 'Verify Information' },
  ]

  const currentInfo = stepTitles[currentStep - 1] || stepTitles[0]

  const validateStep2 = () => {
    const isKm = language === 'km'
    const errs: Record<string, string> = {}
    if (!businessProfile.name_en?.trim()) {
      errs.name_en = isKm ? 'សូមបញ្ចូលឈ្មោះអាជីវកម្ម (អង់គ្លេស)' : 'Store name (English) is required'
    }
    if (!businessProfile.name_km?.trim()) {
      errs.name_km = isKm ? 'សូមបញ្ចូលឈ្មោះអាជីវកម្ម (ខ្មែរ)' : 'Store name (Khmer) is required'
    }
    if (!branch.name_en?.trim()) {
      errs.branch_name_en = isKm ? 'សូមបញ្ចូលឈ្មោះសាខា (អង់គ្លេស)' : 'Branch name (English) is required'
    }
    if (!branch.name_km?.trim()) {
      errs.branch_name_km = isKm ? 'សូមបញ្ចូលឈ្មោះសាខា (ខ្មែរ)' : 'Branch name (Khmer) is required'
    }
    if (!branch.phone?.trim()) {
      errs.branch_phone = isKm ? 'សូមបញ្ចូលលេខទូរស័ព្ទទំនាក់ទំនង' : 'Contact phone number is required'
    }
    if (!branch.address?.trim()) {
      errs.branch_address = isKm ? 'សូមបញ្ចូលអាសយដ្ឋានទីតាំង' : 'Physical store address is required'
    }
    if (!branch.opening_time?.trim()) {
      errs.opening_time = isKm ? 'សូមបញ្ចូលម៉ោងបើក' : 'Opening time is required'
    }
    if (!branch.closing_time?.trim()) {
      errs.closing_time = isKm ? 'សូមបញ្ចូលម៉ោងបិទ' : 'Closing time is required'
    }
    return errs
  }

  const handleNextStep = () => {
    setSubmitError(null)
    if (currentStep === 1) {
      if (!businessProfile.business_type) {
        setSubmitError(
          language === 'km'
            ? 'សូមជ្រើសរើសប្រភេទអាជីវកម្មរបស់អ្នក'
            : 'Please select your business type'
        )
        return
      }
      nextStep()
      return
    }

    if (currentStep === 2) {
      const errs = validateStep2()
      if (Object.keys(errs).length > 0) {
        setStep2Errors(errs)
        return
      }
      setStep2Errors({})
      nextStep()
      return
    }

    nextStep()
  }

  const handlePrevStep = () => {
    setSubmitError(null)
    prevStep()
  }

  const handleCompleteOnboarding = async () => {
    const errs = validateStep2()
    if (Object.keys(errs).length > 0) {
      setStep2Errors(errs)
      setStep(2)
      return
    }
    setStep2Errors({})

    setIsSubmitting(true)
    try {
      let bizId = activeBizId || (businesses.length > 0 ? businesses[0].id : null)
      let branchId =
        localStorage.getItem('emenu_branch_id') ||
        (branches.length > 0 ? branches[0].id : null)

      if (bizId) {
        localStorage.setItem('emenu_business_id', bizId)
        if (branchId) {
          localStorage.setItem('emenu_branch_id', branchId)
        }

        // Sync Business Profile to backend
        await api.patch(`/businesses/${bizId}`, {
          name_en: businessProfile.name_en || undefined,
          name_km: businessProfile.name_km || undefined,
          business_type: businessProfile.business_type || undefined,
          logo_url: businessProfile.logo_url || undefined,
        }).catch(() => null)

        if (branchId) {
          // Sync Branch to backend
          await api.patch(`/businesses/${bizId}/branches/${branchId}`, {
            name_en: branch.name_en || undefined,
            name_km: branch.name_km || undefined,
            phone: branch.phone || undefined,
            address: branch.address || undefined,
            operating_hours: {
              opening_time: branch.opening_time,
              closing_time: branch.closing_time,
            },
          }).catch(() => null)
        }
        queryClient.invalidateQueries({ queryKey: ['businesses'] })
        queryClient.invalidateQueries({ queryKey: ['branches'] })
      }

      if (businessProfile.name_en) {
        localStorage.setItem('emenu_business_name_en', businessProfile.name_en)
      }
      if (businessProfile.name_km) {
        localStorage.setItem('emenu_business_name_km', businessProfile.name_km)
      }
      if (businessProfile.logo_url) {
        localStorage.setItem('emenu_business_logo', businessProfile.logo_url)
      }

      window.dispatchEvent(
        new CustomEvent('emenu:business-updated', {
          detail: {
            name_en: businessProfile.name_en,
            name_km: businessProfile.name_km,
            logo_url: businessProfile.logo_url,
          },
        })
      )

      localStorage.setItem('emenu_onboarding_completed', 'true')

      // Navigate to Store Admin HQ
      navigate('/admin')
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail ||
        (language === 'km'
          ? 'មានបញ្ហាក្នុងការរក្សាទុកព័ត៌មាន សូមព្យាយាមម្តងទៀត'
          : 'Failed to save information. Please try again.')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between selection:bg-emerald-600 selection:text-white">
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        {/* Top Control Bar with Step Progress Track and Language Switcher */}
        <div className="flex items-center justify-between gap-4">
          {/* Clean Text-Only Step Progress Track with Smooth Transitions */}
          <div className="flex items-center gap-2 sm:gap-3.5 overflow-x-auto pb-1 text-xs sm:text-sm font-medium">
            {stepsMeta.map((s, idx) => {
              const isActive = s.num === currentStep
              const isPassed = s.num < currentStep
              return (
                <button
                  type="button"
                  key={s.num}
                  disabled={!isPassed && !isActive}
                  onClick={() => isPassed && setStep(s.num as any)}
                  className={`flex items-center gap-2 sm:gap-3.5 shrink-0 transition-all duration-300 ${
                    isPassed ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  }`}
                >
                  <div
                    className={`flex items-center gap-1.5 transition-colors duration-300 ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                        : isPassed
                        ? 'text-zinc-800 dark:text-zinc-200 font-medium'
                        : 'text-zinc-400 dark:text-zinc-600 font-normal'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono font-bold transition-all duration-300 ${
                        isActive
                          ? 'bg-emerald-600 text-white scale-110 shadow-sm shadow-emerald-600/30'
                          : isPassed
                          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {s.num}
                    </span>
                    <span className="transition-all duration-300">{language === 'km' ? s.labelKm : s.labelEn}</span>
                  </div>
                  {idx < stepsMeta.length - 1 && (
                    <span className="text-zinc-300 dark:text-zinc-700 transition-colors duration-300">/</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Switch Language Button */}
          <div className="shrink-0">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Step Title Header (Rendered only when title is present) */}
        {Boolean(language === 'km' ? currentInfo.titleKm : currentInfo.titleEn) && (
          <div className="space-y-1.5 pt-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? currentInfo.titleKm : currentInfo.titleEn}
            </h1>
            {Boolean(language === 'km' ? currentInfo.subtitleKm : currentInfo.subtitleEn) && (
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                {language === 'km' ? currentInfo.subtitleKm : currentInfo.subtitleEn}
              </p>
            )}
          </div>
        )}

        {/* Step Content Card Container with silky-smooth step entrance transition */}
        <div key={currentStep} className="step-content-animate">
          {currentStep === 3 ? (
            <div className="py-1">
              <Step3VerifyInformation />
            </div>
          ) : (
            <div className="p-6 sm:p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-none">
              {currentStep === 1 && <Step1BusinessTypeProfile />}
              {currentStep === 2 && <Step2BranchSetup />}
            </div>
          )}
        </div>

        {/* Error Section: Text error only, no container */}
        {submitError && (
          <p className="text-xs sm:text-sm text-red-500 text-center font-medium">
            {submitError}
          </p>
        )}

        {/* Navigation Step Controls with Micro-Animations */}
        <div className="flex items-center justify-between pt-2">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="group h-11 px-6 rounded-full text-sm font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center shadow-none hover:border-zinc-400"
            >
              <ArrowLeft className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:-translate-x-1" />
              <span>{language === 'km' ? 'ថយក្រោយ' : 'Back'}</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="group h-11 px-7 rounded-full text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/10 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center hover:shadow-lg hover:shadow-emerald-600/20"
            >
              <span>{language === 'km' ? 'បន្តទៅមុខ' : 'Continue'}</span>
              <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCompleteOnboarding}
              disabled={isSubmitting}
              className="group h-11 px-7 rounded-full text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/10 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center hover:shadow-lg hover:shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-125" />
              <span>{language === 'km' ? 'ចាប់ផ្តើម' : 'Start'}</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
        © {new Date().getFullYear()} E-Menu Platform. All rights reserved.
      </footer>
    </div>
  )
}
