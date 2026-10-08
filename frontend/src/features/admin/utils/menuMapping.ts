import type {
  CategoryResponse,
  MenuItemResponse,
  ModifierGroupDetailResponse,
} from '../hooks/useMenuQueries'
import type { BranchMenuItemDisplayResponse } from '../hooks/useBranchMenuQueries'
import type { Category, MenuItem, ModifierGroup, ModifierOption } from '../types/admin.types'

/** Fallback KHR rate for display until the business exchange rate is wired in. */
export const DEFAULT_KHR_PER_USD = 4100

export interface MenuItemFormState {
  name_en: string
  name_km: string
  category_id: string
  price_usd: number
  description_en: string
  description_km: string
  image_url: string
  kitchen_station: 'KITCHEN' | 'BAR'
  modifier_groups: ModifierGroup[]
}

export interface CategoryFormState {
  name_en: string
  name_km: string
}

export const EMPTY_CATEGORY_FORM: CategoryFormState = { name_en: '', name_km: '' }

export function toKhr(usd: number): number {
  return Math.round(usd * DEFAULT_KHR_PER_USD)
}

export function emptyItemForm(categoryId = ''): MenuItemFormState {
  return {
    name_en: '',
    name_km: '',
    category_id: categoryId,
    price_usd: 0,
    description_en: '',
    description_km: '',
    image_url: '',
    kitchen_station: 'KITCHEN',
    modifier_groups: [],
  }
}

export function itemFormFromMenuItem(item: MenuItem): MenuItemFormState {
  return {
    name_en: item.name_en,
    name_km: item.name_km,
    category_id: item.category_id || '',
    price_usd: item.price_usd,
    description_en: item.description_en || '',
    description_km: item.description_km || '',
    image_url: item.image_url || '',
    kitchen_station: item.kitchen_station === 'BAR' ? 'BAR' : 'KITCHEN',
    modifier_groups: item.modifier_groups || [],
  }
}

export function toCategory(category: CategoryResponse): Category {
  return {
    id: category.id,
    name_en: category.name_en,
    name_km: category.name_km || category.name_en,
    display_order: category.display_order ?? 0,
    is_active: category.is_active ?? true,
    branch_id: (category as any).branch_id ?? null,
  }
}

const KITCHEN_STATIONS = ['KITCHEN', 'BAR', 'BAKERY', 'GRILL'] as const

function toKitchenStation(value?: string | null): MenuItem['kitchen_station'] {
  const upper = value?.toUpperCase()
  return KITCHEN_STATIONS.find((station) => station === upper) ?? 'KITCHEN'
}

export function toMenuItem(item: MenuItemResponse): MenuItem {
  const priceUsd = Number(item.base_price) || 0
  return {
    id: item.id,
    category_id: item.category_id ?? '',
    name_en: item.name_en,
    name_km: item.name_km || item.name_en,
    description_en: item.description_en || '',
    description_km: item.description_km || '',
    image_url: item.image_url || null,
    price_usd: priceUsd,
    price_khr: toKhr(priceUsd),
    is_available: item.is_active ?? true,
    kitchen_station: toKitchenStation(item.kitchen_station),
    modifier_groups: [],
    branch_id: (item as any).branch_id ?? null,
    is_local_item: !!(item as any).branch_id,
  }
}

export function toBranchMenuItem(item: BranchMenuItemDisplayResponse): MenuItem {
  const priceUsd = Number(item.effective_price) || 0
  return {
    id: item.id,
    category_id: item.category_id ?? '',
    name_en: item.name_en,
    name_km: item.name_km || item.name_en,
    description_en: item.description_en || '',
    description_km: item.description_km || '',
    image_url: item.image_url || null,
    price_usd: priceUsd,
    price_khr: toKhr(priceUsd),
    is_available: item.is_available,
    kitchen_station: toKitchenStation(item.kitchen_station),
    modifier_groups: toModifierGroups(item.modifier_groups || []),
    master_price: Number(item.master_price) || 0,
    price_override:
      item.price_override !== null && item.price_override !== undefined
        ? Number(item.price_override)
        : null,
    is_local_item: item.is_local_item ?? false,
    availability_status: item.availability_status,
    branch_id: item.branch_id ?? null,
  }
}

export function toModifierGroups(groups: ModifierGroupDetailResponse[]): ModifierGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name_en: group.name_en,
    name_km: group.name_km || group.name_en,
    is_required: (group.min_selections ?? 0) > 0,
    min_selections: group.min_selections ?? 0,
    max_selections: group.max_selections ?? 1,
    options: (group.options ?? []).map((option) => ({
      id: option.id,
      name_en: option.name_en,
      name_km: option.name_km || option.name_en,
      price_usd: Number(option.price) || 0,
      is_default: option.is_default ?? false,
    })),
  }))
}

/** Add an option to the first modifier group, creating a default "Options" group if needed. */
export function addOptionToGroups(
  groups: ModifierGroup[],
  option: ModifierOption,
  newGroupId = `mg_${Date.now()}`
): ModifierGroup[] {
  if (groups.length === 0) {
    return [
      {
        id: newGroupId,
        name_en: 'Options',
        name_km: 'ជម្រើសបន្ថែម',
        is_required: false,
        min_selections: 0,
        max_selections: 20,
        options: [option],
      },
    ]
  }
  const [first, ...rest] = groups
  return [{ ...first, options: [...first.options, option] }, ...rest]
}

/** Remove an option by ID and drop any group left empty. */
export function removeOptionFromGroups(groups: ModifierGroup[], optionId: string): ModifierGroup[] {
  return groups
    .map((group) => ({ ...group, options: group.options.filter((o) => o.id !== optionId) }))
    .filter((group) => group.options.length > 0)
}

export function filterMenuItems(
  items: MenuItem[],
  activeCategory: string,
  searchQuery: string
): MenuItem[] {
  const query = searchQuery.toLowerCase()
  return items.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category_id === activeCategory
    const matchesSearch =
      item.name_en.toLowerCase().includes(query) || item.name_km.includes(searchQuery)
    return matchesCategory && matchesSearch
  })
}
