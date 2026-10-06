import { useState, type FC } from 'react'
import { Loader2 } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage } from '@/lib/api-error'
import type { components } from '@/types/api'
import { useBusinesses, useUpdateBusiness } from '../hooks/useTenantQueries'

type Business = components['schemas']['BusinessResponse']

// Same rule as the API: Bakong account IDs look like "name@bank".
const BAKONG_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}@[A-Za-z0-9]{2,16}$/
// KHQR (EMVCo tag 59) allows at most 25 characters for the merchant name.
const BAKONG_MERCHANT_NAME_MAX = 25

/** Loads the current business and renders its settings form. */
export const StoreSettingsTab: FC = () => {
  const { language } = useLanguageStore()
  const { data: businesses = [], isLoading, isError } = useBusinesses()
  const storedBusinessId = localStorage.getItem('emenu_business_id')
  const business = businesses.find((b) => b.id === storedBusinessId) ?? businesses[0]

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    )
  }
  if (isError || !business) {
    return (
      <p className="max-w-3xl mx-auto py-8 text-sm text-red-600 dark:text-red-400">
        {language === 'km' ? 'មិនអាចផ្ទុកការកំណត់ហាងបានទេ' : 'Could not load the store settings.'}
      </p>
    )
  }
  // Keyed by business so the form starts from that business's saved values.
  return <StoreSettingsForm key={business.id} business={business} />
}

const toFormNumber = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(Number(value))

const StoreSettingsForm: FC<{ business: Business }> = ({ business }) => {
  const { language } = useLanguageStore()
  const updateBusiness = useUpdateBusiness()

  // Financial settings, starting from what is saved for this business
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'KHR'>(
    business.base_currency === 'KHR' ? 'KHR' : 'USD'
  )
  const [exchangeRate, setExchangeRate] = useState(toFormNumber(business.exchange_rate))
  const [vatRate, setVatRate] = useState(toFormNumber(business.tax_percentage))
  const [serviceChargeRate, setServiceChargeRate] = useState(
    toFormNumber(business.service_charge_percentage)
  )
  const [isTaxInclusive, setIsTaxInclusive] = useState(business.is_tax_inclusive ?? true)
  const [isServiceChargeInclusive, setIsServiceChargeInclusive] = useState(
    business.is_service_charge_inclusive ?? false
  )

  // Bakong KHQR merchant account that receives payments
  const [bakongAccountId, setBakongAccountId] = useState(business.bakong_account_id ?? '')
  const [bakongMerchantName, setBakongMerchantName] = useState(business.bakong_merchant_name ?? '')
  const [bakongAcquiringBank, setBakongAcquiringBank] = useState(
    business.bakong_acquiring_bank ?? 'ABA Bank'
  )

  // Inline Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaved, setIsSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

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
    if (bakongAccountId.trim() && !BAKONG_ACCOUNT_ID_PATTERN.test(bakongAccountId.trim())) {
      errs.bakongAccountId =
        language === 'km'
          ? 'លេខគណនីបាគងត្រូវមានទម្រង់ name@bank'
          : 'Bakong Account ID must look like name@bank'
    }
    if (bakongAccountId.trim() && !bakongMerchantName.trim()) {
      errs.bakongMerchantName = language === 'km' ? 'សូមបញ្ចូលឈ្មោះហាងដែលត្រូវបង្ហាញលើ QR' : 'Store name for QR code is required'
    } else if (bakongMerchantName.trim().length > BAKONG_MERCHANT_NAME_MAX) {
      errs.bakongMerchantName =
        language === 'km'
          ? `ឈ្មោះលើ QR មិនអាចលើស ${BAKONG_MERCHANT_NAME_MAX} តួអក្សរ`
          : `The QR store name can be at most ${BAKONG_MERCHANT_NAME_MAX} characters`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setSaveError('')
    const accountId = bakongAccountId.trim()
    try {
      await updateBusiness.mutateAsync({
        businessId: business.id,
        payload: {
          base_currency: baseCurrency,
          exchange_rate: exchangeRate,
          tax_percentage: vatRate || '0',
          is_tax_inclusive: isTaxInclusive,
          service_charge_percentage: serviceChargeRate || '0',
          is_service_charge_inclusive: isServiceChargeInclusive,
          bakong_account_id: accountId || null,
          bakong_merchant_name: accountId ? bakongMerchantName.trim() : null,
          bakong_acquiring_bank: accountId ? bakongAcquiringBank : null,
        },
      })
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      setSaveError(
        getApiErrorMessage(
          err,
          language === 'km' ? 'មិនអាចរក្សាទុកការកំណត់បានទេ' : 'Could not save the settings.'
        )
      )
    }
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
                    const numericVal = e.target.value.replace(/[^0-9.]/g, '')
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
                    const numericVal = e.target.value.replace(/[^0-9.]/g, '')
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={isTaxInclusive}
                  onChange={(e) => setIsTaxInclusive(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                {language === 'km' ? 'តម្លៃមុខម្ហូបរួមបញ្ចូល VAT រួចហើយ' : 'Menu prices already include VAT'}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={isServiceChargeInclusive}
                  onChange={(e) => setIsServiceChargeInclusive(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                {language === 'km' ? 'តម្លៃមុខម្ហូបរួមបញ្ចូលថ្លៃសេវារួចហើយ' : 'Menu prices already include the service charge'}
              </label>
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
                disabled
                value=""
                placeholder={language === 'km' ? 'មិនទាន់អាចប្រើបាន' : 'Not available yet'}
                className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-sm font-mono outline-none shadow-none cursor-not-allowed"
              />
              <p className="text-xs text-zinc-500">
                {language === 'km'
                  ? 'ការជូនដំណឹង Telegram នឹងអាចកំណត់បាន នៅពេលប្រព័ន្ធអាចរក្សាទុក Bot Token ដោយការអ៊ិនគ្រីប។'
                  : 'Telegram alerts will be configurable once bot tokens can be stored encrypted.'}
              </p>
            </div>
          </div>

          {/* Bottom Save Button */}
          <div className="pt-4 flex items-center justify-end">
            {saveError && (
              <p role="alert" className="mr-4 text-xs font-medium text-red-600 dark:text-red-400">
                {saveError}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={updateBusiness.isPending}
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
