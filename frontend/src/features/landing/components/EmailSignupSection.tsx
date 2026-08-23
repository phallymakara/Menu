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
    <section id="demo-signup" className="py-20 text-center space-y-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {language === 'km'
            ? 'ត្រៀមខ្លួនជាស្រេចក្នុងការផ្លាស់ប្តូរភោជនីយដ្ឋានរបស់អ្នកហើយឬនៅ?'
            : 'Ready to modernize your restaurant operations?'}
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          {language === 'km'
            ? 'បញ្ចូលអ៊ីមែល​​​​ ឬ លេខទូរស័ព្ទ​​​ របស់អ្នកដើម្បីទទួលបានការសាកល្បងដោយឥតគិតថ្លៃ ឬណាត់ជួបជាមួយក្រុមការងារយើងខ្ញុំ។'
            : 'Enter your​ email or phhone to get started with a 14-day free trial or book a live product walkthrough.'}
        </p>
      </div>

      <div className="max-w-md mx-auto">
        {isSubmitted ? (
          <p className="text-emerald-600 dark:text-emerald-400 text-base font-semibold py-3 leading-relaxed">
            {language === 'km'
              ? 'សូមអរគុណ! យើងខ្ញុំបានទទួលព័ត៌មានរបស់លោកអ្នករួចរាល់។ ក្រុមការងារនឹងទាក់ទងមកក្នុងពេលឆាប់ៗ។'
              : 'Thank you! We received your request. Our team will reach out shortly.'}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2.5">
            <div className="relative flex-1">
              <Mail className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('enterEmail')}
                className="w-full pl-11 pr-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
              />
            </div>
            <Button type="submit" variant="primary" size="lg" className="h-12 px-6 text-base font-semibold">
              {language === 'km' ? 'ផ្ញើព័ត៌មាន' : 'Submit'}
            </Button>
          </form>
        )}

        <div className="mt-4 flex items-center justify-center gap-2 text-sm sm:text-base text-zinc-500 dark:text-zinc-400 font-medium">
          <span>{language === 'km' ? 'មិនទាមទារកាតឥណទាន • ដំឡើងរហ័ស' : 'No credit card required • Instant setup'}</span>
        </div>
      </div>
    </section>
  )
}
