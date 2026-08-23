import { type FC } from 'react'
import { Link } from 'react-router-dom'
import { Utensils } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const OnboardingHeader: FC = () => {
  const { t, language } = useLanguageStore()

  return (
    <header className="bg-white/95 dark:bg-zinc-950/95 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white transition-transform group-hover:scale-105">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight block leading-tight">
              {t('appName')}
            </span>
            <span className="text-xs text-zinc-500 block font-normal leading-none mt-0.5">
              {language === 'km' ? 'ការរៀបចំហាង' : 'Setup Wizard'}
            </span>
          </div>
        </Link>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
