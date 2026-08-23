import { type FC } from 'react'
import { Utensils } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const Footer: FC = () => {
  const { t, language } = useLanguageStore()

  return (
    <footer className="bg-zinc-50/50 dark:bg-zinc-900/30 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
            <Utensils className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight block">
              {t('appName')}
            </span>
            <span className="text-xs text-zinc-500 block">
              {language === 'km' ? 'ប្រព័ន្ធគ្រប់គ្រងភោជនីយដ្ឋានទំនើបកម្ពុជា' : 'Modern Restaurant OS for Cambodia'}
            </span>
          </div>
        </div>

        <div className="text-xs text-zinc-500 text-center md:text-right">
          <p>© {new Date().getFullYear()} {t('appName')} Platform. All rights reserved.</p>
          <p className="mt-1 text-zinc-400 dark:text-zinc-600">{t('poweredBy')}</p>
        </div>
      </div>
    </footer>
  )
}
