import { type FC } from 'react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const PartnerLogos: FC = () => {
  const { t, language } = useLanguageStore()

  const partners = [
    'Bistro Siem Reap',
    'Phnom Penh Roastery',
    'Malis Khmer Dining',
    'Riverside Taphouse',
    'Angkor Cafe & Bakery',
    'Lotus Lounge',
  ]

  return (
    <section className="py-12 border-t border-zinc-200 dark:border-zinc-800 text-center space-y-6">
      <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
        {language === 'km' ? 'ផ្តល់ទំនុកចិត្តដោយភោជនីយដ្ឋាន និងហាងកាហ្វេជាច្រើន' : t('trustedBy')}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 max-w-4xl mx-auto">
        {partners.map((partner, i) => (
          <span
            key={i}
            className="text-xs sm:text-sm font-semibold text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors tracking-tight"
          >
            {partner}
          </span>
        ))}
      </div>
    </section>
  )
}
