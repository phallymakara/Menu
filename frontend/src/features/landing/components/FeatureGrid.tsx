import { type FC } from 'react'
import { Utensils, LayoutGrid, ChefHat, Boxes, CreditCard, Building2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const FeatureGrid: FC = () => {
  const { language } = useLanguageStore()

  const coreFeatures = [
    {
      icon: Utensils,
      title_en: 'Digital QR Menu',
      title_km: 'មីនុយឌីជីថល QR',
      desc_en: 'Bilingual Khmer & English catalog with size variants, modifier option groups, and dietary tags.',
      desc_km: 'មីនុយពីរសភា ខ្មែរ-អង់គ្លេស កំណត់ទំហំ ជម្រើសបន្ថែម និងសម្គាល់អាហារបួស/ហិរ។',
    },
    {
      icon: LayoutGrid,
      title_en: 'Cashier POS & Floor',
      title_km: 'ផ្ទាំងគិតប្រាក់ POS & ប្លង់តុ',
      desc_en: 'Interactive floor map, quick touch orders, supervisor voids, and 80mm thermal receipts.',
      desc_km: 'ប្លង់តុតាមតំបន់ គិតប្រាក់រហ័ស លុបមុខម្ហូបដោយលេខកូដមេការ និងព្រីនវិក្កយបត្រ។',
    },
    {
      icon: ChefHat,
      title_en: 'Kitchen Display (KDS)',
      title_km: 'ផ្ទាំងផ្ទះបាយ KDS',
      desc_en: 'Multi-station routing (Grill, Bar, Wok), color-coded SLA timers, and course staging.',
      desc_km: 'បែងចែកផ្នែកផ្ទះបាយ នាឡិកាកំណត់ពេល និងគ្រប់គ្រងលំដាប់ចេញម្ហូប។',
    },
    {
      icon: Boxes,
      title_en: 'Inventory & Recipe BOM',
      title_km: 'ស្តុកវត្ថុធាតុដើម & BOM',
      desc_en: 'Track ingredient stock levels, auto-deplete recipes upon order, and prevent waste.',
      desc_km: 'តាមដានស្តុក កាត់ស្តុកគ្រឿងផ្សំស្វ័យប្រវត្តិតាមរូបមន្ត និងការពារការខូចខាត។',
    },
    {
      icon: CreditCard,
      title_en: 'Bakong KHQR & Cash',
      title_km: 'ទូទាត់បាគង KHQR & សាច់ប្រាក់',
      desc_en: 'Dynamic EMVCo KHQR in USD & 100-Riel KHR, mixed cash change, and instant verification.',
      desc_km: 'បង្កើត KHQR ឌីជីថលស្វ័យប្រវត្តិ គណនាប្រាក់អាប់ និងជូនដំណឹងទូទាត់រហ័ស។',
    },
    {
      icon: Building2,
      title_en: 'Multi-Branch Franchise',
      title_km: 'គ្រប់គ្រងច្រើនសាខា HQ',
      desc_en: 'Centralized menu catalog, inter-branch stock transfers, and consolidated franchise analytics.',
      desc_km: 'គ្រប់គ្រងមីនុយកណ្តាល ផ្ទេរស្តុកទំនិញរវាងសាខា និងរបាយការណ៍រួម។',
    },
  ]

  return (
    <section id="features" className="py-20 space-y-14">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-mono">
          CORE FEATURES
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'មុខងារស្នូលទាំងអស់ដែលភោជនីយដ្ឋានត្រូវការ' : 'Everything your restaurant needs to operate efficiently'}
        </h2>
        <p className="text-base sm:text-xl text-zinc-600 dark:text-zinc-300 leading-relaxed">
          {language === 'km'
            ? 'ប្រព័ន្ធប្រតិបត្តិការពេញលេញ សម្រាប់ភោជនីយដ្ឋាន ហាងកាហ្វេ និង F&B សម័យទំនើប។'
            : 'A complete end-to-end hospitality operating system tailored for Cambodian businesses.'}
        </p>
      </div>

      {/* 3x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coreFeatures.map((f, i) => {
          const Icon = f.icon
          return (
            <Card key={i} className="p-7 sm:p-8 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200">
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                {language === 'km' ? f.title_km : f.title_en}
              </h3>
              <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {language === 'km' ? f.desc_km : f.desc_en}
              </p>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
