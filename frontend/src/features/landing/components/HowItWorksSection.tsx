import { type FC } from 'react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const HowItWorksSection: FC = () => {
  const { language } = useLanguageStore()

  const steps = [
    {
      num: '01',
      title_en: 'Create Your Menu',
      title_km: 'បង្កើតមីនុយរបស់អ្នក',
      desc_en: 'Input items in Khmer and English, configure size variants, and setup modifier groups.',
      desc_km: 'បញ្ចូលមុខម្ហូបជាភាសាខ្មែរ និងអង់គ្លេស កំណត់ទំហំ និងជម្រើសបន្ថែម។',
    },
    {
      num: '02',
      title_en: 'Print Table QR Codes',
      title_km: 'បោះពុម្ព QR កូដដាក់លើតុ',
      desc_en: 'Export printable high-res table QR stands with one click for each dining table.',
      desc_km: 'ទាញយក QR កូដតុនីមួយៗជា file រូបភាពច្បាស់សម្រាប់បោះពុម្ពដាក់លើតុ។',
    },
    {
      num: '03',
      title_en: 'Guests Scan & Order',
      title_km: 'ភ្ញៀវស្កេន និងកុម្ម៉ង់',
      desc_en: 'Diners scan with any phone camera, customize selections, and stage course rounds.',
      desc_km: 'ភ្ញៀវប្រើទូរស័ព្ទស្កេនកុម្ម៉ង់ផ្ទាល់ខ្លួន មិនបាច់រង់ចាំបុគ្គលិក។',
    },
    {
      num: '04',
      title_en: 'Settle via Bakong KHQR',
      title_km: 'ទូទាត់តាមបាគង KHQR',
      desc_en: 'Guests pay instantly by scanning the dynamic Bakong KHQR with automated staff alerts.',
      desc_km: 'ទូទាត់រហ័សទាន់ចិត្តតាមបាគង KHQR ជាមួយនឹងការជូនដំណឹងស្វ័យប្រវត្តិ។',
    },
  ]

  return (
    <section id="how-it-works" className="py-20 space-y-14">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'ដំណើរការងាយស្រួលត្រឹម ៤ ជំហាន' : 'How it works in 4 simple steps'}
        </h2>
        <p className="text-base sm:text-xl text-zinc-600 dark:text-zinc-300 leading-relaxed">
          {language === 'km' ? 'ចាប់ផ្តើមប្រើប្រាស់បានក្នុងរយៈពេលត្រឹមតែប៉ុន្មាននាទី' : 'Get started in minutes with zero complicated hardware'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((s, i) => (
          <div key={i} className="p-6 sm:p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
            <span className="font-mono text-5xl font-black text-emerald-600 dark:text-emerald-400 block">
              {s.num}
            </span>
            <h3 className="font-bold text-2xl text-zinc-900 dark:text-zinc-100 leading-snug">
              {language === 'km' ? s.title_km : s.title_en}
            </h3>
            <p className="text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {language === 'km' ? s.desc_km : s.desc_en}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
