import { type FC } from 'react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const FeatureGrid: FC = () => {
  const { language } = useLanguageStore()

  const coreFeatures = [
    {
      title_en: 'Digital QR Menu',
      title_km: 'មីនុយឌីជីថល QR',
      desc_en: 'Bilingual Khmer & English catalog with size variants, modifier option groups, and dietary tags.',
      desc_km: 'មីនុយពីរសភា ខ្មែរ-អង់គ្លេស កំណត់ទំហំ ជម្រើសបន្ថែម និងសម្គាល់អាហារបួស/ហិរ។',
    },
    {
      title_en: 'Live POS & Ordering',
      title_km: 'ផ្ទាំងប្រតិបត្តិ POS & បញ្ជាទិញ',
      desc_en: 'Fast, intuitive POS interface for floor staff to manage tables, courses, and bills seamlessly.',
      desc_km: 'ផ្ទាំងគ្រប់គ្រងការកុម្ម៉ង់ផ្ទាល់ រហ័ស និងងាយស្រួលប្រើសម្រាប់បុគ្គលិកគ្រប់ផ្នែក។',
    },
    {
      title_en: 'Kitchen Display (KDS)',
      title_km: 'ផ្ទាំងផ្ទះបាយ KDS',
      desc_en: 'Multi-station kitchen routing with real-time SLA timers and ticket priority tracking.',
      desc_km: 'បែងចែកតាមផ្នែកចង្ក្រាន នាឡិកាកំណត់ពេល និងគ្រប់គ្រងលំដាប់ចេញម្ហូបទាន់ពេល។',
    },
    {
      title_en: 'Branch Admin',
      title_km: 'Branch Admin',
      desc_en: 'Staff shifts, role-based permissions, and localized daily branch sales reports.',
      desc_km: 'គ្រប់គ្រងការងារបុគ្គលិក កំណត់សិទ្ធិ និងរបាយការណ៍លក់ប្រចាំថ្ងៃរបស់សាខា។',
    },
    {
      title_en: 'Instant KHQR & Banking',
      title_km: 'ទូទាត់រហ័ស KHQR & ធនាគារ',
      desc_en: 'Dynamic EMVCo KHQR payments supporting all Cambodian mobile banking apps with instant alerts.',
      desc_km: 'បង្កើត KHQR ឌីជីថលស្វ័យប្រវត្តិ គាំទ្រគ្រប់ធនាគារ និងជូនដំណឹងទូទាត់ភ្លាមៗ។',
    },
    {
      title_en: 'HQ Franchise Management',
      title_km: 'គ្រប់គ្រងបញ្ជីទំនិញ HQ',
      desc_en: 'Centralized multi-outlet catalog, cross-branch transfers, and franchise consolidated analytics.',
      desc_km: 'គ្រប់គ្រងមុខម្ហូបកណ្តាល ផ្ទេរស្តុកទំនិញរវាងសាខា និងរបាយការណ៍រួមទូទាំងប្រព័ន្ធ។',
    },
    {
      title_en: 'Inventory',
      title_km: 'Inventory',
      desc_en: 'Automated ingredient depletion based on recipes, low-stock alerts, and waste control.',
      desc_km: 'តាមដានស្តុកទំនិញ កាត់ស្តុកគ្រឿងផ្សំស្វ័យប្រវត្តិតាមរូបមន្ត និងការពារការបាត់បង់។',
    },
    {
      title_en: 'Customer CRM',
      title_km: 'Customer CRM',
      desc_en: 'Customer profiles, loyalty rewards points, visit frequency, and promotional campaigns.',
      desc_km: 'ប្រព័ន្ធគ្រប់គ្រងអតិថិជន សន្សំពិន្ទុ ប្រវត្តិការកុម្ម៉ង់ និងការផ្ញើប្រូម៉ូសិនពិសេស។',
    },
    {
      title_en: 'Analytics',
      title_km: 'Analytics',
      desc_en: 'In-depth revenue analytics, profit margins, peak sales hours, and best-selling menu items.',
      desc_km: 'របាយការណ៍ចំណូលចំណាយ ប្រាក់ចំណេញ មុខម្ហូបលក់ដាច់បំផុត និងទិន្នន័យអាជីវកម្មស៊ីជម្រៅ។',
    },
  ]

  return (
    <section
      id="features"
      className="relative w-full py-10 sm:py-14 overflow-hidden scroll-mt-20"
      style={{
        backgroundImage: `url('/images/features-bg.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Soft overlay to ensure great text contrast */}
      <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] pointer-events-none z-0" />

      {/* Centered Section Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 px-4">
          <div className="text-xs sm:text-sm font-extrabold text-emerald-600 uppercase tracking-widest font-mono">
            CORE FEATURES
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-zinc-950">
            {language === 'km' ? 'មុខងារសំខាន់ៗដែលភោជនីយដ្ឋានត្រូវការ' : 'Core Features Your Restaurant Needs'}
          </h2>
          <p className="text-base sm:text-lg text-zinc-600 leading-relaxed font-normal">
            {language === 'km'
              ? 'ប្រព័ន្ធប្រតិបត្តិការពេញលេញ សម្រាប់ភោជនីយដ្ឋាន ហាងកាហ្វេ និង F&B សម័យទំនើប។'
              : 'A complete end-to-end hospitality operating system tailored for Cambodian businesses.'}
          </p>
        </div>

        {/* 3x3 Text-Only Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6">
          {coreFeatures.map((f, i) => (
            <div
              key={i}
              className="p-7 sm:p-8 rounded-[24px] bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-start space-y-3.5 min-h-[190px] sm:min-h-[210px]"
            >
              <h3 className="text-xl sm:text-2xl font-black text-zinc-900 leading-snug">
                {language === 'km' ? f.title_km : f.title_en}
              </h3>
              <p className="text-base sm:text-lg lg:text-[19px] text-zinc-600 leading-relaxed font-normal">
                {language === 'km' ? f.desc_km : f.desc_en}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
