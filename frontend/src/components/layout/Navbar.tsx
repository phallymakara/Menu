import { type FC } from 'react'
import { Link } from 'react-router-dom'
import { Utensils } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const Navbar: FC = () => {
  const { t, language } = useLanguageStore()

  return (
    <header className="bg-white/95 dark:bg-zinc-950/95 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white transition-transform group-hover:scale-105">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight block leading-tight">
              {t('appName')}
            </span>
            <span className="text-[11px] text-zinc-500 block font-normal leading-none">
              {language === 'km' ? 'ប្រព័ន្ធមីនុយ QR' : 'Smart QR System'}
            </span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          <a href="#features" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors">
            {t('features')}
          </a>
          <a href="#how-it-works" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors">
            {t('howItWorks')}
          </a>
          <a href="#pricing" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors">
            {t('pricing')}
          </a>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            to="/login"
            className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors px-2 py-1"
          >
            {language === 'km' ? 'ចូលប្រើប្រាស់' : 'Sign In'}
          </Link>
          <Link to="/register">
            <Button size="sm" variant="primary">
              {t('getStartedFree')}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
