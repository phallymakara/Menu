import { useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { OnboardingHeader } from './components/OnboardingHeader'
import { Step1BusinessTypeProfile } from './components/Step1BusinessTypeProfile'
import { Step2BranchSetup } from './components/Step2BranchSetup'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from './stores/useOnboardingStore'
import { api } from '@/lib/api'

export const OnboardingWizardPage: FC = () => {
  const { language } = useLanguageStore()
  const { currentStep, nextStep, prevStep, businessProfile, branch } = useOnboardingStore()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stepTitles = [
    {
      titleKm: 'ជ្រើសរើសប្រភេទអាជីវកម្មរបស់អ្នក',
      titleEn: 'Select Your Business Establishment Type',
      subtitleKm: 'ជ្រើសរើសទម្រង់អាជីវកម្មដើម្បីកំណត់មុខងារ និងការបញ្ជាទិញឱ្យត្រូវតាមហាងរបស់អ្នក',
      subtitleEn: 'Choose your establishment format to customize ordering workflows',
    },
    {
      titleKm: 'ព័ត៌មានម៉ាកយីហោ និងសាខាដំបូង',
      titleEn: 'Store Profile & First Outlet Setup',
      subtitleKm: 'បញ្ចូលឈ្មោះហាង ឡូហ្គោ ព័ត៌មានសាខា និងម៉ោងបើកដំណើរការ',
      subtitleEn: 'Configure store identity, brand logo, branch details, and operating hours',
    },
  ]

  const stepsMeta = [
    { num: 1, labelKm: 'ប្រភេទអាជីវកម្ម', labelEn: 'Business Type' },
    { num: 2, labelKm: 'ព័ត៌មានហាង & សាខា', labelEn: 'Store & Branch' },
  ]

  const currentInfo = stepTitles[currentStep - 1] || stepTitles[0]

  const handleCompleteOnboarding = async () => {
    setIsSubmitting(true)
    try {
      // Sync Business Profile to backend
      await api.patch('/businesses/me', {
        name_en: businessProfile.name_en,
        name_km: businessProfile.name_km,
        business_type: businessProfile.business_type,
        logo_url: businessProfile.logo_url,
      }).catch(() => null)

      // Sync Branch to backend
      await api.patch('/branches/me', {
        name_en: branch.name_en,
        name_km: branch.name_km,
        phone: branch.phone,
        address: branch.address,
        opening_time: branch.opening_time,
        closing_time: branch.closing_time,
      }).catch(() => null)

      // Navigate to Store Admin HQ
      navigate('/admin')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between selection:bg-emerald-600 selection:text-white">
      <OnboardingHeader />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Clean Text-Only Step Progress Track */}
        <div className="flex items-center gap-2 sm:gap-3.5 overflow-x-auto pb-1 text-xs sm:text-sm font-medium">
          {stepsMeta.map((s, idx) => {
            const isActive = s.num === currentStep
            const isPassed = s.num < currentStep
            return (
              <div key={s.num} className="flex items-center gap-2 sm:gap-3.5 shrink-0">
                <div
                  className={`flex items-center gap-1.5 ${
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                      : isPassed
                      ? 'text-zinc-800 dark:text-zinc-200 font-medium'
                      : 'text-zinc-400 dark:text-zinc-600 font-normal'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono font-bold ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : isPassed
                      ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-zinc-200 dark:border-zinc-800'
                  }`}>
                    {s.num}
                  </span>
                  <span>{language === 'km' ? s.labelKm : s.labelEn}</span>
                </div>
                {idx < stepsMeta.length - 1 && (
                  <span className="text-zinc-300 dark:text-zinc-700">/</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Step Title Header */}
        <div className="space-y-1.5 pt-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            {language === 'km' ? currentInfo.titleKm : currentInfo.titleEn}
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
            {language === 'km' ? currentInfo.subtitleKm : currentInfo.subtitleEn}
          </p>
        </div>

        {/* Step Content Card Container (Zero Shadows, Clean Flat Border) */}
        <div className="p-6 sm:p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          {currentStep === 1 && <Step1BusinessTypeProfile />}
          {currentStep === 2 && <Step2BranchSetup />}
        </div>

        {/* Navigation Step Controls */}
        <div className="flex items-center justify-between pt-2">
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={prevStep}
              className="h-11 px-5 text-sm font-semibold"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {language === 'km' ? 'ថយក្រោយ' : 'Back'}
            </Button>
          ) : (
            <div />
          )}

          {currentStep === 1 ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={nextStep}
              className="h-11 px-6 text-sm font-semibold"
            >
              {language === 'km' ? 'បន្តទៅមុខ' : 'Continue'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleCompleteOnboarding}
              disabled={isSubmitting}
              className="h-11 px-6 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              {language === 'km' ? 'បញ្ចប់ការរៀបចំ និងចាប់ផ្តើម' : 'Complete Setup & Launch'}
            </Button>
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
