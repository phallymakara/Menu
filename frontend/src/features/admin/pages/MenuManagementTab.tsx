import { useEffect, useState, type FC, type FormEvent } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { getApiErrorStatus } from '@/lib/api-error'
import { isUuid } from '@/lib/utils'
import { useBusinesses } from '../hooks/useTenantQueries'
import { useUploadMedia } from '../hooks/useMediaQueries'
import {
  itemModifierGroupsQuery,
  useCategories,
  useCreateCategory,
  useCreateMenuItem,
  useDeleteCategory,
  useDeleteMenuItem,
  useMenuItems,
  useSaveItemOptions,
  useUpdateCategory,
  useUpdateMenuItem,
} from '../hooks/useMenuQueries'
import type { Category, MenuItem } from '../types/admin.types'
import {
  EMPTY_CATEGORY_FORM,
  emptyItemForm,
  filterMenuItems,
  itemFormFromMenuItem,
  toCategory,
  toKhr,
  toMenuItem,
  toModifierGroups,
  type CategoryFormState,
  type MenuItemFormState,
} from '../utils/menuMapping'
import { CategoryFilterBar } from '../components/menu/CategoryFilterBar'
import { CategoryFormModal } from '../components/menu/CategoryFormModal'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { MenuItemFormModal } from '../components/menu/MenuItemFormModal'

/**
 * Menu catalog admin: categories, items and item options.
 *
 * Signed-in users edit the backend catalog. Without a session (demo mode), or when the
 * server answers 401, edits are kept in local state only.
 */
