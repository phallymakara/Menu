import type { FC } from 'react'
import { Edit3, Search } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import type { Category } from '../../types/admin.types'

interface CategoryFilterBarProps {
  categories: Category[]
  activeCategory: string
  onCategoryChange: (categoryId: string) => void
  onEditCategory: (category: Category) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

export const CategoryFilterBar: FC<CategoryFilterBarProps> = ({
  categories,
  activeCategory,
  onCategoryChange,
  onEditCategory,
  searchQuery,
  onSearchChange,
}) => {
  const { language } = useLanguageStore()

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
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
              onClick={() => onCategoryChange(c.id)}
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
              onClick={() => onEditCategory(c)}
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
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={language === 'km' ? 'ស្វែងរកមុខម្ហូប...' : 'Search menu...'}
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
        />
      </div>
    </div>
  )
}
