import { useState, type FC } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthModalStore } from '@/stores/useAuthModalStore'
import { usePublicPlans } from '@/features/admin/hooks/useSubscriptionQueries'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

interface DisplayPlan {
  id?: string
  code: string
  name_en: string
  name_km: string
  priceMonthly: number
  priceAnnual: number
  badge: string | null
  desc_en: string
  desc_km: string
  features_en: string[]
  features_km: string[]
  cta_en: string
  cta_km: string
  isPopular: boolean
}

const FALLBACK_PLANS: DisplayPlan[] = [
  {
    code: 'starter',
    name_en: 'Starter',
    name_km: 'Starter',
    priceMonthly: 10,
    priceAnnual: 100,
    badge: null,
    desc_en: 'Ideal for small cafés, bakeries, or single food stalls.',
    desc_km: 'ល្អបំផុតសម្រាប់ហាងកាហ្វេតូចៗ ប៊ូទិកនំ ឬតូបអាហារទោល។',
    features_en: [
      '1 Branch Outlet',
      'Up to 3 Staff Accounts',
      'Bilingual Digital QR Menu',
      'Cash Payment Settlement',
      'Advanced Analytics & Reports',
    ],
    features_km: [
      '១ សាខា',
      'គណនីបុគ្គលិករហូតដល់ ៣ នាក់',
      'មីនុយ QR ពីរសភា (ខ្មែរ-អង់គ្លេស)',
      'ទូទាត់សាច់ប្រាក់',
      'ការវិភាគកម្រិតខ្ពស់ & របាយការណ៍',
    ],
    cta_en: 'Get Started',
    cta_km: 'ចាប់ផ្តើមឥឡូវនេះ',
    isPopular: false,
  },
  {
    code: 'standard',
    name_en: 'Standard',
    name_km: 'Standard',
    priceMonthly: 25,
    priceAnnual: 250,
    badge: 'Popular',
    desc_en: 'Complete operations with QR ordering, Kitchen Display & KHQR.',
    desc_km: 'ដំណោះស្រាយ F&B ពេញលេញជាមួយ QR កុម្ម៉ង់ អេក្រង់ផ្ទះបាយ និងបាគង KHQR។',
    features_en: [
      'Up to 3 Branch Outlets',
      'Up to 15 Staff Accounts',
      'Bilingual Digital QR Menu & Self-Ordering',
      'Dynamic Bakong KHQR Payments',
      'Kitchen Display System (KDS)',
      'Advanced Analytics & Reports',
    ],
    features_km: [
      'រហូតដល់ ៣ សាខា',
      'គណនីបុគ្គលិករហូតដល់ ១៥ នាក់',
      'មីនុយ QR ពីរសភា & ភ្ញៀវកុម្ម៉ង់ផ្ទាល់ខ្លួន',
      'ទូទាត់បាគង KHQR ស្វ័យប្រវត្តិ',
      'ប្រព័ន្ធអេក្រង់ផ្ទះបាយ (KDS)',
      'ការវិភាគកម្រិតខ្ពស់ & របាយការណ៍',
    ],
    cta_en: 'Start Free Trial',
    cta_km: 'សាកល្បងឥតគិតថ្លៃ',
    isPopular: true,
  },
  {
    code: 'growth',
    name_en: 'Growth',
    name_km: 'Growth',
    priceMonthly: 50,
    priceAnnual: 500,
    badge: null,
    desc_en: 'Multi-branch operations with centralized reporting.',
    desc_km: 'ប្រតិបត្តិការពហុសាខាជាមួយរបាយការណ៍គ្រប់គ្រងរួមមជ្ឈមណ្ឌល។',
    features_en: [
      'Up to 10 Branch Outlets',
      'Up to 50 Staff Accounts',
      'Bilingual Digital QR Menu & Self-Ordering',
      'Dynamic Bakong KHQR Payments',
      'Kitchen Display System (KDS)',
      'Advanced Analytics & Reports',
      'Multi-Branch Network & Consolidated Reports',
      'Promotions & Discounts Engine',
    ],
    features_km: [
      'រហូតដល់ ១០ សាខា',
      'គណនីបុគ្គលិករហូតដល់ ៥០ នាក់',
      'មីនុយ QR ពីរសភា & ភ្ញៀវកុម្ម៉ង់ផ្ទាល់ខ្លួន',
      'ទូទាត់បាគង KHQR ស្វ័យប្រវត្តិ',
      'ប្រព័ន្ធអេក្រង់ផ្ទះបាយ (KDS)',
      'ការវិភាគកម្រិតខ្ពស់ & របាយការណ៍',
      'បណ្តាញពហុសាខា & របាយការណ៍រួម',
      'ប្រព័ន្ធប្រូម៉ូសិន & បញ្ចុះតម្លៃ',
    ],
    cta_en: 'Contact Sales',
    cta_km: 'ទាក់ទងផ្នែកលក់',
    isPopular: false,
  },
]

