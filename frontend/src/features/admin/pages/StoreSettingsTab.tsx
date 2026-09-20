import { useState, type FC } from 'react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'
import { Button } from '@/components/ui/Button'

export const StoreSettingsTab: FC = () => {
  const { language } = useLanguageStore()
  const { branch, updateBranch, updateBusinessProfile } = useOnboardingStore()

  // Financial Settings State (empty by default if user hasn't input it)
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'KHR'>('USD')
  const [exchangeRate, setExchangeRate] = useState('')
  const [vatRate, setVatRate] = useState('')
  const [serviceChargeRate, setServiceChargeRate] = useState('')

  // Bakong KHQR Settings State
  const [bakongAccountId, setBakongAccountId] = useState(branch.bakong_account_id || '')
  const [bakongMerchantName, setBakongMerchantName] = useState(branch.bakong_merchant_name || '')
  const [bakongAcquiringBank, setBakongAcquiringBank] = useState(branch.bakong_acquiring_bank || 'ABA Bank')

  // Telegram Alert State
  const [telegramBotToken, setTelegramBotToken] = useState('')

  // Inline Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaved, setIsSaved] = useState(false)

  const validate = () => {
    const errs: Record<string, string> = {}
    const parsedExchange = parseFloat(exchangeRate)
    if (!exchangeRate.trim() || isNaN(parsedExchange) || parsedExchange <= 0) {
      errs.exchangeRate = language === 'km' ? 'សូមបញ្ចូលអត្រាប្តូរប្រាក់ឱ្យបានត្រឹមត្រូវ' : 'Please enter a valid exchange rate'
    }
    if (vatRate.trim()) {
      const parsedVat = parseFloat(vatRate)
      if (isNaN(parsedVat) || parsedVat < 0 || parsedVat > 100) {
        errs.vatRate = language === 'km' ? 'អត្រាពន្ធ VAT ត្រូវនៅចន្លោះ ០ ទៅ ១០០' : 'VAT rate must be between 0% and 100%'
      }
    }
    if (serviceChargeRate.trim()) {
      const parsedService = parseFloat(serviceChargeRate)
      if (isNaN(parsedService) || parsedService < 0 || parsedService > 100) {
        errs.serviceChargeRate = language === 'km' ? 'ថ្លៃសេវាត្រូវនៅចន្លោះ ០ ទៅ ១០០' : 'Service charge must be between 0% and 100%'
      }
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
    if (exchangeRate) {
      updateBusinessProfile({
        exchange_rate: parseFloat(exchangeRate) || 4100,
        base_currency: baseCurrency,
      })
    }
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
    <div className="max-w-3xl mx-auto w-full py-2">
      <form onSubmit={handleSaveSettings}>
        {/* Single Combined Main Container */}
        <div className="p-6 sm:p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-8 shadow-none">
          {/* 1. Cambodian Financials & Currency Rules */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? '១. រូបិយប័ណ្ណ និងអត្រាប្តូរប្រាក់ (USD / KHR)' : '1. Currency & Exchange Rates'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'រូបិយប័ណ្ណគោល (Base Currency)' : 'Base Currency'}
                </label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value as 'USD' | 'KHR')}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
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
                  type="text"
                  inputMode="numeric"
                  value={exchangeRate}
                  onChange={(e) => {
                    const numericVal = e.target.value.replace(/[^0-9]/g, '')
                    setExchangeRate(numericVal)
                    if (errors.exchangeRate) setErrors((prev) => ({ ...prev, exchangeRate: '' }))
                  }}
                  placeholder={language === 'km' ? 'បញ្ចូលអត្រាប្តូរប្រាក់' : 'Enter exchange rate'}
                  className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm font-mono outline-none transition-colors shadow-none ${
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
                  type="text"
                  inputMode="numeric"
                  value={vatRate}
                  onChange={(e) => {
                    const numericVal = e.target.value.replace(/[^0-9]/g, '')
                    setVatRate(numericVal)
                    if (errors.vatRate) setErrors((prev) => ({ ...prev, vatRate: '' }))
                  }}
                  placeholder={language === 'km' ? 'បញ្ចូលពន្ធ VAT (%)' : 'Enter VAT (%)'}
                  className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors shadow-none ${
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
                  type="text"
                  inputMode="numeric"
                  value={serviceChargeRate}
                  onChange={(e) => {
                    const numericVal = e.target.value.replace(/[^0-9]/g, '')
                    setServiceChargeRate(numericVal)
                    if (errors.serviceChargeRate) setErrors((prev) => ({ ...prev, serviceChargeRate: '' }))
                  }}
                  placeholder={language === 'km' ? 'បញ្ចូលថ្លៃសេវា (%)' : 'Enter service charge (%)'}
                  className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors shadow-none ${
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
          <div className="space-y-4">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? '២. គណនីទូទាត់បាគង KHQR' : '2. Bakong KHQR Settlement Account'}
            </h3>

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
                  placeholder={language === 'km' ? 'បញ្ចូលលេខគណនីបាគង' : 'Enter Bakong Account ID'}
                  className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm font-mono outline-none transition-colors shadow-none ${
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
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
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
                placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះបង្ហាញលើ QR' : 'Enter Merchant Display Name'}
                className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors shadow-none ${
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
          <div className="space-y-4">
            <h3 className="font-bold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
              {language === 'km' ? '៣. ប្រព័ន្ធជូនដំណឹង Telegram (Bot Alert)' : '3. Telegram Order & Payment Alert Bot'}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                Telegram Bot Token
              </label>
              <input
                type="text"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder={language === 'km' ? 'បញ្ចូល Telegram Bot Token' : 'Enter Telegram Bot Token'}
                className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
              />
            </div>
          </div>

          {/* Bottom Save Button */}
          <div className="pt-4 flex items-center justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-full"
            >
              {isSaved
                ? (language === 'km' ? 'បានរក្សាទុក!' : 'Saved!')
                : (language === 'km' ? 'រក្សាទុកការកំណត់' : 'Save Changes')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
