import { useState, type FC } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const PricingTable: FC = () => {
  const { t, language } = useLanguageStore()
  const [isAnnual, setIsAnnual] = useState(false)

  const plans = [
    {
      name_en: 'Starter Free',
      name_km: 'កញ្ចប់សាកល្បង Free',
      priceMonthly: 0,
      priceAnnual: 0,
      badge: null,
      desc_en: 'Perfect for small cafes and single-location food stalls.',
      desc_km: 'ល្អបំផុតសម្រាប់ហាងកាហ្វេតូចៗ និងអាជីវកម្មទោល។',
      features_en: [
        '1 Branch Outlet',
        'Up to 3 Staff Accounts',
        'Bilingual Digital QR Menu',
        'Customer Self-Ordering',
        'Cash Payment Settlement',
      ],
      features_km: [
        '១ សាខា',
        'គណនីបុគ្គលិករហូតដល់ ៣ នាក់',
        'មីនុយ QR ពីរសភា (ខ្មែរ-អង់គ្លេស)',
        'ភ្ញៀវកុម្ម៉ង់ផ្ទាល់ខ្លួន',
        'ទូទាត់សាច់ប្រាក់',
      ],
      cta_en: 'Get Started Free',
      cta_km: 'ចាប់ផ្តើមឥតគិតថ្លៃ',
      isPopular: false,
    },
    {
      name_en: 'Pro Multi-Outlet',
      name_km: 'កញ្ចប់ Pro ច្រើនសាខា',
      priceMonthly: 29,
      priceAnnual: 290,
      badge: 'POPULAR',
      desc_en: 'For busy restaurants requiring kitchen screens and Bakong KHQR.',
      desc_km: 'សម្រាប់ភោជនីយដ្ឋានដែលមានផ្ទះបាយ និងត្រូវការបាគង KHQR។',
      features_en: [
        'Up to 5 Branch Outlets',
        'Up to 20 Staff Accounts',
        'Kitchen Display System (KDS)',
        'Dynamic Bakong KHQR Payments',
        'Multi-Branch Inventory & BOM',
        'Telegram Bot Staff Alerts',
      ],
      features_km: [
        'រហូតដល់ ៥ សាខា',
        'គណនីបុគ្គលិករហូតដល់ ២០ នាក់',
        'ផ្ទាំងផ្ទះបាយ KDS ច្រើនផ្នែក',
        'ទូទាត់បាគង KHQR ស្វ័យប្រវត្តិ',
        'គ្រប់គ្រងស្តុកវត្ថុធាតុដើម',
        'ការជូនដំណឹងតាម Telegram',
      ],
      cta_en: 'Start 14-Day Trial',
      cta_km: 'សាកល្បង ១៤ ថ្ងៃ',
      isPopular: true,
    },
    {
      name_en: 'Enterprise Unlimited',
      name_km: 'កញ្ចប់ Enterprise គ្មានដែនកំណត់',
      priceMonthly: 99,
      priceAnnual: 990,
      badge: null,
      desc_en: 'For franchise restaurant chains and large hospitality groups.',
      desc_km: 'សម្រាប់សង្វាក់ភោជនីយដ្ឋានធំៗ និងសាជីវកម្ម F&B។',
      features_en: [
        'Unlimited Branches & Outlets',
        'Unlimited Staff & Cashier Accounts',
        'Centralized Multi-Brand Analytics',
        'Inter-Branch Stock Transfers',
        'Dedicated 24/7 Support',
        'Custom Domain & Branding',
      ],
      features_km: [
        'សាខាមិនកំណត់',
        'គណនីបុគ្គលិកមិនកំណត់',
        'របាយការណ៍វិភាគលម្អិតកណ្តាល',
        'ផ្ទេរស្តុកទំនិញរវាងសាខា',
        'ការគាំទ្រពិសេស ២៤/៧',
        'ប្រើប្រាស់ឈ្មោះ Domain ផ្ទាល់ខ្លួន',
      ],
      cta_en: 'Contact Sales',
      cta_km: 'ទាក់ទងផ្នែកលក់',
      isPopular: false,
    },
  ]

  return (
    <section id="pricing" className="py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {t('pricing')}
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          {language === 'km' ? 'តម្លៃសមរម្យ គ្មានការលាក់បាំង ចាប់ផ្តើមដោយឥតគិតថ្លៃ' : 'Simple, transparent pricing. Start free, upgrade as you grow.'}
        </p>

        {/* Billing Toggle */}
        <div className="pt-4 flex items-center justify-center gap-3 text-xs font-medium">
          <span className={!isAnnual ? 'text-zinc-900 dark:text-zinc-100 font-semibold' : 'text-zinc-500'}>
            {language === 'km' ? 'បង់ប្រចាំខែ' : 'Monthly'}
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="w-12 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 p-0.5 transition-colors relative"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white dark:bg-zinc-100 transition-transform ${
                isAnnual ? 'translate-x-6 bg-emerald-600' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={isAnnual ? 'text-zinc-900 dark:text-zinc-100 font-semibold' : 'text-zinc-500'}>
            {language === 'km' ? 'បង់ប្រចាំឆ្នាំ (សន្សំ ២ ខែ)' : 'Annually (Save 2 Months)'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p, i) => {
          const price = isAnnual ? p.priceAnnual : p.priceMonthly
          const period = isAnnual ? (language === 'km' ? '/ឆ្នាំ' : '/year') : (language === 'km' ? '/ខែ' : '/month')

          return (
            <Card
              key={i}
              className={`p-6 flex flex-col justify-between space-y-6 ${
                p.isPopular ? 'border-emerald-600 dark:border-emerald-500 ring-1 ring-emerald-600/20' : ''
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? p.name_km : p.name_en}
                  </h3>
                  {p.badge && <Badge variant="brand" size="sm">{p.badge}</Badge>}
                </div>

                <p className="text-xs text-zinc-500 leading-relaxed">
                  {language === 'km' ? p.desc_km : p.desc_en}
                </p>

                <div className="pt-2 pb-1 font-mono">
                  <span className="text-3xl font-extrabold text-zinc-950 dark:text-zinc-50">
                    ${price}
                  </span>
                  <span className="text-xs text-zinc-500 font-sans ml-1">{period}</span>
                </div>

                {/* Feature List */}
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
                  {(language === 'km' ? p.features_km : p.features_en).map((f, fi) => (
                    <div key={fi} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant={p.isPopular ? 'primary' : 'outline'}
                className="w-full"
                size="md"
              >
                {language === 'km' ? p.cta_km : p.cta_en}
              </Button>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
