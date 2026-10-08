import { useState, useEffect, useMemo, type FC } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  Trash2,
  Check,
  RotateCcw,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/Button'
import { useBusinesses, useBranches } from '../../hooks/useTenantQueries'
import { useMenuItems, useCategories, type MenuItemResponse } from '../../hooks/useMenuQueries'
import {
  useBranchPublishedMenu,
  useSetBranchItemOverride,
  useBulkSetBranchItemOverrides,
  useDeleteBranchItemOverride,
  useResetBranchOverrides,
  type BranchMenuItemDisplayResponse,
  type ResetBranchOverridesRequest,
} from '../../hooks/useBranchMenuQueries'
import { BranchItemOverrideModal } from './BranchItemOverrideModal'
import { ResetBranchOverridesModal } from './ResetBranchOverridesModal'

export const BranchMenuSettings: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const queryClient = useQueryClient()

  const [businessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => {
    const saved = localStorage.getItem('emenu_branch_id')
    return saved === 'all' ? null : saved
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)

  // Modals state
  const [isResetOverridesModalOpen, setIsResetOverridesModalOpen] = useState(false)
  const [overridingItem, setOverridingItem] = useState<BranchMenuItemDisplayResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: businesses = [] } = useBusinesses()
  const activeBusinessId = businessId || businesses[0]?.id || null
  const { data: branches = [], isLoading: isLoadingBranches } = useBranches(activeBusinessId)

  // Master items from Head Branch / HQ
  const { data: masterItems = [], isLoading: isLoadingMasterItems } = useMenuItems(activeBusinessId)
  const { data: categories = [] } = useCategories(activeBusinessId)

  const categoriesById = useMemo(() => {
    const map = new Map<string, { name_en: string; name_km?: string }>()
    for (const c of categories) {
      map.set(c.id, { name_en: c.name_en, name_km: c.name_km || c.name_en })
    }
    return map
  }, [categories])

  // Auto-select first branch when branches are loaded
  useEffect(() => {
    if (branches.length > 0) {
      const saved = localStorage.getItem('emenu_branch_id')
      const target = saved && saved !== 'all' && branches.some((b) => b.id === saved)
        ? saved
        : branches[0].id
      if (!selectedBranchId || !branches.some((b) => b.id === selectedBranchId)) {
        setSelectedBranchId(target)
      }
    } else {
      setSelectedBranchId(null)
    }
  }, [branches, selectedBranchId])

  // Clear selections when branch changes
  useEffect(() => {
    setSelectedItemIds(new Set())
  }, [selectedBranchId])

  // Sync with global header branch selection
  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const branchId = e.detail?.branchId
      const target = branchId && branchId !== 'all' ? branchId : branches[0]?.id
      if (target) {
        setIsSwitchingBranch(true)
        setSelectedBranchId(target)
        queryClient.invalidateQueries({ queryKey: ['branch-published-menu'] })
        queryClient.invalidateQueries({ queryKey: ['menu-items'] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [branches, queryClient])

  // Branch menu query (returns items currently overridden to this branch)
  const {
    data: branchCatalog,
    isLoading: isLoadingBranchMenu,
    isFetching: isFetchingBranchMenu,
  } = useBranchPublishedMenu(activeBusinessId, selectedBranchId, true)

  const isBranchDataMatching =
    !selectedBranchId ||
    (!!branchCatalog && branchCatalog.branch_id === selectedBranchId)

  useEffect(() => {
    if (!isLoadingBranchMenu && !isFetchingBranchMenu && isBranchDataMatching) {
      setIsSwitchingBranch(false)
    }
  }, [isLoadingBranchMenu, isFetchingBranchMenu, isBranchDataMatching])

  // Mutations
  const setOverrideMutation = useSetBranchItemOverride(activeBusinessId, selectedBranchId)
  const bulkOverrideMutation = useBulkSetBranchItemOverrides(activeBusinessId, selectedBranchId)
  const deleteOverrideMutation = useDeleteBranchItemOverride(activeBusinessId, selectedBranchId)
  const resetOverridesMutation = useResetBranchOverrides(activeBusinessId, selectedBranchId)

  // Map of items currently in this branch
  const branchItemsMap = useMemo(() => {
    const map = new Map<string, BranchMenuItemDisplayResponse>()
    if (isBranchDataMatching && branchCatalog?.categories) {
      for (const cat of branchCatalog.categories) {
        if (cat.items) {
          for (const item of cat.items) {
            map.set(item.id, item)
          }
        }
      }
    }
    return map
  }, [branchCatalog, isBranchDataMatching])

  // Only central master items from HQ can be overridden into branches
  const centralMasterItems = useMemo(
    () => masterItems.filter((item: any) => !item.branch_id),
    [masterItems]
  )

  // Filter items by search
  const filteredMasterItems = centralMasterItems.filter((item) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      item.name_en.toLowerCase().includes(q) ||
      (item.name_km && item.name_km.includes(searchQuery))
    )
  })

  // Toggling selection of a single item
  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Toggle select all
  const isAllSelected =
    filteredMasterItems.length > 0 &&
    filteredMasterItems.every((item) => selectedItemIds.has(item.id))

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds(new Set())
    } else {
      setSelectedItemIds(new Set(filteredMasterItems.map((item) => item.id)))
    }
  }

  // Bulk override selected items to this branch
  const handleBulkOverrideSelected = async () => {
    if (selectedItemIds.size === 0 || !selectedBranchId) return
    setIsSubmitting(true)
    try {
      const overridesPayload = Array.from(selectedItemIds).map((id) => {
        const existing = branchItemsMap.get(id)
        return {
          menu_item_id: id,
          price_override: existing?.price_override ?? null,
          availability_status: (existing?.availability_status as any) || 'AVAILABLE',
        }
      })

      await bulkOverrideMutation.mutateAsync({ overrides: overridesPayload })
      const count = selectedItemIds.size
      setSelectedItemIds(new Set())
      showFeedback(
        'success',
        isKm
          ? `បានកែប្រែមុខម្ហូប ${count} ដាក់ចូលសាខាដោយជោគជ័យ`
          : `Successfully overridden ${count} items to branch`
      )
    } catch {
      showFeedback('error', isKm ? 'មិនអាចកែប្រែមុខម្ហូបបានទេ' : 'Failed to override items')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open modal to customize override for a specific master item
  const handleOpenOverrideModal = (mItem: MenuItemResponse) => {
    const existingBranchItem = branchItemsMap.get(mItem.id)
    if (existingBranchItem) {
      setOverridingItem(existingBranchItem)
      return
    }

    const displayItem: BranchMenuItemDisplayResponse = {
      id: mItem.id,
      category_id: mItem.category_id,
      sku: mItem.sku ?? null,
      name_en: mItem.name_en,
      name_km: mItem.name_km ?? null,
      description_en: mItem.description_en ?? null,
      description_km: mItem.description_km ?? null,
      master_price: String(mItem.base_price ?? 0),
      price_override: null,
      effective_price: String(mItem.base_price ?? 0),
      currency: mItem.currency || 'USD',
      image_url: mItem.image_url ?? null,
      gallery_images: [],
      prep_time_minutes: 0,
      kitchen_station: null,
      is_vegetarian: false,
      is_vegan: false,
      is_halal: false,
      is_gluten_free: false,
      contains_nuts: false,
      contains_dairy: false,
      spice_level: 0,
      is_featured: false,
      is_popular: false,
      is_new: false,
      display_order: 0,
      availability_status: 'AVAILABLE',
      is_available: true,
      is_local_item: false,
      branch_id: null,
      variants: [],
      modifier_groups: [],
    }
    setOverridingItem(displayItem)
  }

  // Save single item override
  const handleSaveBranchOverride = async (data: {
    price_override: number | null
    availability_status: 'AVAILABLE' | 'TEMPORARILY_OUT_OF_STOCK' | 'HIDDEN'
  }) => {
    if (!overridingItem) return
    setIsSubmitting(true)
    try {
      await setOverrideMutation.mutateAsync({
        itemId: overridingItem.id,
        payload: {
          menu_item_id: overridingItem.id,
          price_override: data.price_override,
          availability_status: data.availability_status,
        },
      })
      setOverridingItem(null)
      showFeedback('success', isKm ? 'បានកែប្រែដោយជោគជ័យ' : 'Branch override saved successfully')
    } catch {
      showFeedback('error', isKm ? 'មិនអាចរក្សាទុកការកែប្រែបានទេ' : 'Failed to save override')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Remove single item override from branch
  const handleRemoveItemOverride = async (itemId: string) => {
    setIsSubmitting(true)
    try {
      await deleteOverrideMutation.mutateAsync(itemId)
      showFeedback('success', isKm ? 'បានលុបចេញពីសាខានេះ' : 'Removed from this branch')
    } catch {
      showFeedback('error', isKm ? 'មិនអាចលុបបានទេ' : 'Failed to remove from branch')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset all overrides
  const handleResetBranchOverrides = async (payload: ResetBranchOverridesRequest) => {
    setIsSubmitting(true)
    try {
      await resetOverridesMutation.mutateAsync(payload)
      setIsResetOverridesModalOpen(false)
      showFeedback('success', isKm ? 'បានកំណត់ឡើងវិញដូចមេ' : 'Overrides reset to master')
    } catch {
      showFeedback('error', isKm ? 'មិនអាចកំណត់ឡើងវិញបានទេ' : 'Failed to reset overrides')
    } finally {
      setIsSubmitting(false)
    }
  }

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text })
    setTimeout(() => setFeedbackMessage(null), 3500)
  }

  const isLoading =
    isSwitchingBranch ||
    isLoadingBranches ||
    isLoadingMasterItems ||
    isLoadingBranchMenu ||
    !isBranchDataMatching ||
    (isFetchingBranchMenu && branchItemsMap.size === 0)

  return (
    <div className="w-full min-h-[420px] p-5 sm:p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col space-y-5 shadow-none">
      {/* Toast Alert Feedback */}
      {feedbackMessage && (
        <div
          role="alert"
          className={`flex items-center gap-2 p-3 rounded-2xl border text-xs font-medium ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Header Bar: Branch Selector & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />
          <label htmlFor="branch-select" className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider shrink-0">
            {isKm ? 'ជ្រើសរើសសាខា' : 'Select Branch'}:
          </label>
          {isLoadingBranches ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : branches.length > 0 ? (
            <select
              id="branch-select"
              value={selectedBranchId ?? ''}
              onChange={(e) => {
                const newId = e.target.value || null
                setIsSwitchingBranch(true)
                setSelectedBranchId(newId)
                setSearchQuery('')
                if (newId) {
                  localStorage.setItem('emenu_branch_id', newId)
                  useAuthStore.getState().setContext(
                    useAuthStore.getState().organizationId,
                    useAuthStore.getState().businessId,
                    newId
                  )
                  window.dispatchEvent(
                    new CustomEvent('emenu:branch-changed', { detail: { branchId: newId } })
                  )
                }
              }}
              className="text-xs sm:text-sm font-semibold py-1.5 px-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {isKm && b.name_km ? b.name_km : b.name_en}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-zinc-500">
              {isKm ? 'មិនទាន់មានសាខា' : 'No branches found'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {branchItemsMap.size > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsResetOverridesModalOpen(true)}
              className="text-xs font-medium px-3.5 py-1.5 rounded-full border-zinc-300 dark:border-zinc-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              {isKm ? 'កំណត់ឡើងវិញដូចមេ' : 'Reset to Master'}
            </Button>
          )}

          {selectedItemIds.size > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleBulkOverrideSelected}
              disabled={isSubmitting}
              className="text-xs font-semibold px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isKm
                ? `កែប្រែដាក់ចូលសាខា (${selectedItemIds.size})`
                : `Override to Branch (${selectedItemIds.size})`}
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Area */}
      {branches.length === 0 ? (
        <div className="flex-1 min-h-[220px] flex items-center justify-center py-10 text-center text-xs text-zinc-500">
          {isKm
            ? 'មិនទាន់មានសាខាសម្រាប់កំណត់ម៉ឺនុយទេ។ សូមបង្កើតសាខានៅទំព័រសាខាជាមុនសិន។'
            : 'No branches available. Please create a branch in the Branches page first.'}
        </div>
      ) : (
        <div className="flex-1 flex flex-col space-y-4">
          {/* Search & Actions Bar */}
          {masterItems.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <span>
                  {isKm ? 'មុខម្ហូបក្នុងសាខានេះ' : 'In this branch'}:{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">
                    {branchItemsMap.size}
                  </strong>{' '}
                  / {masterItems.length}
                </span>
                {selectedItemIds.size > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ({selectedItemIds.size} {isKm ? 'បានជ្រើសរើស' : 'selected'})
                  </span>
                )}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isKm ? 'ស្វែងរកមុខម្ហូប...' : 'Search items...'}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors shadow-none"
                />
              </div>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            </div>
          ) : masterItems.length === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center py-12 text-center text-xs text-zinc-400">
              {isKm
                ? 'មិនទាន់មានមុខម្ហូបនៅក្នុងប្រព័ន្ធនៅឡើយទេ។'
                : 'No menu items entered in the system yet.'}
            </div>
          ) : filteredMasterItems.length === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center py-12 text-center text-xs text-zinc-400">
              {isKm ? 'មិនមានមុខម្ហូបត្រូវនឹងការស្វែងរកទេ' : 'No items match the search query'}
            </div>
          ) : (
            <div className="overflow-auto max-h-[520px] rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur text-zinc-500 font-semibold">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all"
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 dark:border-zinc-700"
                      />
                    </th>
                    <th className="py-3 px-3.5">{isKm ? 'មុខម្ហូប' : 'Item'}</th>
                    <th className="py-3 px-3.5">{isKm ? 'ប្រភេទ' : 'Category'}</th>
                    <th className="py-3 px-3.5">{isKm ? 'តម្លៃ Master HQ' : 'Master Price'}</th>
                    <th className="py-3 px-3.5">{isKm ? 'តម្លៃសាខានេះ' : 'Branch Price'}</th>
                    <th className="py-3 px-3.5">{isKm ? 'ស្ថានភាពក្នុងសាខា' : 'Status'}</th>
                    <th className="py-3 px-3.5 text-right">{isKm ? 'សកម្មភាព' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
                  {filteredMasterItems.map((mItem) => {
                    const branchItem = branchItemsMap.get(mItem.id)
                    const isInBranch = !!branchItem
                    const masterPrice = Number(mItem.base_price ?? 0)
                    const branchPrice = branchItem
                      ? Number(branchItem.effective_price ?? branchItem.price_override ?? masterPrice)
                      : masterPrice
                    const hasCustomPrice = branchItem
                      ? branchItem.price_override !== null && branchItem.price_override !== undefined
                      : false
                    const priceDiff = branchPrice - masterPrice
                    const isChecked = selectedItemIds.has(mItem.id)
                    const catInfo = mItem.category_id ? categoriesById.get(mItem.category_id) : undefined

                    return (
                      <tr
                        key={mItem.id}
                        className={`transition-colors ${
                          isChecked
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                            : isInBranch
                            ? 'hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40'
                            : 'opacity-75 hover:opacity-100 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleItemSelection(mItem.id)}
                            aria-label={`Select ${mItem.name_en}`}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {isKm && mItem.name_km ? mItem.name_km : mItem.name_en}
                            </span>
                            {hasCustomPrice && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                {isKm ? 'កែប្រែតម្លៃ' : 'Custom Price'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-zinc-500">
                          {catInfo ? (isKm ? catInfo.name_km : catInfo.name_en) : '—'}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-zinc-500">
                          ${masterPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-3.5 font-mono">
                          {isInBranch ? (
                            <>
                              <span
                                className={
                                  hasCustomPrice
                                    ? 'font-bold text-amber-700 dark:text-amber-400'
                                    : 'text-zinc-900 dark:text-zinc-100'
                                }
                              >
                                ${branchPrice.toFixed(2)}
                              </span>
                              {hasCustomPrice && priceDiff !== 0 && (
                                <span className="text-[10px] ml-1.5 text-zinc-400">
                                  ({priceDiff > 0 ? `+$${priceDiff.toFixed(2)}` : `-$${Math.abs(priceDiff).toFixed(2)}`})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          {isInBranch ? (
                            branchItem?.is_available ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {isKm ? 'មានលក់' : 'Available'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                                {isKm ? 'អស់' : 'Unavailable'}
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              {isKm ? 'មិនទាន់មានក្នុងសាខា' : 'Not in Branch'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant={isInBranch ? 'outline' : 'primary'}
                              size="sm"
                              onClick={() => handleOpenOverrideModal(mItem)}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                                isInBranch
                                  ? 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              <SlidersHorizontal className="w-3 h-3 mr-1 text-inherit" />
                              {isInBranch
                                ? (isKm ? 'កែសម្រួល' : 'Edit')
                                : (isKm ? 'កែប្រែ' : 'Override')}
                            </Button>
                            {isInBranch && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveItemOverride(mItem.id)}
                                disabled={isSubmitting}
                                title={isKm ? 'លុបចេញពីសាខានេះ' : 'Remove from this branch'}
                                className="text-xs font-semibold p-1.5 rounded-full border-zinc-200 dark:border-zinc-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {overridingItem && (
        <BranchItemOverrideModal
          item={overridingItem}
          isSubmitting={isSubmitting}
          onSubmit={handleSaveBranchOverride}
          onRevertToMaster={async () => {
            await handleRemoveItemOverride(overridingItem.id)
            setOverridingItem(null)
          }}
          onClose={() => setOverridingItem(null)}
        />
      )}

      {isResetOverridesModalOpen && (
        <ResetBranchOverridesModal
          categories={categories.map((c) => ({
            id: c.id,
            name_en: c.name_en,
            name_km: c.name_km || c.name_en,
            display_order: c.display_order ?? 0,
            is_active: c.is_active ?? true,
          }))}
          isSubmitting={isSubmitting}
          onSubmit={handleResetBranchOverrides}
          onClose={() => setIsResetOverridesModalOpen(false)}
        />
      )}
    </div>
  )
}