export const PricingTable: FC = () => {
  const { t, language } = useLanguageStore()
  const isKm = language === 'km'
  const { openRegisterModal } = useAuthModalStore()
  const [isAnnual, setIsAnnual] = useState(false)

  // Fetch live public subscription plans from backend (synced live with Super Admin)
  const { data: dbPlans = [], isLoading } = usePublicPlans()

  // Map dynamic plans from database if available, else fallback to standard defaults
  const plans: DisplayPlan[] =
    dbPlans && dbPlans.length > 0
      ? dbPlans.map((plan, index) => {
          const flags = (plan.feature_flags as Record<string, boolean>) || {}
          const isPopular =
            plan.code === 'standard' ||
            (dbPlans.length === 3 && index === 1) ||
            (dbPlans.length > 1 && index === 1)

          // Build dynamic feature checklist in English and Khmer
          const features_en: string[] = []
          const features_km: string[] = []

          // 1. Branches limit
          if (plan.max_branches === -1) {
            features_en.push('Unlimited Branch Outlets')
            features_km.push('សាខាគ្មានដែនកំណត់')
          } else {
            features_en.push(`Up to ${plan.max_branches} Branch Outlets`)
            features_km.push(`រហូតដល់ ${plan.max_branches} សាខា`)
          }

          // 2. Staff limit
          if (plan.max_staff === -1) {
            features_en.push('Unlimited Staff Accounts')
            features_km.push('គណនីបុគ្គលិកមិនកំណត់')
          } else {
            features_en.push(`Up to ${plan.max_staff} Staff Accounts`)
            features_km.push(`បុគ្គលិករហូតដល់ ${plan.max_staff} នាក់`)
          }

          // 3. Feature Gates derived directly from plan flags
          if (flags.qr_ordering ?? flags.has_qr_ordering) {
            features_en.push('Bilingual Digital QR Menu & Self-Ordering')
            features_km.push('មីនុយ QR ពីរសភា & ភ្ញៀវកុម្ម៉ង់ផ្ទាល់ខ្លួន')
          }
          if (flags.khqr ?? flags.has_khqr) {
            features_en.push('Dynamic Bakong KHQR Payments')
            features_km.push('ទូទាត់បាគង KHQR ស្វ័យប្រវត្តិ')
          }
          if (flags.kds ?? flags.has_kds) {
            features_en.push('Kitchen Display System (KDS)')
            features_km.push('ប្រព័ន្ធអេក្រង់ផ្ទះបាយ (KDS)')
          }
          if (flags.analytics ?? flags.has_analytics) {
            features_en.push('Advanced Analytics & Sales Reports')
            features_km.push('ការវិភាគកម្រិតខ្ពស់ & របាយការណ៍លក់')
          }
          if (flags.inventory ?? flags.has_inventory) {
            features_en.push('Multi-Branch Inventory & Stock Alerts')
            features_km.push('គ្រប់គ្រងស្តុកតាមសាខា & ការជូនដំណឹង')
          }
          if (flags.multi_branch ?? flags.multi_branch_reports ?? flags.has_multi_branch) {
            features_en.push('Multi-Branch Network & Centralized Reports')
            features_km.push('បណ្តាញពហុសាខា & របាយការណ៍រួម')
          }
          if (flags.promotions) {
            features_en.push('Promotions & Discounts Engine')
            features_km.push('ប្រព័ន្ធប្រូម៉ូសិន & បញ្ចុះតម្លៃ')
          }
          if (flags.api_access ?? flags.has_api_access) {
            features_en.push('Direct REST API & Webhooks Access')
            features_km.push('ការតភ្ជាប់ API & Webhooks')
          }

          return {
            id: plan.id,
            code: plan.code,
            name_en: plan.name,
            name_km: plan.name,
            priceMonthly: Number(plan.price_usd_monthly),
            priceAnnual: Number(plan.price_usd_annually),
            badge: isPopular ? (isKm ? 'ពេញនិយម' : 'Popular') : null,
            desc_en: plan.description || '',
            desc_km: plan.description || '',
            features_en,
            features_km,
            cta_en: isPopular ? 'Start 14-Day Trial' : 'Get Started',
            cta_km: isPopular ? 'សាកល្បង ១៤ ថ្ងៃ' : 'ចាប់ផ្តើមឥឡូវនេះ',
            isPopular,
          }
        })
      : FALLBACK_PLANS

  return (
    <section id="pricing" className="py-6 sm:py-10 space-y-6 sm:space-y-8 scroll-mt-20">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
          {t('pricing')}
        </h2>
        <p className="text-base sm:text-xl text-zinc-600 leading-relaxed">
          {isKm
            ? 'តម្លៃសមរម្យ គ្មានការលាក់បាំង ចាប់ផ្តើមដោយឥតគិតថ្លៃ'
            : 'Simple, transparent pricing. Start free, upgrade as you grow.'}
        </p>

        {/* Billing Toggle */}
        <div className="pt-4 flex items-center justify-center gap-3 text-sm sm:text-base font-medium">
          <span className={!isAnnual ? 'text-zinc-900 font-bold' : 'text-zinc-400'}>
            {isKm ? 'បង់ប្រចាំខែ' : 'Monthly'}
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            aria-label="Toggle annual billing"
            className={`w-14 h-7 rounded-full p-0.5 transition-colors relative ${
              isAnnual ? 'bg-emerald-600' : 'bg-zinc-300'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-white transition-transform ${
                isAnnual ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={isAnnual ? 'text-emerald-600 font-bold' : 'text-zinc-400'}>
            {isKm ? 'បង់ប្រចាំឆ្នាំ (សន្សំ ២ ខែ)' : 'Annually (Save 2 Months)'}
          </span>
        </div>
      </div>

      {isLoading && (!dbPlans || dbPlans.length === 0) ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <EmenuLoader
            size="md"
            message={isKm ? 'កំពុងទាញយកតារាងតម្លៃ...' : 'Loading pricing plans...'}
          />
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${plans.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'md:grid-cols-3'} gap-6`}>
          {plans.map((p, i) => {
            const price = isAnnual ? p.priceAnnual : p.priceMonthly
            const period = isAnnual ? (isKm ? '/ឆ្នាំ' : '/year') : (isKm ? '/ខែ' : '/month')

            return (
              <Card
                key={p.id || p.code || i}
                className={`p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-300 ${
                  p.isPopular ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-zinc-200/90'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg sm:text-xl text-zinc-900 leading-snug">
                      {isKm ? p.name_km : p.name_en}
                    </h3>
                    {p.badge && <Badge variant="brand" size="sm">{p.badge}</Badge>}
                  </div>

                  {p.desc_en && (
                    <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                      {isKm ? p.desc_km : p.desc_en}
                    </p>
                  )}

                  <div className="pt-1 pb-0.5 font-mono">
                    <span className="text-3xl sm:text-4xl font-black text-zinc-950">
                      ${price}
                    </span>
                    <span className="text-sm text-zinc-500 font-sans ml-1.5">{period}</span>
                  </div>

                  {/* Feature List */}
                  <div className="pt-2 space-y-2">
                    {(isKm ? p.features_km : p.features_en).map((f, fi) => (
                      <div key={fi} className="flex items-center gap-2.5 text-sm sm:text-base text-zinc-800 font-medium">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  variant={p.isPopular ? 'primary' : 'outline'}
                  className="w-full h-11 text-sm sm:text-base font-semibold rounded-full mt-2"
                  size="md"
                  onClick={openRegisterModal}
                >
                  {isKm ? p.cta_km : p.cta_en}
                </Button>
              </Card>
            )
          })}
        </div>
      )}

      {/* 3 Isometric Business Showcase Images - Transparent, No Containers, No Text */}
      <div className="pt-4 sm:pt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 items-center justify-center">
          <div className="flex items-center justify-center">
            <img
              src="/images/biz-restaurant.webp"
              alt="Khmer Restaurant"
              className="w-full max-w-[340px] h-auto object-contain drop-shadow-xl transition-transform duration-500 hover:scale-105"
              loading="lazy"
            />
          </div>
          <div className="flex items-center justify-center">
            <img
              src="/images/biz-boba.webp"
              alt="Boba Shop"
              className="w-full max-w-[340px] h-auto object-contain drop-shadow-xl transition-transform duration-500 hover:scale-105"
              loading="lazy"
            />
          </div>
          <div className="flex items-center justify-center">
            <img
              src="/images/biz-bakery.webp"
              alt="Bakery"
              className="w-full max-w-[340px] h-auto object-contain drop-shadow-xl transition-transform duration-500 hover:scale-105"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
