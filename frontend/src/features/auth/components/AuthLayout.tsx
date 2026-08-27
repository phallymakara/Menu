import { type FC, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Utensils } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
}

export const AuthLayout: FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  const { t, language } = useLanguageStore()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between selection:bg-emerald-600 selection:text-white">
      {/* Top Minimalist Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl w-full mx-auto">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white transition-transform group-hover:scale-105">
            <Utensils className="w-4 h-4" />
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-sm tracking-tight block leading-tight">
              {t('appName')}
            </span>
            <span className="text-[10px] text-zinc-500 block font-normal leading-none">
              {language === 'km' ? 'ប្រព័ន្ធមីនុយ QR' : 'Smart QR System'}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg space-y-6">
          {/* Card Title & Subtitle */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              {title}
            </h1>
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {subtitle}
            </p>
          </div>

          {/* Form Card Container (Zero Shadows, Clean Flat Border) */}
          <div className="p-6 sm:p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
        © {new Date().getFullYear()} {t('appName')} Platform. All rights reserved.
      </footer>
    </div>
  )
}
