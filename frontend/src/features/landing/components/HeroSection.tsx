import { useState, type FC, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const HeroSection: FC = () => {
  const { t, language } = useLanguageStore()
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (email) {
      setIsSubmitted(true)
    }
  }

  return (
    <section className="pt-12 pb-16 text-center space-y-10">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-[1.15]">
          {t('heroHeadline')}
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          {t('heroSubheadline')}
        </p>

        {/* Email Signup / CTA Form */}
        <div className="max-w-md mx-auto pt-2">
          {isSubmitted ? (
            <div className="p-4 rounded-xl border border-emerald-600/50 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              {language === 'km'
                ? 'សូមអរគុណ! យើងនឹងទាក់ទងលោកអ្នកដើម្បីរៀបចំគណនីហាងក្នុងពេលឆាប់ៗ។'
                : 'Thank you! We will reach out shortly to help you set up your restaurant menu.'}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('enterEmail')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                />
              </div>
              <Button type="submit" variant="primary" size="md">
                {t('getStartedFree')}
              </Button>
            </form>
          )}

          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-zinc-500">
            <Link to="/t/demo-table-08" className="hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 font-medium transition-colors">
              <span>{language === 'km' ? 'ឬសាកល្បងកុម្ម៉ង់ផ្ទាល់ (Live Demo)' : 'Or try live ordering demo'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
