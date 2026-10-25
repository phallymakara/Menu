import { type FC } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ServiceHubBellButton } from '@/features/service-hub/components/ServiceHubBellButton'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuthStore } from '@/stores/useAuthStore'
import { LogoutButton } from '@/components/ui/LogoutConfirmModal'

export interface POSStaffInfo {
  id?: string
  full_name: string
  role?: string
  avatar_url?: string | null
}

export interface POSHeaderProps {
  storeName?: string
  storeLogo?: string | null
  isConnected?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
  /** Active business and branch; the service hub bell counts that branch's requests. */
  businessId?: string | null
  branchId?: string | null
  activeStaff?: POSStaffInfo | null
  onLock?: () => void
  canAccessAdmin?: boolean
}

export const POSHeader: FC<POSHeaderProps> = ({
  storeName,
  storeLogo,
  isConnected: _isConnected = true,
  businessId = null,
  branchId = null,
  activeStaff = null,
  onLock,
  canAccessAdmin = true,
}) => {
  const { language } = useLanguageStore()
  const authUser = useAuthStore((s) => s.user)

  const displayProfile = activeStaff
    ? {
        full_name: activeStaff.full_name,
        role: activeStaff.role,
        avatar_url: activeStaff.avatar_url,
      }
    : authUser
    ? {
        full_name: authUser.full_name,
        role: authUser.is_platform_admin ? 'Admin' : 'Owner',
        avatar_url: authUser.avatar_url,
      }
    : null

  const rawStoreName =
    storeName ||
    (language === 'km'
      ? localStorage.getItem('emenu_business_name_km') || localStorage.getItem('emenu_business_name_en') || 'ហាងរបស់ខ្ញុំ'
      : localStorage.getItem('emenu_business_name_en') || localStorage.getItem('emenu_business_name_km') || 'Store')

  const resolvedStoreName =
    rawStoreName
      .replace(/'s\s+restaurant$/i, '')
      .replace(/\s+restaurant$/i, '')
      .trim() || rawStoreName

  const resolvedLogo = storeLogo !== undefined ? storeLogo : localStorage.getItem('emenu_business_logo') || null



  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-zinc-950 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Branding & Back Link */}
        <div className="flex items-center gap-3">
          {canAccessAdmin && (
            <Link
              to="/admin"
              onClick={onLock}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors"
              title={language === 'km' ? 'ផ្ទាំងគ្រប់គ្រង' : 'Dashboard'}
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}

          <div className="flex items-center gap-3">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt={resolvedStoreName}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-zinc-200/80 dark:border-zinc-800 shadow-xs shrink-0"
              />
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-black text-sm sm:text-base shrink-0 uppercase shadow-xs">
                {resolvedStoreName.charAt(0)}
              </div>
            )}

            <div>
              <h1 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 leading-tight">
                {resolvedStoreName}
              </h1>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* User profile avatar & lock */}
          {displayProfile && (
            <div className="flex items-center gap-1.5 pl-1">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs sm:text-sm font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm shrink-0"
                title={`${displayProfile.full_name}${displayProfile.role ? ` (${displayProfile.role})` : ''}`}
              >
                {displayProfile.avatar_url ? (
                  <img
                    src={displayProfile.avatar_url}
                    alt={displayProfile.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  displayProfile.full_name?.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <LogoutButton
                align="right"
                direction="bottom"
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              />
            </div>
          )}

          <ServiceHubBellButton businessId={businessId} branchId={branchId} />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
