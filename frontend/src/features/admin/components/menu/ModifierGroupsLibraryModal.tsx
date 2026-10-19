import { useState, type FC, type FormEvent } from 'react'
import { X, Layers, Trash2, Edit3, Loader2, Info, ShieldAlert } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import {
  useBusinessModifierGroups,
  useModifierGroupDetail,
  useUpdateModifierGroup,
  useDeleteModifierGroup,
  type ModifierGroupDetailResponse,
  type ModifierGroupUpdate,
} from '../../hooks/useMenuQueries'

interface ModifierGroupsLibraryModalProps {
  businessId: string | null
  onClose: () => void
}

export const ModifierGroupsLibraryModal: FC<ModifierGroupsLibraryModalProps> = ({
  businessId,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const { data: groups, isLoading, error } = useBusinessModifierGroups(businessId)
  const updateGroupMutation = useUpdateModifierGroup(businessId)
  const deleteGroupMutation = useDeleteModifierGroup(businessId)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ModifierGroupUpdate>({
    name_en: '',
    name_km: '',
    min_selections: 0,
    max_selections: 1,
  })

  const [inspectGroupId, setInspectGroupId] = useState<string | null>(null)
  const { data: inspectedGroup, isLoading: isInspecting } = useModifierGroupDetail(
    businessId,
    inspectGroupId
  )

  const handleStartEdit = (group: ModifierGroupDetailResponse) => {
    setEditingGroupId(group.id)
    setEditForm({
      name_en: group.name_en,
      name_km: group.name_km || '',
      min_selections: group.min_selections ?? 0,
      max_selections: group.max_selections ?? 1,
    })
  }

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingGroupId) return
    try {
      await updateGroupMutation.mutateAsync({
        groupId: editingGroupId,
        payload: editForm,
      })
      setEditingGroupId(null)
    } catch {
      alert(isKm ? 'មិនអាចកែសម្រួលក្រុមជម្រើសបានទេ' : 'Failed to update modifier group')
    }
  }

  const handleDelete = async (groupId: string, name: string) => {
    if (!confirm(isKm ? `តើអ្នកប្រាកដជាចង់លុប "${name}" ទេ?` : `Are you sure you want to delete "${name}"?`)) {
      return
    }
    try {
      await deleteGroupMutation.mutateAsync(groupId)
    } catch {
      alert(isKm ? 'មិនអាចលុបក្រុមជម្រើសបានទេ' : 'Failed to delete modifier group')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-3xl w-full p-6 sm:p-7 space-y-5 shadow-none modal-dialog-animate z-10 my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
                {isKm ? 'បណ្ណាល័យក្រុមជម្រើសបន្ថែម' : 'Modifier Groups Library'}
              </h2>
              <p className="text-xs text-zinc-500">
                {isKm
                  ? 'ក្រុមជម្រើសដែលអាចប្រើឡើងវិញបានសម្រាប់មុខម្ហូបជាច្រើន'
                  : 'Reusable modifier groups shared across menu items'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {isLoading ? (
            <div className="py-16 flex justify-center items-center">
              <EmenuLoader />
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-2 text-rose-500 text-xs">
              <ShieldAlert className="w-8 h-8 mx-auto" />
              <p>{isKm ? 'មិនអាចទាញយកបណ្ណាល័យក្រុមជម្រើសបានទេ' : 'Unable to load modifier groups'}</p>
            </div>
          ) : !groups || groups.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {isKm ? 'មិនទាន់មានក្រុមជម្រើសនៅឡើយទេ' : 'No modifier groups found'}
              </p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {isKm
                  ? 'បង្កើតក្រុមជម្រើសនៅក្នុងទម្រង់បន្ថែមមុខម្ហូប ដើម្បីរក្សាទុកក្នុងបណ្ណាល័យនេះ។'
                  : 'Create modifier groups when editing menu items to reuse them across your menu.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const isEditing = editingGroupId === group.id
                const isRequired = (group.min_selections ?? 0) >= 1
                return (
                  <div
                    key={group.id}
                    className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                  >
                    {isEditing ? (
                      /* Inline Edit Form */
                      <form onSubmit={handleSaveEdit} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                              {isKm ? 'ឈ្មោះជាភាសាអង់គ្លេស' : 'Name (English)'} *
                            </label>
                            <input
                              type="text"
                              required
                              value={editForm.name_en ?? ''}
                              onChange={(e) =>
                                setEditForm((prev) => ({ ...prev, name_en: e.target.value }))
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                              {isKm ? 'ឈ្មោះជាភាសាខ្មែរ' : 'Name (Khmer)'}
                            </label>
                            <input
                              type="text"
                              value={editForm.name_km || ''}
                              onChange={(e) =>
                                setEditForm((prev) => ({ ...prev, name_km: e.target.value }))
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(editForm.min_selections ?? 0) >= 1}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  min_selections: e.target.checked ? 1 : 0,
                                }))
                              }
                              className="rounded text-emerald-600"
                            />
                            <span>{isKm ? 'តម្រូវឱ្យជ្រើសរើស (Required)' : 'Required'}</span>
                          </label>

                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500 text-[11px]">Min:</span>
                            <input
                              type="number"
                              min={0}
                              value={editForm.min_selections ?? 0}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  min_selections: parseInt(e.target.value, 10) || 0,
                                }))
                              }
                              className="w-14 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500 text-[11px]">Max:</span>
                            <input
                              type="number"
                              min={1}
                              value={editForm.max_selections ?? 1}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  max_selections: parseInt(e.target.value, 10) || 1,
                                }))
                              }
                              className="w-14 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingGroupId(null)}
                              className="text-xs px-3 py-1 rounded-lg"
                            >
                              {isKm ? 'បោះបង់' : 'Cancel'}
                            </Button>
                            <Button
                              type="submit"
                              variant="primary"
                              size="sm"
                              disabled={updateGroupMutation.isPending}
                              className="text-xs px-4 py-1 rounded-lg bg-emerald-600 text-white"
                            >
                              {updateGroupMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                isKm ? 'រក្សាទុក' : 'Save'
                              )}
                            </Button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      /* Display Row */
                      <div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                              {isKm && group.name_km ? group.name_km : group.name_en}
                            </h3>
                            {group.name_km && group.name_en !== group.name_km && (
                              <span className="text-xs text-zinc-400">({group.name_en})</span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isRequired
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}
                            >
                              {isRequired
                                ? isKm
                                  ? 'ចាំបាច់'
                                  : 'Required'
                                : isKm
                                ? 'ស្រេចចិត្ត'
                                : 'Optional'}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              (Min: {group.min_selections ?? 0}, Max: {group.max_selections ?? 1})
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setInspectGroupId(inspectGroupId === group.id ? null : group.id)
                              }
                              className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              title={isKm ? 'ព័ត៌មានលម្អិត' : 'Inspect Details'}
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(group)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              title={isKm ? 'កែសម្រួល' : 'Edit'}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(group.id, isKm && group.name_km ? group.name_km : group.name_en)
                              }
                              className="p-1.5 text-zinc-400 hover:text-rose-600 transition-colors rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title={isKm ? 'លុប' : 'Delete'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Child Options List */}
                        {group.options && group.options.length > 0 ? (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {group.options.map((opt) => {
                              const numPrice = parseFloat(opt.price || '0')
                              return (
                                <span
                                  key={opt.name_en}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-700/50"
                                >
                                  <span className="font-medium">
                                    {isKm && opt.name_km ? opt.name_km : opt.name_en}
                                  </span>
                                  {numPrice > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                                      +${numPrice.toFixed(2)}
                                    </span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-400 italic mt-1">
                            {isKm ? 'គ្មានជម្រើសបន្ថែម' : 'No options configured'}
                          </p>
                        )}

                        {/* Inspected Details Drawer */}
                        {inspectGroupId === group.id && (
                          <div className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 text-xs space-y-1.5 animate-in fade-in duration-200">
                            {isInspecting ? (
                              <div className="py-2 flex justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                              </div>
                            ) : inspectedGroup ? (
                              <>
                                <div className="flex justify-between items-center text-[11px] text-zinc-500">
                                  <span>Group ID:</span>
                                  <span className="font-mono text-zinc-700 dark:text-zinc-300 select-all">
                                    {inspectedGroup.id}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[11px] text-zinc-500">
                                  <span>Business ID:</span>
                                  <span className="font-mono text-zinc-700 dark:text-zinc-300 select-all">
                                    {inspectedGroup.business_id}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[11px] text-zinc-500">
                                  <span>Total Options:</span>
                                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                                    {inspectedGroup.options?.length || 0}
                                  </span>
                                </div>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-full px-5 text-xs"
          >
            {isKm ? 'បិទ' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  )
}
