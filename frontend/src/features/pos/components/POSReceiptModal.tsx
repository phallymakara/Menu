import { type FC } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useSessionPrecheckReceipt, usePaymentReceipt } from '../hooks/useReceiptQueries'

export interface POSReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  tableNumber?: string
  branchName?: string
  totalUSD: number
  totalKHR: number
  subtotalUSD: number
  taxUSD: number
  paymentMethod?: string
  receiptNumber?: string
  businessId?: string | null
  branchId?: string | null
  sessionId?: string | null
  paymentId?: string | null
}

export const POSReceiptModal: FC<POSReceiptModalProps> = ({
  isOpen,
  onClose,
  tableNumber = 'T-01',
  branchName = 'Siem Reap Bistro',
  totalUSD,
  totalKHR,
  subtotalUSD,
  taxUSD,
  paymentMethod = 'CASH',
  receiptNumber = 'REC-1048',
  businessId = null,
  branchId = null,
  sessionId = null,
  paymentId = null,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  // Fetch server-rendered receipt or pre-check slip when IDs are available
  const { data: precheckHtml, isLoading: isPrecheckLoading } = useSessionPrecheckReceipt(
    businessId,
    branchId,
    sessionId,
    {
      format: 'html',
      width: '80mm',
      lang: 'bilingual',
      enabled: isOpen && !!businessId && !!branchId && !!sessionId && !paymentId,
    }
  )

  const { data: paymentHtml, isLoading: isPaymentLoading } = usePaymentReceipt(
    businessId,
    branchId,
    paymentId,
    {
      format: 'html',
      width: '80mm',
      lang: 'bilingual',
      enabled: isOpen && !!businessId && !!branchId && !!paymentId,
    }
  )

  const serverHtml = (typeof paymentHtml === 'string' ? paymentHtml : null) || (typeof precheckHtml === 'string' ? precheckHtml : null)
  const isLoading = isPrecheckLoading || isPaymentLoading

  const handlePrint = () => {
    window.print()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isKm ? 'វិក្កយបត្រផ្លូវការ (Sales Receipt)' : 'Official Sales Receipt'}
      size="sm"
    >
      <div className="space-y-4 pb-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            <span className="text-xs text-zinc-500">
              {isKm ? 'កំពុងបង្កើតវិក្កយបត្រ...' : 'Generating receipt slip...'}
            </span>
          </div>
        ) : serverHtml ? (
          /* Server-Rendered Thermal Receipt (Zero Shadows, Clean Border) */
          <div
            id="pos-thermal-receipt"
            className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 max-h-96 overflow-y-auto text-zinc-950 dark:text-zinc-50 text-xs"
            dangerouslySetInnerHTML={{ __html: serverHtml }}
          />
        ) : (
          /* Client Fallback Monospace Receipt (Zero Shadows) */
          <div
            id="pos-thermal-receipt"
            className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 font-mono text-xs space-y-3"
          >
            {/* Header */}
            <div className="text-center space-y-0.5 border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2">
              <h4 className="font-bold text-sm tracking-wider uppercase">{branchName}</h4>
              <p className="text-[11px] text-zinc-500">Siem Reap, Cambodia</p>
              <p className="text-[10px] text-zinc-400">VAT TIN: K001-9021482</p>
              <p className="text-[10px] text-zinc-400">{new Date().toLocaleString()}</p>
            </div>

            {/* Table & Metadata */}
            <div className="flex justify-between text-[11px] text-zinc-500 border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2">
              <span>Table: {tableNumber}</span>
              <span>#{receiptNumber}</span>
            </div>

            {/* Totals */}
            <div className="space-y-1 pt-1 text-xs">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${subtotalUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>VAT (10%):</span>
                <span>${taxUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm border-t border-zinc-200 dark:border-zinc-800 pt-1">
                <span>TOTAL (USD):</span>
                <span>${totalUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-emerald-600 dark:text-emerald-400">
                <span>TOTAL (KHR):</span>
                <span>{totalKHR.toLocaleString()} ៛</span>
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
                <span>Payment Method:</span>
                <span className="font-semibold">{paymentMethod}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-3 border-t border-dashed border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500">
              <p>សូមអរគុណ! សូមអញ្ជើញមកម្តងទៀត</p>
              <p>Thank you! Please visit again</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>{isKm ? 'ព្រីនវិក្កយបត្រ' : 'Print Receipt'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-xs transition-colors"
          >
            {isKm ? 'បិទ' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
