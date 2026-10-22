import { useState, type FC } from 'react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage } from '@/lib/api-error'
import type { components } from '@/types/api'
import { useBusinesses, useBusiness, useBranch, useUpdateBusiness } from '../hooks/useTenantQueries'
import { useUploadMedia } from '../hooks/useMediaQueries'
import { BranchMenuSettings } from '../components/menu/BranchMenuSettings'
import { TenantSubscriptionCard } from '../components/settings/TenantSubscriptionCard'
import { TenantAuditLogsCard } from '../components/settings/TenantAuditLogsCard'
import { EmenuLoader } from '@/components/ui/EmenuLoader'

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
  const storedBranchId = localStorage.getItem('emenu_branch_id')
  const business = businesses.find((b) => b.id === storedBusinessId) ?? businesses[0]
  const orgId =
    localStorage.getItem('emenu_tenant_id') || localStorage.getItem('emenu_organization_id')

  const { data: directBusiness } = useBusiness(business?.id ?? null)
  const { data: directBranch } = useBranch(business?.id ?? null, storedBranchId)

  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center">
        <EmenuLoader
          size="md"
          message={language === 'km' ? 'កំពុងផ្ទុកការកំណត់...' : 'Loading store settings...'}
        />
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

  return (
    <div className="max-w-4xl mx-auto w-full py-2 space-y-6">
      {/* 1. Store & KHQR Setup Containers */}
      <StoreSettingsForm key={(directBusiness ?? business).id} business={directBusiness ?? business} />

      {/* Active Branch Overview */}
      {directBranch && (
        <div className="flex items-center justify-between px-5 py-3 rounded-2xl bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {language === 'km' ? directBranch.name_km || directBranch.name_en : directBranch.name_en}
            </span>
            {directBranch.code && (
              <span className="font-mono text-zinc-400">({directBranch.code})</span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              MAIN
            </span>
          </div>
          {directBranch.address && (
            <span className="truncate max-w-xs text-zinc-500 dark:text-zinc-400">{directBranch.address}</span>
          )}
        </div>
      )}

      {/* 2. Branch Menus & Overrides Container */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'ការកែប្រែទិន្នន័យមុខម្ហូបតាមសាខា' : 'Branch Menu Overrides'}
        </h3>
        <BranchMenuSettings />
      </div>

      {/* 3. Tenant Subscription & Resource Limits */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'គម្រោងសេវាកម្ម និងកម្រិតធនធាន' : 'Subscription & Resource Limits'}
        </h3>
        <TenantSubscriptionCard orgId={orgId} />
      </div>

      {/* 4. Organization Audit Trail */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm sm:text-base text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'កំណត់ត្រាសវនកម្មប្រតិបត្តិការ' : 'Operational Audit Trail'}
        </h3>
        <TenantAuditLogsCard orgId={orgId} />
      </div>
    </div>
  )
}

const toFormNumber = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(Number(value))

const StoreSettingsForm: FC<{ business: Business }> = ({ business }) => {
  const { language } = useLanguageStore()
  const updateBusiness = useUpdateBusiness()
  const uploadMedia = useUploadMedia(business.id)

  // Store profile & branding
  const [nameEn, setNameEn] = useState(business.name_en || '')
  const [nameKm, setNameKm] = useState(business.name_km || '')
  const [logoUrl, setLogoUrl] = useState<string | null>(business.logo_url || null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // Financial settings, starting from what is saved for this business
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'KHR'>(
    business.base_currency === 'KHR' ? 'KHR' : 'USD'
  )
  const [exchangeRate, setExchangeRate] = useState(toFormNumber(business.exchange_rate))
  const [vatRate, setVatRate] = useState(toFormNumber(business.tax_percentage))
  const [serviceChargeRate, setServiceChargeRate] = useState(
    toFormNumber(business.service_charge_percentage)
  )
  const [isTaxInclusive, setIsTaxInclusive] = useState(business.is_tax_inclusive ?? false)
  const [isServiceChargeInclusive, setIsServiceChargeInclusive] = useState(
    business.is_service_charge_inclusive ?? false
  )

  // Bakong KHQR merchant account that receives payments
  const [bakongAccountId, setBakongAccountId] = useState(business.bakong_account_id ?? '')
  const [bakongMerchantName, setBakongMerchantName] = useState(business.bakong_merchant_name ?? '')
  const [bakongAcquiringBank, setBakongAcquiringBank] = useState(
    business.bakong_acquiring_bank ?? ''
  )

  // Validation & save state
  const [currencyErrors, setCurrencyErrors] = useState<Record<string, string>>({})
  const [bakongErrors, setBakongErrors] = useState<Record<string, string>>({})
  const [isSaved, setIsSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Validation 1: Currency & Taxes
  const validateCurrency = () => {
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
    setCurrencyErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Validation 2: Bakong KHQR
  const validateBakong = () => {
    const errs: Record<string, string> = {}
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
    setBakongErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Unified save handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const currencyOk = validateCurrency()
    const bakongOk = validateBakong()
    if (!currencyOk || !bakongOk) return

    setSaveError('')
    setIsSaving(true)
    const accountId = bakongAccountId.trim()
    try {
      await updateBusiness.mutateAsync({
        businessId: business.id,
        payload: {
          name_en: nameEn.trim() || business.name_en,
          name_km: nameKm.trim() || null,
          logo_url: logoUrl || null,
          base_currency: baseCurrency,
          exchange_rate: exchangeRate,
          tax_percentage: vatRate || '0',
          is_tax_inclusive: isTaxInclusive,
          service_charge_percentage: serviceChargeRate || '0',
          is_service_charge_inclusive: isServiceChargeInclusive,
          bakong_account_id: accountId || null,
          bakong_merchant_name: accountId ? bakongMerchantName.trim() : null,
          bakong_acquiring_bank: accountId ? (bakongAcquiringBank || null) : null,
        },
      })
      if (nameEn.trim()) localStorage.setItem('emenu_business_name_en', nameEn.trim())
      if (nameKm.trim()) localStorage.setItem('emenu_business_name_km', nameKm.trim())
      if (logoUrl) {
        localStorage.setItem('emenu_business_logo', logoUrl)
      } else {
        localStorage.removeItem('emenu_business_logo')
      }
      window.dispatchEvent(
        new CustomEvent('emenu:business-updated', {
          detail: {
            name_en: nameEn.trim(),
            name_km: nameKm.trim(),
            logo_url: logoUrl,
          },
        })
      )
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      setSaveError(
        getApiErrorMessage(
          err,
          language === 'km' ? 'មិនអាចរក្សាទុកការកំណត់បានទេ' : 'Could not save the settings.'
        )
      )
    } finally {
      setIsSaving(false)
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
    <form onSubmit={handleSave} className="w-full space-y-6">
      {/* 1. Store Identity & Logo */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-none">
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {language === 'km' ? '១. ព័ត៌មាន និងរូបសញ្ញាហាង (Store Identity & Logo)' : '1. Store Identity & Logo'}
          </h3>
        </div>
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Store logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  LOGO
                </span>
              )}
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {language === 'km' ? 'រូបសញ្ញាហាង (Store Logo)' : 'Store Logo'}
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer">
                  <span>
                    {isUploadingLogo
                      ? (language === 'km' ? 'កំពុងបញ្ចូល...' : 'Uploading...')
                      : (language === 'km' ? 'បញ្ចូលរូបភាព' : 'Upload Logo')}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingLogo}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setIsUploadingLogo(true)
                      try {
                        const { url } = await uploadMedia.mutateAsync(file)
                        setLogoUrl(url)
                      } catch {
                        const fallbackUrl = URL.createObjectURL(file)
                        setLogoUrl(fallbackUrl)
                      } finally {
                        setIsUploadingLogo(false)
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <span>{language === 'km' ? 'លុបចេញ' : 'Remove'}</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {language === 'km'
                  ? 'ប្រសិនបើមិនទាន់មានរូបសញ្ញា ប្រព័ន្ធនឹងបង្ហាញរូបតំណាងម៉ឺនុយជំនួសវិញ។'
                  : 'If no logo is uploaded, the header displays the menu icon instead.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'ឈ្មោះហាង (ភាសាអង់គ្លេស)' : 'Store Name (English)'}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះហាងជាភាសាអង់គ្លេស' : 'Enter store name in English'}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'ឈ្មោះហាង (ភាសាខ្មែរ)' : 'Store Name (Khmer)'}
              </label>
              <input
                type="text"
                value={nameKm}
                onChange={(e) => setNameKm(e.target.value)}
                placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះហាងជាភាសាខ្មែរ' : 'Enter store name in Khmer'}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Currency & Exchange Rates */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-none">
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {language === 'km' ? '២. រូបិយប័ណ្ណ និងអត្រាប្តូរប្រាក់ (USD / KHR)' : '2. Currency & Exchange Rates'}
          </h3>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'រូបិយប័ណ្ណគោល (Base Currency)' : 'Base Currency'}
              </label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as 'USD' | 'KHR')}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
              >
                <option value="USD">USD ($) - United States Dollar</option>
                <option value="KHR">KHR (៛) - Cambodian Riel</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'អត្រាប្តូរប្រាក់ (1 USD = ? KHR)' : 'Exchange Rate (1 USD = ? KHR)'} *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={exchangeRate}
                onChange={(e) => {
                  const numericVal = e.target.value.replace(/[^0-9]/g, '')
                  setExchangeRate(numericVal)
                  if (currencyErrors.exchangeRate) setCurrencyErrors((prev) => ({ ...prev, exchangeRate: '' }))
                }}
                placeholder={language === 'km' ? 'បញ្ចូលអត្រាប្តូរប្រាក់' : 'Enter exchange rate'}
                className={`w-full px-3.5 py-2 rounded-xl border bg-white dark:bg-zinc-900/50 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors shadow-none ${
                  currencyErrors.exchangeRate
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {currencyErrors.exchangeRate && (
                <div className="text-red-600 dark:text-red-400 text-xs font-normal mt-1">
                  {currencyErrors.exchangeRate}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'អត្រាពន្ធ VAT (%)' : 'VAT Tax Rate (%)'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={vatRate}
                onChange={(e) => {
                  const numericVal = e.target.value.replace(/[^0-9.]/g, '')
                  setVatRate(numericVal)
                  if (currencyErrors.vatRate) setCurrencyErrors((prev) => ({ ...prev, vatRate: '' }))
                }}
                placeholder={language === 'km' ? 'បញ្ចូលអត្រាពន្ធ VAT (%)' : 'Enter VAT (%)'}
                className={`w-full px-3.5 py-2 rounded-xl border bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors shadow-none ${
                  currencyErrors.vatRate
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {currencyErrors.vatRate && (
                <div className="text-red-600 dark:text-red-400 text-xs font-normal mt-1">
                  {currencyErrors.vatRate}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'ថ្លៃសេវា (%)' : 'Service Charge (%)'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={serviceChargeRate}
                onChange={(e) => {
                  const numericVal = e.target.value.replace(/[^0-9.]/g, '')
                  setServiceChargeRate(numericVal)
                  if (currencyErrors.serviceChargeRate) setCurrencyErrors((prev) => ({ ...prev, serviceChargeRate: '' }))
                }}
                placeholder={language === 'km' ? 'បញ្ចូលថ្លៃសេវា (%)' : 'Enter service charge (%)'}
                className={`w-full px-3.5 py-2 rounded-xl border bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors shadow-none ${
                  currencyErrors.serviceChargeRate
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {currencyErrors.serviceChargeRate && (
                <div className="text-red-600 dark:text-red-400 text-xs font-normal mt-1">
                  {currencyErrors.serviceChargeRate}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs font-normal text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isTaxInclusive}
                onChange={(e) => setIsTaxInclusive(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
              />
              <span>{language === 'km' ? 'តម្លៃមុខម្ហូបរួមបញ្ចូល VAT រួចហើយ' : 'Menu prices already include VAT'}</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-normal text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isServiceChargeInclusive}
                onChange={(e) => setIsServiceChargeInclusive(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
              />
              <span>{language === 'km' ? 'តម្លៃមុខម្ហូបរួមបញ្ចូលថ្លៃសេវារួចហើយ' : 'Menu prices already include the service charge'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Bakong KHQR Settlement */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-none">
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {language === 'km' ? '៣. គណនីទូទាត់បាគង KHQR' : '3. Bakong KHQR Settlement Account'}
          </h3>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'លេខគណនីបាគង (Bakong Account ID)' : 'Bakong Account ID'} *
              </label>
              <input
                type="text"
                value={bakongAccountId}
                onChange={(e) => {
                  setBakongAccountId(e.target.value)
                  if (bakongErrors.bakongAccountId) setBakongErrors((prev) => ({ ...prev, bakongAccountId: '' }))
                }}
                placeholder={language === 'km' ? 'បញ្ចូលលេខគណនីបាគង' : 'Enter Bakong Account ID'}
                className={`w-full px-3.5 py-2 rounded-xl border bg-white dark:bg-zinc-900/50 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors shadow-none ${
                  bakongErrors.bakongAccountId
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              />
              {bakongErrors.bakongAccountId && (
                <div className="text-red-600 dark:text-red-400 text-xs font-normal mt-1">
                  {bakongErrors.bakongAccountId}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {language === 'km' ? 'ធនាគារទទួលប្រាក់ (Acquiring Bank)' : 'Acquiring Bank'} *
              </label>
              <select
                value={bakongAcquiringBank}
                onChange={(e) => {
                  setBakongAcquiringBank(e.target.value)
                  if (bakongErrors.bakongAcquiringBank) {
                    setBakongErrors((prev) => ({ ...prev, bakongAcquiringBank: '' }))
                  }
                }}
                className={`w-full px-3.5 py-2 rounded-xl border bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 outline-none transition-colors shadow-none ${
                  bakongErrors.bakongAcquiringBank
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100'
                }`}
              >
                <option value="">{language === 'km' ? 'ជ្រើសរើសធនាគារ' : 'Select Bank'}</option>
                {acquiringBanks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              {bakongErrors.bakongAcquiringBank && (
                <div className="text-red-600 dark:text-red-400 text-xs font-normal mt-1">
                  {bakongErrors.bakongAcquiringBank}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
              {language === 'km' ? 'ឈ្មោះបង្ហាញលើ QR (Merchant Display Name)' : 'Merchant Display Name'} *
            </label>
            <input
              type="text"
              value={bakongMerchantName}
              onChange={(e) => {
                setBakongMerchantName(e.target.value)
                if (bakongErrors.bakongMerchantName) setBakongErrors((prev) => ({ ...prev, bakongMerchantName: '' }))
              }}
              placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះបង្ហាញលើ QR' : 'Enter Merchant Display Name'}
              className={`w-full px-3.5 py-2 rounded-xl border bg-white dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none transition-colors shadow-none ${
                bakongErrors.bakongMerchantName
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100'
              }`}
            />
            {bakongErrors.bakongMerchantName && (
              <div className="text-red-600 dark:text-red-400 text-xs font-normal mt-1">
                {bakongErrors.bakongMerchantName}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Telegram Bot Alert */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-none">
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {language === 'km' ? '៤. ប្រព័ន្ធជូនដំណឹង Telegram (Bot Alert)' : '4. Telegram Alert Bot'}
          </h3>
        </div>
        <div className="p-5 sm:p-6 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
              Telegram Bot Token
            </label>
            <input
              type="text"
              disabled
              value=""
              placeholder={language === 'km' ? 'មិនទាន់អាចប្រើបាន' : 'Not available yet'}
              className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-500 outline-none shadow-none cursor-not-allowed"
            />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {language === 'km'
                ? 'ការជូនដំណឹង Telegram នឹងអាចកំណត់បាន នៅពេលប្រព័ន្ធអាចរក្សាទុក Bot Token ដោយការអ៊ិនគ្រីប។'
                : 'Telegram alerts will be configurable once bot tokens can be stored encrypted.'}
            </p>
          </div>
        </div>
      </div>

      {/* Form Save Button */}
      <div className="pt-1 flex items-center justify-end">
        {saveError && (
          <p role="alert" className="mr-3 text-xs font-normal text-red-600 dark:text-red-400">
            {saveError}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={isSaving}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-xl shadow-none transition-colors"
        >
          {isSaving
            ? (language === 'km' ? 'កំពុងរក្សាទុក...' : 'Saving...')
            : isSaved
            ? (language === 'km' ? 'បានរក្សាទុក!' : 'Saved!')
            : (language === 'km' ? 'រក្សាទុកការកំណត់' : 'Save Changes')}
        </Button>
      </div>
    </form>
  )
}
