import { useState, type FC } from 'react'
import {
  Plus,
  Printer,
  Trash2,
  Users,
  ExternalLink,
  X,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'
import { Button } from '@/components/ui/Button'
import type { DiningZone, DiningTable } from '../types/admin.types'

export const DiningTablesTab: FC = () => {
  const { language } = useLanguageStore()
  const { businessProfile } = useOnboardingStore()

  const [activeZone, setActiveZone] = useState<string>('all')
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [selectedTableForPrint, setSelectedTableForPrint] = useState<DiningTable | null>(null)

  // Zones
  const [zones] = useState<DiningZone[]>([
    { id: 'zone-1', name_en: 'Main Hall', name_km: 'សាលធំកណ្តាល', tables_count: 8 },
    { id: 'zone-2', name_en: 'Outdoor Terrace', name_km: 'រានហាលខាងក្រៅ', tables_count: 4 },
    { id: 'zone-3', name_en: 'VIP Private Room', name_km: 'បន្ទប់ពិសេស VIP', tables_count: 2 },
  ])

  // Tables
  const [tables, setTables] = useState<DiningTable[]>([
    { id: 'tbl-1', table_number: 'T-01', zone_id: 'zone-1', zone_name: 'Main Hall', capacity: 4, qr_token: 't_bkk_01', status: 'AVAILABLE' },
    { id: 'tbl-2', table_number: 'T-02', zone_id: 'zone-1', zone_name: 'Main Hall', capacity: 4, qr_token: 't_bkk_02', status: 'OCCUPIED' },
    { id: 'tbl-3', table_number: 'T-03', zone_id: 'zone-1', zone_name: 'Main Hall', capacity: 2, qr_token: 't_bkk_03', status: 'AVAILABLE' },
    { id: 'tbl-4', table_number: 'T-04', zone_id: 'zone-1', zone_name: 'Main Hall', capacity: 6, qr_token: 't_bkk_04', status: 'BILLING' },
    { id: 'tbl-5', table_number: 'T-05', zone_id: 'zone-1', zone_name: 'Main Hall', capacity: 4, qr_token: 't_bkk_05', status: 'AVAILABLE' },
    { id: 'tbl-6', table_number: 'T-06', zone_id: 'zone-2', zone_name: 'Outdoor Terrace', capacity: 4, qr_token: 't_bkk_06', status: 'AVAILABLE' },
    { id: 'tbl-7', table_number: 'T-07', zone_id: 'zone-2', zone_name: 'Outdoor Terrace', capacity: 2, qr_token: 't_bkk_07', status: 'AVAILABLE' },
    { id: 'tbl-8', table_number: 'T-08', zone_id: 'zone-2', zone_name: 'Outdoor Terrace', capacity: 4, qr_token: 't_bkk_08', status: 'OCCUPIED' },
    { id: 'tbl-9', table_number: 'VIP-01', zone_id: 'zone-3', zone_name: 'VIP Private Room', capacity: 8, qr_token: 't_bkk_vip01', status: 'AVAILABLE' },
    { id: 'tbl-10', table_number: 'VIP-02', zone_id: 'zone-3', zone_name: 'VIP Private Room', capacity: 10, qr_token: 't_bkk_vip02', status: 'AVAILABLE' },
  ])

  // Batch Form State
  const [batchPrefix, setBatchPrefix] = useState('T-')
  const [batchCount, setBatchCount] = useState(6)
  const [batchCapacity, setBatchCapacity] = useState(4)
  const [batchZoneId, setBatchZoneId] = useState('zone-1')

  const handleDeleteTable = (tableId: string) => {
    setTables(tables.filter((t) => t.id !== tableId))
  }

  const handleGenerateBatch = (e: React.FormEvent) => {
    e.preventDefault()
    const targetZone = zones.find((z) => z.id === batchZoneId)
    const newTables: DiningTable[] = []
    const startIdx = tables.length + 1

    for (let i = 1; i <= batchCount; i++) {
      const numStr = String(startIdx + i - 1).padStart(2, '0')
      newTables.push({
        id: `tbl-${Date.now()}-${i}`,
        table_number: `${batchPrefix}${numStr}`,
        zone_id: batchZoneId,
        zone_name: targetZone?.name_en || 'Main Hall',
        capacity: batchCapacity,
        qr_token: `t_${batchPrefix.toLowerCase().replace('-', '')}_${numStr}`,
        status: 'AVAILABLE',
      })
    }

    setTables([...tables, ...newTables])
    setIsBatchModalOpen(false)
  }

  const handlePrintAll = () => {
    window.print()
  }

  const filteredTables = tables.filter((t) => activeZone === 'all' || t.zone_id === activeZone)

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'ប្លង់តុ & QR កូដ' : 'Dining Tables & QR Codes'}
          </h1>
          <p className="text-sm text-zinc-500">
            {language === 'km'
              ? 'បង្កើត និងគ្រប់គ្រងតំបន់អង្គុយ ចំនួនតុ និងបោះពុម្ព QR កូដសម្រាប់ភ្ញៀវស្កេន'
              : 'Configure dining zones, batch-generate tables, and print customer QR cards.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setIsPrintModalOpen(true)}
            className="text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            {language === 'km' ? 'បោះពុម្ព QR ទាំងអស់' : 'Print All QR Cards'}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setIsBatchModalOpen(true)}
            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {language === 'km' ? 'បង្កើតតុជាបាច់ (Batch)' : 'Batch Generate Tables'}
          </Button>
        </div>
      </div>

      {/* Zone Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveZone('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
            activeZone === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {language === 'km' ? 'តំបន់ទាំងអស់' : 'All Zones'} ({tables.length})
        </button>
        {zones.map((z) => {
          const count = tables.filter((t) => t.zone_id === z.id).length
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setActiveZone(z.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                activeZone === z.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {language === 'km' ? z.name_km : z.name_en} ({count})
            </button>
          )
        })}
      </div>

      {/* Tables Grid (Zero Shadows, Crisp Flat Border) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((tbl) => {
          const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
            `${window.location.origin}/t/${tbl.qr_token}`
          )}`

          return (
            <div
              key={tbl.id}
              className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Header: Table Number & Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-zinc-950 dark:text-zinc-50 font-mono">
                      {tbl.table_number}
                    </span>
                    <span className="text-xs text-zinc-400 font-medium">({tbl.zone_name})</span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      tbl.status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : tbl.status === 'OCCUPIED'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    }`}
                  >
                    {tbl.status}
                  </span>
                </div>

                {/* Seating Capacity */}
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                  <Users className="w-3.5 h-3.5" />
                  <span>{tbl.capacity} {language === 'km' ? 'កៅអី' : 'Seats'}</span>
                </div>

                {/* QR Code Preview Box */}
                <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center space-y-1.5">
                  <img
                    src={qrSvgUrl}
                    alt={`QR for ${tbl.table_number}`}
                    className="w-24 h-24 rounded-lg bg-white p-1"
                  />
                  <span className="text-[10px] font-mono text-zinc-400">
                    /t/{tbl.qr_token}
                  </span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <a
                  href={`/t/${tbl.qr_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{language === 'km' ? 'មើលមីនុយ' : 'Preview'}</span>
                </a>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTableForPrint(tbl)
                      setIsPrintModalOpen(true)
                    }}
                    title="Print QR Stand"
                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteTable(tbl.id)}
                    title="Delete Table"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Batch Generate Tables */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsBatchModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បង្កើតតុជាបាច់ (Batch Generate)' : 'Batch Generate Tables'}
              </h3>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'បុព្វបទកូដតុ (Prefix)' : 'Table Prefix'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchPrefix}
                    onChange={(e) => setBatchPrefix(e.target.value)}
                    placeholder="T-"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ចំនួនតុ (Count)' : 'Number of Tables'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={batchCount}
                    onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'តំបន់អង្គុយ' : 'Dining Zone'} *
                  </label>
                  <select
                    value={batchZoneId}
                    onChange={(e) => setBatchZoneId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {language === 'km' ? z.name_km : z.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'ចំនួនកៅអី (Seats)' : 'Seats / Capacity'} *
                  </label>
                  <select
                    value={batchCapacity}
                    onChange={(e) => setBatchCapacity(parseInt(e.target.value) || 4)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                  >
                    <option value={2}>2 Seats</option>
                    <option value={4}>4 Seats</option>
                    <option value={6}>6 Seats</option>
                    <option value={8}>8 Seats</option>
                    <option value={10}>10+ Seats</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsBatchModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {language === 'km' ? 'បង្កើតតុភ្លាមៗ' : 'Generate Tables'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Printable QR Table Stand Package */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => {
              setIsPrintModalOpen(false)
              setSelectedTableForPrint(null)
            }}
          />
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
                  {language === 'km' ? 'កាត QR កូដសម្រាប់ដាក់លើតុ' : 'Printable Table QR Stand Cards'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {language === 'km'
                    ? 'ទំហំស្តង់ដារសម្រាប់បោះពុម្ពដាក់លើជើងទម្រតុអាហារ'
                    : 'Standard acrylic stand size ready for high-resolution printing'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPrintModalOpen(false)
                  setSelectedTableForPrint(null)
                }}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(selectedTableForPrint ? [selectedTableForPrint] : tables.slice(0, 4)).map((t) => {
                const qrSvg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  `${window.location.origin}/t/${t.qr_token}`
                )}`
                return (
                  <div
                    key={t.id}
                    className="p-6 rounded-2xl border-2 border-zinc-900 dark:border-zinc-100 bg-white text-zinc-900 flex flex-col items-center text-center space-y-3 print:border-black"
                  >
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-sm text-zinc-800">
                        {businessProfile.name_en || 'E-Menu Restaurant'}
                      </h4>
                      <div className="text-2xl font-black font-mono tracking-tight text-emerald-600">
                        {t.table_number}
                      </div>
                    </div>

                    <img src={qrSvg} alt="QR" className="w-32 h-32 rounded-lg" />

                    <div className="space-y-0.5 text-xs text-zinc-600">
                      <p className="font-bold font-khmer">ស្កេនដើម្បីមើលមីនុយ & កុម្ម៉ង់ម្ហូប</p>
                      <p className="text-[10px] text-zinc-400">Scan to View Menu & Order</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setIsPrintModalOpen(false)
                  setSelectedTableForPrint(null)
                }}
              >
                {language === 'km' ? 'បិទ' : 'Close'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handlePrintAll}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                {language === 'km' ? 'បោះពុម្ពឥឡូវនេះ' : 'Print Cards'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