export const MenuManagementTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const queryClient = useQueryClient()

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [itemForm, setItemForm] = useState<MenuItemFormState>(emptyItemForm())
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM)

  // Close the item action menu on any outside click.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.item-action-menu')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const { data: businesses = [] } = useBusinesses()
  useEffect(() => {
    if (!businessId && businesses.length > 0) {
      setBusinessId(businesses[0].id)
      localStorage.setItem('emenu_business_id', businesses[0].id)
    }
  }, [businesses, businessId])

  const { data: rawCategories = [], isLoading: isCategoriesLoading } = useCategories(businessId)
  const { data: rawItems = [], isLoading: isItemsLoading } = useMenuItems(businessId)
  const isLoading = (isCategoriesLoading || isItemsLoading) && items.length === 0

  // Mirror server data into local state so demo-mode edits can live alongside it.
  useEffect(() => {
    if (rawCategories.length > 0) setCategories(rawCategories.map(toCategory))
  }, [rawCategories])
  useEffect(() => {
    if (rawItems.length > 0) setItems(rawItems.map(toMenuItem))
  }, [rawItems])

  const createCategory = useCreateCategory(businessId)
  const updateCategory = useUpdateCategory(businessId)
  const deleteCategory = useDeleteCategory(businessId)
  const createItem = useCreateMenuItem(businessId)
  const updateItem = useUpdateMenuItem(businessId)
  const deleteItem = useDeleteMenuItem(businessId)
  const saveItemOptions = useSaveItemOptions(businessId)
  const uploadMedia = useUploadMedia(businessId)

  const hasSession = () => !!businessId && !!localStorage.getItem('emenu_access_token')

  // --- Categories ---
  const openCreateCategoryModal = () => {
    setEditingCategory(null)
    setCategoryForm(EMPTY_CATEGORY_FORM)
    setIsCategoryModalOpen(true)
  }

  const openEditCategoryModal = (category: Category) => {
    setEditingCategory(category)
    setCategoryForm({ name_en: category.name_en, name_km: category.name_km })
    setIsCategoryModalOpen(true)
  }

  const closeCategoryModal = () => {
    setCategoryForm(EMPTY_CATEGORY_FORM)
    setEditingCategory(null)
    setIsCategoryModalOpen(false)
  }

  const applyCategoryLocally = () => {
    const nameKm = categoryForm.name_km || categoryForm.name_en
    if (editingCategory) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingCategory.id ? { ...c, name_en: categoryForm.name_en, name_km: nameKm } : c
        )
      )
    } else {
      setCategories((prev) => [
        ...prev,
        {
          id: `cat-${Date.now()}`,
          name_en: categoryForm.name_en,
          name_km: nameKm,
          display_order: prev.length + 1,
          is_active: true,
        },
      ])
    }
  }

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault()
    if (!categoryForm.name_en.trim()) return

    setIsSubmitting(true)
    setErrorMessage(null)
    const nameKm = categoryForm.name_km || categoryForm.name_en

    try {
      if (hasSession() && editingCategory && isUuid(editingCategory.id)) {
        const updated = await updateCategory.mutateAsync({
          categoryId: editingCategory.id,
          payload: { name_en: categoryForm.name_en, name_km: nameKm },
        })
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? toCategory(updated) : c)))
      } else if (hasSession() && !editingCategory) {
        const created = await createCategory.mutateAsync({
          name_en: categoryForm.name_en,
          name_km: nameKm,
          display_order: categories.length + 1,
          is_active: true,
        })
        setCategories((prev) => [...prev, toCategory(created)])
      } else {
        applyCategoryLocally()
      }
      closeCategoryModal()
    } catch (err) {
      if (getApiErrorStatus(err) === 401) {
        applyCategoryLocally()
        closeCategoryModal()
      } else {
        setErrorMessage(
          isKm
            ? 'មិនអាចរក្សាទុកប្រភេទបានទេ។ សូមព្យាយាមម្តងទៀត។'
            : 'Unable to save category. Please try again.'
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    const confirmMsg = isKm
      ? 'តើអ្នកពិតជាចង់លុបប្រភេទនេះមែនទេ?'
      : 'Are you sure you want to delete this category?'
    if (!window.confirm(confirmMsg)) return

    setErrorMessage(null)
    if (hasSession() && isUuid(categoryId)) {
      try {
        await deleteCategory.mutateAsync(categoryId)
      } catch (err) {
        if (getApiErrorStatus(err) !== 401) {
          setErrorMessage(
            isKm
              ? 'មិនអាចលុបប្រភេទបានទេ។ សូមព្យាយាមម្តងទៀត។'
              : 'Unable to delete category. Please try again.'
          )
          return
        }
      }
    }

    setCategories((prev) => prev.filter((c) => c.id !== categoryId))
    if (activeCategory === categoryId) setActiveCategory('all')
  }

  // --- Items ---
  const openCreateItemModal = () => {
    setEditingItem(null)
    setItemForm(emptyItemForm(categories[0]?.id))
    setIsItemModalOpen(true)
  }

  const openEditItemModal = async (item: MenuItem) => {
    setEditingItem(item)
    setItemForm(itemFormFromMenuItem(item))
    setIsItemModalOpen(true)

    if (businessId && isUuid(item.id)) {
      try {
        const groups = await queryClient.fetchQuery(itemModifierGroupsQuery(businessId, item.id))
        if (groups.length > 0) {
          setItemForm((prev) => ({ ...prev, modifier_groups: toModifierGroups(groups) }))
        }
      } catch {
        // Keep the options already on the item.
      }
    }
  }

  const closeItemModal = () => {
    setItemForm(emptyItemForm(categories[0]?.id))
    setEditingItem(null)
    setIsItemModalOpen(false)
  }

  const handleImageSelected = async (file: File) => {
    // Show a local preview immediately; replace it with the hosted URL once uploaded.
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const preview = reader.result
        setItemForm((prev) => ({ ...prev, image_url: preview }))
      }
    }
    reader.readAsDataURL(file)

    if (!businessId) return
    setIsUploadingImage(true)
    try {
      const { url } = await uploadMedia.mutateAsync(file)
      setItemForm((prev) => ({ ...prev, image_url: url }))
    } catch {
      // Upload failed: keep the local preview so the form is still usable.
    } finally {
      setIsUploadingImage(false)
    }
  }

  const buildLocalItem = (base?: MenuItem): MenuItem => ({
    id: base?.id ?? `item-${Date.now()}`,
    category_id: itemForm.category_id || categories[0]?.id || 'cat-1',
    name_en: itemForm.name_en,
    name_km: itemForm.name_km || itemForm.name_en,
    description_en: itemForm.description_en,
    description_km: itemForm.description_km,
    image_url: itemForm.image_url || base?.image_url || null,
    price_usd: itemForm.price_usd,
    price_khr: toKhr(itemForm.price_usd),
    is_available: base?.is_available ?? true,
    kitchen_station: itemForm.kitchen_station,
    modifier_groups: itemForm.modifier_groups,
  })

  const handleSaveItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!itemForm.name_en.trim() || itemForm.price_usd <= 0) return

    setIsSubmitting(true)
    setErrorMessage(null)

    const payload = {
      name_en: itemForm.name_en,
      name_km: itemForm.name_km || itemForm.name_en,
      category_id: isUuid(itemForm.category_id) ? itemForm.category_id : null,
      base_price: itemForm.price_usd,
      description_en: itemForm.description_en,
      description_km: itemForm.description_km,
      image_url: itemForm.image_url || null,
    }
    const withFormExtras = (saved: MenuItem): MenuItem => ({
      ...saved,
      category_id: saved.category_id || itemForm.category_id,
      image_url: itemForm.image_url || saved.image_url,
      kitchen_station: itemForm.kitchen_station,
      modifier_groups: itemForm.modifier_groups,
    })

    try {
      let saved: MenuItem
      if (hasSession() && editingItem && isUuid(editingItem.id)) {
        const updated = await updateItem.mutateAsync({ itemId: editingItem.id, payload })
        saved = withFormExtras(toMenuItem(updated))
      } else if (hasSession() && !editingItem) {
        const created = await createItem.mutateAsync({ ...payload, is_active: true })
        saved = withFormExtras(toMenuItem(created))
      } else {
        saved = buildLocalItem(editingItem ?? undefined)
      }

      if (hasSession() && isUuid(saved.id)) {
        try {
          await saveItemOptions.mutateAsync({
            itemId: saved.id,
            options: itemForm.modifier_groups.flatMap((g) => g.options),
          })
        } catch {
          setErrorMessage(
            isKm
              ? 'បានរក្សាទុកមុខម្ហូប ប៉ុន្តែមិនអាចរក្សាទុកជម្រើសបានទេ។'
              : 'Item saved, but its options could not be saved.'
          )
        }
      }

      setItems((prev) =>
        editingItem ? prev.map((it) => (it.id === editingItem.id ? saved : it)) : [saved, ...prev]
      )
      closeItemModal()
    } catch {
      setErrorMessage(
        isKm
          ? 'មិនអាចរក្សាទុកមុខម្ហូបបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Unable to save menu item. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleAvailability = async (item: MenuItem) => {
    const isAvailable = !item.is_available
    const setAvailability = (value: boolean) =>
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_available: value } : it)))

    setAvailability(isAvailable) // optimistic
    if (!hasSession() || !isUuid(item.id)) return

    try {
      await updateItem.mutateAsync({ itemId: item.id, payload: { is_active: isAvailable } })
    } catch (err) {
      if (getApiErrorStatus(err) !== 401) {
        setAvailability(!isAvailable)
        setErrorMessage(
          isKm ? 'មិនអាចផ្លាស់ប្តូរស្ថានភាពមុខម្ហូបបានទេ។' : 'Unable to update item availability status.'
        )
      }
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    const confirmMsg = isKm
      ? 'តើអ្នកពិតជាចង់លុបមុខម្ហូបនេះមែនទេ?'
      : 'Are you sure you want to delete this menu item?'
    if (!window.confirm(confirmMsg)) return

    setErrorMessage(null)
    if (hasSession() && isUuid(itemId)) {
      try {
        await deleteItem.mutateAsync(itemId)
      } catch (err) {
        if (getApiErrorStatus(err) !== 401) {
          setErrorMessage(
            isKm
              ? 'មិនអាចលុបមុខម្ហូបបានទេ។ សូមព្យាយាមម្តងទៀត។'
              : 'Unable to delete menu item. Please try again.'
          )
          return
        }
      }
    }
    setItems((prev) => prev.filter((it) => it.id !== itemId))
  }

  const filteredItems = filterMenuItems(items, activeCategory, searchQuery)

  return (
    <div className="space-y-6">
      {/* Primary Actions Aligned Left */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openCreateCategoryModal}
          className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full border-zinc-300 dark:border-zinc-700"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {language === 'km' ? 'បង្កើតប្រភេទ' : 'New Category'}
        </Button>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={openCreateItemModal}
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

      <CategoryFilterBar
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        onEditCategory={openEditCategoryModal}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

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
            <MenuItemCard
              key={item.id}
              item={item}
              isMenuOpen={openMenuId === item.id}
              onToggleMenu={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
              onEdit={() => {
                setOpenMenuId(null)
                openEditItemModal(item)
              }}
              onDelete={() => {
                setOpenMenuId(null)
                handleDeleteItem(item.id)
              }}
              onToggleAvailability={() => handleToggleAvailability(item)}
            />
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

      {isItemModalOpen && (
        <MenuItemFormModal
          isEditing={!!editingItem}
          form={itemForm}
          setForm={setItemForm}
          categories={categories}
          isSubmitting={isSubmitting}
          isUploadingImage={isUploadingImage}
          onImageSelected={handleImageSelected}
          onSubmit={handleSaveItem}
          onClose={closeItemModal}
        />
      )}

      {isCategoryModalOpen && (
        <CategoryFormModal
          isEditing={!!editingCategory}
          form={categoryForm}
          setForm={setCategoryForm}
          isSubmitting={isSubmitting}
          onSubmit={handleSaveCategory}
          onDelete={() => {
            if (editingCategory) handleDeleteCategory(editingCategory.id)
            setIsCategoryModalOpen(false)
          }}
          onClose={() => setIsCategoryModalOpen(false)}
        />
      )}
    </div>
  )
}
