import { useState, useEffect, useCallback, type FC } from 'react'
import {
  Plus,
  Search,
  Trash2,
  X,
  Edit3,
  Loader2,
  Camera,
  MoreVertical,
  Check,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Category, MenuItem, ModifierGroup, ModifierOption } from '../types/admin.types'

export const MenuManagementTab: FC = () => {
  const { language } = useLanguageStore()

  // State
  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Filter & Search
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Action Menu Dropdown State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.item-action-menu')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Modals
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Item Form State
  const [itemForm, setItemForm] = useState<{
    name_en: string
    name_km: string
    category_id: string
    price_usd: number
    description_en: string
    description_km: string
    image_url: string
    kitchen_station: 'KITCHEN' | 'BAR'
    modifier_groups: ModifierGroup[]
  }>({
    name_en: '',
    name_km: '',
    category_id: 'cat-1',
    price_usd: 0,
    description_en: '',
    description_km: '',
    image_url: '',
    kitchen_station: 'KITCHEN',
    modifier_groups: [],
  })

  // Option Draft state for adding options with Check/X icons
  const [isAddingOption, setIsAddingOption] = useState(false)
  const [newOptionDraft, setNewOptionDraft] = useState<{
    name_en: string
    name_km: string
    price_usd: string
  }>({ name_en: '', name_km: '', price_usd: '' })

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
        const fetchedItems: MenuItem[] = await Promise.all(
          rawItems.map(async (it: any) => {
            let modifier_groups: ModifierGroup[] = []
            if (isUuid(it.id)) {
              try {
                const mgRes = await api.get(`/businesses/${currentBizId}/items/${it.id}/modifier-groups`)
                if (Array.isArray(mgRes.data)) {
                  modifier_groups = mgRes.data.map((g: any) => ({
                    id: g.id,
                    name_en: g.name_en,
                    name_km: g.name_km || g.name_en,
                    is_required: (g.min_selections || 0) > 0,
                    min_selections: g.min_selections || 0,
                    max_selections: g.max_selections || 1,
                    options: (g.options || []).map((o: any) => ({
                      id: o.id,
                      name_en: o.name_en,
                      name_km: o.name_km || o.name_en,
                      price_usd: parseFloat(o.price || 0),
                      is_default: o.is_default || false,
                    })),
                  }))
                }
              } catch {
                // Ignore fallback
              }
            }

            return {
              id: it.id,
              category_id: it.category_id,
              name_en: it.name_en,
              name_km: it.name_km || it.name_en,
              description_en: it.description_en || '',
              description_km: it.description_km || '',
              image_url: it.image_url || null,
              price_usd: parseFloat(it.base_price || it.price_usd || 0),
              price_khr: Math.round(parseFloat(it.base_price || it.price_usd || 0) * 4100),
              is_available: it.is_active ?? it.is_available ?? true,
              kitchen_station: it.kitchen_station || 'KITCHEN',
              modifier_groups,
            }
          })
        )
        setItems(fetchedItems)
      }
    } catch {
      setErrorMessage(
        language === 'km'
          ? 'មិនអាចទាញយកទិន្នន័យមុខម្ហូបបានទេ។'
          : 'Unable to load menu items. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [businessId, language])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Helper to detect real database UUID vs mock items/categories
  const isUuid = (id?: string | null) =>
    !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  // --- Category CRUD Operations ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryForm.name_en.trim()) return

    setIsSubmitting(true)
    setErrorMessage(null)
    const token = localStorage.getItem('emenu_access_token')

    try {
      if (businessId && token) {
        if (editingCategory && isUuid(editingCategory.id)) {
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
        } else if (!editingCategory) {
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
        } else {
          // Editing local category
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
        }
      } else {
        // Fallback for local/demo mode
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
    } catch (err: any) {
      if (err.response?.status !== 401) {
        setErrorMessage(
          language === 'km'
            ? 'មិនអាចរក្សាទុកប្រភេទបានទេ។ សូមព្យាយាមម្តងទៀត។'
            : 'Unable to save category. Please try again.'
        )
      } else {
        // Save locally on 401
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
        setCategoryForm({ name_en: '', name_km: '' })
        setEditingCategory(null)
        setIsAddCategoryModalOpen(false)
      }
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

    setErrorMessage(null)
    const token = localStorage.getItem('emenu_access_token')

    if (businessId && token && isUuid(categoryId)) {
      try {
        await api.delete(`/businesses/${businessId}/categories/${categoryId}`)
      } catch (err: any) {
        if (err.response?.status !== 401) {
          setErrorMessage(
            language === 'km'
              ? 'មិនអាចលុបប្រភេទបានទេ។ សូមព្យាយាមម្តងទៀត។'
              : 'Unable to delete category. Please try again.'
          )
          return
        }
      }
    }

    setCategories((prev) => prev.filter((c) => c.id !== categoryId))
    if (activeCategory === categoryId) {
      setActiveCategory('all')
    }
  }

  // --- Menu Item CRUD Operations ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview immediately for rapid responsive UI
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setItemForm((prev) => ({ ...prev, image_url: reader.result as string }))
      }
    }
    reader.readAsDataURL(file)

    // Upload to server media endpoint
    if (businessId) {
      setIsUploadingImage(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const uploadRes = await api.post(
          `/businesses/${businessId}/media/upload`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        )
        if (uploadRes.data?.url) {
          setItemForm((prev) => ({ ...prev, image_url: uploadRes.data.url }))
        }
      } catch (err) {
        console.warn('Backend image upload endpoint not reachable, kept preview data:', err)
      } finally {
        setIsUploadingImage(false)
      }
    }
  }

  // --- Direct Option Handlers with Tick/Check Save & Cross/X Cancel ---
  const handleOpenAddOption = () => {
    setIsAddingOption(true)
    setNewOptionDraft({ name_en: '', name_km: '', price_usd: '' })
  }

  const handleCancelNewOption = () => {
    setIsAddingOption(false)
    setNewOptionDraft({ name_en: '', name_km: '', price_usd: '' })
  }

  const handleSaveNewOption = () => {
    const nameEn = newOptionDraft.name_en.trim()
    const nameKm = newOptionDraft.name_km.trim()
    if (!nameEn && !nameKm) return

    const newOption: ModifierOption = {
      id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name_en: nameEn || nameKm,
      name_km: nameKm || nameEn,
      price_usd: parseFloat(newOptionDraft.price_usd) || 0,
      is_default: false,
    }

    setItemForm((prev) => {
      if (prev.modifier_groups.length === 0) {
        return {
          ...prev,
          modifier_groups: [
            {
              id: `mg_${Date.now()}`,
              name_en: 'Options',
              name_km: 'ជម្រើសបន្ថែម',
              is_required: false,
              min_selections: 0,
              max_selections: 20,
              options: [newOption],
            },
          ],
        }
      }
      const firstGroup = prev.modifier_groups[0]
      const updatedFirst = {
        ...firstGroup,
        options: [...firstGroup.options, newOption],
      }
      return {
        ...prev,
        modifier_groups: [updatedFirst, ...prev.modifier_groups.slice(1)],
      }
    })

    setIsAddingOption(false)
    setNewOptionDraft({ name_en: '', name_km: '', price_usd: '' })
  }

  const handleRemoveDirectOption = (optId: string) => {
    setItemForm((prev) => ({
      ...prev,
      modifier_groups: prev.modifier_groups
        .map((g) => ({
          ...g,
          options: g.options.filter((o) => o.id !== optId),
        }))
        .filter((g) => g.options.length > 0),
    }))
  }

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemForm.name_en.trim() || itemForm.price_usd <= 0) return

    setIsSubmitting(true)
    setErrorMessage(null)
    const token = localStorage.getItem('emenu_access_token')

    try {
      if (businessId && token) {
        let savedItemId: string | null = null
        let savedItemPayload: any = null

        if (editingItem && isUuid(editingItem.id)) {
          const res = await api.patch(
            `/businesses/${businessId}/items/${editingItem.id}`,
            {
              name_en: itemForm.name_en,
              name_km: itemForm.name_km || itemForm.name_en,
              category_id: isUuid(itemForm.category_id) ? itemForm.category_id : null,
              base_price: itemForm.price_usd,
              description_en: itemForm.description_en,
              description_km: itemForm.description_km,
              image_url: itemForm.image_url || null,
            }
          )
          savedItemId = editingItem.id
          savedItemPayload = {
            ...editingItem,
            name_en: res.data.name_en,
            name_km: res.data.name_km,
            category_id: res.data.category_id,
            price_usd: parseFloat(res.data.base_price),
            price_khr: Math.round(parseFloat(res.data.base_price) * 4100),
            description_en: res.data.description_en,
            description_km: res.data.description_km,
            image_url: itemForm.image_url || res.data.image_url,
            kitchen_station: itemForm.kitchen_station,
            modifier_groups: itemForm.modifier_groups,
          }
        } else if (!editingItem) {
          const res = await api.post(`/businesses/${businessId}/items`, {
            category_id: isUuid(itemForm.category_id) ? itemForm.category_id : null,
            name_en: itemForm.name_en,
            name_km: itemForm.name_km || itemForm.name_en,
            base_price: itemForm.price_usd,
            description_en: itemForm.description_en,
            description_km: itemForm.description_km,
            image_url: itemForm.image_url || null,
            is_active: true,
          })
          savedItemId = res.data.id
          savedItemPayload = {
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
            modifier_groups: itemForm.modifier_groups,
          }
        }

        // --- Database Persistence for Options / Modifier Groups ---
        if (savedItemId && isUuid(savedItemId)) {
          const allOptions = itemForm.modifier_groups.flatMap((g) => g.options)
          if (allOptions.length > 0) {
            let targetGroupId: string | null = null
            const existingMgRes = await api
              .get(`/businesses/${businessId}/items/${savedItemId}/modifier-groups`)
              .catch(() => null)

            if (existingMgRes?.data && Array.isArray(existingMgRes.data) && existingMgRes.data.length > 0) {
              targetGroupId = existingMgRes.data[0].id
            } else {
              const newMgRes = await api
                .post(`/businesses/${businessId}/modifier-groups`, {
                  name_en: 'Options',
                  name_km: 'ជម្រើសបន្ថែម',
                  min_selections: 0,
                  max_selections: 20,
                  display_order: 0,
                  is_active: true,
                })
                .catch(() => null)

              if (newMgRes?.data?.id) {
                targetGroupId = newMgRes.data.id
                await api
                  .post(`/businesses/${businessId}/items/${savedItemId}/modifier-groups`, {
                    modifier_group_ids: [targetGroupId],
                  })
                  .catch(() => null)
              }
            }

            if (targetGroupId) {
              for (const opt of allOptions) {
                if (opt.id.startsWith('opt_')) {
                  await api
                    .post(`/businesses/${businessId}/modifier-groups/${targetGroupId}/options`, {
                      name_en: opt.name_en,
                      name_km: opt.name_km || opt.name_en,
                      price: opt.price_usd,
                      is_default: opt.is_default || false,
                      is_active: true,
                    })
                    .catch(() => null)
                }
              }
            }
          }
        }

        if (editingItem && savedItemPayload) {
          setItems((prev) =>
            prev.map((it) => (it.id === editingItem.id ? savedItemPayload : it))
          )
        } else if (savedItemPayload) {
          setItems((prev) => [savedItemPayload, ...prev])
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
                  modifier_groups: itemForm.modifier_groups,
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
            modifier_groups: itemForm.modifier_groups,
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
        modifier_groups: [],
      })
      setEditingItem(null)
      setIsAddItemModalOpen(false)
    } catch {
      setErrorMessage(
        language === 'km'
          ? 'មិនអាចរក្សាទុកមុខម្ហូបបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Unable to save menu item. Please try again.'
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

    const token = localStorage.getItem('emenu_access_token')

    if (businessId && token && isUuid(item.id)) {
      try {
        await api.patch(`/businesses/${businessId}/items/${item.id}`, {
          is_active: newStatus,
        })
      } catch (err: any) {
        if (err.response?.status !== 401) {
          // Revert on real server failure
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, is_available: !newStatus } : it))
          )
          setErrorMessage(
            language === 'km'
              ? 'មិនអាចផ្លាស់ប្តូរស្ថានភាពមុខម្ហូបបានទេ។'
              : 'Unable to update item availability status.'
          )
        }
      }
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    const confirmMsg =
      language === 'km'
        ? 'តើអ្នកពិតជាចង់លុបមុខម្ហូបនេះមែនទេ?'
        : 'Are you sure you want to delete this menu item?'
    if (!window.confirm(confirmMsg)) return

    setErrorMessage(null)
    const token = localStorage.getItem('emenu_access_token')
    if (businessId && token && isUuid(itemId)) {
      try {
        await api.delete(`/businesses/${businessId}/items/${itemId}`)
      } catch (err: any) {
        if (err.response?.status !== 401) {
          setErrorMessage(
            language === 'km'
              ? 'មិនអាចលុបមុខម្ហូបបានទេ។ សូមព្យាយាមម្តងទៀត។'
              : 'Unable to delete menu item. Please try again.'
          )
          return
        }
      }
    }
    setItems((prev) => prev.filter((it) => it.id !== itemId))
  }

  const openEditItemModal = async (item: MenuItem) => {
    setEditingItem(item)
    setItemForm({
      name_en: item.name_en,
      name_km: item.name_km,
      category_id: item.category_id || '',
      price_usd: item.price_usd,
      description_en: item.description_en || '',
      description_km: item.description_km || '',
      image_url: item.image_url || '',
      kitchen_station: item.kitchen_station === 'BAR' ? 'BAR' : 'KITCHEN',
      modifier_groups: item.modifier_groups || [],
    })
    setIsAddItemModalOpen(true)

    // If backend item with valid UUID, fetch latest modifier groups
    if (businessId && isUuid(item.id)) {
      try {
        const mgRes = await api.get(`/businesses/${businessId}/items/${item.id}/modifier-groups`)
        if (Array.isArray(mgRes.data) && mgRes.data.length > 0) {
          const fetchedGroups: ModifierGroup[] = mgRes.data.map((g: any) => ({
            id: g.id,
            name_en: g.name_en,
            name_km: g.name_km || g.name_en,
            is_required: (g.min_selections || 0) > 0,
            min_selections: g.min_selections || 0,
            max_selections: g.max_selections || 1,
            options: (g.options || []).map((o: any) => ({
              id: o.id,
              name_en: o.name_en,
              name_km: o.name_km || o.name_en,
              price_usd: parseFloat(o.price || 0),
              is_default: o.is_default || false,
            })),
          }))
          setItemForm((prev) => ({ ...prev, modifier_groups: fetchedGroups }))
        }
      } catch {
        // Keep existing
      }
    }
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
    <div className="space-y-6">
      {/* Primary Actions Aligned Left */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingCategory(null)
            setCategoryForm({ name_en: '', name_km: '' })
            setIsAddCategoryModalOpen(true)
          }}
          className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full border-zinc-300 dark:border-zinc-700"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {language === 'km' ? 'បង្កើតប្រភេទ' : 'New Category'}
        </Button>

        <Button
          type="button"
          variant="primary"
          size="sm"
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
              modifier_groups: [],
            })
            setIsAddItemModalOpen(true)
          }}
          className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {language === 'km' ? 'បន្ថែមមុខម្ហូបថ្មី' : 'Add Menu Item'}
        </Button>
      </div>

      {/* Error Message: plain text only, no container */}
      {errorMessage && (
        <p className="text-sm text-red-600 dark:text-red-400">
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
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeCategory === 'all'
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
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeCategory === c.id
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
                className="hidden group-hover:inline-flex absolute -top-1 -right-1 p-1 rounded-md bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 hover:scale-105 transition-transform"
              >
                <Edit3 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Search Field */}
        <div className="relative w-full sm:w-80 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប...' : 'Search menu...'}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
          />
        </div>
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-2 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-xs">{language === 'km' ? 'កំពុងទាញយកមុខម្ហូប...' : 'Loading menu...'}</p>
        </div>
      )}

      {/* Menu Items Grid: Image -> Title & Price -> Description */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border transition-colors flex flex-col justify-between relative ${item.is_available
                  ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 opacity-75'
                }`}
            >
              <div>
                {/* 1. Image */}
                {item.image_url && (
                  <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-center rounded-t-2xl overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.name_en}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Three-dot Action Menu in corner */}
                <div className="item-action-menu absolute top-2 right-2 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === item.id ? null : item.id)
                    }}
                    title="Options"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white border border-zinc-200/80 dark:border-zinc-700/80 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {openMenuId === item.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-8 w-36 py-1 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 z-30 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null)
                          openEditItemModal(item)
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{language === 'km' ? 'កែសម្រួល' : 'Edit Item'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null)
                          handleDeleteItem(item.id)
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{language === 'km' ? 'លុបមុខម្ហូប' : 'Delete Item'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Body: Title Price & Description */}
                <div className="p-4 space-y-2.5">
                  {/* 2. Title & Price */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50 truncate leading-snug">
                        {language === 'km' && item.name_km ? item.name_km : item.name_en}
                      </h3>
                      {item.name_km && language !== 'km' && (
                        <p className="text-sm text-zinc-500 font-khmer truncate mt-0.5">
                          {item.name_km}
                        </p>
                      )}
                      {item.name_en && language === 'km' && item.name_en !== item.name_km && (
                        <p className="text-sm text-zinc-500 truncate mt-0.5">
                          {item.name_en}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50 leading-snug">
                        ${item.price_usd.toFixed(2)}
                      </div>
                      <div className="text-xs sm:text-sm text-zinc-500 font-mono font-medium">
                        {item.price_khr.toLocaleString()} ៛
                      </div>
                    </div>
                  </div>

                  {/* 3. Description */}
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                      {language === 'km' && item.description_km
                        ? item.description_km
                        : item.description_en || (language === 'km' ? 'គ្មានការពិពណ៌នា' : 'No description provided.')}
                    </p>
                  </div>

                  {/* 4. Options / Modifiers Badge if configured */}
                  {item.modifier_groups && item.modifier_groups.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                        {language === 'km'
                          ? `មានជម្រើស (${item.modifier_groups.length})`
                          : `${item.modifier_groups.length} Option Groups`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer: Toggle Switch to Sell / Not Sell */}
              <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {item.is_available
                    ? language === 'km' ? 'បើកលក់' : 'Available'
                    : language === 'km' ? 'បិទលក់' : 'Off Sale'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.is_available}
                  onClick={() => handleToggleStock(item)}
                  title={
                    item.is_available
                      ? language === 'km' ? 'ចុចដើម្បីបិទការលក់' : 'Click to disable sale'
                      : language === 'km' ? 'ចុចដើម្បីបើកការលក់' : 'Click to enable sale'
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${item.is_available
                      ? 'bg-emerald-600'
                      : 'bg-zinc-200 dark:bg-zinc-700'
                    }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${item.is_available ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm font-semibold text-zinc-500">
            {language === 'km' ? 'មិនទាន់មានមុខម្ហូបនៅឡើយទេ' : 'No menu items found'}
          </p>
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
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center justify-center space-y-1 text-emerald-600">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-[11px] font-semibold text-zinc-500">
                        {language === 'km' ? 'កំពុងបញ្ចូល...' : 'Uploading...'}
                      </span>
                    </div>
                  ) : itemForm.image_url ? (
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

              {/* Custom Options & Add-ons Section at Bottom */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                    <span>{language === 'km' ? 'ជម្រើសបន្ថែម' : 'Options'}</span>
                  </h4>

                  {/* Add Option Button */}
                  {!isAddingOption && (
                    <button
                      type="button"
                      onClick={handleOpenAddOption}
                      className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{language === 'km' ? 'បន្ថែមជម្រើស' : 'Add Option'}</span>
                    </button>
                  )}
                </div>

                {/* Display Saved Options (Not inside input fields) */}
                {itemForm.modifier_groups.flatMap((g) => g.options).length > 0 && (
                  <div className="space-y-1.5">
                    {itemForm.modifier_groups
                      .flatMap((g) => g.options)
                      .map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                              {language === 'km' && opt.name_km ? opt.name_km : opt.name_en}
                            </span>
                            {opt.name_km && opt.name_en && opt.name_km !== opt.name_en && (
                              <span className="text-xs text-zinc-400 truncate">
                                ({language === 'km' ? opt.name_en : opt.name_km})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-semibold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                              {opt.price_usd > 0 ? `+$${opt.price_usd.toFixed(2)}` : '+$0.00'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDirectOption(opt.id)}
                              title={language === 'km' ? 'លុបជម្រើសនេះ' : 'Delete Option'}
                              className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Adding Option Draft Row with Tick & Cross icons */}
                {isAddingOption && (
                  <div className="grid grid-cols-[1fr_1fr_80px_28px_28px] sm:grid-cols-[1fr_1fr_90px_32px_32px] gap-1.5 sm:gap-2 items-center w-full pt-1">
                    <input
                      type="text"
                      autoFocus
                      value={newOptionDraft.name_en}
                      onChange={(e) =>
                        setNewOptionDraft((prev) => ({ ...prev, name_en: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveNewOption()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          handleCancelNewOption()
                        }
                      }}
                      placeholder="Choice (EN)"
                      className="w-full min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                    />
                    <input
                      type="text"
                      value={newOptionDraft.name_km}
                      onChange={(e) =>
                        setNewOptionDraft((prev) => ({ ...prev, name_km: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveNewOption()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          handleCancelNewOption()
                        }
                      }}
                      placeholder="ជម្រើស (KM)"
                      className="w-full min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
                    />
                    <div className="relative w-full min-w-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">+$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newOptionDraft.price_usd}
                        onChange={(e) =>
                          setNewOptionDraft((prev) => ({ ...prev, price_usd: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSaveNewOption()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            handleCancelNewOption()
                          }
                        }}
                        placeholder="0.00"
                        className="w-full pl-5 sm:pl-6 pr-2 py-1.5 sm:py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs sm:text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors text-right"
                      />
                    </div>
                    {/* Tick Icon to Save */}
                    <button
                      type="button"
                      onClick={handleSaveNewOption}
                      title={language === 'km' ? 'រក្សាទុកជម្រើស' : 'Save Option'}
                      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    {/* Cross Icon to Cancel */}
                    <button
                      type="button"
                      onClick={handleCancelNewOption}
                      title={language === 'km' ? 'បោះបង់' : 'Cancel'}
                      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
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
