import { useEffect, type FC, ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, Store } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useCurrentUser } from '@/features/admin/hooks/useStaffQueries'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

interface PlatformAdminGuardProps {
  children: ReactNode
}

export const PlatformAdminGuard: FC<PlatformAdminGuardProps> = ({ children }) => {
  const { isAuthenticated, token, user, updateUser } = useAuthStore()
  const { language } = useLanguageStore()
  const navigate = useNavigate()

  const hasToken = isAuthenticated || !!token
  const { data: userData, isLoading: isLoadingUser, isError } = useCurrentUser()

  useEffect(() => {
    if (userData) {
      updateUser({
        id: userData.user_id,
        email: userData.email,
        full_name: userData.full_name || '',
        phone: userData.phone,
        is_platform_admin: userData.is_platform_admin,
      })
    }
  }, [userData, updateUser])

  if (!hasToken || isError) {
    return <Navigate to="/login" replace />
  }

  // If token is present but user profile is still loading, display custom animated EmenuLoader
  if (!user && isLoadingUser) {
    return (
      <div className="h-screen h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <EmenuLoader
          size="lg"
          message={language === 'km' ? 'កំពុងផ្ទៀងផ្ទាត់សិទ្ធិ Super Admin...' : 'Verifying Super Admin access...'}
          showBrandText
        />
      </div>
    )
  }

  const isPlatformAdmin = user?.is_platform_admin ?? userData?.is_platform_admin

  // Enforce Super Admin role (is_platform_admin === true)
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-6 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-200 dark:border-amber-900/40">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? 'គ្មានសិទ្ធិចូលដំណើរការ' : 'Super Admin Privileges Required'}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {language === 'km'
                ? 'ទំព័រនេះត្រូវបានកំណត់សម្រាប់តែគណនី Platform Super Administrator ប៉ុណ្ណោះ។ គណនីបច្ចុប្បន្នរបស់អ្នកមិនមានសិទ្ធិនេះទេ។'
                : 'This portal is restricted exclusively to Platform Super Administrators. Your current account does not have platform operator privileges.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white text-sm font-semibold transition-all shadow-sm"
            >
              <Store className="w-4 h-4" />
              {language === 'km' ? 'ត្រឡប់ទៅហាង' : 'Go to Restaurant Store'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              {language === 'km' ? 'ត្រឡប់ក្រោយ' : 'Go Back'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
