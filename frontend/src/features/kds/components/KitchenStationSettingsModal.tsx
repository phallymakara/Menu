import { useState, type FC } from 'react'
import { Plus, Trash2, Edit2, Check, X, Layers, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useCategories } from '@/features/admin/hooks/useMenuQueries'
import {
  useKitchenStations,
  useCreateKitchenStation,
  useUpdateKitchenStation,
  useDeleteKitchenStation,
  useAssignStationItems,
  type KitchenStationResponse,
} from '../hooks/useKDSQueries'

export interface KitchenStationSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  businessId: string | null
  branchId: string | null
}

const PRESET_COLORS = [
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
]

export const KitchenStationSettingsModal: FC<KitchenStationSettingsModalProps> = ({
  isOpen,
  onClose,
  businessId,
  branchId,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const { data: stations = [], isLoading: isStationsLoading } = useKitchenStations(businessId, branchId)
  const { data: rawCategories = [] } = useCategories(businessId)

  const createMutation = useCreateKitchenStation(businessId, branchId)
  const updateMutation = useUpdateKitchenStation(businessId, branchId)
  const deleteMutation = useDeleteKitchenStation(businessId, branchId)
  const assignMutation = useAssignStationItems(businessId, branchId)

  // Editing or creating station form state
  const [editingStation, setEditingStation] = useState<KitchenStationResponse | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [nameEn, setNameEn] = useState('')
  const [nameKm, setNameKm] = useState('')
  const [code, setCode] = useState('')
  const [colorHex, setColorHex] = useState(PRESET_COLORS[0])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const startCreate = () => {
    setEditingStation(null)
    setNameEn('')
    setNameKm('')
    setCode('')
    setColorHex(PRESET_COLORS[0])
    setSelectedCategoryIds([])
    setErrorMsg(null)
    setIsCreating(true)
  }

  const startEdit = (st: KitchenStationResponse) => {
    setIsCreating(false)
    setEditingStation(st)
    setNameEn(st.name_en)
    setNameKm(st.name_km || '')
    setCode(st.code)
    setColorHex(st.color_hex || PRESET_COLORS[0])
    setSelectedCategoryIds([])
    setErrorMsg(null)
  }

  const cancelEdit = () => {
    setEditingStation(null)
    setIsCreating(false)
    setErrorMsg(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameEn.trim()) {
      setErrorMsg(isKm ? 'សូមបញ្ចូលឈ្មោះស្ថានីយជាភាសាអង់គ្លេស' : 'Please enter station name.')
      return
    }
    if (!code.trim()) {
      setErrorMsg(isKm ? 'សូមបញ្ចូលកូដស្ថានីយ (ឧទាហរណ៍ GRILL)' : 'Please enter station code.')
      return
    }

    setErrorMsg(null)
    try {
      if (editingStation) {
        await updateMutation.mutateAsync({
          stationId: editingStation.id,
          payload: {
            name_en: nameEn.trim(),
            name_km: nameKm.trim() || undefined,
            code: code.trim().toUpperCase(),
            color_hex: colorHex,
          },
        })

        if (selectedCategoryIds.length > 0) {
          await assignMutation.mutateAsync({
            stationId: editingStation.id,
            payload: { category_ids: selectedCategoryIds },
          })
        }
      } else {
        const created = await createMutation.mutateAsync({
          name_en: nameEn.trim(),
          name_km: nameKm.trim() || undefined,
          code: code.trim().toUpperCase(),
          station_type: 'prep_station',
          color_hex: colorHex,
        })

        if (created?.id && selectedCategoryIds.length > 0) {
          await assignMutation.mutateAsync({
            stationId: created.id,
            payload: { category_ids: selectedCategoryIds },
          })
        }
      }
      cancelEdit()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចរក្សាទុកស្ថានីយផ្ទះបាយបានទេ។ សូមព្យាយាមម្តងទៀត។' : 'Unable to save kitchen station. Please try again.'
      )
    }
  }

  const handleDelete = async (stationId: string) => {
    const confirmText = isKm ? 'តើអ្នកប្រាកដជាចង់លុបស្ថានីយនេះមែនទេ?' : 'Are you sure you want to delete this kitchen station?'
    if (!window.confirm(confirmText)) return

    try {
      await deleteMutation.mutateAsync(stationId)
      if (editingStation?.id === stationId) cancelEdit()
    } catch {
      setErrorMsg(
        isKm ? 'មិនអាចលុបស្ថានីយផ្ទះបាយបានទេ។' : 'Unable to delete kitchen station.'
      )
    }
  }

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || assignMutation.isPending

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isKm ? 'គ្រប់គ្រងស្ថានីយផ្ទះបាយ (Kitchen Stations)' : 'Kitchen Stations & Routing'}
      description={
        isKm
          ? 'កំណត់អេក្រង់ផ្ទះបាយ (ឧ. ភេសជ្ជៈ សាច់អាំង ចៀន) និងបែងចែកប្រភេទមុខម្ហូប'
          : 'Configure dedicated preparation stations and route menu categories.'
      }
    >
      <div className="space-y-4">
        {/* Error message near fields */}
        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {errorMsg}
          </p>
        )}

        {/* Existing Stations List */}
        {!isCreating && !editingStation && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                {isKm ? 'ស្ថានីយបច្ចុប្បន្ន' : 'Configured Stations'} ({stations.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startCreate}
                className="text-xs rounded-full border-zinc-200 dark:border-zinc-800"
              >
                <Plus className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                {isKm ? 'បង្កើតស្ថានីយថ្មី' : 'Add Station'}
              </Button>
            </div>

            {isStationsLoading ? (
              <div className="py-8 flex justify-center text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              </div>
            ) : stations.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                {isKm ? 'មិនទាន់មានស្ថានីយផ្ទះបាយនៅឡើយទេ' : 'No kitchen stations created yet.'}
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                {stations.map((st) => (
                  <div
                    key={st.id}
                    className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: st.color_hex || '#3b82f6' }}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {isKm && st.name_km ? st.name_km : st.name_en}
                          <span className="ml-1.5 text-[10px] font-mono text-zinc-400 font-normal">
                            ({st.code})
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 block capitalize">
                          {st.station_type ? st.station_type.replace('_', ' ') : 'station'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(st)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Edit station"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(st.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Delete station"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create / Edit Station Form */}
        {(isCreating || editingStation) && (
          <form onSubmit={handleSave} className="space-y-3.5 pt-1">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                {editingStation
                  ? (isKm ? 'កែប្រែស្ថានីយ' : 'Edit Kitchen Station')
                  : (isKm ? 'បង្កើតស្ថានីយថ្មី' : 'Create New Station')}
              </span>
              <button
                type="button"
                onClick={cancelEdit}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {isKm ? 'ឈ្មោះជាភាសាអង់គ្លេស' : 'Station Name (EN)'} *
                </label>
                <input
                  type="text"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Grill & BBQ"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {isKm ? 'កូដស្ថានីយ (Code)' : 'Station Code'} *
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. GRILL"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-mono uppercase outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                {isKm ? 'ឈ្មោះជាភាសាខ្មែរ (ស្រេចចិត្ត)' : 'Station Name (Khmer - Optional)'}
              </label>
              <input
                type="text"
                value={nameKm}
                onChange={(e) => setNameKm(e.target.value)}
                placeholder="ឧទាហរណ៍ កន្លែងអាំងសាច់"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs outline-none focus:border-zinc-400"
              />
            </div>

            {/* Color Palette */}
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                {isKm ? 'ពណ៌សម្គាល់' : 'Color Tag'}
              </label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorHex(c)}
                    className="w-6 h-6 rounded-full border-2 transition-transform flex items-center justify-center"
                    style={{
                      backgroundColor: c,
                      borderColor: colorHex === c ? '#18181b' : 'transparent',
                    }}
                  >
                    {colorHex === c && <Check className="w-3 h-3 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Routing Assignment */}
            {rawCategories.length > 0 && (
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  <Layers className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{isKm ? 'កំណត់ប្រភេទមុខម្ហូបទៅស្ថានីយនេះ' : 'Assign Menu Categories'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                  {rawCategories.map((cat) => {
                    const isSelected = selectedCategoryIds.includes(cat.id)
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                        }`}
                      >
                        {isKm && cat.name_km ? cat.name_km : cat.name_en}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelEdit}
                className="text-xs rounded-full border-zinc-200 dark:border-zinc-800"
              >
                {isKm ? 'បោះបង់' : 'Cancel'}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSaving}
                className="text-xs rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving
                  ? (isKm ? 'កំពុងរក្សាទុក...' : 'Saving...')
                  : (isKm ? 'រក្សាទុក' : 'Save Station')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
