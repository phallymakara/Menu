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
      className="relative w-full overflow-hidden bg-white flex flex-col items-center justify-start pt-8 sm:pt-12 lg:pt-14 pb-32 sm:pb-44 md:pb-52 lg:pb-60 min-h-[480px] sm:min-h-[560px] lg:min-h-[640px]"
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
        <div className="absolute inset-x-0 bottom-0 h-12 sm:h-20 bg-gradient-to-t from-white via-white/20 to-transparent pointer-events-none" />
      </div>

      {/* 2. Text & CTA Buttons Layer Rendered DIRECTLY ON TOP of the Background Image */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-4 sm:space-y-6">
        {/* Main Headline (2 lines matching reference image) */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-950 leading-[1.25] sm:leading-[1.18] drop-shadow-sm">
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
            onClick={(e) => {
              e.preventDefault()
              const el = document.getElementById('demo-signup')
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                window.history.pushState(null, '', '#demo-signup')
              }
            }}
            className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm sm:text-base font-semibold text-zinc-800 bg-white/95 backdrop-blur-sm border border-zinc-300/90 hover:bg-white shadow-sm transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            {isKm ? 'ទស្សនា Demo' : 'Book Demo'}
          </a>
        </div>
      </div>
    </section>
  )
}
