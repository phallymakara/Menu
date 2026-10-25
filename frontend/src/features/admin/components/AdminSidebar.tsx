import { type FC } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  LayoutGrid,
  UtensilsCrossed,
  Grid3X3,
  Users,
  Settings,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const AdminSidebar: FC<{
  onCloseMobile?: () => void
  isCollapsed?: boolean
}> = ({ onCloseMobile, isCollapsed = false }) => {
  const { language } = useLanguageStore()
  const location = useLocation()

  const navSections = [
    {
      titleEn: 'OPERATIONS',
      titleKm: 'ប្រតិបត្តិការប្រចាំថ្ងៃ',
      items: [
        {
          path: '/admin',
          exact: true,
          icon: LayoutDashboard,
          labelKm: 'ផ្ទាំងសង្ខេប',
          labelEn: 'Dashboard Overview',
        },
        {
          path: '/pos',
          icon: LayoutGrid,
          labelKm: 'ផ្ទាំងគិតប្រាក់ POS',
          labelEn: 'Live POS Register',
        },
        {
          path: '/kds',
          icon: UtensilsCrossed,
          labelKm: 'អេក្រង់ផ្ទះបាយ KDS',
          labelEn: 'Kitchen KDS Display',
        },
      ],
    },
    {
      titleEn: 'CATALOG & FLOOR',
      titleKm: 'កាតាឡុក & ប្លង់តុ',
      items: [
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
          labelEn: 'Tables & QR Stands',
        },
      ],
    },
    {
      titleEn: 'SETTINGS & ACCESS',
      titleKm: 'ការកំណត់ & សិទ្ធិ',
      items: [
        {
          path: '/admin/staff',
          icon: Users,
          labelKm: 'បុគ្គលិក & សិទ្ធិ (RBAC)',
          labelEn: 'Staff & Roles (RBAC)',
        },
        {
          path: '/admin/settings',
          icon: Settings,
          labelKm: 'ការកំណត់ហាង & KHQR',
          labelEn: 'Store & KHQR Setup',
        },
      ],
    },
  ]

  const isCurrentPath = (path: string, exact?: boolean) => {
    if (exact) {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  return (
    <nav
      className={`w-full h-full border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between overflow-y-auto overflow-x-hidden shrink-0 transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${
        isCollapsed ? 'px-2 py-2.5' : 'p-2.5'
      }`}
    >
      <div className={isCollapsed ? 'space-y-2' : 'space-y-3'}>
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-0.5">
            {isCollapsed ? (
              sIdx > 0 && <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
            ) : (
              <div className="px-3 text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                {language === 'km' ? section.titleKm : section.titleEn}
              </div>
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = isCurrentPath(item.path, item.exact)
                const label = language === 'km' ? item.labelKm : item.labelEn

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    title={label}
                    className={`flex items-center rounded-full text-sm font-semibold transition-all group ${
                      isCollapsed
                        ? 'w-10 h-10 justify-center mx-auto'
                        : 'gap-3 px-3.5 py-1.5'
                    } ${
                      isActive
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold shadow-none'
                        : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <Icon
                      className={`${isCollapsed ? 'w-4 h-4' : 'w-4 h-4'} shrink-0 ${
                        isActive
                          ? 'text-white dark:text-zinc-950'
                          : 'text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100'
                      }`}
                    />
                    {!isCollapsed && <span className="truncate">{label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
