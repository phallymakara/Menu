import { useState, type FC } from 'react'
import { Coffee, QrCode, Utensils, CreditCard, ChefHat, Sparkles } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

interface Hotspot {
  id: string
  x: number // percentage
  y: number // percentage
  icon: typeof Coffee
  title_km: string
  title_en: string
  desc_km: string
  desc_en: string
}

const HOTSPOTS: Hotspot[] = [
  {
    id: 'cafe',
    x: 14,
    y: 28,
    icon: Coffee,
    title_km: 'ហាងកាហ្វេ & តូបភេសជ្ជៈ',
    title_en: 'Café & Drink Bar',
    desc_km: 'គ្រប់គ្រងជម្រើសផ្អែម/ទឹកកក និងបញ្ជាទិញរហ័ស',
    desc_en: 'Configure sweetness/ice variants & speedy counter tickets',
  },
  {
    id: 'qr-menu',
    x: 32,
    y: 45,
    icon: QrCode,
    title_km: 'ស្កេនមីនុយឌីជីថល QR',
    title_en: 'Digital QR Self-Ordering',
    desc_km: 'ស្កេនជាមួយទូរស័ព្ទដៃ មើលរូបភាពម្ហូប ពីរសភា ខ្មែរ-អង់គ្លេស',
    desc_en: 'Scan with smartphone camera to view bilingual menu & photo gallery',
  },
  {
    id: 'dining-table',
    x: 48,
    y: 70,
    icon: Utensils,
    title_km: 'ភ្ញៀវកុម្ម៉ង់នៅតុ',
    title_en: 'Table Dining Experience',
    desc_km: 'កុម្ម៉ង់ដោយខ្លួនឯង តាមដានស្ថានភាពម្ហូប មិនបាច់រង់ចាំបុគ្គលិក',
    desc_en: 'Seamless self-ordering with real-time dish status updates',
  },
  {
    id: 'khqr-pay',
    x: 73,
    y: 52,
    icon: CreditCard,
    title_km: 'ទូទាត់បាគង KHQR ស្វ័យប្រវត្តិ',
    title_en: 'Automated Bakong KHQR',
    desc_km: 'ស្កេនទូទាត់ភ្លាមៗជាមួយគ្រប់ធនាគារ កាត់បន្ថយការភ័ន្តច្រឡំ',
    desc_en: 'Scan to pay instantly with any Cambodian banking app',
  },
  {
    id: 'kds-kitchen',
    x: 88,
    y: 35,
    icon: ChefHat,
    title_km: 'ផ្ទាំងផ្ទះបាយ KDS',
    title_en: 'Kitchen Display (KDS)',
    desc_km: 'បែងចែកផ្នែកចម្អិនតាមពេលវេលាជាក់ស្តែង គ្មានការបាត់បង់វិក្កយបត្រ',
    desc_en: 'Multi-station routing (Grill, Bar, Wok) with SLA countdown timers',
  },
]

export const HeroIllustration: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const [activeSpot, setActiveSpot] = useState<string | null>(null)

  return (
    <div className="relative mx-auto max-w-5xl mt-6 sm:mt-10 group">
      {/* Decorative Container */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-900/5 dark:shadow-black/40 transition-all p-2 sm:p-4">
        {/* The Panoramic Image Generated from Reference */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-white">
          <img
            src="/images/hero-workflow-panoramic.jpg"
            alt="E-Menu Complete Restaurant Workflow: Café, QR Self-Ordering, Dining Table, Staff Dispatch, KHQR Payment, Kitchen KDS"
            className="w-full h-full object-cover object-center transform group-hover:scale-[1.01] transition-transform duration-700"
            loading="eager"
          />

          {/* Interactive Interactive Hotspot Pins */}
          {HOTSPOTS.map((spot) => {
            const Icon = spot.icon
            const isActive = activeSpot === spot.id

            return (
              <div
                key={spot.id}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
              >
                {/* Pulsing Pin Button */}
                <button
                  type="button"
                  onClick={() => setActiveSpot(isActive ? null : spot.id)}
                  onMouseEnter={() => setActiveSpot(spot.id)}
                  onMouseLeave={() => setActiveSpot(null)}
                  aria-label={isKm ? spot.title_km : spot.title_en}
                  className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-transform transform hover:scale-110 shadow-lg ${
                    isActive
                      ? 'bg-emerald-600 text-white scale-110 ring-4 ring-emerald-400/40'
                      : 'bg-white/95 dark:bg-zinc-900/95 text-emerald-600 border border-emerald-500/40 hover:bg-emerald-50'
                  }`}
                >
                  <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  {/* Ping Animation Ring */}
                  <span className="absolute -inset-1 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />
                </button>

                {/* Popover Card */}
                {isActive && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 sm:w-64 p-3 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 shadow-2xl z-30 pointer-events-none text-left animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {isKm ? spot.title_km : spot.title_en}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                      {isKm ? spot.desc_km : spot.desc_en}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Bottom Flow Legend Banner */}
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 px-2 text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isKm ? 'ដំណើរការអាជីវកម្មភោជនីយដ្ឋានពេញលេញ' : 'End-to-End Restaurant Workflow'}</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto py-0.5">
            <span>☕ {isKm ? 'ហាងកាហ្វេ' : 'Café'}</span>
            <span>→</span>
            <span>📱 {isKm ? 'មីនុយ QR' : 'QR Menu'}</span>
            <span>→</span>
            <span>🍽️ {isKm ? 'តុភ្ញៀវ' : 'Dining'}</span>
            <span>→</span>
            <span>💳 {isKm ? 'បាគង KHQR' : 'KHQR'}</span>
            <span>→</span>
            <span>🍳 {isKm ? 'ផ្ទះបាយ KDS' : 'KDS'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
