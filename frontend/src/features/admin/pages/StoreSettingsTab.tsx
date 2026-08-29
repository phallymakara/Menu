import { useState, type FC } from 'react'
import {
  DollarSign,
  CreditCard,
  Send,
  Check,
  Save,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'
import { Button } from '@/components/ui/Button'

export const StoreSettingsTab: FC = () => {
  const { language } = useLanguageStore()
  const { branch, updateBranch } = useOnboardingStore()

  // Financial Settings State
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'KHR'>('USD')
  const [exchangeRate, setExchangeRate] = useState(4100)
  const [vatRate, setVatRate] = useState(10)
  const [serviceChargeRate, setServiceChargeRate] = useState(0)

  // Bakong KHQR Settings State
  const [bakongAccountId, setBakongAccountId] = useState(branch.bakong_account_id || 'bistro_sr@aclb')
  const [bakongMerchantName, setBakongMerchantName] = useState(branch.bakong_merchant_name || 'Siem Reap Bistro')
  const [bakongAcquiringBank, setBakongAcquiringBank] = useState(branch.bakong_acquiring_bank || 'ACLEDA Bank')

  // Telegram Alert State
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')

  // Inline Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaved, setIsSaved] = useState(false)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!exchangeRate || exchangeRate <= 0) {
      errs.exchangeRate = language === 'km' ? 'សូមបញ្ចូលអត្រាប្តូរប្រាក់ឱ្យបានត្រឹមត្រូវ' : 'Please enter a valid exchange rate'
    }
    if (vatRate < 0 || vatRate > 100) {
      errs.vatRate = language === 'km' ? 'អត្រាពន្ធ VAT ត្រូវនៅចន្លោះ ០ ទៅ ១០០' : 'VAT rate must be between 0% and 100%'
    }
    if (serviceChargeRate < 0 || serviceChargeRate > 100) {
      errs.serviceChargeRate = language === 'km' ? 'ថ្លៃសេវាត្រូវនៅចន្លោះ ០ ទៅ ១០០' : 'Service charge must be between 0% and 100%'
    }
    if (!bakongAccountId.trim()) {
      errs.bakongAccountId = language === 'km' ? 'សូមបញ្ចូលលេខគណនីបាគង' : 'Bakong Account ID is required'
    }
    if (!bakongMerchantName.trim()) {
      errs.bakongMerchantName = language === 'km' ? 'សូមបញ្ចូលឈ្មោះហាងដែលត្រូវបង្ហាញលើ QR' : 'Store name for QR code is required'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    updateBranch({
      bakong_account_id: bakongAccountId,
      bakong_merchant_name: bakongMerchantName,
      bakong_acquiring_bank: bakongAcquiringBank,
    })
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 3000)
  }

  const acquiringBanks = [
    'ABA Bank',
    'ACLEDA Bank',
    'Canadia Bank',
    'Sathapana Bank',
    'Wing Bank',
    'Prince Bank',
    'Foreign Trade Bank (FTB)',
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Save Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'ការកំណត់ហាង & KHQR' : 'Store & KHQR Setup'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {language === 'km'
              ? 'កំណត់រូបិយប័ណ្ណ អត្រាប្តូរប្រាក់ គណនីបាគង KHQR និងប្រព័ន្ធជូនដំណឹង Telegram'
              : 'Configure USD/KHR currency exchange rate, Bakong KHQR settlement, and Telegram bot.'}
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleSaveSettings}
          className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
        >
          {isSaved ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              <span>{language === 'km' ? 'បានរក្សាទុក!' : 'Saved!'}</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              <span>{language === 'km' ? 'រក្សាទុកការកំណត់' : 'Save Changes'}</span>
            </>
          )}
        </Button>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-5">
        {/* 1. Cambodian Financials & Currency Rules */}
        <div className="p-5 sm:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? '១. រូបិយប័ណ្ណ និងអត្រាប្តូរប្រាក់ (USD / KHR)' : '1. Currency & Exchange Rates'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'រូបិយប័ណ្ណគោល (Base Currency)' : 'Base Currency'}
              </label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as 'USD' | 'KHR')}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
              >
                <option value="USD">USD ($) - United States Dollar</option>
                <option value="KHR">KHR (៛) - Cambodian Riel</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'អត្រាប្តូរប្រាក់ (1 USD = ? KHR)' : 'Exchange Rate (1 USD = ? KHR)'} *
              </label>
              <input
                type="number"
                value={exchangeRate}
                onChange={(e) => {
                  setExchangeRate(parseInt(e.target.value) || 0)
                  if (errors.exchangeRate) setErrors((prev) => ({ ...prev, exchangeRate: '' }))
                }}
                placeholder="4100"
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm font-mono outline-none transition-colors ${
                  errors.exchangeRate
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {errors.exchangeRate && (
                <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                  {errors.exchangeRate}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'ពន្ធ VAT (%)' : 'VAT Tax Rate (%)'}
              </label>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => {
                  setVatRate(parseFloat(e.target.value) || 0)
                  if (errors.vatRate) setErrors((prev) => ({ ...prev, vatRate: '' }))
                }}
                placeholder="10"
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                  errors.vatRate
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {errors.vatRate && (
                <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                  {errors.vatRate}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'ថ្លៃសេវា (%)' : 'Service Charge (%)'}
              </label>
              <input
                type="number"
                value={serviceChargeRate}
                onChange={(e) => {
                  setServiceChargeRate(parseFloat(e.target.value) || 0)
                  if (errors.serviceChargeRate) setErrors((prev) => ({ ...prev, serviceChargeRate: '' }))
                }}
                placeholder="0"
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                  errors.serviceChargeRate
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {errors.serviceChargeRate && (
                <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                  {errors.serviceChargeRate}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Bakong KHQR Settlement */}
        <div className="p-5 sm:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? '២. គណនីទូទាត់បាគង KHQR' : '2. Bakong KHQR Settlement Account'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'លេខគណនីបាគង (Bakong Account ID)' : 'Bakong Account ID'} *
              </label>
              <input
                type="text"
                value={bakongAccountId}
                onChange={(e) => {
                  setBakongAccountId(e.target.value)
                  if (errors.bakongAccountId) setErrors((prev) => ({ ...prev, bakongAccountId: '' }))
                }}
                placeholder="e.g. bistro_sr@aclb"
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm font-mono outline-none transition-colors ${
                  errors.bakongAccountId
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {errors.bakongAccountId && (
                <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                  {errors.bakongAccountId}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'ធនាគារទទួលប្រាក់ (Acquiring Bank)' : 'Acquiring Bank'} *
              </label>
              <select
                value={bakongAcquiringBank}
                onChange={(e) => setBakongAcquiringBank(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
              >
                {acquiringBanks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះបង្ហាញលើ QR (Merchant Display Name)' : 'Merchant Display Name'} *
            </label>
            <input
              type="text"
              value={bakongMerchantName}
              onChange={(e) => {
                setBakongMerchantName(e.target.value)
                if (errors.bakongMerchantName) setErrors((prev) => ({ ...prev, bakongMerchantName: '' }))
              }}
              placeholder="e.g. SIEM REAP BISTRO"
              className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                errors.bakongMerchantName
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
              }`}
            />
            {errors.bakongMerchantName && (
              <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                {errors.bakongMerchantName}
              </div>
            )}
          </div>
        </div>

        {/* 3. Telegram Instant Order & Payment Bot */}
        <div className="p-5 sm:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <Send className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? '៣. ប្រព័ន្ធជូនដំណឹង Telegram (Bot Alert)' : '3. Telegram Order & Payment Alert Bot'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                Telegram Bot Token
              </label>
              <input
                type="text"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="e.g. 7123456789:AAHKJ..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                Telegram Chat ID / Channel ID
              </label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. -10019283746"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
