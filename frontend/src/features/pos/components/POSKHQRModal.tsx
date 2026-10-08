import { useState, useEffect, useMemo, type FC } from 'react'
import { QrCode, RefreshCw, Check, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'
import {
  useGenerateSessionKHQR,
  useGenerateOrderKHQR,
  useKHQRAttemptStatus,
  useSettleSessionKHQR,
  useConfirmSessionKHQRManual,
  useSettleOrderKHQR,
  useConfirmOrderKHQRManual,
  type DynamicKHQRResponse,
} from '../hooks/usePaymentQueries'

export interface POSKHQRModalProps {
  isOpen: boolean
  onClose: () => void
  businessId: string | null
  branchId: string | null
  sessionId?: string | null
  orderId?: string | null
  tableNumber?: string
  totalUSD: number
  onSuccessPayment: () => void
}

export const POSKHQRModal: FC<POSKHQRModalProps> = ({
  isOpen,
  onClose,
  businessId,
  branchId,
  sessionId,
  orderId,
  tableNumber = 'T-01',
  totalUSD,
  onSuccessPayment,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'KHR'>('USD')
  const [qrData, setQrData] = useState<DynamicKHQRResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300)
  const [isSettling, setIsSettling] = useState(false)

  // Mutations
  const generateSessionKHQR = useGenerateSessionKHQR(businessId, branchId)
  const generateOrderKHQR = useGenerateOrderKHQR(businessId, branchId)
  const settleSessionKHQR = useSettleSessionKHQR(businessId, branchId)
  const confirmSessionManual = useConfirmSessionKHQRManual(businessId, branchId)
  const settleOrderKHQR = useSettleOrderKHQR(businessId, branchId)
  const confirmOrderManual = useConfirmOrderKHQRManual(businessId, branchId)

  const attemptId = qrData?.attempt_id ?? null

  // Poll status of the generated attempt
  const { data: attemptStatus } = useKHQRAttemptStatus(
    businessId,
    branchId,
    attemptId,
    { enabled: isOpen && !!attemptId && !isSettling }
  )

  // Generate QR on modal open or currency change
  const handleGenerate = async (currency: 'USD' | 'KHR') => {
    setErrorMsg(null)
    setQrData(null)
    try {
      if (sessionId) {
        const res = await generateSessionKHQR.mutateAsync({
          sessionId,
          payload: { currency },
        })
        setQrData(res)
        setSecondsRemaining(300)
      } else if (orderId) {
        const res = await generateOrderKHQR.mutateAsync({
          orderId,
          payload: { currency },
        })
        setQrData(res)
        setSecondsRemaining(300)
      }
    } catch {
      setErrorMsg(
        isKm
          ? 'មិនអាចបង្កើតកូដ KHQR បានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Could not generate KHQR code. Please try again.'
      )
    }
  }

  useEffect(() => {
    if (isOpen && (sessionId || orderId)) {
      handleGenerate(selectedCurrency)
    } else {
      setQrData(null)
      setErrorMsg(null)
      setIsSettling(false)
    }
  }, [isOpen, sessionId, orderId, selectedCurrency])

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !qrData || secondsRemaining <= 0) return
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [isOpen, qrData, secondsRemaining])

  const formatTimer = useMemo(() => {
    const mins = Math.floor(secondsRemaining / 60)
    const secs = secondsRemaining % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }, [secondsRemaining])

  // Automatically settle when poll reports succeeded
  useEffect(() => {
    if (!attemptStatus || isSettling) return

    if (attemptStatus.status === 'succeeded') {
      setIsSettling(true)
      const completeSettlement = async () => {
        try {
          if (sessionId && attemptId) {
            await settleSessionKHQR.mutateAsync({
              sessionId,
              payload: { attempt_id: attemptId },
            })
          } else if (orderId && attemptId) {
            await settleOrderKHQR.mutateAsync({
              orderId,
              payload: { attempt_id: attemptId },
            })
          }
          onSuccessPayment()
          onClose()
        } catch {
          setIsSettling(false)
          setErrorMsg(
            isKm
              ? 'ការទូទាត់បានជោគជ័យ ប៉ុន្តែមិនទាន់អាចបិទវិក្កយបត្របានទេ។'
              : 'Payment received but failed to close bill. Please retry.'
          )
        }
      }
      completeSettlement()
    } else if (attemptStatus.status === 'expired') {
      setErrorMsg(
        isKm
          ? 'កូដ KHQR បានផុតកំណត់ហើយ។ សូមបង្កើតកូដថ្មី។'
          : 'KHQR code has expired. Please regenerate.'
      )
    }
  }, [attemptStatus, isSettling, sessionId, orderId, attemptId, onClose, onSuccessPayment, isKm])

  // Manual cashier confirmation
  const handleManualConfirm = async () => {
    if (!attemptId) return
    setIsSettling(true)
    setErrorMsg(null)
    try {
      if (sessionId) {
        await confirmSessionManual.mutateAsync({
          sessionId,
          payload: { attempt_id: attemptId, reason: 'Cashier confirmed receipt manually' },
        })
      } else if (orderId) {
        await confirmOrderManual.mutateAsync({
          orderId,
          payload: { attempt_id: attemptId, reason: 'Cashier confirmed receipt manually' },
        })
      }
      onSuccessPayment()
      onClose()
    } catch {
      setIsSettling(false)
      setErrorMsg(
        isKm
          ? 'មិនអាចបញ្ជាក់ការទូទាត់ដោយផ្ទាល់បានទេ។'
          : 'Could not confirm payment manually.'
      )
    }
  }

  const isLoading = generateSessionKHQR.isPending || generateOrderKHQR.isPending

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isKm ? `ទូទាត់ Bakong KHQR — តុ ${tableNumber}` : `Bakong KHQR Payment — Table ${tableNumber}`}
      description={
        isKm
          ? 'ស្កេនទូទាត់តាមរយៈកម្មវិធីធនាគារក្នុងប្រទេសកម្ពុជា (Bakong / All Banks)'
          : 'Scan to pay with any Cambodian banking app (Bakong / KHQR)'
      }
      size="md"
    >
      <div className="space-y-4 pb-2">
        {/* Currency Switcher */}
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-50 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setSelectedCurrency('USD')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              selectedCurrency === 'USD'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            USD ($)
          </button>
          <button
            type="button"
            onClick={() => setSelectedCurrency('KHR')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              selectedCurrency === 'KHR'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            KHR (៛)
          </button>
        </div>

        {/* QR Code Presentation Box */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col items-center justify-center min-h-[280px]">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <span className="text-xs text-zinc-500">
                {isKm ? 'កំពុងបង្កើតកូដ KHQR...' : 'Generating dynamic KHQR...'}
              </span>
            </div>
          ) : qrData ? (
            <div className="w-full flex flex-col items-center space-y-3">
              {/* QR Image */}
              <div className="relative p-2 bg-white rounded-lg border border-zinc-200 dark:border-zinc-800">
                <img
                  src={qrData.qr_image_data_url}
                  alt="Bakong Dynamic KHQR"
                  className="w-52 h-52 object-contain"
                />
              </div>

              {/* Amount Display */}
              <div className="text-center space-y-0.5">
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {selectedCurrency === 'USD'
                    ? `$${Number(qrData.amount_usd || totalUSD).toFixed(2)}`
                    : `${qrData.amount_khr.toLocaleString()} ៛`}
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  {selectedCurrency === 'USD'
                    ? `~ ${qrData.amount_khr.toLocaleString()} KHR (@ ${qrData.exchange_rate} ៛)`
                    : `~ $${Number(qrData.amount_usd || totalUSD).toFixed(2)} USD (@ ${qrData.exchange_rate} ៛)`}
                </div>
              </div>

              {/* Status and Countdown */}
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  {isKm ? 'រង់ចាំការទូទាត់...' : 'Waiting for payment...'}
                </span>
                <span className="font-mono text-zinc-500">{formatTimer}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <QrCode className="w-12 h-12 text-zinc-400" />
              <span className="text-xs text-zinc-500">
                {isKm ? 'មិនមានកូដ QR ទេ' : 'No QR code generated'}
              </span>
              <button
                type="button"
                onClick={() => handleGenerate(selectedCurrency)}
                className="mt-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {isKm ? 'ព្យាយាមម្តងទៀត' : 'Retry'}
              </button>
            </div>
          )}
        </div>

        {/* Inline error text */}
        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}

        {/* Action Controls */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!qrData || isSettling}
            onClick={handleManualConfirm}
            className="flex-1 py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isSettling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>{isKm ? 'បញ្ជាក់ការបង់ប្រាក់ដោយផ្ទាល់' : 'Manual Confirm'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleGenerate(selectedCurrency)}
            disabled={isLoading}
            className="py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs flex items-center gap-1 transition-colors"
            title={isKm ? 'បង្កើតកូដឡើងវិញ' : 'Regenerate'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition-colors"
          >
            {isKm ? 'បិទ' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
