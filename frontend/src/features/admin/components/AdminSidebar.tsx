import { type FC } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  LayoutGrid,
  UtensilsCrossed,
  Grid3X3,
  Boxes,
  ArrowLeftRight,
  Users,
  Settings,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const AdminSidebar: FC<{ onCloseMobile?: () => void }> = ({ onCloseMobile }) => {
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
      titleEn: 'SUPPLY & INVENTORY',
      titleKm: 'ការផ្គត់ផ្គង់ & ស្តុក',
      items: [
        {
          path: '/admin/inventory',
          exact: true,
          icon: Boxes,
          labelKm: 'គ្រឿងផ្សំដើម',
          labelEn: 'Raw Ingredients',
        },
        {
          path: '/admin/inventory/transfers',
          icon: ArrowLeftRight,
          labelKm: 'ការផ្ទេរស្តុក',
          labelEn: 'Stock Transfers',
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
    <aside className="w-64 h-[calc(100vh-4rem)] sticky top-16 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between p-3 overflow-y-auto shrink-0">
      <div className="space-y-4">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            <div className="px-3 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              {language === 'km' ? section.titleKm : section.titleEn}
            </div>

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = isCurrentPath(item.path, item.exact)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
                        : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white dark:text-zinc-950' : 'text-zinc-500'}`} />
                    <span className="truncate">{language === 'km' ? item.labelKm : item.labelEn}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
