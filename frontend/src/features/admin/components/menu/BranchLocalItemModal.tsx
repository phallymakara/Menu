import { useState, type FC, type FormEvent } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { Category } from '../../types/admin.types'
import type { BranchLocalItemCreate } from '../../hooks/useBranchMenuQueries'

interface BranchLocalItemModalProps {
  categories: Category[]
  isSubmitting: boolean
  isUploadingImage: boolean
  onImageSelected: (file: File) => Promise<string | undefined>
  onSubmit: (data: BranchLocalItemCreate) => Promise<void>
  onClose: () => void
}

export const BranchLocalItemModal: FC<BranchLocalItemModalProps> = ({
  categories,
  isSubmitting,
  isUploadingImage,
  onImageSelected,
  onSubmit,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const [nameEn, setNameEn] = useState('')
  const [nameKm, setNameKm] = useState('')
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || '')
  const [price, setPrice] = useState<string>('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [descriptionKm, setDescriptionKm] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await onImageSelected(file)
      if (url) setImageUrl(url)
    } catch {
      // Local preview handling if upload fails
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!nameEn.trim()) {
      setError(isKm ? 'សូមបញ្ចូលឈ្មោះមុខម្ហូប (English)' : 'English dish name is required')
      return
    }
    const parsedPrice = parseFloat(price)
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError(isKm ? 'សូមបញ្ចូលតម្លៃដែលត្រឹមត្រូវ' : 'Valid base price is required')
      return
    }

    setError(null)
    try {
      await onSubmit({
        name_en: nameEn.trim(),
        name_km: nameKm.trim() || null,
        category_id: categoryId || null,
        base_price: parsedPrice,
        description_en: descriptionEn.trim() || null,
        description_km: descriptionKm.trim() || null,
        image_url: imageUrl,
        is_active: true,
      })
      onClose()
    } catch {
      setError(
        isKm
          ? 'មិនអាចបង្កើតមុខម្ហូបសាខាបានទេ។ សូមព្យាយាមម្តងទៀត។'
          : 'Failed to create branch local item. Please try again.'
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50">
              {isKm ? 'បន្ថែមមុខម្ហូបពិសេសសាខា (Local Dish)' : 'Add Branch Local Dish'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isKm
                ? 'មុខម្ហូបនេះនឹងលេចឡើងសម្រាប់តែសាខានេះប៉ុណ្ណោះ'
                : 'This dish will only be visible in this branch until promoted.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image & Basic Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {isKm ? 'ឈ្មោះ (English)' : 'Name (English)'} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Signature Iced Latte"
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {isKm ? 'ឈ្មោះ (ភាសាខ្មែរ)' : 'Name (Khmer)'}
              </label>
              <input
                type="text"
                value={nameKm}
                onChange={(e) => setNameKm(e.target.value)}
                placeholder="ឧ. កាហ្វេទឹកដោះគោទឹកកកពិសេស"
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {isKm ? 'ប្រភេទមុខម្ហូប' : 'Category'}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">{isKm ? 'គ្មានប្រភេទ' : 'None'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isKm && c.name_km ? c.name_km : c.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {isKm ? 'តម្លៃ ($ USD)' : 'Price ($ USD)'} *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="3.50"
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Image Upload Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
              {isKm ? 'រូបភាពមុខម្ហូប' : 'Dish Photo'}
            </label>
            <div className="flex items-center gap-3">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="w-12 h-12 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shrink-0"
                />
              )}
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                {isUploadingImage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-zinc-500" />
                )}
                <span>{isKm ? 'ជ្រើសរើសរូបភាព' : 'Choose Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isUploadingImage}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {isKm ? 'ការពិពណ៌នា (English)' : 'Description (English)'}
              </label>
              <textarea
                rows={2}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                placeholder="Description (English)"
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                {isKm ? 'ការពិពណ៌នា (ភាសាខ្មែរ)' : 'Description (Khmer)'}
              </label>
              <textarea
                rows={2}
                value={descriptionKm}
                onChange={(e) => setDescriptionKm(e.target.value)}
                placeholder="ការពិពណ៌នា (ភាសាខ្មែរ)"
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end pt-3 border-t border-zinc-100 dark:border-zinc-800 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs font-semibold border-zinc-300 dark:border-zinc-700"
            >
              {isKm ? 'បោះបង់' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || isUploadingImage}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {isKm ? 'បង្កើតមុខម្ហូបសាខា' : 'Create Local Dish'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
