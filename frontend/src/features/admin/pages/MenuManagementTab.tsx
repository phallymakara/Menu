import { useState, useEffect, useCallback, type FC } from 'react'
import {
  Plus,
  Search,
  Trash2,
  Check,
  X,
  Edit3,
  Loader2,
  Camera,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Category, MenuItem } from '../types/admin.types'

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name_en: 'Main Dishes', name_km: 'ម្ហូបពិសេស', display_order: 1, is_active: true },
  { id: 'cat-2', name_en: 'Appetizers', name_km: 'អាហារសម្រន់', display_order: 2, is_active: true },
  { id: 'cat-3', name_en: 'Drinks & Coffee', name_km: 'ភេសជ្ជៈ & កាហ្វេ', display_order: 3, is_active: true },
  { id: 'cat-4', name_en: 'Desserts', name_km: 'បង្អែម', display_order: 4, is_active: true },
]

const DEFAULT_ITEMS: MenuItem[] = [
  {
    id: 'item-1',
    category_id: 'cat-1',
    name_en: 'Beef Lok Lak',
    name_km: 'ឡុកឡាក់សាច់គោ',
    description_en: 'Tender wok-tossed beef cubes with Kampot pepper lime dip.',
    description_km: 'សាច់គោឆាម្រេចកំពត ញ៉ាំជាមួយបាយក្តៅៗ។',
    price_usd: 5.50,
    price_khr: 22550,
    is_available: true,
    kitchen_station: 'KITCHEN',
  },
  {
    id: 'item-2',
    category_id: 'cat-1',
    name_en: 'Fish Amok Royale',
    name_km: 'អាម៉ុកត្រីបុរាណ',
    description_en: 'Traditional Khmer steamed coconut fish curry in banana leaf cup.',
    description_km: 'អាម៉ុកត្រីដុតស្លឹកចេក រសជាតិប្រណិតបែបខ្មែរបុរាណ។',
    price_usd: 6.00,
    price_khr: 24600,
    is_available: true,
    kitchen_station: 'KITCHEN',
  },
  {
    id: 'item-3',
    category_id: 'cat-3',
    name_en: 'Iced Khmer Milk Coffee',
    name_km: 'កាហ្វេទឹកដោះគោទឹកកក',
    description_en: 'Slow-drip dark roast Robusta with sweet condensed milk over ice.',
    description_km: 'កាហ្វេទឹកដោះគោក្លិនឈ្ងុយ រសជាតិដិតជាប់ចិត្ត។',
    price_usd: 1.80,
    price_khr: 7380,
    is_available: true,
    kitchen_station: 'BAR',
  },
  {
    id: 'item-4',
    category_id: 'cat-3',
    name_en: 'Passion Fruit Soda',
    name_km: 'សូដាផាសិនស្រស់',
    description_en: 'Fresh passion fruit pulp with sparkling soda and chia seeds.',
    description_km: 'ផាសិនស្រស់លាយសូដា ជូរអែមត្រជាក់ស្រស់ស្រាយ។',
    price_usd: 2.25,
    price_khr: 9225,
    is_available: true,
    kitchen_station: 'BAR',
  },
  {
    id: 'item-5',
    category_id: 'cat-2',
    name_en: 'Crispy Spring Rolls (4 pcs)',
    name_km: 'ណែមបំពងស្រួយ (៤ ដុំ)',
    description_en: 'Golden crispy rolls stuffed with pork and sweet chili dip.',
    description_km: 'ណែមបំពងស្រួយក្តៅៗ ជ្រលក់ទឹកត្រីផ្អែម។',
    price_usd: 3.50,
    price_khr: 14350,
    is_available: false,
    kitchen_station: 'KITCHEN',
  },
]

