import type { FC } from 'react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthModalStore } from '@/stores/useAuthModalStore'
import heroBgImage from '@/assets/hero-workflow-panoramic.jpg'

export const HeroSection: FC = () => {
  const { language } = useLanguageStore()
  const { openRegisterModal } = useAuthModalStore()
  const isKm = language === 'km'

  return (
    <section
      className="relative w-full overflow-hidden bg-white dark:bg-zinc-950 flex flex-col items-center justify-start pt-10 sm:pt-16 lg:pt-20 pb-44 sm:pb-64 md:pb-80 lg:pb-96 min-h-[580px] sm:min-h-[680px] lg:min-h-[780px]"
      style={{
        backgroundImage: `url(${heroBgImage})`,
        backgroundPosition: 'bottom center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
      }}
    >
      {/* 1. Full-Width Background Image Layer wrapping 100% entire width of the page */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none select-none overflow-hidden">
        <img
          src={heroBgImage}
          alt="E-Menu Restaurant Workflow Background"
          className="w-full h-full object-cover object-bottom block"
          loading="eager"
        />
        {/* Soft bottom edge blend into the page */}
        <div className="absolute inset-x-0 bottom-0 h-12 sm:h-20 bg-gradient-to-t from-white dark:from-zinc-950 via-white/20 dark:via-zinc-950/20 to-transparent pointer-events-none" />
      </div>

      {/* 2. Text & CTA Buttons Layer Rendered DIRECTLY ON TOP of the Background Image */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-4 sm:space-y-6">
        {/* Main Headline (2 lines matching reference image) */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 leading-[1.25] sm:leading-[1.18] drop-shadow-sm">
          {isKm ? (
            <>
              <span className="block">ប្រព័ន្ធគ្រប់គ្រងភោជនីយដ្ឋាន និង</span>
              <span className="block mt-1 sm:mt-2">មីនុយ QR ទំនើប</span>
            </>
          ) : (
            <>
              <span className="block">Smart Restaurant OS &</span>
              <span className="block mt-1 sm:mt-2">Modern QR Digital Menu</span>
            </>
          )}
        </h1>

        {/* Subtitle */}
        <p className="text-sm sm:text-lg lg:text-xl text-zinc-700 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed font-normal drop-shadow-sm">
          {isKm
            ? 'ប្រព័ន្ធឌីជីថល QR វិសេស (ប្រែ-អង់គ្លេស) ផ្ទាំងផ្ទះបាយ (KDS) និងប្រព័ន្ធទូទាត់ប្រាក់ KHQR ចំរុះសម្រាប់ភោជនីយដ្ឋាន និងហាងកាហ្វេគ្រប់កម្រិត។'
            : 'Next-generation bilingual QR ordering, multi-station Kitchen Display (KDS), and automated Bakong KHQR payments for restaurants and cafes.'}
        </p>

        {/* CTA Buttons Matching Reference Image */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5">
          <button
            type="button"
            onClick={openRegisterModal}
            className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm sm:text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-md shadow-emerald-600/25 hover:shadow-lg hover:shadow-emerald-600/35 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            {isKm ? 'សាកល្បងឥតគិតថ្លៃ' : 'Start Free Trial'}
          </button>
          <a
            href="#demo-signup"
            className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-300/90 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 shadow-sm transition-all transform hover:-translate-y-0.5"
          >
            {isKm ? 'ទស្សនា Demo' : 'Book Demo'}
          </a>
        </div>
      </div>
    </section>
  )
}
