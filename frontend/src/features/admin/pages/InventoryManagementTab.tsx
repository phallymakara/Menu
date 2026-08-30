import { useState, type FC } from 'react'
import {
  Boxes,
  Plus,
  ArrowLeftRight,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'

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

interface StockTransfer {
  id: string
  transfer_number: string
  from_branch: string
  to_branch: string
  items_count: number
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED'
  created_at: string
}

export const InventoryTab: FC<{ defaultSection?: 'ingredients' | 'transfers' }> = ({
  defaultSection = 'ingredients',
}) => {
  const { language } = useLanguageStore()
  const [activeSubTab, setActiveSubTab] = useState<'ingredients' | 'transfers'>(defaultSection)
  const [searchQuery, setSearchQuery] = useState('')

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
      name_km: 'គ្រាប់កាហ្វេ រ៉ូប៊ូស្តា',
      sku: 'ING-CF-005',
      unit: 'KG',
      cost_usd: 9.0,
      in_stock: 14.0,
      reorder_threshold: 10.0,
    },
  ])

  // Transfers State
  const [transfers, setTransfers] = useState<StockTransfer[]>([
    {
      id: 'tr-101',
      transfer_number: 'TR-2026-0801',
      from_branch: 'Central Commissary Warehouse',
      to_branch: 'BKK Flagship Branch',
      items_count: 6,
      status: 'COMPLETED',
      created_at: '2026-08-28',
    },
    {
      id: 'tr-102',
      transfer_number: 'TR-2026-0802',
      from_branch: 'Central Commissary Warehouse',
      to_branch: 'Toul Kork Branch',
      items_count: 4,
      status: 'IN_TRANSIT',
      created_at: '2026-08-29',
    },
  ])

  // Modal States
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState(false)
  const [isNewTransferModalOpen, setIsNewTransferModalOpen] = useState(false)

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

  // Transfer Form State
  const [newTransfer, setNewTransfer] = useState({
    from_branch: 'Central Commissary Warehouse',
    to_branch: 'BKK Flagship Branch',
    items_count: 1,
  })
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({})

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
    setNewIngredient({
      name_en: '',
      name_km: '',
      sku: '',
      unit: 'KG',
      cost_usd: 0,
      in_stock: 0,
      reorder_threshold: 0,
    })
    setIngredientErrors({})
    setIsAddIngredientModalOpen(false)
  }

  const validateTransfer = () => {
    const errs: Record<string, string> = {}
    if (!newTransfer.to_branch.trim()) {
      errs.to_branch = language === 'km' ? 'សូមជ្រើសរើសសាខាទទួល' : 'Destination branch is required'
    }
    if (newTransfer.from_branch === newTransfer.to_branch) {
      errs.to_branch = language === 'km' ? 'សាខាផ្ញើនិងទទួលមិនអាចដូចគ្នាបានទេ' : 'Source and destination cannot be identical'
    }
    setTransferErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateTransfer()) return

    const item: StockTransfer = {
      id: `tr-${Date.now()}`,
      transfer_number: `TR-2026-${String(transfers.length + 101).padStart(4, '0')}`,
      from_branch: newTransfer.from_branch,
      to_branch: newTransfer.to_branch,
      items_count: newTransfer.items_count,
      status: 'PENDING',
      created_at: new Date().toISOString().split('T')[0],
    }
    setTransfers([item, ...transfers])
    setTransferErrors({})
    setIsNewTransferModalOpen(false)
  }

  const filteredIngredients = ingredients.filter(
    (i) =>
      i.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.name_km.includes(searchQuery) ||
      i.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header & Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'ការផ្គត់ផ្គង់ & ស្តុកគ្រឿងផ្សំ' : 'Supply & Inventory'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {language === 'km'
              ? 'គ្រប់គ្រងគ្រឿងផ្សំដើម និងការផ្ទេរស្តុកទំនិញរវាងសាខា'
              : 'Manage master raw ingredients and multi-branch stock transfers.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeSubTab === 'ingredients' ? (
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
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setTransferErrors({})
                setIsNewTransferModalOpen(true)
              }}
              className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
              {language === 'km' ? 'ផ្ទេរស្តុកថ្មី' : 'New Stock Transfer'}
            </Button>
          )}
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('ingredients')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'ingredients'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>{language === 'km' ? 'គ្រឿងផ្សំដើម (Raw Ingredients)' : 'Raw Ingredients'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('transfers')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'transfers'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
          }`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>{language === 'km' ? 'ការផ្ទេរស្តុក (Stock Transfers)' : 'Stock Transfers'}</span>
        </button>
      </div>

      {/* Sub-tab 1: Raw Ingredients Table */}
      {activeSubTab === 'ingredients' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'km' ? 'ស្វែងរកតាមឈ្មោះ ឬ SKU...' : 'Search ingredient or SKU...'}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
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
      )}

      {/* Sub-tab 2: Stock Transfers */}
      {activeSubTab === 'transfers' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-medium">
                    <th className="py-3 px-4">{language === 'km' ? 'លេខកូដផ្ទេរ' : 'Transfer #'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'សាខាដើម' : 'From Branch'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'សាខាទទួល' : 'To Branch'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ចំនួនមុខ' : 'Items'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'កាលបរិច្ឆេទ' : 'Date'}</th>
                    <th className="py-3 px-4">{language === 'km' ? 'ស្ថានភាព' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {tr.transfer_number}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{tr.from_branch}</td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{tr.to_branch}</td>
                      <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {tr.items_count} {language === 'km' ? 'មុខ' : 'items'}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">{tr.created_at}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
                          {tr.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Raw Ingredient */}
      {isAddIngredientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsAddIngredientModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមគ្រឿងផ្សំដើម' : 'Add Raw Ingredient'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddIngredientModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'ឈ្មោះគ្រឿងផ្សំ (EN)' : 'Ingredient Name (EN)'} *
                </label>
                <input
                  type="text"
                  value={newIngredient.name_en}
                  onChange={(e) => {
                    setNewIngredient({ ...newIngredient, name_en: e.target.value })
                    if (ingredientErrors.name_en) setIngredientErrors((prev) => ({ ...prev, name_en: '' }))
                  }}
                  placeholder="e.g. Kampot Black Pepper"
                  className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
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
                  {language === 'km' ? 'ឈ្មោះគ្រឿងផ្សំ (KM)' : 'Ingredient Name (KM)'}
                </label>
                <input
                  type="text"
                  value={newIngredient.name_km}
                  onChange={(e) => setNewIngredient({ ...newIngredient, name_km: e.target.value })}
                  placeholder="ឧ. ម្រេចខ្មៅកំពត"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ឯកតា (Unit)' : 'Unit of Measure'} *
                  </label>
                  <select
                    value={newIngredient.unit}
                    onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                  >
                    <option value="KG">KG (គីឡូក្រាម)</option>
                    <option value="GRAM">GRAM (ក្រាម)</option>
                    <option value="LITER">LITER (លីត្រ)</option>
                    <option value="ML">ML (មីលីលីត្រ)</option>
                    <option value="PIECE">PIECE (ដុំ/ផ្លែ)</option>
                    <option value="CAN">CAN (កំប៉ុង)</option>
                    <option value="BOTTLE">BOTTLE (ដប)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ថ្លៃដើម ($ USD)' : 'Cost per Unit ($)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newIngredient.cost_usd || ''}
                    onChange={(e) => {
                      setNewIngredient({ ...newIngredient, cost_usd: parseFloat(e.target.value) || 0 })
                      if (ingredientErrors.cost_usd) setIngredientErrors((prev) => ({ ...prev, cost_usd: '' }))
                    }}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ស្តុកបច្ចុប្បន្ន' : 'Current Stock'} *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newIngredient.in_stock || ''}
                    onChange={(e) => {
                      setNewIngredient({ ...newIngredient, in_stock: parseFloat(e.target.value) || 0 })
                      if (ingredientErrors.in_stock) setIngredientErrors((prev) => ({ ...prev, in_stock: '' }))
                    }}
                    placeholder="0"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
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

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'កម្រិតព្រមានស្តុកទាប' : 'Reorder Alert'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newIngredient.reorder_threshold || ''}
                    onChange={(e) =>
                      setNewIngredient({ ...newIngredient, reorder_threshold: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                  />
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

      {/* Modal: New Stock Transfer */}
      {isNewTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsNewTransferModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'ផ្ទេរស្តុកទំនិញ' : 'New Stock Transfer'}
              </h3>
              <button
                type="button"
                onClick={() => setIsNewTransferModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'សាខាដើម (From Branch)' : 'From Branch'} *
                </label>
                <input
                  type="text"
                  value={newTransfer.from_branch}
                  onChange={(e) => setNewTransfer({ ...newTransfer, from_branch: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'សាខាទទួល (To Branch)' : 'To Branch'} *
                </label>
                <input
                  type="text"
                  value={newTransfer.to_branch}
                  onChange={(e) => {
                    setNewTransfer({ ...newTransfer, to_branch: e.target.value })
                    if (transferErrors.to_branch) setTransferErrors((prev) => ({ ...prev, to_branch: '' }))
                  }}
                  placeholder="e.g. Toul Kork Branch"
                  className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none ${
                    transferErrors.to_branch
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                  }`}
                />
                {transferErrors.to_branch && (
                  <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                    {transferErrors.to_branch}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'ចំនួនមុខទំនិញ' : 'Items Count'} *
                </label>
                <input
                  type="number"
                  min="1"
                  value={newTransfer.items_count}
                  onChange={(e) => setNewTransfer({ ...newTransfer, items_count: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsNewTransferModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {language === 'km' ? 'បង្កើតប័ណ្ណផ្ទេរ' : 'Dispatch Transfer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
