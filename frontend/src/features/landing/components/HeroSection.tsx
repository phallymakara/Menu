import { type FC } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const HeroSection: FC = () => {
  const { t, language } = useLanguageStore()

  return (
    <section className="pt-16 pb-20 text-center space-y-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-[1.15]">
          {t('heroHeadline')}
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-2xl text-zinc-600 dark:text-zinc-300 max-w-3xl mx-auto leading-relaxed">
          {t('heroSubheadline')}
        </p>

        {/* Hero Actions: [Get Started] & [Book Demo] */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <Link to="/register">
            <Button variant="primary" size="lg" className="min-w-[140px] text-sm">
              {language === 'km' ? 'ចាប់ផ្តើមឥឡូវនេះ' : 'Get Started'}
            </Button>
          </Link>
          <a href="#demo-signup">
            <Button variant="outline" size="lg" className="min-w-[140px] text-sm">
              {language === 'km' ? 'Book Demo' : 'Book Demo'}
            </Button>
          </a>
        </div>
      </div>
    </section>
  )
}
