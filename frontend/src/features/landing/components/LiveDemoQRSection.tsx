import { type FC } from 'react'
import { Link } from 'react-router-dom'
import { Smartphone, ArrowRight } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Card } from '@/components/ui/Card'

export const LiveDemoQRSection: FC = () => {
  const { t, language } = useLanguageStore()

  // Generate SVG QR pattern pointing to demo
  return (
    <section className="py-16 border-t border-zinc-200 dark:border-zinc-800 text-center space-y-8">
      <div className="max-w-xl mx-auto space-y-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {t('liveDemoTitle')}
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          {t('liveDemoScan')}
        </p>
      </div>

      <Card className="max-w-sm mx-auto p-6 space-y-5 text-center">
        {/* QR Code Container */}
        <div className="w-48 h-48 mx-auto bg-white p-3 rounded-xl border border-zinc-200 flex items-center justify-center">
          {/* Crisp Vector QR Code SVG */}
          <svg viewBox="0 0 100 100" className="w-full h-full text-zinc-900 fill-current">
            <path d="M10,10 h30 v30 h-30 z M16,16 v18 h18 v-18 z M22,22 h6 v6 h-6 z" />
            <path d="M60,10 h30 v30 h-30 z M66,16 v18 h18 v-18 z M72,22 h6 v6 h-6 z" />
            <path d="M10,60 h30 v30 h-30 z M16,66 v18 h18 v-18 z M22,72 h6 v6 h-6 z" />
            <rect x="48" y="12" width="6" height="6" />
            <rect x="48" y="24" width="6" height="12" />
            <rect x="12" y="48" width="12" height="6" />
            <rect x="30" y="48" width="6" height="6" />
            <rect x="48" y="48" width="12" height="12" />
            <rect x="66" y="48" width="6" height="6" />
            <rect x="78" y="48" width="12" height="6" />
            <rect x="48" y="66" width="6" height="12" />
            <rect x="60" y="66" width="12" height="6" />
            <rect x="78" y="66" width="6" height="18" />
            <rect x="60" y="78" width="12" height="6" />
            <rect x="48" y="84" width="6" height="6" />
          </svg>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block font-mono">
            Table 08 • Garden Terrace
          </span>
          <span className="text-[11px] text-zinc-500 block">
            {language === 'km' ? 'ស្កេនដើម្បីសាកល្បងកុម្ម៉ង់ និងទូទាត់' : 'Scan to test mobile ordering and Bakong payment'}
          </span>
        </div>

        <Link
          to="/t/demo-table-08"
          className="inline-flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-900 dark:text-zinc-100 transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{language === 'km' ? 'បើកមើលលើកុំព្យូទ័រនេះ' : 'Open in this browser'}</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </Card>
    </section>
  )
}
