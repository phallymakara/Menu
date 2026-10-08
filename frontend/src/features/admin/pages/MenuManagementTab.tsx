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
  useReorderCategories,
  useSaveItemOptions,
  useUpdateCategory,
  useUpdateMenuItem,
} from '../hooks/useMenuQueries'
import {
  useBranchPublishedMenu,
  useSetBranchItemOverride,
  useDeleteBranchItemOverride,
  useResetBranchOverrides,
  useCreateBranchLocalItem,
  usePromoteLocalItem,
} from '../hooks/useBranchMenuQueries'
import type { Category, MenuItem } from '../types/admin.types'
import {
  EMPTY_CATEGORY_FORM,
  emptyItemForm,
  filterMenuItems,
  itemFormFromMenuItem,
  toBranchMenuItem,
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
 * Menu catalog admin: categories, items, and Master Brand Catalog editing.
 */
export const MenuManagementTab: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const queryClient = useQueryClient()

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => {
    const saved = localStorage.getItem('emenu_branch_id')
    return saved === 'all' ? null : saved
  })
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const branchId = e.detail?.branchId
      const nextBranchId = branchId === 'all' ? null : (branchId ?? null)
      setIsSwitchingBranch(true)
      setSelectedBranchId(nextBranchId)
      // Clear data immediately so previous branch's items don't linger
      setItems([])
      setCategories([])
      setActiveCategory('all')
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [queryClient])

  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Modals state
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

  // Master catalog queries
  const { data: rawCategories = [], isLoading: isCategoriesLoading } = useCategories(businessId)
  const { data: rawItems = [], isLoading: isItemsLoading } = useMenuItems(businessId)

  // Branch published catalog query (active when a branch is selected)
  const {
    data: branchMenuData,
    isLoading: isBranchMenuLoading,
    isFetching: isBranchMenuFetching,
  } = useBranchPublishedMenu(businessId, selectedBranchId, true)

  const isBranchDataMatching =
    !selectedBranchId ||
    (!!branchMenuData && branchMenuData.branch_id === selectedBranchId)

  const isLoading = selectedBranchId
    ? isSwitchingBranch ||
      isBranchMenuLoading ||
      !isBranchDataMatching ||
      (isBranchMenuFetching && items.length === 0)
    : isSwitchingBranch || ((isCategoriesLoading || isItemsLoading) && items.length === 0)

  // Sync data into local items state based on scope
  useEffect(() => {
    if (selectedBranchId) {
      if (branchMenuData && branchMenuData.branch_id === selectedBranchId) {
        const categoriesList = branchMenuData.categories ?? []
        const branchItems = categoriesList.flatMap((cat) =>
          (cat.items ?? []).map(toBranchMenuItem)
        )
        setItems(branchItems)

        const mappedBranchCats: Category[] = categoriesList.map((c) => ({
          id: c.id,
          name_en: c.name_en,
          name_km: c.name_km || c.name_en,
          display_order: c.display_order ?? 0,
          is_active: true,
          branch_id: selectedBranchId,
        }))

        // Include any branch-local categories that don't yet have items
        const localCats = rawCategories
          .filter((c: any) => c.branch_id === selectedBranchId)
          .map(toCategory)
        for (const lc of localCats) {
          if (!mappedBranchCats.some((c) => c.id === lc.id)) {
            mappedBranchCats.push(lc)
          }
        }
        setCategories(mappedBranchCats)
        setIsSwitchingBranch(false)
      } else if (!isBranchMenuLoading && !isBranchMenuFetching) {
        setItems([])
        setCategories([])
        setIsSwitchingBranch(false)
      }
    } else if (!selectedBranchId) {
      // Central Master HQ scope: only master categories & master items (branch_id is null)
      setCategories(rawCategories.filter((c: any) => !c.branch_id).map(toCategory))
      setItems(rawItems.filter((i: any) => !i.branch_id).map(toMenuItem))
      setIsSwitchingBranch(false)
    }
  }, [
    selectedBranchId,
    branchMenuData,
    isBranchMenuLoading,
    isBranchMenuFetching,
    rawCategories,
    rawItems,
  ])

  // Master mutations
  const createCategory = useCreateCategory(businessId)
  const updateCategory = useUpdateCategory(businessId)
  const deleteCategory = useDeleteCategory(businessId)
  const createItem = useCreateMenuItem(businessId)
  const updateItem = useUpdateMenuItem(businessId)
  const deleteItem = useDeleteMenuItem(businessId)
  const saveItemOptions = useSaveItemOptions(businessId)
  const uploadMedia = useUploadMedia(businessId)
  const reorderCategories = useReorderCategories(businessId)

  // Branch mutations
  const setBranchItemOverride = useSetBranchItemOverride(businessId, selectedBranchId)
  const deleteBranchItemOverride = useDeleteBranchItemOverride(businessId, selectedBranchId)
  const resetBranchOverrides = useResetBranchOverrides(businessId, selectedBranchId)
  const createBranchLocalItem = useCreateBranchLocalItem(businessId, selectedBranchId)
  const promoteLocalItem = usePromoteLocalItem(businessId, selectedBranchId)

  const hasSession = () => !!businessId && !!localStorage.getItem('emenu_access_token')

  const handleReorderCategories = async (newCategories: Category[]) => {
    setCategories(newCategories)
    if (!hasSession()) return
    try {
      await reorderCategories.mutateAsync({
        items: newCategories.map((c, index) => ({ id: c.id, display_order: index })),
      })
    } catch {
      setErrorMessage(
        language === 'km' ? 'មិនអាចផ្លាស់ប្តូរលំដាប់ប្រភេទបានទេ' : 'Failed to update category order.'
      )
    }
  }

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
          branch_id: selectedBranchId || null,
        } as any)
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
        if (selectedBranchId) {
          const targetCat = categories.find((c) => c.id === categoryId)
          if (targetCat?.branch_id === selectedBranchId) {
            // Branch local category: delete directly
            await deleteCategory.mutateAsync(categoryId)
          } else {
            // Master category in branch: reset overrides for this category in this branch
            await resetBranchOverrides.mutateAsync({ category_id: categoryId })
          }
        } else {
          // Central Master HQ: delete master category
          await deleteCategory.mutateAsync(categoryId)
        }
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
      return url
    } catch {
      // Keep local preview
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
        if (selectedBranchId) {
          // In branch scope, create a local item isolated strictly to this branch
          const created = await createBranchLocalItem.mutateAsync({
            name_en: itemForm.name_en,
            name_km: itemForm.name_km || itemForm.name_en,
            category_id: isUuid(itemForm.category_id) ? itemForm.category_id : null,
            base_price: itemForm.price_usd,
            currency: 'USD',
            description_en: itemForm.description_en,
            description_km: itemForm.description_km,
            image_url: itemForm.image_url || null,
            is_active: true,
            display_order: items.length + 1,
          })
          saved = withFormExtras(toMenuItem(created))
        } else {
          // Central Master HQ scope (branch_id is null)
          const created = await createItem.mutateAsync({ ...payload, is_active: true })
          saved = withFormExtras(toMenuItem(created))
        }
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
      if (selectedBranchId) {
        // In branch scope, toggling availability sets a branch stock override
        await setBranchItemOverride.mutateAsync({
          itemId: item.id,
          payload: {
            menu_item_id: item.id,
            availability_status: isAvailable ? 'AVAILABLE' : 'TEMPORARILY_OUT_OF_STOCK',
            price_override: item.price_override ?? null,
          },
        })
      } else {
        await updateItem.mutateAsync({ itemId: item.id, payload: { is_active: isAvailable } })
      }
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
        if (selectedBranchId) {
          const targetItem = items.find((i) => i.id === itemId)
          if (targetItem?.is_local_item || targetItem?.branch_id === selectedBranchId) {
            // Local item: delete from database
            await deleteItem.mutateAsync(itemId)
          } else {
            // Overridden master item: remove override from this branch so it disappears only from this branch
            await deleteBranchItemOverride.mutateAsync(itemId)
          }
        } else {
          // Master HQ item: delete from database
          await deleteItem.mutateAsync(itemId)
        }
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

  const handlePromoteLocalItem = async (itemId: string) => {
    if (!selectedBranchId) return
    const confirmMsg = isKm
      ? 'តើអ្នកពិតជាចង់លើកមុខម្ហូបសាខានេះទៅជាមុខម្ហូបមេ (Master HQ) មែនទេ?'
      : 'Are you sure you want to promote this local dish to the Central Master Brand Catalog?'
    if (!window.confirm(confirmMsg)) return

    try {
      await promoteLocalItem.mutateAsync(itemId)
    } catch {
      setErrorMessage(
        isKm ? 'មិនអាចលើកជាមុខម្ហូបមេបានទេ' : 'Failed to promote local dish to master catalog.'
      )
    }
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
        onReorder={handleReorderCategories}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Lazy Loading Skeleton Grid when switching branch or loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            <span>
              {language === 'km'
                ? 'កំពុងផ្ទុកទិន្នន័យពីសាខា...'
                : 'Loading branch menu data...'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col justify-between animate-pulse"
              >
                <div>
                  {/* Image Skeleton */}
                  <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800" />

                  {/* Body Skeleton */}
                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="space-y-1.5">
                      <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md w-3/4" />
                      <div className="h-3 bg-zinc-100 dark:bg-zinc-800/60 rounded-md w-1/2" />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded-md w-1/3" />
                      <div className="h-4 bg-zinc-100 dark:bg-zinc-800/60 rounded-md w-1/4" />
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0">
                  <div className="h-8 bg-zinc-100 dark:bg-zinc-800/60 rounded-full w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu Items Grid */}
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
              isBranchMode={!!selectedBranchId}
              onPromoteLocalItem={() => {
                setOpenMenuId(null)
                handlePromoteLocalItem(item.id)
              }}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">
            {language === 'km'
              ? 'មិនទាន់មានមុខម្ហូបក្នុងសាខានេះនៅឡើយទេ'
              : 'No menu items in this branch yet'}
          </p>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {selectedBranchId
              ? language === 'km'
                ? 'សាខានេះត្រូវបានញែកដាច់ដោយឡែក។ អ្នកអាចបន្ថែមមុខម្ហូបថ្មីសម្រាប់សាខានេះ ឬកែប្រែទិន្នន័យពីសាខាមេ (HQ)។'
                : 'This branch is isolated. You can add local items or override dishes from the Master Catalog (HQ).'
              : language === 'km'
                ? 'មិនទាន់មានមុខម្ហូបក្នុងបញ្ជីមុខម្ហូបមេនៅឡើយទេ។'
                : 'No master catalog items found.'}
          </p>
        </div>
      )}

      {/* Modals */}
      {isItemModalOpen && (
        <MenuItemFormModal
          isEditing={!!editingItem}
          businessId={businessId}
          itemId={editingItem?.id}
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
