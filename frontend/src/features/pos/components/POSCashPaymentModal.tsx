import { useState, useMemo, type FC } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { calculateCashChange, roundToNearest100Riel } from '../stores/usePOSStore'

export interface POSCashPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  totalUSD: number
  exchangeRate?: number
  tableNumber?: string
  onConfirmSettlement: (result: {
    tenderedUSD: number
    tenderedKHR: number
    changeUSD: number
    changeKHR: number
  }) => Promise<void>
  isSubmitting?: boolean
}

export const POSCashPaymentModal: FC<POSCashPaymentModalProps> = ({
  isOpen,
  onClose,
  totalUSD,
  exchangeRate = 4100,
  tableNumber = 'T-01',
  onConfirmSettlement,
  isSubmitting = false,
}) => {
  const { language } = useLanguageStore()

  const [tenderedUSDStr, setTenderedUSDStr] = useState<string>('')
  const [tenderedKHRStr, setTenderedKHRStr] = useState<string>('')
  const [preference, setPreference] = useState<'khr' | 'usd' | 'split'>('khr')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const tenderedUSD = parseFloat(tenderedUSDStr) || 0
  const tenderedKHR = parseInt(tenderedKHRStr, 10) || 0

  const totalKHR = roundToNearest100Riel(totalUSD * exchangeRate)

  // Calculate change with 100-Riel rounding
  const changeResult = useMemo(() => {
    return calculateCashChange(totalUSD, exchangeRate, tenderedUSD, tenderedKHR, preference)
  }, [totalUSD, exchangeRate, tenderedUSD, tenderedKHR, preference])

  // Quick Preset Actions
  const handleQuickTenderUSD = (amount: number) => {
    setTenderedUSDStr(amount.toString())
    setTenderedKHRStr('')
    setErrorMsg(null)
  }

  const handleQuickTenderKHR = (amount: number) => {
    setTenderedKHRStr(amount.toString())
    setTenderedUSDStr('')
    setErrorMsg(null)
  }

  const handleExactCash = () => {
    setTenderedUSDStr(totalUSD.toFixed(2))
    setTenderedKHRStr('')
    setErrorMsg(null)
  }

  const handleSettle = async () => {
    if (!changeResult.is_exact_or_sufficient) {
      setErrorMsg(
        language === 'km'
          ? 'ចំនួនទឹកប្រាក់ដែលទទួលបានមិនទាន់គ្រប់គ្រាន់ទេ។'
          : 'Total tendered cash is less than the bill total.'
      )
      return
    }

    try {
      await onConfirmSettlement({
        tenderedUSD,
        tenderedKHR,
        changeUSD: changeResult.change_usd,
        changeKHR: changeResult.change_khr,
      })
      onClose()
    } catch {
      setErrorMsg(
        language === 'km' ? 'មិនអាចទូទាត់ប្រាក់បានទេ។ សូមព្យាយាមម្តងទៀត។' : 'Failed to settle payment.'
      )
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'km' ? `គិតប្រាក់សុទ្ធ (100៛) — តុ ${tableNumber}` : `Cash Settlement (100៛) — Table ${tableNumber}`}
      description={language === 'km' ? 'ប្រព័ន្ធគណនាប្រាក់អាប់ដោយស្វ័យប្រវត្តិតាមស្តង់ដារធនាគារជាតិ' : 'Automatic 100-Riel change calculation'}
      isBottomSheet={true}
    >
      <div className="space-y-4 pb-2">
        {/* 1. Grand Total Display */}
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-500 block leading-tight">
              {language === 'km' ? 'ទឹកប្រាក់ត្រូវទូទាត់' : 'Grand Total Due'}:
            </span>
            <div className="text-2xl font-extrabold text-zinc-950 dark:text-zinc-50 font-mono">
              ${totalUSD.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-500 font-mono">@ {exchangeRate.toLocaleString()} ៛/USD</span>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {totalKHR.toLocaleString()} ៛
            </div>
          </div>
        </div>

        {/* 2. Quick Tender Buttons */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
            {language === 'km' ? 'ជ្រើសរើសលឿន (Quick Tender)' : 'Quick Tender'}:
          </span>
          <div className="flex flex-wrap gap-1.5 text-xs font-mono font-semibold">
            <button
              onClick={handleExactCash}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Exact (${totalUSD.toFixed(2)})
            </button>
            <button
              onClick={() => handleQuickTenderUSD(10)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              $10
            </button>
            <button
              onClick={() => handleQuickTenderUSD(20)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              $20
            </button>
            <button
              onClick={() => handleQuickTenderUSD(50)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              $50
            </button>
            <button
              onClick={() => handleQuickTenderUSD(100)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              $100
            </button>
            <button
              onClick={() => handleQuickTenderKHR(50000)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              50,000 ៛
            </button>
            <button
              onClick={() => handleQuickTenderKHR(100000)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              100,000 ៛
            </button>
          </div>
        </div>

        {/* 3. Dual-Currency Tendered Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              USD Received ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={tenderedUSDStr}
              onChange={(e) => {
                setTenderedUSDStr(e.target.value)
                setErrorMsg(null)
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              KHR Received (៛)
            </label>
            <input
              type="number"
              step="100"
              value={tenderedKHRStr}
              onChange={(e) => {
                setTenderedKHRStr(e.target.value)
                setErrorMsg(null)
              }}
              placeholder="0"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* 4. Change Currency Preference */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-zinc-500">
            {language === 'km' ? 'រូបិយប័ណ្ណប្រាក់អាប់' : 'Change Preference'}:
          </span>
          <div className="inline-flex rounded-lg p-0.5 bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold">
            <button
              onClick={() => setPreference('khr')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                preference === 'khr'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-zinc-500'
              }`}
            >
              KHR (៛)
            </button>
            <button
              onClick={() => setPreference('usd')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                preference === 'usd'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-zinc-500'
              }`}
            >
              USD ($)
            </button>
          </div>
        </div>

        {/* 5. Change Output Summary */}
        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 space-y-1 text-xs font-mono">
          <div className="flex justify-between text-zinc-500">
            <span>{language === 'km' ? 'ប្រាក់ទទួលសរុប' : 'Total Tendered'}:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              ${changeResult.total_tendered_usd.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm font-bold pt-1 border-t border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-700 dark:text-zinc-300 font-sans">
              {language === 'km' ? 'ប្រាក់អាប់ (100៛)' : 'Change Returned'}:
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 text-base">
              {preference === 'usd'
                ? `$${changeResult.change_usd.toFixed(2)} + ${changeResult.change_khr.toLocaleString()} ៛`
                : `${changeResult.change_khr.toLocaleString()} ៛ ($${(changeResult.change_khr / exchangeRate).toFixed(2)})`}
            </span>
          </div>
        </div>

        {/* Inline Error (Clean Red Text, No Outer Container) */}
        {errorMsg && (
          <div className="text-xs text-red-500 text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* 6. Settlement Confirm Action */}
        <button
          onClick={handleSettle}
          disabled={!changeResult.is_exact_or_sufficient || isSubmitting}
          className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Check className="w-4 h-4" />
          <span>
            {isSubmitting
              ? (language === 'km' ? 'កំពុងទូទាត់...' : 'Settling Payment...')
              : (language === 'km' ? 'បញ្ជាក់ការគិតប្រាក់ (Complete Settle)' : 'Confirm & Complete Settlement')}
          </span>
        </button>
      </div>
    </Modal>
  )
}
