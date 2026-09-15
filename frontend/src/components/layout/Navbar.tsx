import { useState, type FC } from 'react'
import { Link } from 'react-router-dom'
import { Utensils, Menu as MenuIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthModalStore } from '@/stores/useAuthModalStore'

export const Navbar: FC = () => {
  const { t, language } = useLanguageStore()
  const { openRegisterModal } = useAuthModalStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="bg-white/95 dark:bg-zinc-950/95 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white transition-transform group-hover:scale-105">
            <Utensils className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-base sm:text-lg tracking-tight block leading-tight">
              {t('appName')}
            </span>
            <span className="text-[11px] sm:text-xs text-zinc-500 block font-normal leading-none mt-0.5">
              {language === 'km' ? 'ប្រព័ន្ធមីនុយ QR' : 'Smart QR System'}
            </span>
          </div>
        </Link>

        {/* Desktop / Laptop Center Nav Links */}
        <nav className="hidden md:flex items-center gap-7 lg:gap-8 text-sm sm:text-base font-medium text-zinc-600 dark:text-zinc-300">
          <a href="#features" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors">
            {language === 'km' ? 'មុខងារស្នូល' : 'Features'}
          </a>
          <a href="#how-it-works" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors">
            {language === 'km' ? 'របៀបដំណើរការ' : 'How It Works'}
          </a>
          <a href="#pricing" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors">
            {language === 'km' ? 'តម្លៃសេវាកម្ម' : 'Pricing'}
          </a>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />

          {/* Desktop Auth Buttons */}
          <div className="hidden sm:flex items-center gap-2.5">
            <Link
              to="/login"
              className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors px-2 py-1"
            >
              {language === 'km' ? 'ចូលប្រើប្រាស់' : 'Sign In'}
            </Link>
            <Button
              size="md"
              variant="primary"
              onClick={openRegisterModal}
              className="text-sm font-semibold rounded-full px-5"
            >
              {language === 'km' ? 'សាកល្បងឥតគិតថ្លៃ' : 'Start Free Trial'}
            </Button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="sm:hidden p-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Sheet */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-6 space-y-4 animate-in slide-in-from-top duration-200">
          <nav className="flex flex-col space-y-3.5 text-base font-semibold text-zinc-700 dark:text-zinc-200">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 hover:text-emerald-600 transition-colors"
            >
              {t('features')}
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 hover:text-emerald-600 transition-colors"
            >
              {t('howItWorks')}
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 hover:text-emerald-600 transition-colors"
            >
              {t('pricing')}
            </a>
          </nav>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-3">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 text-base font-semibold text-zinc-800 dark:text-zinc-200 rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              {language === 'km' ? 'ចូលប្រើប្រាស់' : 'Sign In'}
            </Link>
            <Button
              size="lg"
              variant="primary"
              onClick={() => {
                setMobileMenuOpen(false)
                openRegisterModal()
              }}
              className="w-full justify-center h-12 text-base font-semibold"
            >
              {t('getStartedFree')}
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
