import { useState, useEffect, type FC } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  Boxes,
  Building2,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import { useBusinesses, useBranches } from '../hooks/useTenantQueries'
import {
  useInventoryItems,
  useBranchStock,
  useLowStockAlerts,
  useCreateInventoryItem,
  useAdjustStock,
  type LowStockAlertItem,
} from '../hooks/useInventoryQueries'

interface RawIngredient {
  id: string
  name_en: string
  name_km: string
  sku: string
  unit: string
  cost_usd: number
  in_stock: number
  reorder_threshold: number
}

const UNIT_OPTIONS = [
  { value: 'kg', label: 'KG (Kilograms)' },
  { value: 'g', label: 'G (Grams)' },
  { value: 'liter', label: 'L (Liters)' },
  { value: 'ml', label: 'ML (Milliliters)' },
  { value: 'piece', label: 'PIECE (Pieces)' },
  { value: 'can', label: 'CAN (Cans)' },
  { value: 'bottle', label: 'BOTTLE (Bottles)' },
  { value: 'pack', label: 'PACK (Packs / Boxes)' },
]

export const InventoryTab: FC = () => {
  const { language } = useLanguageStore()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'all' | 'alerts'>('all')

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [branchId, setBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )

  const { data: businesses = [] } = useBusinesses()
  const { data: branches = [] } = useBranches(businessId)

  useEffect(() => {
    if (!businessId && businesses.length > 0) {
      setBusinessId(businesses[0].id)
      localStorage.setItem('emenu_business_id', businesses[0].id)
    }
  }, [businesses, businessId])

  useEffect(() => {
    const handleBranchChanged = () => {
      const stored = localStorage.getItem('emenu_branch_id')
      setBranchId(stored)
      if (businessId) {
        queryClient.invalidateQueries({ queryKey: ['inventory', 'items', businessId] })
        queryClient.invalidateQueries({ queryKey: ['inventory', 'alerts', 'low-stock', businessId] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [businessId, queryClient])

  // Queries
  const { data: serverItems = [], isLoading: isLoadingItems } = useInventoryItems(businessId)
  const effectiveBranchId = branchId && branchId !== 'all' ? branchId : null
  const { data: branchStocks = [] } = useBranchStock(businessId, effectiveBranchId)
  const { data: lowStockData, isLoading: isLoadingAlerts } = useLowStockAlerts(
    businessId,
    effectiveBranchId
  )

  // Mutations
  const createItemMutation = useCreateInventoryItem(businessId)
  const adjustStockMutation = useAdjustStock(businessId, effectiveBranchId || (branches[0]?.id ?? null))

  // Ingredients State (Local fallback + synced server items)
  const [ingredients, setIngredients] = useState<RawIngredient[]>([
    {
      id: 'ing-1',
      name_en: 'Angkor Beef Tenderloin',
      name_km: 'សាច់គោផាត់បន្ទាយមានជ័យ',
      sku: 'ING-BF-001',
      unit: 'KG',
      cost_usd: 12.5,
      in_stock: 45.0,
      reorder_threshold: 15.0,
    },
    {
      id: 'ing-2',
      name_en: 'Kampot Black Pepper',
      name_km: 'ម្រេចខ្មៅកំពត',
      sku: 'ING-PP-002',
      unit: 'KG',
      cost_usd: 18.0,
      in_stock: 8.5,
      reorder_threshold: 5.0,
    },
    {
      id: 'ing-3',
      name_en: 'Jasmine Fragrant Rice',
      name_km: 'អង្ករផ្ការំដួល',
      sku: 'ING-RC-003',
      unit: 'KG',
      cost_usd: 1.1,
      in_stock: 120.0,
      reorder_threshold: 40.0,
    },
    {
      id: 'ing-4',
      name_en: 'Sweet Condensed Milk',
      name_km: 'ទឹកដោះគោខាប់',
      sku: 'ING-MK-004',
      unit: 'CAN',
      cost_usd: 0.85,
      in_stock: 64.0,
      reorder_threshold: 24.0,
    },
    {
      id: 'ing-5',
      name_en: 'Robusta Espresso Beans',
      name_km: 'គ្រាប់កាហ្វេរ៉ូប៊ូស្តា',
      sku: 'ING-CF-005',
      unit: 'KG',
      cost_usd: 9.5,
      in_stock: 32.0,
      reorder_threshold: 10.0,
    },
  ])

  // Sync server items and branch quantities if available
  useEffect(() => {
    if (serverItems.length > 0) {
      const stockMap = new Map(branchStocks.map((s) => [s.inventory_item_id, Number(s.quantity)]))
      setIngredients(
        serverItems.map((item) => ({
          id: item.id,
          name_en: item.name_en,
          name_km: item.name_km || item.name_en,
          sku: item.sku || 'N/A',
          unit: item.unit_of_measure.toUpperCase(),
          cost_usd: Number(item.cost_per_unit_usd),
          in_stock: stockMap.get(item.id) ?? 0,
          reorder_threshold: Number(item.reorder_threshold),
        }))
      )
    }
  }, [serverItems, branchStocks])

  // Modal State: Add Raw Ingredient
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState(false)
  const [newIngredient, setNewIngredient] = useState({
    name_en: '',
    name_km: '',
    sku: '',
    unit: 'kg',
    cost_usd: 0,
    in_stock: 0,
    reorder_threshold: 10,
  })
  const [ingredientErrors, setIngredientErrors] = useState<Record<string, string>>({})

  // Modal State: Stock Adjustment / Restock
  const [adjustModalItem, setAdjustModalItem] = useState<{
    itemId: string
    itemName: string
    branchId: string
    branchName?: string
    unit: string
    currentQuantity?: number
  } | null>(null)
  const [adjustForm, setAdjustForm] = useState<{
    quantityChange: number
    reason: 'restock' | 'stock_take_audit' | 'spoilage_waste'
    notes: string
  }>({
    quantityChange: 10,
    reason: 'restock',
    notes: '',
  })
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // Validate Add Ingredient
  const validateIngredient = () => {
    const errs: Record<string, string> = {}
    if (!newIngredient.name_en.trim()) {
      errs.name_en = language === 'km' ? 'សូមបញ្ចូលឈ្មោះគ្រឿងផ្សំជាភាសាអង់គ្លេស' : 'Ingredient English name is required'
    }
    if (newIngredient.cost_usd < 0) {
      errs.cost_usd = language === 'km' ? 'ថ្លៃដើមមិនអាចតិចជាង ០' : 'Cost cannot be negative'
    }
    if (newIngredient.reorder_threshold < 0) {
      errs.reorder_threshold = language === 'km' ? 'កម្រិតជូនដំណឹងមិនអាចតិចជាង ០' : 'Threshold cannot be negative'
    }
    setIngredientErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateIngredient()) return

    if (businessId) {
      try {
        await createItemMutation.mutateAsync({
          name_en: newIngredient.name_en.trim(),
          name_km: newIngredient.name_km.trim() || undefined,
          sku: newIngredient.sku.trim() || undefined,
          unit_of_measure: newIngredient.unit as any,
          cost_per_unit_usd: newIngredient.cost_usd.toString() as any,
          reorder_threshold: newIngredient.reorder_threshold.toString() as any,
          ideal_stock_quantity: (newIngredient.reorder_threshold * 2).toString() as any,
        })
        setIsAddIngredientModalOpen(false)
        setNewIngredient({
          name_en: '',
          name_km: '',
          sku: '',
          unit: 'kg',
          cost_usd: 0,
          in_stock: 0,
          reorder_threshold: 10,
        })
        return
      } catch (err: any) {
        setIngredientErrors({ form: err?.message || 'Failed to create ingredient on server' })
      }
    }

    // Local fallback
    const item: RawIngredient = {
      id: `ing-${Date.now()}`,
      name_en: newIngredient.name_en,
      name_km: newIngredient.name_km || newIngredient.name_en,
      sku: newIngredient.sku || `ING-${Date.now().toString().slice(-4)}`,
      unit: newIngredient.unit.toUpperCase(),
      cost_usd: newIngredient.cost_usd,
      in_stock: newIngredient.in_stock,
      reorder_threshold: newIngredient.reorder_threshold,
    }

    setIngredients([item, ...ingredients])
    setIsAddIngredientModalOpen(false)
    setNewIngredient({
      name_en: '',
      name_km: '',
      sku: '',
      unit: 'kg',
      cost_usd: 0,
      in_stock: 0,
      reorder_threshold: 10,
    })
  }

  // Handle stock adjustment submit
  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustModalItem) return
    setAdjustError(null)

    const targetBranchId = adjustModalItem.branchId || effectiveBranchId || branches[0]?.id
    if (!targetBranchId || !businessId) {
      setAdjustError(language === 'km' ? 'មិនមានសាខាដែលបានជ្រើសរើស' : 'No branch selected for adjustment')
      return
    }

    try {
      await adjustStockMutation.mutateAsync({
        inventory_item_id: adjustModalItem.itemId,
        quantity_change: (adjustForm.reason === 'spoilage_waste' && adjustForm.quantityChange > 0
          ? -adjustForm.quantityChange
          : adjustForm.quantityChange) as any,
        reason: adjustForm.reason,
        notes: adjustForm.notes.trim() || undefined,
      })
      setAdjustModalItem(null)
      setAdjustForm({ quantityChange: 10, reason: 'restock', notes: '' })
    } catch (err: any) {
      setAdjustError(err?.message || 'Failed to adjust stock')
    }
  }

  // Filtered ingredients
  const filteredIngredients = ingredients.filter(
    (i) =>
      i.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.name_km.includes(searchQuery) ||
      i.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const lowStockAlerts: LowStockAlertItem[] = lowStockData?.alerts || []
  const totalAlertsCount = lowStockData?.total_low_stock_items ?? lowStockAlerts.length

  const filteredAlerts = lowStockAlerts.filter(
    (a) =>
      a.item_name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.sku && a.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      a.branch_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Top Banner for Low Stock Alerts */}
      {totalAlertsCount > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                <span>{language === 'km' ? 'ការជូនដំណឹងស្តុកជិតអស់' : 'Low Stock Warning'}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white">
                  {totalAlertsCount} {language === 'km' ? 'មុខទំនិញ' : 'items'}
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                {language === 'km'
                  ? `មានគ្រឿងផ្សំចំនួន ${totalAlertsCount} កំពុងស្ថិតក្រោមកម្រិតកំណត់ស្តុកអប្បបរមា (Threshold) ដែលទាមទារការបញ្ជាទិញចូលស្តុកបន្ថែម។`
                  : `${totalAlertsCount} item(s) are at or below their reorder threshold across selected branches.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <Button
              type="button"
              variant={viewMode === 'alerts' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode(viewMode === 'alerts' ? 'all' : 'alerts')}
              className={`text-xs font-semibold ${
                viewMode === 'alerts'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
              }`}
            >
              {viewMode === 'alerts'
                ? language === 'km'
                  ? 'បង្ហាញទំនិញទាំងអស់'
                  : 'Show All Items'
                : language === 'km'
                  ? 'ពិនិត្យបញ្ជីខ្វះខាត'
                  : 'Review Shortages'}
            </Button>
          </div>
        </div>
      )}

      {/* Header Bar & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'all'
                ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>{language === 'km' ? 'គ្រឿងផ្សំទាំងអស់' : 'All Ingredients'}</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {filteredIngredients.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('alerts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'alerts'
                ? 'bg-white dark:bg-zinc-950 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{language === 'km' ? 'ស្តុកជិតអស់' : 'Low Stock Alerts'}</span>
            {totalAlertsCount > 0 ? (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                {totalAlertsCount}
              </span>
            ) : (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                0
              </span>
            )}
          </button>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setIngredientErrors({})
              setIsAddIngredientModalOpen(true)
            }}
            className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {language === 'km' ? 'បន្ថែមគ្រឿងផ្សំ' : 'Add Raw Ingredient'}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Search bar & Quick info */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                viewMode === 'alerts'
                  ? language === 'km'
                    ? 'ស្វែងរកតាមឈ្មោះគ្រឿងផ្សំ ឬ សាខា...'
                    : 'Search alert or branch...'
                  : language === 'km'
                    ? 'ស្វែងរកតាមឈ្មោះ ឬ SKU...'
                    : 'Search ingredient or SKU...'
              }
              className="w-full pl-10 pr-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
            />
          </div>
          {effectiveBranchId && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500">
              <Building2 className="w-3.5 h-3.5" />
              <span>
                {branches.find((b) => b.id === effectiveBranchId)?.name_en || 'Branch'}
              </span>
            </div>
          )}
        </div>

        {/* VIEW 1: LOW STOCK ALERTS TABLE */}
        {viewMode === 'alerts' ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-950/20 text-zinc-600 dark:text-zinc-400 font-medium">
                    <th className="py-3 px-4">{language === 'km' ? 'គ្រឿងផ្សំ' : 'Depleted Ingredient'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'សាខា' : 'Branch'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ស្តុកបច្ចុប្បន្ន' : 'Current Stock'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'កម្រិតកំណត់ (Threshold)' : 'Threshold'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ខ្វះខាត (Shortage)' : 'Shortage'}</th>
                    <th className="py-3 px-4 text-right">{language === 'km' ? 'សកម្មភាព' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {isLoadingAlerts ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <EmenuLoader
                          size="sm"
                          message={language === 'km' ? 'កំពុងពិនិត្យស្តុកជិតអស់...' : 'Scanning low stock alerts...'}
                        />
                      </td>
                    </tr>
                  ) : filteredAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {language === 'km' ? 'ស្តុកមានសុវត្ថិភាពល្អ' : 'All Stock Levels Healthy'}
                          </div>
                          <p className="text-xs text-zinc-500 max-w-sm">
                            {language === 'km'
                              ? 'គ្មានគ្រឿងផ្សំណាមួយដែលស្ថិតក្រោមកម្រិតកំណត់ស្តុកអប្បបរមានៅពេលនេះទេ។'
                              : 'No items are currently below their reorder threshold.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAlerts.map((alert) => (
                      <tr
                        key={`${alert.branch_id}-${alert.inventory_item_id}`}
                        className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            <span>{alert.item_name_en}</span>
                          </div>
                          {alert.sku && (
                            <div className="text-[11px] font-mono text-zinc-400 pl-3.5">
                              {alert.sku}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-zinc-800 dark:text-zinc-200 font-medium">
                            {alert.branch_name}
                          </div>
                          <div className="text-[11px] text-zinc-400">{alert.branch_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            {Number(alert.current_quantity).toFixed(1)} {alert.unit_of_measure}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                          {Number(alert.reorder_threshold).toFixed(1)} {alert.unit_of_measure}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">
                            <ArrowDownRight className="w-3 h-3" />
                            -{Number(alert.shortage_quantity).toFixed(1)} {alert.unit_of_measure}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAdjustModalItem({
                                itemId: alert.inventory_item_id,
                                itemName: alert.item_name_en,
                                branchId: alert.branch_id,
                                branchName: alert.branch_name,
                                unit: alert.unit_of_measure,
                                currentQuantity: Number(alert.current_quantity),
                              })
                              setAdjustForm({
                                quantityChange: Math.max(1, Math.ceil(Number(alert.shortage_quantity))),
                                reason: 'restock',
                                notes: `Restock due to shortage of ${alert.shortage_quantity} ${alert.unit_of_measure}`,
                              })
                            }}
                            className="text-xs font-semibold px-2.5 py-1 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            {language === 'km' ? 'ទិញចូលស្តុក' : 'Restock'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* VIEW 2: ALL INVENTORY ITEMS TABLE */
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-medium">
                    <th className="py-3 px-4">{language === 'km' ? 'ឈ្មោះគ្រឿងផ្សំ' : 'Ingredient'}</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ឯកតា' : 'Unit'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ថ្លៃដើម/ឯកតា' : 'Cost/Unit'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ស្តុកបច្ចុប្បន្ន' : 'Current Stock'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'កម្រិតជូនដំណឹង' : 'Threshold'}</th>
                    <th className="py-3 px-4 text-right">{language === 'km' ? 'សកម្មភាព' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {isLoadingItems ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <EmenuLoader
                          size="sm"
                          message={language === 'km' ? 'កំពុងទាញយកទិន្នន័យស្តុក...' : 'Loading inventory items...'}
                        />
                      </td>
                    </tr>
                  ) : filteredIngredients.map((item) => {
                    const isLow = item.in_stock <= item.reorder_threshold
                    return (
                      <tr key={item.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            {isLow && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Low Stock" />}
                            <span>{language === 'km' ? item.name_km : item.name_en}</span>
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {language === 'km' ? item.name_en : item.name_km}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-500 text-xs">{item.sku}</td>
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{item.unit}</td>
                        <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                          ${item.cost_usd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          <span className={isLow ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-zinc-900 dark:text-zinc-100'}>
                            {item.in_stock} {item.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 text-xs">
                          {item.reorder_threshold} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustModalItem({
                                  itemId: item.id,
                                  itemName: language === 'km' ? item.name_km : item.name_en,
                                  branchId: effectiveBranchId || branches[0]?.id || '',
                                  unit: item.unit,
                                  currentQuantity: item.in_stock,
                                })
                                setAdjustForm({
                                  quantityChange: 10,
                                  reason: 'restock',
                                  notes: '',
                                })
                              }}
                              className="px-2 py-1 rounded text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                            >
                              {language === 'km' ? 'កែតម្រូវ' : 'Adjust'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIngredients(ingredients.filter((i) => i.id !== item.id))}
                              className="p-1 rounded text-zinc-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Adjust / Restock Stock */}
      {adjustModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setAdjustModalItem(null)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                  <span>{language === 'km' ? 'កែតម្រូវស្តុកគ្រឿងផ្សំ' : 'Adjust Stock Balance'}</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {adjustModalItem.itemName} ({adjustModalItem.branchName || 'Current Branch'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalItem(null)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustStockSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'មូលហេតុនៃការកែតម្រូវ' : 'Adjustment Reason'} *
                </label>
                <select
                  value={adjustForm.reason}
                  onChange={(e) =>
                    setAdjustForm({
                      ...adjustForm,
                      reason: e.target.value as 'restock' | 'stock_take_audit' | 'spoilage_waste',
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                >
                  <option value="restock">
                    {language === 'km' ? 'ទិញចូលស្តុក (Restock Delivery)' : 'Restock (Add Stock)'}
                  </option>
                  <option value="stock_take_audit">
                    {language === 'km' ? 'រាប់ស្តុកផ្ទៀងផ្ទាត់ (Stock Take Audit)' : 'Stock Take Audit'}
                  </option>
                  <option value="spoilage_waste">
                    {language === 'km' ? 'ខូចខាត ឬ ចោល (Spoilage / Waste)' : 'Spoilage / Waste'}
                  </option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {adjustForm.reason === 'spoilage_waste'
                    ? language === 'km'
                      ? `ចំនួនដែលខូចខាត (${adjustModalItem.unit})`
                      : `Waste Quantity (${adjustModalItem.unit})`
                    : language === 'km'
                      ? `ចំនួនកែប្រែ (${adjustModalItem.unit})`
                      : `Quantity Change (${adjustModalItem.unit})`} *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={adjustForm.quantityChange}
                    onChange={(e) =>
                      setAdjustForm({
                        ...adjustForm,
                        quantityChange: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">
                    {adjustModalItem.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'កំណត់សម្គាល់ (Notes)' : 'Audit Notes'}
                </label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  placeholder={language === 'km' ? 'ឧ. ការដឹកជញ្ជូនប្រចាំសប្តាហ៍' : 'e.g. Weekly vendor delivery'}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setAdjustModalItem(null)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={adjustStockMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {adjustStockMutation.isPending
                    ? language === 'km'
                      ? 'កំពុងរក្សាទុក...'
                      : 'Saving...'
                    : language === 'km'
                      ? 'យល់ព្រមកែប្រែ'
                      : 'Apply Adjustment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Raw Ingredient */}
      {isAddIngredientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsAddIngredientModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមគ្រឿងផ្សំដើម' : 'Add Raw Ingredient'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddIngredientModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {ingredientErrors.form && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                {ingredientErrors.form}
              </div>
            )}

            <form onSubmit={handleSaveIngredient} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'ឈ្មោះជាភាសាអង់គ្លេស' : 'Ingredient Name (English)'} *
                </label>
                <input
                  type="text"
                  value={newIngredient.name_en}
                  onChange={(e) => {
                    setNewIngredient({ ...newIngredient, name_en: e.target.value })
                    if (ingredientErrors.name_en) setIngredientErrors((prev) => ({ ...prev, name_en: '' }))
                  }}
                  placeholder={language === 'km' ? 'ឧ. Angkor Beef Tenderloin' : 'e.g. Angkor Beef Tenderloin'}
                  className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                    ingredientErrors.name_en
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                  }`}
                />
                {ingredientErrors.name_en && (
                  <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                    {ingredientErrors.name_en}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'ឈ្មោះជាភាសាខ្មែរ' : 'Ingredient Name (Khmer)'}
                </label>
                <input
                  type="text"
                  value={newIngredient.name_km}
                  onChange={(e) => setNewIngredient({ ...newIngredient, name_km: e.target.value })}
                  placeholder={language === 'km' ? 'ឧ. សាច់គោផាត់' : 'e.g. សាច់គោផាត់'}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">SKU</label>
                  <input
                    type="text"
                    value={newIngredient.sku}
                    onChange={(e) => setNewIngredient({ ...newIngredient, sku: e.target.value })}
                    placeholder="ING-001"
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ឯកតា' : 'Unit of Measure'} *
                  </label>
                  <select
                    value={newIngredient.unit}
                    onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                  >
                    {UNIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ថ្លៃដើម/ឯកតា ($)' : 'Cost Per Unit ($)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newIngredient.cost_usd}
                    onChange={(e) => {
                      setNewIngredient({ ...newIngredient, cost_usd: parseFloat(e.target.value) || 0 })
                      if (ingredientErrors.cost_usd) setIngredientErrors((prev) => ({ ...prev, cost_usd: '' }))
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                      ingredientErrors.cost_usd
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {ingredientErrors.cost_usd && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {ingredientErrors.cost_usd}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'កម្រិតជូនដំណឹងទិញថែម' : 'Reorder Threshold'} *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newIngredient.reorder_threshold}
                    onChange={(e) => {
                      setNewIngredient({ ...newIngredient, reorder_threshold: parseFloat(e.target.value) || 0 })
                      if (ingredientErrors.reorder_threshold)
                        setIngredientErrors((prev) => ({ ...prev, reorder_threshold: '' }))
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                      ingredientErrors.reorder_threshold
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {ingredientErrors.reorder_threshold && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {ingredientErrors.reorder_threshold}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsAddIngredientModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={createItemMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {createItemMutation.isPending
                    ? language === 'km'
                      ? 'កំពុងរក្សាទុក...'
                      : 'Saving...'
                    : language === 'km'
                      ? 'រក្សាទុក'
                      : 'Save Ingredient'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
