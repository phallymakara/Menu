import { useState, type FC } from 'react'
import { Plus, Trash2, Users, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '../stores/useOnboardingStore'
import { DiningAreaItem } from '../types/onboarding.types'

export const Step3DiningTables: FC = () => {
  const { language } = useLanguageStore()
  const { diningAreas, addDiningArea, removeDiningArea } = useOnboardingStore()

  const [newAreaNameEn, setNewAreaNameEn] = useState('')
  const [newAreaNameKm, setNewAreaNameKm] = useState('')
  const [newTablesCount, setNewTablesCount] = useState(6)
  const [newCapacity, setNewCapacity] = useState(4)
  const [newPrefix, setNewPrefix] = useState('T-')

  const handleAddArea = () => {
    if (!newAreaNameEn.trim()) return

    const newArea: DiningAreaItem = {
      id: 'area-' + Date.now(),
      name_en: newAreaNameEn.trim(),
      name_km: newAreaNameKm.trim() || newAreaNameEn.trim(),
      tables_count: Number(newTablesCount) || 1,
      default_capacity: Number(newCapacity) || 4,
      table_prefix: newPrefix.trim() || 'T-',
    }

    addDiningArea(newArea)
    setNewAreaNameEn('')
    setNewAreaNameKm('')
    setNewPrefix('T-')
  }

  const totalTables = diningAreas.reduce((sum, a) => sum + Number(a.tables_count), 0)
  const totalCapacity = diningAreas.reduce((sum, a) => sum + (Number(a.tables_count) * Number(a.default_capacity)), 0)

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Overview Stats */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div>
          <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {language === 'km' ? 'ប្លង់តុ និងតំបន់អង្គុយ' : 'Dining Areas & Seating Layout'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {language === 'km'
              ? 'បង្កើតតំបន់អង្គុយ និងកំណត់ចំនួនតុសម្រាប់សាខារបស់អ្នក'
              : 'Add dining zones and define the number of tables'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
              {totalTables}
            </span>
            <span className="text-xs text-zinc-500">{language === 'km' ? 'ចំនួនតុសរុប' : 'Total Tables'}</span>
          </div>
          <div>
            <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 font-mono block">
              {totalCapacity}
            </span>
            <span className="text-xs text-zinc-500">{language === 'km' ? 'កៅអីសរុប' : 'Total Seats'}</span>
          </div>
        </div>
      </div>

      {/* Existing Areas List */}
      <div className="space-y-3">
        <label className="text-base font-bold text-zinc-900 dark:text-zinc-100 block">
          {language === 'km' ? 'តំបន់អង្គុយបច្ចុប្បន្ន' : 'Configured Dining Zones'}
        </label>

        <div className="space-y-3">
          {diningAreas.map((area) => (
            <div
              key={area.id}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? area.name_km : area.name_en}
                    <span className="text-xs font-normal text-zinc-400 ml-2">
                      ({area.name_en})
                    </span>
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                    <span>
                      {language === 'km' ? `ចំនួន ${area.tables_count} តុ` : `${area.tables_count} tables`} ({area.table_prefix}01 - {area.table_prefix}{area.tables_count < 10 ? '0' + area.tables_count : area.tables_count})
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {area.default_capacity} {language === 'km' ? 'កៅអី/តុ' : 'seats/table'}
                    </span>
                  </div>
                </div>
              </div>

              {diningAreas.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDiningArea(area.id)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add New Area Section */}
      <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-4">
        <label className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 block">
          {language === 'km' ? '+ បន្ថែមតំបន់អង្គុយថ្មី' : '+ Add New Dining Zone'}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {language === 'km' ? 'ឈ្មោះតំបន់ (អង់គ្លេស)' : 'Zone Name (English)'}
            </label>
            <input
              type="text"
              value={newAreaNameEn}
              onChange={(e) => setNewAreaNameEn(e.target.value)}
              placeholder="e.g. 2nd Floor Balcony"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {language === 'km' ? 'អក្សរសម្គាល់តុ' : 'Table Prefix'}
            </label>
            <input
              type="text"
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
              placeholder="B-"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {language === 'km' ? 'ចំនួនតុ' : 'Tables'}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={newTablesCount}
              onChange={(e) => setNewTablesCount(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-center focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {language === 'km' ? 'កៅអី/តុ' : 'Seats/Table'}
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={newCapacity}
              onChange={(e) => setNewCapacity(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-center focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddArea}
            disabled={!newAreaNameEn.trim()}
            className="text-xs font-semibold"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {language === 'km' ? 'បញ្ចូលតំបន់នេះ' : 'Add Zone'}
          </Button>
        </div>
      </div>
    </div>
  )
}
