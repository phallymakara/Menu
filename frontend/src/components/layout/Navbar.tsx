import { useState, type FC } from 'react'
import { Link } from 'react-router-dom'
import { Menu as MenuIcon, X } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthModalStore } from '@/stores/useAuthModalStore'

export const Navbar: FC = () => {
  const { t, language } = useLanguageStore()
  const { openLoginModal } = useAuthModalStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    setMobileMenuOpen(false)
    const element = document.getElementById(targetId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.pushState(null, '', `#${targetId}`)
    }
  }

  return (
    <header className="bg-white/95 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group shrink-0">
          <img
            src="/logo-mark.svg"
            alt="E-Menu Cambodia"
            className="w-10 h-10 sm:w-11 sm:h-11 object-contain transition-transform group-hover:scale-105"
          />
          <div className="hidden sm:block">
            <span className="font-bold text-lg sm:text-xl tracking-tight block leading-tight text-zinc-950">
              {t('appName')}
            </span>
            <span className="text-xs sm:text-sm text-zinc-500 block font-normal leading-none mt-0.5">
              {language === 'km' ? 'ប្រព័ន្ធមីនុយ QR' : 'Smart QR System'}
            </span>
          </div>
        </Link>

        {/* Desktop / Laptop Center Nav Links */}
        <nav className="hidden md:flex items-center gap-7 lg:gap-9 text-base sm:text-lg font-semibold text-zinc-600">
          <a
            href="#features"
            onClick={(e) => handleNavClick(e, 'features')}
            className="hover:text-emerald-600 transition-colors"
          >
            {language === 'km' ? 'មុខងារស្នូល' : 'Features'}
          </a>
          <a
            href="#how-it-works"
            onClick={(e) => handleNavClick(e, 'how-it-works')}
            className="hover:text-emerald-600 transition-colors"
          >
            {language === 'km' ? 'របៀបដំណើរការ' : 'How It Works'}
          </a>
          <a
            href="#pricing"
            onClick={(e) => handleNavClick(e, 'pricing')}
            className="hover:text-emerald-600 transition-colors"
          >
            {language === 'km' ? 'តម្លៃសេវាកម្ម' : 'Pricing'}
          </a>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageSwitcher />

          {/* Desktop Auth Buttons */}
          <div className="hidden sm:flex items-center">
            <button
              type="button"
              onClick={openLoginModal}
              className="text-base sm:text-lg font-bold text-zinc-700 hover:text-emerald-600 transition-colors px-4 py-2 rounded-full hover:bg-zinc-100 cursor-pointer"
            >
              {language === 'km' ? 'ចូលប្រើប្រាស់' : 'Sign In'}
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="sm:hidden p-2 rounded-lg text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Sheet */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-white px-6 py-6 space-y-4 animate-in slide-in-from-top duration-200 shadow-xl">
          <nav className="flex flex-col space-y-3.5 text-lg font-bold text-zinc-800">
            <a
              href="#features"
              onClick={(e) => handleNavClick(e, 'features')}
              className="py-1.5 hover:text-emerald-600 transition-colors"
            >
              {language === 'km' ? 'មុខងារស្នូល' : 'Features'}
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => handleNavClick(e, 'how-it-works')}
              className="py-1.5 hover:text-emerald-600 transition-colors"
            >
              {language === 'km' ? 'របៀបដំណើរការ' : 'How It Works'}
            </a>
            <a
              href="#pricing"
              onClick={(e) => handleNavClick(e, 'pricing')}
              className="py-1.5 hover:text-emerald-600 transition-colors"
            >
              {language === 'km' ? 'តម្លៃសេវាកម្ម' : 'Pricing'}
            </a>
          </nav>

          <div className="pt-2 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false)
                openLoginModal()
              }}
              className="w-full text-center py-3 text-lg font-bold text-zinc-800 rounded-full border border-zinc-200 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              {language === 'km' ? 'ចូលប្រើប្រាស់' : 'Sign In'}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
