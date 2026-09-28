import type { ChangeEvent, Dispatch, FC, FormEvent, SetStateAction } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { Category } from '../../types/admin.types'
import type { MenuItemFormState } from '../../utils/menuMapping'
import { ItemOptionsEditor } from './ItemOptionsEditor'

interface MenuItemFormModalProps {
  isEditing: boolean
  form: MenuItemFormState
  setForm: Dispatch<SetStateAction<MenuItemFormState>>
  categories: Category[]
  isSubmitting: boolean
  isUploadingImage: boolean
  onImageSelected: (file: File) => void
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

export const MenuItemFormModal: FC<MenuItemFormModalProps> = ({
  isEditing,
  form,
  setForm,
  categories,
  isSubmitting,
  isUploadingImage,
  onImageSelected,
  onSubmit,
  onClose,
}) => {
  const { language } = useLanguageStore()

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onImageSelected(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
        onClick={() => onClose()}
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
            {isEditing
              ? language === 'km'
                ? 'កែសម្រួលមុខម្ហូប'
                : 'Edit Menu Item'
              : language === 'km'
                ? 'បន្ថែមមុខម្ហូបថ្មី'
                : 'Add New Menu Item'}
          </h3>
          <button
            type="button"
            onClick={() => onClose()}
            aria-label="Close"
            className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Dish Image Upload at Top Center */}
          <div className="flex flex-col items-center justify-center space-y-1.5 pb-1">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {language === 'km' ? 'រូបភាពមុខម្ហូប' : 'Food Image'}
            </label>
            <div
              onClick={() => document.getElementById('food-image-input')?.click()}
              className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors group shadow-xs"
            >
              {isUploadingImage ? (
                <div className="flex flex-col items-center justify-center space-y-1 text-emerald-600">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[11px] font-semibold text-zinc-500">
                    {language === 'km' ? 'កំពុងបញ្ចូល...' : 'Uploading...'}
                  </span>
                </div>
              ) : form.image_url ? (
                <>
                  <img
                    src={form.image_url}
                    alt="Food Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold rounded-full">
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
              onChange={handleFileChange}
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
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះមុខម្ហូបជាភាសាអង់គ្លេស' : 'Enter item name in English'}
                className="w-full px-4 py-2.5 sm:py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'ឈ្មោះមុខម្ហូប (KM)' : 'Item Name (KM)'}
              </label>
              <input
                type="text"
                value={form.name_km}
                onChange={(e) => setForm({ ...form, name_km: e.target.value })}
                placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះមុខម្ហូបជាភាសាខ្មែរ' : 'Enter item name in Khmer'}
                className="w-full px-4 py-2.5 sm:py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
                {language === 'km' ? 'ប្រភេទ' : 'Category'} *
              </label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full px-4 py-2.5 sm:py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
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
                value={form.price_usd || ''}
                onChange={(e) => setForm({ ...form, price_usd: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-full px-4 py-2.5 sm:py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ការពិពណ៌នា (EN)' : 'Description (EN)'}
            </label>
            <textarea
              rows={2}
              value={form.description_en}
              onChange={(e) => setForm({ ...form, description_en: e.target.value })}
              placeholder={language === 'km' ? 'បញ្ចូលការពិពណ៌នាមុខម្ហូបជាភាសាអង់គ្លេស...' : 'Enter item description in English...'}
              className="w-full px-4 py-3 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ការពិពណ៌នា (KM)' : 'Description (KM)'}
            </label>
            <textarea
              rows={2}
              value={form.description_km}
              onChange={(e) => setForm({ ...form, description_km: e.target.value })}
              placeholder={language === 'km' ? 'បញ្ចូលការពិពណ៌នាមុខម្ហូបជាភាសាខ្មែរ...' : 'Enter item description in Khmer...'}
              className="w-full px-4 py-3 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors resize-none"
            />
          </div>

          <ItemOptionsEditor
            modifierGroups={form.modifier_groups}
            onChange={(modifier_groups) => setForm({ ...form, modifier_groups })}
          />

          <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => onClose()}
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
              ) : isEditing ? (
                language === 'km' ? 'កែប្រែ' : 'Update Item'
              ) : (
                language === 'km' ? 'រក្សាទុកមុខម្ហូប' : 'Save Item'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
