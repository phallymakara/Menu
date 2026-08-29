import { type FC } from 'react'
import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'

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
}) => {
  const { language } = useLanguageStore()

  const handlePrint = () => {
    window.print()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'km' ? 'វិក្កយបត្រផ្លូវការ (Sales Receipt)' : 'Official Sales Receipt'}
      size="sm"
    >
      <div className="space-y-4 pb-2">
        {/* Printable Thermal Receipt Container (Monospace 80mm style, Zero Shadows) */}
        <div
          id="pos-thermal-receipt"
          className="p-5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white text-zinc-950 font-mono text-xs space-y-3"
        >
          {/* Header */}
          <div className="text-center space-y-0.5 border-b border-dashed border-zinc-300 pb-2">
            <h4 className="font-bold text-sm tracking-wider uppercase">{branchName}</h4>
            <p className="text-[11px] text-zinc-600">Siem Reap, Cambodia</p>
            <p className="text-[10px] text-zinc-500">VAT TIN: K001-9021482</p>
            <p className="text-[10px] text-zinc-500">{new Date().toLocaleString()}</p>
          </div>

          {/* Table & Receipt Metadata */}
          <div className="flex justify-between text-[11px] text-zinc-600 border-b border-dashed border-zinc-300 pb-2">
            <span>Table: {tableNumber}</span>
            <span>#{receiptNumber}</span>
          </div>

          {/* Totals */}
          <div className="space-y-1 pt-1 text-xs">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${subtotalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>VAT (10%):</span>
              <span>${taxUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-zinc-300 pt-1">
              <span>TOTAL (USD):</span>
              <span>${totalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm text-emerald-700">
              <span>TOTAL (KHR):</span>
              <span>{totalKHR.toLocaleString()} ៛</span>
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
              <span>Payment Method:</span>
              <span className="font-semibold">{paymentMethod}</span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-center pt-3 border-t border-dashed border-zinc-300 text-[10px] text-zinc-500">
            <p>សូមអរគុណ! សូមអញ្ជើញមកម្តងទៀត</p>
            <p>Thank you! Please visit again</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>{language === 'km' ? 'ព្រីនវិក្កយបត្រ' : 'Print Receipt'}</span>
          </button>

          <button
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-xs transition-colors"
          >
            {language === 'km' ? 'បិទ' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
