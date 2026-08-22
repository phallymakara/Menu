import { type FC } from 'react'
import { QrCode, CreditCard, ChefHat, Boxes } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const FeatureGrid: FC = () => {
  const { language } = useLanguageStore()

  const features = [
    {
      icon: QrCode,
      title_en: 'Zero-Install QR Ordering',
      title_km: 'កុម្ម៉ង់តាម QR ដោយមិនបាច់ដំឡើង App',
      desc_en: 'Customers simply point their camera at the table QR code to browse the bilingual menu, select options, and submit orders directly to the kitchen.',
      desc_km: 'ភ្ញៀវគ្រាន់តែស្កេន QR កូដលើតុដើម្បីមើលមីនុយ ជ្រើសរើសជម្រើសបន្ថែម និងបញ្ជូនការកុម្ម៉ង់ទៅផ្ទះបាយភ្លាមៗ។',
    },
    {
      icon: CreditCard,
      title_en: 'Native Bakong KHQR Payments',
      title_km: 'ទូទាត់ភ្លាមៗជាមួយបាគង KHQR',
      desc_en: 'Automated dynamic EMVCo KHQR generation in USD and 100-Riel rounded KHR with instant real-time Telegram bot alerts for staff.',
      desc_km: 'បង្កើត KHQR ស្វ័យប្រវត្តិតាមស្តង់ដារ EMVCo ជាប្រាក់ដុល្លារ និងរៀល (កាត់កន្ទុយ 100 រៀល) រួមជាមួយការផ្ញើសារជូនដំណឹងតាម Telegram។',
    },
    {
      icon: ChefHat,
      title_en: 'Kitchen Display System (KDS)',
      title_km: 'ផ្ទាំងបញ្ជាផ្ទះបាយ KDS តាមពេលវេលាជាក់ស្តែង',
      desc_en: 'Multi-station routing (Grill, Bar, Wok, Pantry) with color-coded SLA timers and course stage management (Drinks, Appetizers, Mains, Desserts).',
      desc_km: 'បែងចែកទៅតាមផ្នែកផ្ទះបាយ (ចង្ក្រានបារ អាំង ឆា) ជាមួយនឹងនាឡិកាកំណត់ពេល និងការគ្រប់គ្រងវគ្គម្ហូប។',
    },
    {
      icon: Boxes,
      title_en: 'Multi-Branch Inventory & BOM',
      title_km: 'គ្រប់គ្រងស្តុកវត្ថុធាតុដើមច្រើនសាខា',
      desc_en: 'Track ingredient stock levels, automate recipe BOM depletion upon order placement, and manage inter-branch stock transfer dispatches.',
      desc_km: 'តាមដានស្តុកវត្ថុធាតុដើម កាត់ស្តុកស្វ័យប្រវត្តិពេលមានការកុម្ម៉ង់ និងផ្ទេរស្តុកទំនិញរវាងសាខាបានយ៉ាងងាយស្រួល។',
    },
  ]

  return (
    <section id="features" className="py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-10">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'មុខងារស្នូលទាំងអស់ដែលភោជនីយដ្ឋានត្រូវការ' : 'Everything your restaurant needs in one platform'}
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          {language === 'km'
            ? 'រចនាឡើងពិសេសសម្រាប់ភោជនីយដ្ឋាន ហាងកាហ្វេ និងសង្វាក់អាជីវកម្ម F&B នៅកម្ពុជា។'
            : 'Built specifically for restaurants, cafes, and multi-branch hospitality groups in Cambodia.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((f, i) => {
          const Icon = f.icon
          return (
            <Card key={i} className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? f.title_km : f.title_en}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {language === 'km' ? f.desc_km : f.desc_en}
              </p>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
