import { useState, Suspense, type FC } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CreditCard,
  Users,
  FileText,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { PlatformAdminGuard } from './components/PlatformAdminGuard'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { PageLoader } from '@/components/ui/PageLoader'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { logout } from '@/lib/auth-session'

export const PlatformAdminLayout: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  // Sidebar Collapsed / Expanded state (persisted)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('emenu_superadmin_sidebar_collapsed')
      return saved === 'true'
    }
    return false
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('emenu_superadmin_sidebar_collapsed', String(next))
      return next
    })
  }

  const navItems = [
    {
      to: '/superadmin/overview',
      labelEn: 'Overview & Stats',
      labelKm: 'ទិដ្ឋភាពទូទៅ & ស្ថិតិ',
      icon: BarChart3,
    },
    {
      to: '/superadmin/organizations',
      labelEn: 'Organizations',
      labelKm: 'អាជីវកម្ម & ហាង',
      icon: Building2,
    },
    {
      to: '/superadmin/plans',
      labelEn: 'Subscription Plans',
      labelKm: 'គម្រោង Subscription',
      icon: CreditCard,
    },
    {
      to: '/superadmin/users',
      labelEn: 'User Accounts',
      labelKm: 'គណនីអ្នកប្រើប្រាស់',
      icon: Users,
    },
    {
      to: '/superadmin/audit-logs',
      labelEn: 'System Audit Logs',
      labelKm: 'កំណត់ត្រាសវនកម្ម',
      icon: FileText,
    },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <PlatformAdminGuard>
      <div className="h-screen h-[100dvh] overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex font-sans selection:bg-[#167e61]/20 selection:text-[#167e61]">
        {/* =========================================================================
            DESKTOP SIDEBAR
        ========================================================================== */}
        <aside
          className={`hidden lg:flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 relative z-30 shrink-0 ${
            sidebarCollapsed ? 'w-20' : 'w-64'
          }`}
        >
          {/* Edge Toggle Button (Highest First Layer z-50, perfectly centered on border) */}
          <button
            type="button"
            onClick={toggleSidebar}
            title={
              sidebarCollapsed
                ? (isKm ? 'ពង្រីក Sidebar' : 'Expand Sidebar')
                : (isKm ? 'បង្រួម Sidebar' : 'Collapse Sidebar')
            }
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute top-5 -right-3.5 z-50 w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-[#167e61] dark:hover:text-[#22ab84] flex items-center justify-center transition-all cursor-pointer shadow-md hover:scale-110 active:scale-95 ring-1 ring-black/5 dark:ring-white/5"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Brand Header */}
          <div
            className={`h-16 shrink-0 flex items-center border-b border-zinc-200 dark:border-zinc-800 transition-all ${
              sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4 gap-3'
            }`}
          >
            {sidebarCollapsed ? (
              /* Collapsed: Display normal size Emenu logo, centered and clickable to expand */
              <button
                type="button"
                onClick={toggleSidebar}
                title={isKm ? 'ពង្រីក Sidebar' : 'Expand Sidebar'}
                aria-label={isKm ? 'ពង្រីក Sidebar' : 'Expand Sidebar'}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer group active:scale-95 shrink-0 bg-transparent"
              >
                <img
                  src="/logo-mark.svg"
                  alt="Emenu Cambodia"
                  className="w-9 h-9 object-contain shrink-0 group-hover:scale-105 transition-transform"
                />
              </button>
            ) : (
              /* Expanded: Brand logo + text, clickable to collapse */
              <button
                type="button"
                onClick={toggleSidebar}
                title={isKm ? 'បង្រួម Sidebar' : 'Collapse Sidebar'}
                aria-label={isKm ? 'បង្រួម Sidebar' : 'Collapse Sidebar'}
                className="flex items-center gap-3 overflow-hidden text-left cursor-pointer group rounded-full px-1 py-1 active:scale-98 transition-all min-w-0 bg-transparent"
              >
                <img
                  src="/logo-mark.svg"
                  alt="Emenu Cambodia"
                  className="w-9 h-9 object-contain shrink-0 group-hover:scale-105 transition-transform"
                />
                <div className="truncate">
                  <span className="font-bold text-base tracking-tight text-[#167e61] block leading-tight">
                    Emenu Cambodia
                  </span>
                  <span className="text-[10px] text-zinc-400 font-medium block uppercase tracking-wider">
                    Control Console
                  </span>
                </div>
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-full text-sm font-semibold transition-all group relative ${
                      isActive
                        ? 'bg-[#167e61] text-white shadow-sm shadow-[#167e61]/25 font-bold'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-[#167e61]/5 hover:text-[#167e61] dark:hover:text-[#167e61]'
                    } ${
                      sidebarCollapsed
                        ? 'w-12 h-12 justify-center mx-auto'
                        : 'px-4 py-2.5'
                    }`
                  }
                  title={sidebarCollapsed ? (isKm ? item.labelKm : item.labelEn) : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate">
                      {isKm ? item.labelKm : item.labelEn}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Sidebar Footer User Card */}
          <div className="p-3 shrink-0 border-t border-zinc-200 dark:border-zinc-800">
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={handleLogout}
                title={isKm ? 'ចាកចេញ' : 'Sign Out'}
                className="w-10 h-10 mx-auto flex items-center justify-center transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full bg-[#167e61]/10 text-[#167e61] group-hover:text-rose-600 font-bold text-xs flex items-center justify-center border border-[#167e61]/20">
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-3 px-1 py-1">
                <div className="w-9 h-9 rounded-full bg-[#167e61]/10 text-[#167e61] font-bold text-xs flex items-center justify-center shrink-0 border border-[#167e61]/20">
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {user?.full_name || 'Admin'}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    {user?.email || 'admin@emenu.com'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title={isKm ? 'ចាកចេញ' : 'Sign Out'}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* =========================================================================
            MOBILE SIDEBAR OVERLAY
        ========================================================================== */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 max-w-[85vw] bg-white dark:bg-zinc-900 h-full p-4 flex flex-col justify-between shadow-2xl border-r border-zinc-200 dark:border-zinc-800 rounded-r-3xl z-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <img src="/logo-mark.svg" alt="Emenu Cambodia" className="w-8 h-8 object-contain" />
                    <div>
                      <span className="font-bold text-sm text-[#167e61] block leading-tight">
                        Emenu Cambodia
                      </span>
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
                        Control Console
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
                            isActive
                              ? 'bg-[#167e61] text-white shadow-sm shadow-[#167e61]/25 font-bold'
                              : 'text-zinc-600 dark:text-zinc-400 hover:bg-[#167e61]/5 hover:text-[#167e61]'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4" />
                        <span>{isKm ? item.labelKm : item.labelEn}</span>
                      </NavLink>
                    )
                  })}
                </nav>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#167e61]/10 text-[#167e61] font-bold text-xs flex items-center justify-center border border-[#167e61]/20">
                    {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[130px]">
                    {user?.full_name || 'Admin'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-full text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title={isKm ? 'ចាកចេញ' : 'Sign Out'}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MAIN CONTENT AREA WITH COMPACT TOP BAR
        ========================================================================== */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 h-full overflow-hidden">
          {/* Top Bar for Mobile Menu, Controls & Theme/Lang */}
          <header className="h-16 shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 flex items-center justify-between gap-4 z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-2xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Toggle Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="lg:hidden flex items-center gap-2">
                <img src="/logo-mark.svg" alt="Emenu Cambodia" className="w-7 h-7 object-contain" />
                <span className="font-bold text-sm text-[#167e61]">
                  Emenu Cambodia
                </span>
              </div>
            </div>

            {/* Right: Theme Toggle & Language Switcher */}
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </header>

          {/* Main Outlet */}
          <main className="flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden px-2.5 pt-2 pb-4 sm:px-3 sm:pt-2.5 lg:px-3.5 lg:pt-2.5 w-full max-w-full flex flex-col">
            <div className="w-full flex-1 flex flex-col min-h-0">
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </PlatformAdminGuard>
  )
}
