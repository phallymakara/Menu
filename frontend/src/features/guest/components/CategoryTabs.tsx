import { type FC } from 'react'
import { Category } from '../types/guest.types'
import { useLanguageStore } from '@/stores/useLanguageStore'

export interface CategoryTabsProps {
  categories: Category[]
  activeCategoryId: string
  onSelectCategory: (categoryId: string) => void
}

export const CategoryTabs: FC<CategoryTabsProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
}) => {
  const { language } = useLanguageStore()

  return (
    <div className="sticky top-[105px] z-20 bg-white/95 dark:bg-zinc-950/95 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-md">
      <div className="flex gap-2 overflow-x-auto px-4 py-2.5 max-w-2xl mx-auto no-scrollbar">
        <button
          onClick={() => onSelectCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            activeCategoryId === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'ទាំងអស់' : 'All'}
        </button>

        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <span>{language === 'km' && cat.name_km ? cat.name_km : cat.name_en}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                isActive ? 'bg-zinc-700 text-zinc-200 dark:bg-zinc-200 dark:text-zinc-800' : 'text-zinc-400'
              }`}>
                {cat.items.length}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
