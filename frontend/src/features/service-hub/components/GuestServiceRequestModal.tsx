import { useState, type FC } from 'react'
import { Droplets, Utensils, Receipt, SprayCan, Bell, Check, Send } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ServiceRequestType } from '../types/serviceHub.types'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'

export interface GuestServiceRequestModalProps {
  isOpen: boolean
  onClose: () => void
  tableNumber?: string
  onSubmitRequest: (requestType: ServiceRequestType, note: string) => Promise<void>
  isSubmitting?: boolean
}

export const GuestServiceRequestModal: FC<GuestServiceRequestModalProps> = ({
  isOpen,
  onClose,
  tableNumber = 'T-01',
  onSubmitRequest,
  isSubmitting = false,
}) => {
  const { language } = useLanguageStore()

  const [selectedType, setSelectedType] = useState<ServiceRequestType>('WATER')
  const [note, setNote] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const serviceOptions: {
    type: ServiceRequestType
    icon: typeof Droplets
    labelKm: string
    labelEn: string
    subKm: string
    subEn: string
  }[] = [
    {
      type: 'WATER',
      icon: Droplets,
      labelKm: 'សុំទឹក ឬទឹកកកបន្ថែម',
      labelEn: 'Water & Ice Refill',
      subKm: 'ទឹកផឹកត្រជាក់ ឬទឹកកក',
      subEn: 'Cold drinking water or ice',
    },
    {
      type: 'NAPKINS_UTENSILS',
      icon: Utensils,
      labelKm: 'ក្រដាសជូតមាត់ / ស្លាបព្រា',
      labelEn: 'Napkins & Utensils',
      subKm: 'ចង្កឹះ សម ឬក្រដាស',
      subEn: 'Chopsticks, forks, extra napkins',
    },
    {
      type: 'REQUEST_BILL',
      icon: Receipt,
      labelKm: 'សុំគិតប្រាក់ (Check Bill)',
      labelEn: 'Request Bill & Settle',
      subKm: 'សាច់ប្រាក់ ឬ Bakong KHQR',
      subEn: 'Cash or Bakong KHQR checkout',
    },
    {
      type: 'TABLE_CLEANING',
      icon: SprayCan,
      labelKm: 'សុំជួយសម្អាតតុ / កំពប់ទឹក',
      labelEn: 'Table Cleanup / Spill',
      subKm: 'ដកចានចាស់ ឬជូតតុ',
      subEn: 'Clear empty dishes or wipe table',
    },
    {
      type: 'CALL_WAITER',
      icon: Bell,
      labelKm: 'ហៅអ្នកបម្រើផ្ទាល់',
      labelEn: 'General Server Assistance',
      subKm: 'ត្រូវការជំនួយផ្សេងៗ',
      subEn: 'Ask questions or order inquiry',
    },
  ]

  const handleSubmit = async () => {
    setErrorMsg(null)
    try {
      await onSubmitRequest(selectedType, note)
      playSuccessSound()
      onClose()
      setNote('')
    } catch {
      setErrorMsg(
        language === 'km'
          ? 'មិនអាចបញ្ជូនសំណើបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to send request. Please try again.'
      )
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'km' ? `ហៅអ្នកបម្រើ — តុ ${tableNumber}` : `Request Assistance — Table ${tableNumber}`}
      description={language === 'km' ? 'ជ្រើសរើសសេវាកម្មដែលលោកអ្នកត្រូវការ' : 'Select the service assistance you need'}
      isBottomSheet={true}
    >
      <div className="space-y-4 pb-2">
        {/* 1. Service Type Presets Grid */}
        <div className="space-y-2">
          {serviceOptions.map((opt) => {
            const Icon = opt.icon
            const isSelected = selectedType === opt.type
            return (
              <button
                key={opt.type}
                onClick={() => {
                  setSelectedType(opt.type)
                  setErrorMsg(null)
                }}
                className={`w-full p-3 rounded-2xl border text-left transition-colors flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-50'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-950 dark:text-zinc-50 leading-tight">
                      {language === 'km' ? opt.labelKm : opt.labelEn}
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {language === 'km' ? opt.subKm : opt.subEn}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
              </button>
            )
          })}
        </div>

        {/* 2. Optional Custom Note Input */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'km' ? 'ចំណាំបន្ថែម (បើមាន)' : 'Additional Note (Optional)'}:
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              language === 'km' ? 'ឧ. សូមយកកែវបន្ថែម ២...' : 'e.g. 2 extra glasses please...'
            }
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Inline Error (Clean Red Text, No Outer Container) */}
        {errorMsg && (
          <div className="text-xs text-red-500 text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* 3. Send Action */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Send className="w-4 h-4" />
          <span>
            {isSubmitting
              ? (language === 'km' ? 'កំពុងបញ្ជូន...' : 'Sending Request...')
              : (language === 'km' ? 'បញ្ជូនសំណើទៅអ្នកបម្រើ (Call Server)' : 'Send Request to Server')}
          </span>
        </button>
      </div>
    </Modal>
  )
}
