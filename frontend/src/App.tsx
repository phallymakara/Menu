import { useState } from 'react'
import {
  Utensils,
  Bell,
  Check,
  Layers,
  Globe,
  Volume2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useLanguageStore } from '@/stores/useLanguageStore'
import {
  formatUSD,
  formatKHR,
  formatDualCurrency,
  calculateCashChange,
  DEFAULT_EXCHANGE_RATE,
} from '@/lib/currency'
import { playChime, playSuccessSound } from '@/lib/audio'

export default function App() {
  const { t, language } = useLanguageStore()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Interactive Cash Change Calculator State
  const [billUSD, setBillUSD] = useState<number>(18.50)
  const [tenderedUSD, setTenderedUSD] = useState<number>(20.00)
  const [tenderedKHR, setTenderedKHR] = useState<number>(0)
  const [changePref, setChangePref] = useState<'USD' | 'KHR'>('USD')

  const changeCalc = calculateCashChange(
    billUSD,
    tenderedUSD,
    tenderedKHR,
    DEFAULT_EXCHANGE_RATE,
    changePref
  )

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <Utensils className="w-4 h-4" />
            </div>
            <span className="font-bold text-base tracking-tight">
              {t('appName')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button size="sm" variant="primary">
              {t('getStartedFree')}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-2xl mx-auto pt-6">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
            {t('heroHeadline')}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t('heroSubheadline')}
          </p>
        </section>

        {/* 3 Core System Architecture Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Globe className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
            </div>
            <h3 className="font-semibold text-base mb-2">
              {language === 'km' ? 'ភាសាខ្មែរ & អង់គ្លេស' : 'Bilingual Engine'}
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {language === 'km'
                ? 'ពុម្ពអក្សរ Kantumruy Pro & Inter សម្រាប់ភាពច្បាស់ និងងាយស្រួលអានលើគ្រប់ទូរស័ព្ទដៃ។'
                : 'Native Kantumruy Pro and Inter typography optimized for high-density mobile and POS screens.'}
            </p>
          </Card>

          <Card>
            <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <span className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">$ / ៛</span>
            </div>
            <h3 className="font-semibold text-base mb-2">
              {language === 'km' ? 'គិតប្រាក់ USD & 100-Riel KHR' : 'Dual-Currency Engine'}
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {language === 'km'
                ? 'គណនាប្រាក់អាប់ និងអត្រាប្តូរប្រាក់ស្វ័យប្រវត្តិ ជាមួយនឹងការកាត់កន្ទុយ 100 រៀលស្តង់ដារ។'
                : 'Exact retail cash change calculation rounded to the nearest 100 Riel with mixed currency support.'}
            </p>
          </Card>

          <Card>
            <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Volume2 className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
            </div>
            <h3 className="font-semibold text-base mb-2">
              {language === 'km' ? 'សំឡេងរោទ៍ Web Audio Chimes' : 'Web Audio Chimes'}
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {language === 'km'
                ? 'សំឡេងរោទ៍សម្រាប់ផ្ទះបាយ និងការទូទាត់ជោគជ័យដោយមិនចាំបាច់ទាញយក file សំឡេង។'
                : 'Zero-dependency browser synthesizer chimes for kitchen order dispatch and Bakong payments.'}
            </p>
          </Card>
        </section>

        {/* Dual Currency & Cash Change Calculator */}
        <section className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {language === 'km' ? 'គណនាប្រាក់អាប់សាច់ប្រាក់ (Cash Change Calculator)' : 'Cash Change Calculator'}
            </h2>
            <span className="text-sm text-zinc-500 font-mono">1 USD = 4,100 KHR</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {t('total')} (USD)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={billUSD}
                  onChange={(e) => setBillUSD(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2.5 text-base font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <span className="text-sm text-zinc-500 mt-1.5 block font-mono">
                  = {formatKHR(billUSD * DEFAULT_EXCHANGE_RATE)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {t('tendered')} (USD $)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={tenderedUSD}
                    onChange={(e) => setTenderedUSD(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3.5 py-2 text-base font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    {t('tendered')} (KHR ៛)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={tenderedKHR}
                    onChange={(e) => setTenderedKHR(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3.5 py-2 text-base font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  {language === 'km' ? 'ជម្រើសប្រគល់ប្រាក់អាប់' : 'Change Preference'}
                </label>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setChangePref('USD')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      changePref === 'USD'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent font-semibold'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    USD ($) + Riel (៛)
                  </button>
                  <button
                    onClick={() => setChangePref('KHR')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      changePref === 'KHR'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent font-semibold'
                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    100% Riel (៛) Only
                  </button>
                </div>
              </div>
            </div>

            {/* Change Output */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('total')}</span>
                  <span className="font-semibold text-base">{formatDualCurrency(billUSD, DEFAULT_EXCHANGE_RATE)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('tendered')}</span>
                  <span className="font-semibold text-base">{formatUSD(changeCalc.totalTenderedUSD)}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <span className="text-sm font-medium text-zinc-500 block mb-1">
                  {t('change')}
                </span>
                {changeCalc.isSufficient ? (
                  <div>
                    {changePref === 'USD' ? (
                      <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatUSD(changeCalc.changeUSD)}
                        {changeCalc.changeKHR > 0 && (
                          <span className="text-xl text-zinc-600 dark:text-zinc-400 font-normal ml-2">
                            + {formatKHR(changeCalc.changeKHR)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatKHR(changeCalc.changeKHR)}
                      </div>
                    )}
                    <span className="text-xs text-zinc-500 mt-1.5 block">
                      {language === 'km' ? 'កាត់កន្ទុយត្រឹម 100 រៀល' : '100-Riel rounded'}
                    </span>
                  </div>
                ) : (
                  <div className="text-base font-semibold text-red-600 dark:text-red-400">
                    {language === 'km' ? 'ប្រាក់ទទួលមិនគ្រប់' : 'Insufficient Amount'} (Short: {formatUSD(changeCalc.shortageUSD)})
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Functional Audio & Modal Controls */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            {language === 'km' ? 'សាកល្បងសំឡេង និងផ្ទាំង Modal' : 'Audio Chimes & Dialog Controls'}
          </h2>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="md"
              onClick={() => playChime(587.33, 880, 0.4)}
            >
              <Bell className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              {language === 'km' ? 'សំឡេងកុម្ម៉ង់ (Kitchen Alert)' : 'Test Order Chime'}
            </Button>

            <Button
              variant="outline"
              size="md"
              onClick={() => playSuccessSound()}
            >
              <Check className="w-4 h-4 text-emerald-600" />
              {language === 'km' ? 'សំឡេងទូទាត់ (Payment Chime)' : 'Test Payment Sound'}
            </Button>

            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsModalOpen(true)}
            >
              <Layers className="w-4 h-4" />
              {language === 'km' ? 'បើកផ្ទាំង Modal' : 'Open Sample Modal'}
            </Button>
          </div>
        </section>

        {/* Modal / BottomSheet Demo */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={language === 'km' ? 'ជម្រើសកុម្ម៉ង់មុខម្ហូប' : 'Item Customization'}
          description={language === 'km' ? 'ជ្រើសរើសទំហំ និងវគ្គម្ហូប' : 'Select item size and course stage'}
        >
          <div className="space-y-4 py-1">
            <div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">
                {t('selectVariant')}
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-lg border border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 cursor-pointer">
                  <div className="font-medium text-xs">Regular (ធម្មតា)</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">$3.50 / ៛14,400</div>
                </div>
                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer">
                  <div className="font-medium text-xs">Large (ធំ)</div>
                  <div className="text-xs text-zinc-500 mt-0.5">$4.50 / ៛18,500</div>
                </div>
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">
                {t('courseStage')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="brand">{t('drinks')}</Badge>
                <Badge variant="neutral">{t('appetizers')}</Badge>
                <Badge variant="neutral">{t('mains')}</Badge>
                <Badge variant="neutral">{t('desserts')}</Badge>
              </div>
            </div>

            <div className="pt-2">
              <Button
                className="w-full"
                onClick={() => {
                  playSuccessSound()
                  setIsModalOpen(false)
                }}
              >
                {t('addToCart')} ($3.50)
              </Button>
            </div>
          </div>
        </Modal>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-20 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
        <p>{t('poweredBy')}</p>
      </footer>
    </div>
  )
}
