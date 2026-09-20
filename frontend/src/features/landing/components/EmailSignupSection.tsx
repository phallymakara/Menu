import { useState, type FC, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const EmailSignupSection: FC = () => {
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
    <section id="demo-signup" className="py-6 sm:py-8 text-center space-y-5 scroll-mt-20">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
          {language === 'km'
            ? 'ត្រៀមខ្លួនជាស្រេចក្នុងការផ្លាស់ប្តូរភោជនីយដ្ឋានរបស់អ្នកហើយឬនៅ?'
            : 'Ready to modernize your restaurant operations?'}
        </h2>
      </div>

      <div className="max-w-xl mx-auto w-full px-2">
        {isSubmitted ? (
          <p className="text-emerald-600 text-base font-semibold py-3 leading-relaxed">
            {language === 'km'
              ? 'សូមអរគុណ! យើងខ្ញុំបានទទួលព័ត៌មានរបស់លោកអ្នករួចរាល់។ ក្រុមការងារនឹងទាក់ទងមកក្នុងពេលឆាប់ៗ។'
              : 'Thank you! We received your request. Our team will reach out shortly.'}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Mail className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('enterEmail')}
                className="w-full pl-12 pr-5 py-3.5 rounded-full border border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 text-base focus:border-zinc-900 outline-none transition-all shadow-sm"
              />
            </div>
            <Button type="submit" variant="primary" size="lg" className="h-12 px-7 rounded-full text-base font-semibold justify-center shadow-md">
              {language === 'km' ? 'ផ្ញើព័ត៌មាន' : 'Submit'}
            </Button>
          </form>
        )}
      </div>
    </section>
  )
}
