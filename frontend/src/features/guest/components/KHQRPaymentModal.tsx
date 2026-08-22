import { useState, type FC } from 'react'
import { ExternalLink, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { formatUSD, formatKHR, DEFAULT_EXCHANGE_RATE } from '@/lib/currency'
import { playSuccessSound } from '@/lib/audio'

export interface KHQRPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  totalUSD: number
  merchantName?: string
  tableNumber?: string
  isSettled?: boolean
  onSimulateSettlement?: () => void
}

export const KHQRPaymentModal: FC<KHQRPaymentModalProps> = ({
  isOpen,
  onClose,
  totalUSD,
  merchantName = 'Bistro Siem Reap',
  tableNumber = '08',
  isSettled = false,
  onSimulateSettlement,
}) => {
  const { t, language } = useLanguageStore()
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD')

  const totalKHR = Math.round(totalUSD * DEFAULT_EXCHANGE_RATE)
  const displayAmount = currency === 'USD' ? formatUSD(totalUSD) : formatKHR(totalKHR)

  const handleSimulate = () => {
    playSuccessSound()
    onSimulateSettlement?.()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isSettled ? (language === 'km' ? 'ការទូទាត់ជោគជ័យ' : 'Payment Settled') : t('bakongKHQR')}
      description={isSettled ? undefined : (language === 'km' ? 'ស្កេនជាមួយ App ធនាគារណាមួយនៅកម្ពុជា' : 'Scan with any Cambodian Mobile Banking App')}
      isBottomSheet={true}
    >
      <div className="space-y-5 pb-2 text-center">
        {isSettled ? (
          /* Payment Success Confirmation */
          <div className="py-6 space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'ទទួលបានការទូទាត់រួចរាល់' : 'Thank You! Payment Received'}
              </h4>
              <p className="text-xs text-zinc-500">
                {language === 'km'
                  ? 'វិក្កយបត្រត្រូវបានគិតប្រាក់ជោគជ័យ។ សូមអរគុណសម្រាប់ការគាំទ្រ!'
                  : 'Your bill has been settled successfully. Thank you for dining with us!'}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs space-y-1.5 font-mono max-w-xs mx-auto">
              <div className="flex justify-between">
                <span className="text-zinc-500">Table:</span>
                <span className="font-semibold">{tableNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Total Paid:</span>
                <span className="font-bold text-emerald-600">{displayAmount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Method:</span>
                <span className="font-semibold">Bakong Dynamic KHQR</span>
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full"
              size="md"
              onClick={onClose}
            >
              {t('close')}
            </Button>
          </div>
        ) : (
          /* Active KHQR Payment Screen */
          <>
            {/* Currency Switcher Tabs */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
                <button
                  onClick={() => setCurrency('USD')}
                  className={`px-4 py-1.5 rounded-md transition-colors ${
                    currency === 'USD'
                      ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Pay in USD ($)
                </button>
                <button
                  onClick={() => setCurrency('KHR')}
                  className={`px-4 py-1.5 rounded-md transition-colors ${
                    currency === 'KHR'
                      ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Pay in KHR (៛)
                </button>
              </div>
            </div>

            {/* Dynamic KHQR Graphic */}
            <div className="w-56 h-56 mx-auto bg-white p-4 rounded-xl border border-zinc-200 flex flex-col items-center justify-between">
              {/* Bakong Logo Header inside QR */}
              <div className="text-[10px] font-bold text-red-600 tracking-wider uppercase font-mono">
                KHQR • BAKONG
              </div>

              {/* Vector QR Code */}
              <svg viewBox="0 0 100 100" className="w-40 h-40 text-zinc-950 fill-current">
                <path d="M10,10 h30 v30 h-30 z M16,16 v18 h18 v-18 z M22,22 h6 v6 h-6 z" />
                <path d="M60,10 h30 v30 h-30 z M66,16 v18 h18 v-18 z M72,22 h6 v6 h-6 z" />
                <path d="M10,60 h30 v30 h-30 z M16,66 v18 h18 v-18 z M22,72 h6 v6 h-6 z" />
                <rect x="48" y="10" width="6" height="6" />
                <rect x="48" y="22" width="6" height="12" />
                <rect x="10" y="48" width="12" height="6" />
                <rect x="28" y="48" width="6" height="6" />
                <rect x="48" y="48" width="12" height="12" />
                <rect x="66" y="48" width="6" height="6" />
                <rect x="78" y="48" width="12" height="6" />
                <rect x="48" y="66" width="6" height="12" />
                <rect x="60" y="66" width="12" height="6" />
                <rect x="78" y="66" width="6" height="24" />
                <rect x="60" y="78" width="12" height="6" />
                <rect x="48" y="84" width="6" height="6" />
              </svg>

              <div className="text-[9px] font-mono text-zinc-400">
                EMVCo Standard • Instant Settlement
              </div>
            </div>

            {/* Total Payable Display */}
            <div className="space-y-1">
              <span className="text-xs text-zinc-500 block">{merchantName} • Table {tableNumber}</span>
              <div className="text-3xl font-extrabold text-zinc-950 dark:text-zinc-50 font-mono">
                {displayAmount}
              </div>
              <CurrencyDisplay amountUSD={totalUSD} className="text-xs text-zinc-500 font-normal justify-center" />
            </div>

            {/* Deep Link & Simulation Action */}
            <div className="space-y-2 pt-2">
              <a
                href={`bakong://qr?data=EMVCO_KHQR_${totalUSD}`}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{language === 'km' ? 'បើកកម្មវិធីបាគង (Open Bakong App)' : 'Open in Bakong App'}</span>
              </a>

              {/* Dev Simulation button for instant test */}
              <button
                onClick={handleSimulate}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline pt-1 block mx-auto font-medium"
              >
                {language === 'km' ? 'ចុចទីនេះដើម្បីសាកល្បងថាបានបង់ប្រាក់រួច (Demo)' : 'Simulate Successful Payment (Demo)'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
