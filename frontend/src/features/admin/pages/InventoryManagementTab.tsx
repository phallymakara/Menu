import { useState, useEffect, type FC } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { useBusinesses } from '../hooks/useTenantQueries'
import { useInventoryItems } from '../hooks/useInventoryQueries'

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

export const InventoryTab: FC = () => {
  const { language } = useLanguageStore()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const { data: businesses = [] } = useBusinesses()
  useEffect(() => {
    if (!businessId && businesses.length > 0) {
      setBusinessId(businesses[0].id)
      localStorage.setItem('emenu_business_id', businesses[0].id)
    }
  }, [businesses, businessId])

  useEffect(() => {
    const handleBranchChanged = () => {
      if (businessId) {
        queryClient.invalidateQueries({ queryKey: ['inventory-items', businessId] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [businessId, queryClient])

  const { data: serverItems = [] } = useInventoryItems(businessId)

  // Ingredients State
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

  // Sync server items if available
  useEffect(() => {
    if (serverItems.length > 0) {
      setIngredients(
        serverItems.map((item) => ({
          id: item.id,
          name_en: item.name_en,
          name_km: item.name_km || item.name_en,
          sku: item.sku || 'N/A',
          unit: item.unit_of_measure.toUpperCase(),
          cost_usd: Number(item.cost_per_unit_usd),
          in_stock: 0,
          reorder_threshold: Number(item.reorder_threshold),
        }))
      )
    }
  }, [serverItems])

  // Modal State
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState(false)

  // Ingredient Form State
  const [newIngredient, setNewIngredient] = useState({
    name_en: '',
    name_km: '',
    sku: '',
    unit: 'KG',
    cost_usd: 0,
    in_stock: 0,
    reorder_threshold: 0,
  })
  const [ingredientErrors, setIngredientErrors] = useState<Record<string, string>>({})

  // Validate Ingredient
  const validateIngredient = () => {
    const errs: Record<string, string> = {}
    if (!newIngredient.name_en.trim()) {
      errs.name_en = language === 'km' ? 'សូមបញ្ចូលឈ្មោះគ្រឿងផ្សំជាភាសាអង់គ្លេស' : 'Ingredient English name is required'
    }
    if (newIngredient.cost_usd < 0) {
      errs.cost_usd = language === 'km' ? 'ថ្លៃដើមមិនអាចតិចជាង ០' : 'Cost cannot be negative'
    }
    if (newIngredient.in_stock < 0) {
      errs.in_stock = language === 'km' ? 'ចំនួនស្តុកមិនអាចតិចជាង ០' : 'Stock quantity cannot be negative'
    }
    setIngredientErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveIngredient = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateIngredient()) return

    const item: RawIngredient = {
      id: `ing-${Date.now()}`,
      name_en: newIngredient.name_en,
      name_km: newIngredient.name_km || newIngredient.name_en,
      sku: newIngredient.sku || `ING-${Date.now().toString().slice(-4)}`,
      unit: newIngredient.unit,
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
      unit: 'KG',
      cost_usd: 0,
      in_stock: 0,
      reorder_threshold: 0,
    })
  }

  // Filtered ingredients
  const filteredIngredients = ingredients.filter(
    (i) =>
      i.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.name_km.includes(searchQuery) ||
      i.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <div className="flex items-center justify-start gap-2 flex-wrap">
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

      {/* Raw Ingredients Section */}
      <div className="space-y-4">
        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'km' ? 'ស្វែងរកតាមឈ្មោះ ឬ SKU...' : 'Search ingredient or SKU...'}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
          />
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-medium">
                  <th className="py-3 px-4">{language === 'km' ? 'ឈ្មោះគ្រឿងផ្សំ' : 'Ingredient'}</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">{language === 'km' ? 'ឯកតា' : 'Unit'}</th>
                  <th className="py-3 px-4">{language === 'km' ? 'ថ្លៃដើម/ឯកតា' : 'Cost/Unit'}</th>
                  <th className="py-3 px-4">{language === 'km' ? 'ស្តុកបច្ចុប្បន្ន' : 'Current Stock'}</th>
                  <th className="py-3 px-4 text-right">{language === 'km' ? 'សកម្មភាព' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredIngredients.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {language === 'km' ? item.name_km : item.name_en}
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
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.in_stock} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setIngredients(ingredients.filter((i) => i.id !== item.id))}
                        className="p-1 rounded text-zinc-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
                    <option value="KG">KG (Kilograms)</option>
                    <option value="G">G (Grams)</option>
                    <option value="L">L (Liters)</option>
                    <option value="ML">ML (Milliliters)</option>
                    <option value="CAN">CAN (Cans)</option>
                    <option value="BOTTLE">BOTTLE (Bottles)</option>
                    <option value="PIECE">PIECE (Pieces)</option>
                    <option value="BOX">BOX (Boxes)</option>
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
                    {language === 'km' ? 'ស្តុកបច្ចុប្បន្ន' : 'Current Stock'} *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newIngredient.in_stock}
                    onChange={(e) => {
                      setNewIngredient({ ...newIngredient, in_stock: parseFloat(e.target.value) || 0 })
                      if (ingredientErrors.in_stock) setIngredientErrors((prev) => ({ ...prev, in_stock: '' }))
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                      ingredientErrors.in_stock
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {ingredientErrors.in_stock && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {ingredientErrors.in_stock}
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {language === 'km' ? 'រក្សាទុក' : 'Save Ingredient'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
