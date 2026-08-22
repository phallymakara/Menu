import { useState, type FC } from 'react'
import { Plus, Check, Utensils } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { Badge } from '@/components/ui/Badge'

interface PreviewItem {
  id: string
  name_en: string
  name_km: string
  desc_en: string
  desc_km: string
  price: number
  category: 'mains' | 'drinks' | 'desserts'
  tag?: 'SPICY' | 'VEG' | 'POPULAR'
}

const SAMPLE_ITEMS: PreviewItem[] = [
  {
    id: '1',
    name_en: 'Lok Lak Beef with Kampot Pepper',
    name_km: 'ឡុកឡាក់សាច់គោម្រេចកំពត',
    desc_en: 'Tender wok-tossed beef with lime pepper dip',
    desc_km: 'សាច់គោឆាជាមួយទឹកម្រេចក្រូចឆ្មាពិសេស',
    price: 5.50,
    category: 'mains',
    tag: 'POPULAR',
  },
  {
    id: '2',
    name_en: 'Traditional Fish Amok',
    name_km: 'អាម៉ុកត្រីបុរាណ',
    desc_en: 'Steamed coconut curry in banana leaf',
    desc_km: 'អាម៉ុកត្រីស្រស់ខ្ទិះដូងខ្ចប់ស្លឹកចេក',
    price: 6.00,
    category: 'mains',
    tag: 'POPULAR',
  },
  {
    id: '3',
    name_en: 'Iced Milk Green Tea',
    name_km: 'តែបៃតងទឹកដោះគោទឹកកក',
    desc_en: 'Fragrant jasmine tea with fresh milk',
    desc_km: 'តែបៃតងក្រអូបឈ្ងុយជាមួយទឹកដោះគោស្រស់',
    price: 2.25,
    category: 'drinks',
  },
  {
    id: '4',
    name_en: 'Mango Sticky Rice with Coconut Cream',
    name_km: 'បាយដំណើបស្វាយខ្ទិះដូង',
    desc_en: 'Ripe sweet mango with warm sticky rice',
    desc_km: 'ស្វាយទុំផ្អែមជាមួយបាយដំណើបស្រោចខ្ទិះដូង',
    price: 3.50,
    category: 'desserts',
    tag: 'VEG',
  },
]

export const InteractiveMenuPreview: FC = () => {
  const { language } = useLanguageStore()
  const [activeCategory, setActiveCategory] = useState<'all' | 'mains' | 'drinks' | 'desserts'>('all')
  const [selectedItems, setSelectedItems] = useState<string[]>(['1'])

  const filteredItems = SAMPLE_ITEMS.filter(
    (item) => activeCategory === 'all' || item.category === activeCategory
  )

  const toggleItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left">
      {/* Mobile Top Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center text-white text-xs">
            <Utensils className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 block leading-tight">
              {language === 'km' ? 'ភោជនីយដ្ឋាន សៀមរាប' : 'Siem Reap Bistro'}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono block">Table 08 • Terrace</span>
          </div>
        </div>
        <Badge variant="brand" size="sm">Live Menu</Badge>
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto py-3 no-scrollbar border-b border-zinc-100 dark:border-zinc-800/60 text-xs">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeCategory === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'ទាំងអស់' : 'All'}
        </button>
        <button
          onClick={() => setActiveCategory('mains')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeCategory === 'mains'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'ម្ហូបចម្បង' : 'Mains'}
        </button>
        <button
          onClick={() => setActiveCategory('drinks')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeCategory === 'drinks'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'ភេសជ្ជៈ' : 'Drinks'}
        </button>
        <button
          onClick={() => setActiveCategory('desserts')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeCategory === 'desserts'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'បង្អែម' : 'Desserts'}
        </button>
      </div>

      {/* Items List */}
      <div className="py-2.5 space-y-2.5 max-h-72 overflow-y-auto">
        {filteredItems.map((item) => {
          const isAdded = selectedItems.includes(item.id)
          return (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`p-3 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                isAdded
                  ? 'border-emerald-600/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                    {language === 'km' ? item.name_km : item.name_en}
                  </span>
                  {item.tag && (
                    <Badge variant={item.tag === 'POPULAR' ? 'brand' : 'neutral'} size="sm">
                      {item.tag}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 truncate">
                  {language === 'km' ? item.desc_km : item.desc_en}
                </p>
                <CurrencyDisplay amountUSD={item.price} className="text-xs font-semibold" />
              </div>

              <button
                className={`w-7 h-7 rounded-md flex items-center justify-center text-xs shrink-0 transition-colors ${
                  isAdded
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                }`}
              >
                {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>
          )
        })}
      </div>

      {/* Floating Bottom Action */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
        <span className="text-zinc-500">
          {selectedItems.length} {language === 'km' ? 'មុខម្ហូបបានជ្រើសរើស' : 'items selected'}
        </span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
          {selectedItems.length > 0 ? '$' + (selectedItems.length * 4.5).toFixed(2) : '$0.00'}
        </span>
      </div>
    </div>
  )
}