export const MenuManagementTab: FC = () => {
  const { language } = useLanguageStore()

  // State
  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES)
  const [items, setItems] = useState<MenuItem[]>(DEFAULT_ITEMS)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Filter & Search
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Item Form State
  const [itemForm, setItemForm] = useState({
    name_en: '',
    name_km: '',
    category_id: 'cat-1',
    price_usd: 0,
    description_en: '',
    description_km: '',
    image_url: '',
    kitchen_station: 'KITCHEN' as 'KITCHEN' | 'BAR',
  })

  // Category Form State
  const [categoryForm, setCategoryForm] = useState({
    name_en: '',
    name_km: '',
  })

  // Fetch Business ID and Initial Data
  const loadInitialData = useCallback(async () => {
    const token = localStorage.getItem('emenu_access_token')
    if (!token) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)
    try {
      // 1. Resolve Active Business ID
      let currentBizId = businessId || localStorage.getItem('emenu_business_id')
      if (!currentBizId) {
        const bizRes = await api.get('/businesses')
        const businesses = bizRes.data
        if (Array.isArray(businesses) && businesses.length > 0) {
          currentBizId = businesses[0].id
          setBusinessId(currentBizId)
          localStorage.setItem('emenu_business_id', currentBizId!)
        }
      }

      if (!currentBizId) {
        setIsLoading(false)
        return
      }

      // 2. Fetch Categories & Menu Items in parallel
      const [catsRes, itemsRes] = await Promise.all([
        api.get(`/businesses/${currentBizId}/categories`).catch(() => ({ data: [] })),
        api.get(`/businesses/${currentBizId}/items`).catch(() => ({ data: [] })),
      ])

      if (Array.isArray(catsRes.data) && catsRes.data.length > 0) {
        const fetchedCategories: Category[] = catsRes.data.map((c: any) => ({
          id: c.id,
          name_en: c.name_en,
          name_km: c.name_km || c.name_en,
          display_order: c.display_order || 0,
          is_active: c.is_active ?? true,
        }))
        setCategories(fetchedCategories)
      }

      const rawItems = Array.isArray(itemsRes.data)
        ? itemsRes.data
        : itemsRes.data?.items || []

      if (rawItems.length > 0) {
        const fetchedItems: MenuItem[] = rawItems.map((it: any) => ({
          id: it.id,
          category_id: it.category_id,
          name_en: it.name_en,
          name_km: it.name_km || it.name_en,
          description_en: it.description_en || '',
          description_km: it.description_km || '',
          image_url: it.image_url || null,
          price_usd: parseFloat(it.base_price || it.price_usd || 0),
          price_khr: Math.round(parseFloat(it.base_price || it.price_usd || 0) * 4100),
          is_available: it.is_available ?? it.is_active ?? true,
          kitchen_station: it.kitchen_station || 'KITCHEN',
        }))
        setItems(fetchedItems)
      }
    } catch (err: any) {
      // If 401, user is in demo mode or token expired, keep DEFAULT_ITEMS smoothly
      if (err.response?.status !== 401) {
        console.error('Failed to load menu data:', err)
      }
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // --- Category CRUD Operations ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryForm.name_en.trim()) return

    setIsSubmitting(true)
    try {
      if (businessId) {
        if (editingCategory) {
          // UPDATE Category via PostgreSQL
          const res = await api.patch(
            `/businesses/${businessId}/categories/${editingCategory.id}`,
            {
              name_en: categoryForm.name_en,
              name_km: categoryForm.name_km || categoryForm.name_en,
            }
          )
          setCategories((prev) =>
            prev.map((c) => (c.id === editingCategory.id ? { ...c, ...res.data } : c))
          )
        } else {
          // CREATE Category via PostgreSQL
          const res = await api.post(`/businesses/${businessId}/categories`, {
            name_en: categoryForm.name_en,
            name_km: categoryForm.name_km || categoryForm.name_en,
            display_order: categories.length + 1,
            is_active: true,
          })
          const newCat: Category = {
            id: res.data.id,
            name_en: res.data.name_en,
            name_km: res.data.name_km || res.data.name_en,
            display_order: res.data.display_order || categories.length + 1,
            is_active: true,
          }
          setCategories((prev) => [...prev, newCat])
        }
      } else {
        // Fallback local update
        if (editingCategory) {
          setCategories((prev) =>
            prev.map((c) =>
              c.id === editingCategory.id
                ? {
                    ...c,
                    name_en: categoryForm.name_en,
                    name_km: categoryForm.name_km || categoryForm.name_en,
                  }
                : c
            )
          )
        } else {
          const newCat: Category = {
            id: `cat-${Date.now()}`,
            name_en: categoryForm.name_en,
            name_km: categoryForm.name_km || categoryForm.name_en,
            display_order: categories.length + 1,
            is_active: true,
          }
          setCategories((prev) => [...prev, newCat])
        }
      }

      setCategoryForm({ name_en: '', name_km: '' })
      setEditingCategory(null)
      setIsAddCategoryModalOpen(false)
    } catch {
      alert(
        language === 'km'
          ? 'មិនអាចរក្សាទុកប្រភេទបានទេ។'
          : 'Could not save category. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    const confirmMsg =
      language === 'km'
        ? 'តើអ្នកពិតជាចង់លុបប្រភេទនេះមែនទេ?'
        : 'Are you sure you want to delete this category?'
    if (!window.confirm(confirmMsg)) return

    try {
      if (businessId) {
        await api.delete(`/businesses/${businessId}/categories/${categoryId}`)
      }
      setCategories((prev) => prev.filter((c) => c.id !== categoryId))
      if (activeCategory === categoryId) {
        setActiveCategory('all')
      }
    } catch {
      alert(
        language === 'km'
          ? 'មិនអាចលុបប្រភេទបានទេ។'
          : 'Could not delete category. Please try again.'
      )
    }
  }

  // --- Menu Item CRUD Operations ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setItemForm((prev) => ({ ...prev, image_url: reader.result as string }))
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemForm.name_en.trim() || itemForm.price_usd <= 0) return

    setIsSubmitting(true)
    try {
      if (businessId) {
        if (editingItem) {
          // UPDATE Item in PostgreSQL
          const res = await api.patch(
            `/businesses/${businessId}/items/${editingItem.id}`,
            {
              name_en: itemForm.name_en,
              name_km: itemForm.name_km || itemForm.name_en,
              category_id: itemForm.category_id || null,
              base_price: itemForm.price_usd,
              description_en: itemForm.description_en,
              description_km: itemForm.description_km,
              image_url: itemForm.image_url || null,
            }
          )
          setItems((prev) =>
            prev.map((it) =>
              it.id === editingItem.id
                ? {
                    ...it,
                    name_en: res.data.name_en,
                    name_km: res.data.name_km,
                    category_id: res.data.category_id,
                    price_usd: parseFloat(res.data.base_price),
                    price_khr: Math.round(parseFloat(res.data.base_price) * 4100),
                    description_en: res.data.description_en,
                    description_km: res.data.description_km,
                    image_url: itemForm.image_url || res.data.image_url,
                    kitchen_station: itemForm.kitchen_station,
                  }
                : it
            )
          )
        } else {
          // CREATE Item in PostgreSQL
          const res = await api.post(`/businesses/${businessId}/items`, {
            category_id: itemForm.category_id || categories[0]?.id || null,
            name_en: itemForm.name_en,
            name_km: itemForm.name_km || itemForm.name_en,
            base_price: itemForm.price_usd,
            description_en: itemForm.description_en,
            description_km: itemForm.description_km,
            image_url: itemForm.image_url || null,
            is_available: true,
          })

          const createdItem: MenuItem = {
            id: res.data.id,
            category_id: res.data.category_id || itemForm.category_id,
            name_en: res.data.name_en,
            name_km: res.data.name_km || res.data.name_en,
            description_en: res.data.description_en || itemForm.description_en,
            description_km: res.data.description_km || itemForm.description_km,
            image_url: itemForm.image_url || res.data.image_url,
            price_usd: parseFloat(res.data.base_price || itemForm.price_usd),
            price_khr: Math.round(parseFloat(res.data.base_price || itemForm.price_usd) * 4100),
            is_available: true,
            kitchen_station: itemForm.kitchen_station,
          }
          setItems((prev) => [createdItem, ...prev])
        }
      } else {
        // Fallback local update
        if (editingItem) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === editingItem.id
                ? {
                    ...it,
                    name_en: itemForm.name_en,
                    name_km: itemForm.name_km || itemForm.name_en,
                    category_id: itemForm.category_id,
                    price_usd: itemForm.price_usd,
                    price_khr: Math.round(itemForm.price_usd * 4100),
                    description_en: itemForm.description_en,
                    description_km: itemForm.description_km,
                    image_url: itemForm.image_url || it.image_url,
                    kitchen_station: itemForm.kitchen_station,
                  }
                : it
            )
          )
        } else {
          const createdItem: MenuItem = {
            id: `item-${Date.now()}`,
            category_id: itemForm.category_id || categories[0]?.id || 'cat-1',
            name_en: itemForm.name_en,
            name_km: itemForm.name_km || itemForm.name_en,
            description_en: itemForm.description_en,
            description_km: itemForm.description_km,
            image_url: itemForm.image_url || null,
            price_usd: itemForm.price_usd,
            price_khr: Math.round(itemForm.price_usd * 4100),
            is_available: true,
            kitchen_station: itemForm.kitchen_station,
          }
          setItems((prev) => [createdItem, ...prev])
        }
      }

      setItemForm({
        name_en: '',
        name_km: '',
        category_id: categories[0]?.id || '',
        price_usd: 0,
        description_en: '',
        description_km: '',
        image_url: '',
        kitchen_station: 'KITCHEN',
      })
      setEditingItem(null)
      setIsAddItemModalOpen(false)
    } catch {
      alert(
        language === 'km'
          ? 'មិនអាចរក្សាទុកមុខម្ហូបបានទេ។'
          : 'Could not save menu item. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStock = async (item: MenuItem) => {
    const newStatus = !item.is_available

    // Optimistic UI update
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_available: newStatus } : it))
    )

    if (businessId) {
      try {
        await api.patch(`/businesses/${businessId}/items/${item.id}`, {
          is_active: newStatus,
        })
      } catch {
        // Revert on error
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_available: !newStatus } : it))
        )
      }
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    const confirmMsg =
      language === 'km'
        ? 'តើអ្នកពិតជាចង់លុបមុខម្ហូបនេះមែនទេ?'
        : 'Are you sure you want to delete this menu item?'
    if (!window.confirm(confirmMsg)) return

    try {
      if (businessId) {
        await api.delete(`/businesses/${businessId}/items/${itemId}`)
      }
      setItems((prev) => prev.filter((it) => it.id !== itemId))
    } catch {
      alert(
        language === 'km'
          ? 'មិនអាចលុបមុខម្ហូបបានទេ។'
          : 'Could not delete menu item. Please try again.'
      )
    }
  }

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item)
    setItemForm({
      name_en: item.name_en,
      name_km: item.name_km,
      category_id: item.category_id || '',
      price_usd: item.price_usd,
      description_en: item.description_en || '',
      description_km: item.description_km || '',
      image_url: item.image_url || '',
      kitchen_station: (item.kitchen_station === 'BAR' ? 'BAR' : 'KITCHEN'),
    })
    setIsAddItemModalOpen(true)
  }

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat)
    setCategoryForm({
      name_en: cat.name_en,
      name_km: cat.name_km,
    })
    setIsAddCategoryModalOpen(true)
  }

  const filteredItems = items.filter((it) => {
    const matchesCat = activeCategory === 'all' || it.category_id === activeCategory
    const matchesSearch =
      it.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.name_km.includes(searchQuery)
    return matchesCat && matchesSearch
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'មុខម្ហូប & ប្រភេទ' : 'Menu & Category Management'}
          </h1>
          <p className="text-sm text-zinc-500">
            {language === 'km'
              ? 'បង្កើត កែសម្រួល និងគ្រប់គ្រងមុខម្ហូប និង​ តម្លៃ'
              : 'Add dishes, edit categories, and manage live stock'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              setEditingCategory(null)
              setCategoryForm({ name_en: '', name_km: '' })
              setIsAddCategoryModalOpen(true)
            }}
            className="text-sm sm:text-base font-semibold px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-2xl border-zinc-300 dark:border-zinc-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            {language === 'km' ? 'បង្កើតប្រភេទ' : 'New Category'}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => {
              setEditingItem(null)
              setItemForm({
                name_en: '',
                name_km: '',
                category_id: categories[0]?.id || '',
                price_usd: 0,
                description_en: '',
                description_km: '',
                image_url: '',
                kitchen_station: 'KITCHEN',
              })
              setIsAddItemModalOpen(true)
            }}
            className="text-sm sm:text-base font-semibold px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {language === 'km' ? 'បន្ថែមមុខម្ហូបថ្មី' : 'Add Menu Item'}
          </Button>
        </div>
      </div>

      {/* Error Message (Plain Text Only, No Container Box) */}
      {errorMessage && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {/* Category Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              activeCategory === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {language === 'km' ? 'ទាំងអស់' : 'All Items'}
          </button>
          {categories.map((c) => (
            <div key={c.id} className="relative group shrink-0">
              <button
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  activeCategory === c.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {language === 'km' ? c.name_km : c.name_en}
              </button>

                {/* Edit category button on hover */}
                <button
                  type="button"
                  onClick={() => openEditCategoryModal(c)}
                  title="Edit Category"
                  className="hidden group-hover:inline-flex absolute -top-1.5 -right-1.5 p-1 rounded-full bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 shadow-none hover:scale-110 transition-transform"
                >
                  <Edit3 className="w-2.5 h-2.5" />
                </button>
              </div>
            )
          )}
        </div>

        {/* Search Field */}
        <div className="relative w-full sm:w-96 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប...' : 'Search menu...'}
            className="w-full pl-10 pr-4 py-2 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
          />
        </div>
      </div>

      {/* Loading Skeleton / Spinner */}
      {isLoading && (
        <div className="py-16 flex flex-col items-center justify-center space-y-3 text-zinc-400">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          <p className="text-xs">{language === 'km' ? 'កំពុងទាញទិន្នន័យពី Database...' : 'Loading menu from PostgreSQL...'}</p>
        </div>
      )}

      {/* Menu Items Grid (Zero Shadows, Clean Flat Border) */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-colors flex flex-col justify-between space-y-3 ${
                item.is_available
                  ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 opacity-75'
              }`}
            >
              <div className="space-y-2">
                {/* Top row: Badges & Actions */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      item.kitchen_station === 'BAR'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
                    }`}
                  >
                    {item.kitchen_station || 'KITCHEN'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditItemModal(item)}
                      title="Edit Item"
                      className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      title="Delete Item"
                      className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Title & Khmer Title with optional Dish Image */}
                <div className="flex items-start gap-3">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name_en}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-zinc-200 dark:border-zinc-800"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50 truncate">
                      {item.name_en}
                    </h3>
                    <h4 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 font-khmer truncate">
                      {item.name_km}
                    </h4>
                  </div>
                </div>

                {/* Description */}
                {(item.description_km || item.description_en) && (
                  <p className="text-xs text-zinc-500 line-clamp-2">
                    {language === 'km' && item.description_km ? item.description_km : item.description_en}
                  </p>
                )}
              </div>

              {/* Bottom Row: Price & In-Stock Switch */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                    ${item.price_usd.toFixed(2)}
                  </span>
                  <span className="text-xs text-zinc-400 ml-1.5 font-mono">
                    ({item.price_khr.toLocaleString()} ៛)
                  </span>
                </div>

                {/* Availability Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleStock(item)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    item.is_available
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {item.is_available ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>{language === 'km' ? 'មានលក់' : 'In Stock'}</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3 h-3" />
                      <span>{language === 'km' ? 'អស់ស្តុក' : 'Sold Out'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add/Edit Menu Item */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsAddItemModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
                {editingItem
                  ? language === 'km'
                    ? 'កែសម្រួលមុខម្ហូប'
                    : 'Edit Menu Item'
                  : language === 'km'
                  ? 'បន្ថែមមុខម្ហូបថ្មី'
                  : 'Add New Menu Item'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddItemModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Dish Image Upload at Top Center */}
              <div className="flex flex-col items-center justify-center space-y-1.5 pb-1">
                <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {language === 'km' ? 'រូបភាពមុខម្ហូប' : 'Food Image'}
                </label>
                <div
                  onClick={() => document.getElementById('food-image-input')?.click()}
                  className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors group"
                >
                  {itemForm.image_url ? (
                    <>
                      <img
                        src={itemForm.image_url}
                        alt="Food Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                        <Camera className="w-5 h-5 mr-1" />
                        <span>{language === 'km' ? 'ប្តូររូប' : 'Change'}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-2 text-center text-zinc-400 group-hover:text-emerald-600 transition-colors">
                      <Camera className="w-7 h-7 mb-1 stroke-[1.5]" />
                      <span className="text-xs font-semibold leading-tight">
                        {language === 'km' ? 'ចុចបញ្ចូលរូបភាព' : 'Upload Image'}
                      </span>
                    </div>
                  )}
                </div>
                <input
                  id="food-image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'ឈ្មោះមុខម្ហូប (EN)' : 'Item Name (EN)'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={itemForm.name_en}
                    onChange={(e) => setItemForm({ ...itemForm, name_en: e.target.value })}
                    placeholder="e.g. Beef Lok Lak"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'ឈ្មោះមុខម្ហូប (KM)' : 'Item Name (KM)'}
                  </label>
                  <input
                    type="text"
                    value={itemForm.name_km}
                    onChange={(e) => setItemForm({ ...itemForm, name_km: e.target.value })}
                    placeholder="ឧ. ឡុកឡាក់សាច់គោ"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'ប្រភេទ' : 'Category'} *
                  </label>
                  <select
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {language === 'km' ? c.name_km : c.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'តម្លៃ ($ USD)' : 'Price ($ USD)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    value={itemForm.price_usd || ''}
                    onChange={(e) => setItemForm({ ...itemForm, price_usd: parseFloat(e.target.value) || 0 })}
                    placeholder="5.50"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ការពិពណ៌នា (EN)' : 'Description (EN)'}
                </label>
                <textarea
                  rows={2}
                  value={itemForm.description_en}
                  onChange={(e) => setItemForm({ ...itemForm, description_en: e.target.value })}
                  placeholder="e.g. Tender beef with Kampot pepper..."
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ការពិពណ៌នា (KM)' : 'Description (KM)'}
                </label>
                <textarea
                  rows={2}
                  value={itemForm.description_km}
                  onChange={(e) => setItemForm({ ...itemForm, description_km: e.target.value })}
                  placeholder="ឧ. សាច់គោឆាម្រេចកំពត..."
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="h-11 px-5 text-sm font-semibold rounded-2xl"
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  className="h-11 px-6 text-sm font-semibold rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingItem ? (
                    language === 'km' ? 'កែប្រែ' : 'Update Item'
                  ) : (
                    language === 'km' ? 'រក្សាទុកមុខម្ហូប' : 'Save Item'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Category */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsAddCategoryModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
                {editingCategory
                  ? language === 'km'
                    ? 'កែសម្រួលប្រភេទ'
                    : 'Edit Category'
                  : language === 'km'
                  ? 'បង្កើតប្រភេទថ្មី'
                  : 'Create New Category'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddCategoryModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ឈ្មោះប្រភេទ (English)' : 'Category Name (English)'} *
                </label>
                <input
                  type="text"
                  required
                  value={categoryForm.name_en}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_en: e.target.value })}
                  placeholder="e.g. Desserts"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ឈ្មោះប្រភេទ (ខ្មែរ)' : 'Category Name (Khmer)'}
                </label>
                <input
                  type="text"
                  value={categoryForm.name_km}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_km: e.target.value })}
                  placeholder="ឧ. បង្អែម"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {editingCategory ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteCategory(editingCategory.id)
                      setIsAddCategoryModalOpen(false)
                    }}
                    className="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1.5 py-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{language === 'km' ? 'លុបប្រភេទ' : 'Delete'}</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={() => setIsAddCategoryModalOpen(false)}
                    className="h-11 px-5 text-sm font-semibold rounded-2xl"
                  >
                    {language === 'km' ? 'បោះបង់' : 'Cancel'}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={isSubmitting}
                    className="h-11 px-6 text-sm font-semibold rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : editingCategory ? (
                      language === 'km' ? 'កែប្រែ' : 'Update'
                    ) : (
                      language === 'km' ? 'រក្សាទុក' : 'Save Category'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
