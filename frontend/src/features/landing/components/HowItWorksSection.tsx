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
      image: '/images/step-01.png',
      alt: 'Step 1 - Create digital menu and QR',
      imgSize: 'max-h-[95px] sm:max-h-[110px]',
    },
    {
      num: '02',
      title_en: 'Print Table QR Codes',
      title_km: 'បោះពុម្ព QR ភ្ជាប់លើតុ',
      desc_en: 'Export printable high-res table QR stands with one click for each dining table.',
      desc_km: 'ទាញយក QR ចេញពីប្រព័ន្ធ រួច print ដាក់លើតុ ភ្ញៀវស្កេនបានភ្លាមៗ។',
      image: '/images/step-02.png',
      alt: 'Step 2 - Print table QR codes',
      imgSize: 'max-h-[95px] sm:max-h-[110px]',
    },
    {
      num: '03',
      title_en: 'Guests Scan & Order',
      title_km: 'ភ្ញៀវស្កេន និងកុម្ម៉ង់',
      desc_en: 'Diners scan with any phone camera, customize selections, and stage course rounds.',
      desc_km: 'ភ្ញៀវប្រើទូរស័ព្ទស្កេនកុម្ម៉ង់ផ្ទាល់ខ្លួន មិនបាច់រង់ចាំបុគ្គលិក។',
      image: '/images/step-03.png',
      alt: 'Step 3 - Guests scan and order on tablet or phone',
      imgSize: 'max-h-[88px] sm:max-h-[102px]',
    },
    {
      num: '04',
      title_en: 'Settle via Bakong KHQR',
      title_km: 'ទូទាត់ការកុម្ម៉ង់ KHQR',
      desc_en: 'Guests pay instantly by scanning the dynamic Bakong KHQR with automated staff alerts.',
      desc_km: 'ភ្ញៀវទូទាត់តាមរយៈបាគង ឬ KHQR ទទួលបានការជូនដំណឹងស្វ័យប្រវត្តិ។',
      image: '/images/step-04.png',
      alt: 'Step 4 - Settle payment via Bakong KHQR',
      imgSize: 'max-h-[95px] sm:max-h-[110px]',
    },
  ]

  return (
    <section id="how-it-works" className="py-6 sm:py-8 space-y-6 sm:space-y-8 scroll-mt-20">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3 px-4">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-zinc-950">
          {language === 'km' ? 'ដំណើរការដោយលឿន 4 ជំហាន' : 'Fast 4-Step Process'}
        </h2>
        <p className="text-lg sm:text-2xl text-zinc-700 leading-relaxed font-medium">
          {language === 'km'
            ? 'ចាប់ផ្តើមប្រើប្រាស់បានភ្លាមៗ គ្រប់គ្រងអាជីវកម្មរបស់អ្នក'
            : 'Get started instantly and take full control of your restaurant'}
        </p>
      </div>

      {/* 4 Green Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 xl:gap-6">
        {steps.map((s, i) => (
          <div
            key={i}
            className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-b from-[#1e6645] via-[#18563a] to-[#13442e] border border-emerald-500/25 shadow-xl shadow-emerald-950/20 hover:shadow-2xl hover:shadow-emerald-950/30 hover:-translate-y-1.5 transition-all duration-300 min-h-[420px] sm:min-h-[450px]"
          >
            {/* Top Text Layer */}
            <div className="p-6 sm:p-7 relative z-20 space-y-3">
              <span className="font-sans text-5xl sm:text-6xl font-black text-white block tracking-tight leading-none">
                {s.num}
              </span>
              <h3 className="font-black text-2xl sm:text-3xl text-white leading-tight">
                {language === 'km' ? s.title_km : s.title_en}
              </h3>
              <p className="text-emerald-50/95 text-base sm:text-lg leading-relaxed font-normal">
                {language === 'km' ? s.desc_km : s.desc_en}
              </p>
            </div>

            {/* Bottom-Right 3D Transparent Image Layer */}
            <div className="relative z-20 w-full mt-auto flex items-end justify-end pr-3 sm:pr-4 pb-2 pointer-events-none select-none overflow-hidden h-[140px] sm:h-[160px]">
              <img
                src={s.image}
                alt={s.alt}
                className="w-auto max-h-[130px] sm:max-h-[150px] object-contain object-bottom-right drop-shadow-xl transition-transform duration-500 ease-out group-hover:scale-105"
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
