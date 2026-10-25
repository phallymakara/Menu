import { useState, type FC } from 'react'
import { Check, ArrowLeftRight, Layers, FileText, Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { POSTable } from '../types/pos.types'
import {
  useOpenTableSession,
  useCloseTableSession,
  useRequestTableBill,
  useTransferTable,
  useMergeTables,
  useUnmergeTables,
  useUpdateTableStatus,
} from '../hooks/usePOSQueries'

export interface POSTableActionsModalProps {
  isOpen: boolean
  onClose: () => void
  table: POSTable | null
  allTables: POSTable[]
  businessId: string | null
  branchId: string | null
  onSuccessAction: () => void
}

export const POSTableActionsModal: FC<POSTableActionsModalProps> = ({
  isOpen,
  onClose,
  table,
  allTables,
  businessId,
  branchId,
  onSuccessAction,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [targetTableId, setTargetTableId] = useState<string>('')
  const [mergeTargetIds, setMergeTargetIds] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'open' | 'transfer' | 'merge' | 'close'>('open')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const openSessionMutation = useOpenTableSession(businessId, branchId)
  const closeSessionMutation = useCloseTableSession(businessId, branchId)
  const requestBillMutation = useRequestTableBill(businessId, branchId)
  const transferTableMutation = useTransferTable(businessId, branchId)
  const mergeTablesMutation = useMergeTables(businessId, branchId)
  const unmergeTablesMutation = useUnmergeTables(businessId, branchId)
  const updateTableStatusMutation = useUpdateTableStatus(businessId, branchId)

  if (!table) return null

  const isAvailable = table.status.toLowerCase() === 'available'
  const isOccupiedOrBilling =
    table.status.toLowerCase() === 'occupied' || table.status.toLowerCase() === 'bill_requested'
  const hasUnpaidOrders =
    (table.active_orders_count !== undefined && table.active_orders_count > 0) ||
    (table.session_subtotal_usd !== undefined && table.session_subtotal_usd > 0)

  // Other available tables for transfer or merge
  const availableTargetTables = allTables.filter(
    (t) => t.id !== table.id && t.status.toLowerCase() === 'available'
  )

  const handleUpdateStatus = async (newStatus: 'available' | 'occupied') => {
    setErrorMsg(null)
    if (newStatus === 'available' && hasUnpaidOrders) {
      setErrorMsg(
        isKm
          ? 'មិនអាចដោះលែងតុនេះបានទេ ដោយសារមានការកុម្ម៉ង់ដែលមិនទាន់ទូទាត់។ សូមទូទាត់ប្រាក់ជាមុនសិន (សាច់ប្រាក់ ឬ KHQR)។'
          : 'Cannot free table with unpaid orders. Please settle payment by Cash or KHQR first.'
      )
      return
    }
    try {
      if (newStatus === 'available') {
        await updateTableStatusMutation.mutateAsync({ tableId: table.id, status: 'available' })
      } else {
        await updateTableStatusMutation.mutateAsync({ tableId: table.id, status: 'occupied' })
        if (!table.session_id) {
          await openSessionMutation
            .mutateAsync({
              tableId: table.id,
              payload: { guest_count: 1 },
            })
            .catch(() => null)
        }
      }
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចផ្លាស់ប្តូរស្ថានភាពតុបានទេ។' : 'Failed to update table status.'
      )
    }
  }

  const handleOpenSession = async () => {
    setErrorMsg(null)
    try {
      await openSessionMutation.mutateAsync({
        tableId: table.id,
        payload: { guest_count: 1 },
      })
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចបើកដំណើរការតុបានទេ។' : 'Failed to open table session.'
      )
    }
  }

  const handleTransferTable = async () => {
    if (!targetTableId) {
      setErrorMsg(isKm ? 'សូមជ្រើសរើសតុគោលដៅ។' : 'Please select target table.')
      return
    }
    setErrorMsg(null)
    try {
      await transferTableMutation.mutateAsync({
        tableId: table.id,
        payload: { target_table_id: targetTableId, reason: 'Staff transferred table in POS' },
      })
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចផ្ទេរតុបានទេ។' : 'Failed to transfer table.'
      )
    }
  }

  const handleMergeTables = async () => {
    if (mergeTargetIds.length === 0) {
      setErrorMsg(isKm ? 'សូមជ្រើសរើសយ៉ាងហោចណាស់តុមួយដើម្បីផ្គុំ។' : 'Please select at least one table to merge.')
      return
    }
    setErrorMsg(null)
    try {
      await mergeTablesMutation.mutateAsync({
        tableId: table.id,
        payload: { secondary_table_ids: mergeTargetIds, notes: 'Staff merged tables in POS' },
      })
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចផ្គុំតុបានទេ។' : 'Failed to merge tables.'
      )
    }
  }

  const handleUnmerge = async () => {
    setErrorMsg(null)
    try {
      await unmergeTablesMutation.mutateAsync({
        tableId: table.id,
        payload: { secondary_table_ids: [table.id] },
      })
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចបំបែកតុបានទេ។' : 'Failed to unmerge tables.'
      )
    }
  }

  const handleRequestBill = async () => {
    setErrorMsg(null)
    try {
      await requestBillMutation.mutateAsync({ tableId: table.id })
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចសុំគិតប្រាក់បានទេ។' : 'Failed to request bill.'
      )
    }
  }

  const handleCloseSession = async () => {
    if (hasUnpaidOrders) {
      setErrorMsg(
        isKm
          ? 'មិនអាចបិទតុបានទេ ដោយសារមានការកុម្ម៉ង់ដែលមិនទាន់ទូទាត់។ សូមទូទាត់ប្រាក់ជាមុនសិន (សាច់ប្រាក់ ឬ KHQR)។'
          : 'Cannot close table with unpaid orders. Please settle bill via Cash or KHQR first.'
      )
      return
    }
    setErrorMsg(null)
    try {
      await closeSessionMutation.mutateAsync({
        tableId: table.id,
        payload: { next_table_status: 'available', notes: 'Staff manually released table' },
      })
      onSuccessAction()
      onClose()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចបិទតុបានទេ។' : 'Failed to close table session.'
      )
    }
  }

  const isSubmitting =
    openSessionMutation.isPending ||
    closeSessionMutation.isPending ||
    requestBillMutation.isPending ||
    transferTableMutation.isPending ||
    mergeTablesMutation.isPending ||
    unmergeTablesMutation.isPending ||
    updateTableStatusMutation.isPending

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isKm ? `គ្រប់គ្រងតុ ${table.table_number}` : `Manage Table ${table.table_number}`}
      size="sm"
    >
      <div className="space-y-4 pb-2">
        {/* Quick Status Toggle: Available or In Use */}
        <div className="space-y-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
            {isKm ? 'ប្តូរស្ថានភាពតុ (Change Status)' : 'Table Status'}:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isSubmitting || isAvailable || hasUnpaidOrders}
              title={
                hasUnpaidOrders
                  ? isKm
                    ? 'មិនអាចដោះលែងតុដែលមានការកុម្ម៉ង់មិនទាន់ទូទាត់ប្រាក់ទេ។ សូមទូទាត់ប្រាក់ជាមុនសិន។'
                    : 'Cannot free table with unpaid orders. Settle bill via Cash or KHQR first.'
                  : undefined
              }
              onClick={() => handleUpdateStatus('available')}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                hasUnpaidOrders
                  ? 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                  : isAvailable
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20 cursor-default'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-emerald-400 text-zinc-700 dark:text-zinc-300 cursor-pointer'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>{isKm ? 'ទំនេរ (Available)' : 'Available'}</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting || isOccupiedOrBilling}
              onClick={() => handleUpdateStatus('occupied')}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                isOccupiedOrBilling
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/20 cursor-default'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-blue-400 text-zinc-700 dark:text-zinc-300 cursor-pointer'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span>{isKm ? 'កំពុងប្រើ (In Use)' : 'In Use'}</span>
            </button>
          </div>

          {/* Unpaid Orders Warning Badge */}
          {hasUnpaidOrders && (
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5 leading-snug">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                {isKm
                  ? 'តុនេះមានការកុម្ម៉ង់ដែលមិនទាន់ទូទាត់ប្រាក់។ មិនអាចដោះលែងតុបានទេរហូតទាល់តែទូទាត់ប្រាក់រួច (សាច់ប្រាក់ ឬ Bakong KHQR)។'
                  : 'This table has unpaid orders. Settle bill via Cash or Bakong KHQR before freeing table.'}
              </span>
            </div>
          )}
        </div>
        {/* Available Table: Open Table */}
        {isAvailable && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isKm
                ? 'ចុចខាងក្រោមដើម្បីបើកដំណើរការតុនេះសម្រាប់ការកុម្ម៉ង់។'
                : 'Click below to open this table session for ordering.'}
            </p>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleOpenSession}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{isKm ? 'បើកតុ' : 'Open Table'}</span>
            </button>
          </div>
        )}

        {/* Occupied Table: Actions Tab Switcher */}
        {isOccupiedOrBilling && (
          <div className="space-y-3">
            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-50 dark:bg-zinc-900 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('transfer')
                  setErrorMsg(null)
                }}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-colors ${
                  activeTab === 'transfer'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isKm ? 'ផ្ទេរតុ' : 'Transfer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('merge')
                  setErrorMsg(null)
                }}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-colors ${
                  activeTab === 'merge'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isKm ? 'ផ្គុំតុ' : 'Merge'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('close')
                  setErrorMsg(null)
                }}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-colors ${
                  activeTab === 'close'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {isKm ? 'សកម្មភាព' : 'Actions'}
              </button>
            </div>

            {/* Transfer View */}
            {activeTab === 'transfer' && (
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                  {isKm ? 'ជ្រើសរើសតុទំនេរដើម្បីប្តូរភ្ញៀវទៅ' : 'Select Target Table'}:
                </label>
                {availableTargetTables.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3 text-center">
                    {isKm ? 'មិនមានតុទំនេរសម្រាប់ផ្ទេរទៅទេ។' : 'No available tables to transfer to.'}
                  </p>
                ) : (
                  <select
                    value={targetTableId}
                    onChange={(e) => setTargetTableId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs focus:outline-none"
                  >
                    <option value="">{isKm ? '-- ជ្រើសរើសតុ --' : '-- Select Table --'}</option>
                    {availableTargetTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.table_number}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  disabled={!targetTableId || isSubmitting}
                  onClick={handleTransferTable}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowLeftRight className="w-4 h-4" />
                  )}
                  <span>{isKm ? 'ផ្ទេរតុឥឡូវនេះ' : 'Confirm Transfer'}</span>
                </button>
              </div>
            )}

            {/* Merge View */}
            {activeTab === 'merge' && (
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                  {isKm ? 'ជ្រើសរើសតុដើម្បីផ្គុំជាមួយគ្នា' : 'Select Tables to Merge'}:
                </label>
                {availableTargetTables.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3 text-center">
                    {isKm ? 'មិនមានតុទំនេរសម្រាប់ផ្គុំទេ។' : 'No available tables to merge.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {availableTargetTables.map((t) => {
                      const isChecked = mergeTargetIds.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setMergeTargetIds((prev) =>
                              isChecked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            )
                          }}
                          className={`p-2 rounded-lg border text-xs text-left transition-colors ${
                            isChecked
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                              : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          <div className="font-bold">{t.table_number}</div>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={mergeTargetIds.length === 0 || isSubmitting}
                    onClick={handleMergeTables}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Layers className="w-4 h-4" />
                    <span>{isKm ? 'ផ្គុំតុ' : 'Merge Tables'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUnmerge}
                    disabled={isSubmitting}
                    className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-xs transition-colors"
                  >
                    {isKm ? 'បំបែកតុ' : 'Unmerge'}
                  </button>
                </div>
              </div>
            )}

            {/* Quick Actions (Request Bill / Force Close) */}
            {activeTab === 'close' && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRequestBill}
                  className="w-full py-2.5 px-3 rounded-xl border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>{isKm ? 'ដាក់ស្ថានភាព: សុំគិតប្រាក់' : 'Flag as Bill Requested'}</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCloseSession}
                  className="w-full py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>{isKm ? 'បិទដំណើរការតុ' : 'Close Table Session'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error text displayed inline without card or shadow */}
        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition-colors"
        >
          {isKm ? 'បិទ' : 'Close'}
        </button>
      </div>
    </Modal>
  )
}
