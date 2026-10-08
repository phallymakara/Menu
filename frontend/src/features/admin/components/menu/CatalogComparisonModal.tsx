import { useState, type FC } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  GitCompare,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { BranchResponse } from '../../hooks/useTenantQueries'
import {
  useCatalogComparison,
  useSyncMasterCatalog,
  type MasterCatalogSyncRequest,
} from '../../hooks/useBranchMenuQueries'

interface CatalogComparisonModalProps {
  businessId: string | null
  branches: BranchResponse[]
  onClose: () => void
}

export const CatalogComparisonModal: FC<CatalogComparisonModalProps> = ({
  businessId,
  branches,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [searchQuery, setSearchQuery] = useState('')
  const [showSyncControls, setShowSyncControls] = useState(false)
  const [syncScope, setSyncScope] = useState<'ALL_ITEMS' | 'CATEGORIES_ONLY' | 'PRICING_ONLY'>('ALL_ITEMS')
  const [preserveCustomPrices, setPreserveCustomPrices] = useState(true)
  const [forceAvailability, setForceAvailability] = useState(false)
  const [targetBranchId, setTargetBranchId] = useState<string>('')
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const { data: matrix, isLoading, error: matrixError, refetch } = useCatalogComparison(businessId)
  const syncMutation = useSyncMasterCatalog(businessId)

  const handleSyncSubmit = async () => {
    setSyncError(null)
    setSyncSuccessMsg(null)

    const payload: MasterCatalogSyncRequest = {
      sync_scope: syncScope,
      preserve_custom_prices: preserveCustomPrices,
      force_availability: forceAvailability,
      target_branch_ids: targetBranchId ? [targetBranchId] : null,
    }

    try {
      const res = await syncMutation.mutateAsync(payload)
      setSyncSuccessMsg(
        isKm
          ? `បានធ្វើសមកាលកម្មដោយជោគជ័យ៖ សាខាដែលរងឥទ្ធិពល ${res.branches_affected_count}, មុខម្ហូប ${res.items_synced_count}`
          : `Sync completed: ${res.branches_affected_count} branches affected, ${res.items_synced_count} items updated.`
      )
      refetch()
    } catch {
      setSyncError(
        isKm
          ? 'មិនអាចធ្វើសមកាលកម្មកាតាឡុកបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to sync catalog across branches.'
      )
    }
  }

  const filteredItems = (matrix?.items || []).filter((it) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      it.item_name_en.toLowerCase().includes(q) ||
      (it.item_name_km && it.item_name_km.toLowerCase().includes(q)) ||
      (it.category_name && it.category_name.toLowerCase().includes(q))
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4 z-10 my-auto flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50">
                {isKm
                  ? 'តារាងប្រៀបធៀបតម្លៃ និងស្តុកតាមសាខា (Catalog Matrix)'
                  : 'Multi-Branch Catalog Comparison & Sync'}
              </h3>
              <p className="text-xs text-zinc-500">
                {isKm
                  ? 'ប្រៀបធៀបតម្លៃមេ (HQ) ជាមួយតម្លៃជាក់ស្តែងតាមសាខានីមួយៗ'
                  : 'Compare master catalog prices with resolved branch pricing and local specials.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Controls Section */}
        <div className="shrink-0 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {isKm ? 'មុខម្ហូបមេ:' : 'Master Items:'} {matrix?.total_master_items ?? 0}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40">
                {isKm ? 'មុខម្ហូបសាខា:' : 'Local Items:'} {matrix?.total_local_items ?? 0}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSyncControls((prev) => !prev)}
              className="text-xs font-semibold border-zinc-300 dark:border-zinc-700"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              {showSyncControls
                ? isKm
                  ? 'លាក់ការកំណត់ Sync'
                  : 'Hide Sync Tool'
                : isKm
                  ? 'ធ្វើសមកាលកម្មទៅសាខា (Push Sync)'
                  : 'Push HQ Updates to Branches'}
            </Button>
          </div>

          {/* Collapsible Sync Form */}
          {showSyncControls && (
            <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                    {isKm ? 'វិសាលភាព Sync' : 'Sync Scope'}
                  </label>
                  <select
                    value={syncScope}
                    onChange={(e) =>
                      setSyncScope(e.target.value as 'ALL_ITEMS' | 'CATEGORIES_ONLY' | 'PRICING_ONLY')
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  >
                    <option value="ALL_ITEMS">{isKm ? 'គ្រប់មុខម្ហូបទាំងអស់ (All Items)' : 'All Items'}</option>
                    <option value="PRICING_ONLY">{isKm ? 'តែកម្រិតតម្លៃ (Pricing Only)' : 'Pricing Only'}</option>
                    <option value="CATEGORIES_ONLY">{isKm ? 'តែប្រភេទ (Categories Only)' : 'Categories Only'}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                    {isKm ? 'សាខាគោលដៅ' : 'Target Branch'}
                  </label>
                  <select
                    value={targetBranchId}
                    onChange={(e) => setTargetBranchId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  >
                    <option value="">{isKm ? 'គ្រប់សាខាទាំងអស់ (All Branches)' : 'All Branches'}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {isKm && b.name_km ? b.name_km : b.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-end gap-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={preserveCustomPrices}
                      onChange={(e) => setPreserveCustomPrices(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>{isKm ? 'រក្សាតម្លៃផ្ទាល់ខ្លួនរបស់សាខា' : 'Preserve branch custom prices'}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={forceAvailability}
                      onChange={(e) => setForceAvailability(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>{isKm ? 'កំណត់ស្តុកទាំងអស់មកធម្មតា' : 'Force all items in stock'}</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                {syncSuccessMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {syncSuccessMsg}
                  </p>
                )}
                {syncError && <p className="text-xs text-red-600 dark:text-red-400">{syncError}</p>}
                {!syncSuccessMsg && !syncError && <div />}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSyncSubmit}
                  disabled={syncMutation.isPending}
                  className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {syncMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  {isKm ? 'ដំណើរការ Sync ឥឡូវនេះ' : 'Trigger Sync'}
                </Button>
              </div>
            </div>
          )}

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isKm ? 'ស្វែងរកមុខម្ហូប ឬប្រភេទ...' : 'Filter items or category...'}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Matrix Table */}
        <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center space-y-2 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <p className="text-xs">{isKm ? 'កំពុងទាញយកទិន្នន័យប្រៀបធៀប...' : 'Loading matrix...'}</p>
            </div>
          )}

          {matrixError && (
            <div className="py-12 text-center text-xs text-red-600">
              <AlertCircle className="w-5 h-5 mx-auto mb-1" />
              {isKm ? 'មិនអាចទាញយកទិន្នន័យប្រៀបធៀបបានទេ' : 'Failed to load catalog matrix'}
            </div>
          )}

          {!isLoading && !matrixError && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50 dark:bg-zinc-800/80 sticky top-0 border-b border-zinc-200 dark:border-zinc-800 z-10">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                    {isKm ? 'មុខម្ហូប' : 'Menu Item'}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                    {isKm ? 'ប្រភេទ' : 'Category'}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100 text-right">
                    {isKm ? 'តម្លៃមេ (HQ)' : 'HQ Master Price'}
                  </th>
                  {branches.map((b) => (
                    <th
                      key={b.id}
                      className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100 text-right whitespace-nowrap"
                    >
                      {isKm && b.name_km ? b.name_km : b.name_en}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                {filteredItems.map((item) => (
                  <tr key={item.item_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {isKm && item.item_name_km ? item.item_name_km : item.item_name_en}
                        </span>
                        {!item.is_global_master && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold">
                            {isKm ? 'សាខា' : 'Local'}
                          </span>
                        )}
                      </div>
                      {isKm && item.item_name_en !== item.item_name_km && (
                        <p className="text-2xs text-zinc-400">{item.item_name_en}</p>
                      )}
                    </td>
                    <td className="py-2 px-3 text-zinc-500 whitespace-nowrap">
                      {item.category_name || '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      {item.master_base_price_usd !== null && item.master_base_price_usd !== undefined
                        ? `$${Number(item.master_base_price_usd).toFixed(2)}`
                        : '—'}
                    </td>
                    {branches.map((b) => {
                      const branchDetail = item.branches.find((bd) => bd.branch_id === b.id)
                      if (!branchDetail) {
                        return (
                          <td key={b.id} className="py-2 px-3 text-right text-zinc-400">
                            —
                          </td>
                        )
                      }
                      return (
                        <td key={b.id} className="py-2 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={`font-mono ${
                                branchDetail.has_price_override
                                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                  : 'text-zinc-800 dark:text-zinc-200'
                              }`}
                            >
                              ${Number(branchDetail.effective_price_usd).toFixed(2)}
                            </span>
                            {!branchDetail.is_available && (
                              <span className="text-2xs px-1 py-0.2 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 font-semibold">
                                86
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
