import { type FC } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3X3,
  Settings,
  Users,
  LayoutGrid,
  ExternalLink,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const AdminSidebar: FC<{ onCloseMobile?: () => void }> = ({ onCloseMobile }) => {
  const { language } = useLanguageStore()
  const location = useLocation()

  const navItems = [
    {
      path: '/admin',
      exact: true,
      icon: LayoutDashboard,
      labelKm: 'ផ្ទាំងសង្ខេប',
      labelEn: 'Dashboard Overview',
    },
    {
      path: '/admin/menu',
      icon: UtensilsCrossed,
      labelKm: 'មុខម្ហូប & ប្រភេទ',
      labelEn: 'Menu & Categories',
    },
    {
      path: '/admin/tables',
      icon: Grid3X3,
      labelKm: 'ប្លង់តុ & QR កូដ',
      labelEn: 'Dining Tables & QR',
    },
    {
      path: '/admin/settings',
      icon: Settings,
      labelKm: 'ការកំណត់ & ទូទាត់',
      labelEn: 'Settings & Payment',
    },
    {
      path: '/admin/staff',
      icon: Users,
      labelKm: 'បុគ្គលិក & សិទ្ធិ',
      labelEn: 'Staff & Roles',
    },
  ]

  const isCurrentPath = (path: string, exact?: boolean) => {
    if (exact) {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  return (
    <aside className="w-64 h-[calc(100vh-5rem)] sticky top-20 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between p-4 shrink-0">
      {/* Navigation Links */}
      <div className="space-y-1.5 pt-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = isCurrentPath(item.path, item.exact)
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onCloseMobile}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white dark:text-zinc-950' : 'text-zinc-500'}`} />
              <span>{language === 'km' ? item.labelKm : item.labelEn}</span>
            </Link>
          )
        })}
      </div>

      {/* Bottom Quick Links */}
      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
        <Link
          to="/pos"
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            <span>{language === 'km' ? 'ផ្ទាំងគិតប្រាក់ POS' : 'Cashier POS'}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        <Link
          to="/t/demo-table-08"
          target="_blank"
          className="flex items-center justify-between px-3.5 py-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-medium transition-colors"
        >
          <span>{language === 'km' ? 'សាកល្បង QR ភ្ញៀវ' : 'Test Guest QR'}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </aside>
  )
}
