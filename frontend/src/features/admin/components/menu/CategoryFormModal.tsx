import type { Dispatch, FC, FormEvent, SetStateAction } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { CategoryFormState } from '../../utils/menuMapping'

interface CategoryFormModalProps {
  isEditing: boolean
  form: CategoryFormState
  setForm: Dispatch<SetStateAction<CategoryFormState>>
  isSubmitting: boolean
  onSubmit: (e: FormEvent) => void
  onDelete: () => void
  onClose: () => void
}

export const CategoryFormModal: FC<CategoryFormModalProps> = ({
  isEditing,
  form,
  setForm,
  isSubmitting,
  onSubmit,
  onDelete,
  onClose,
}) => {
  const { language } = useLanguageStore()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
        onClick={() => onClose()}
      />
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
            {isEditing
              ? language === 'km'
                ? 'កែសម្រួលប្រភេទ'
                : 'Edit Category'
              : language === 'km'
                ? 'បង្កើតប្រភេទថ្មី'
                : 'Create New Category'}
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
          <div className="space-y-1.5">
            <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះប្រភេទ (English)' : 'Category Name (English)'} *
            </label>
            <input
              type="text"
              required
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះប្រភេទជាភាសាអង់គ្លេស' : 'Enter category name in English'}
              className="w-full px-4 py-2.5 sm:py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះប្រភេទ (ខ្មែរ)' : 'Category Name (Khmer)'}
            </label>
            <input
              type="text"
              value={form.name_km}
              onChange={(e) => setForm({ ...form, name_km: e.target.value })}
              placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះប្រភេទជាភាសាខ្មែរ' : 'Enter category name in Khmer'}
              className="w-full px-4 py-2.5 sm:py-3 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm sm:text-base outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {isEditing ? (
              <button
                type="button"
                onClick={onDelete}
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
  )
}
