import { type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Utensils, LogOut, Menu as MenuIcon } from 'lucide-react'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'

export const AdminHeader: FC<{ onToggleSidebar?: () => void }> = ({ onToggleSidebar }) => {
  const { language } = useLanguageStore()
  const { user, logout } = useAuthStore()
  const { businessProfile } = useOnboardingStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white/95 dark:bg-zinc-950/95 sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-md">
      <div className="px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Left: Mobile Toggle & Store Identity */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white overflow-hidden shrink-0">
              {businessProfile.logo_url ? (
                <img
                  src={businessProfile.logo_url}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Utensils className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-zinc-950 dark:text-zinc-50 block leading-tight">
                  {language === 'km' && businessProfile.name_km ? businessProfile.name_km : businessProfile.name_en}
                </span>
              </div>
              <span className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 block font-medium leading-none mt-1">
                {language === 'km' ? 'ផ្ទាំងគ្រប់គ្រងហាង' : 'Store Admin HQ'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Language, Theme, User profile & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <ThemeToggle />

          {/* User profile avatar & logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300">
              {user?.full_name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title={language === 'km' ? 'ចាកចេញ' : 'Sign Out'}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
