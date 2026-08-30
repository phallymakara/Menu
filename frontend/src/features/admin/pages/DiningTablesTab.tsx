import { useState, useEffect, useCallback, type FC } from 'react'
import {
  Plus,
  Printer,
  Trash2,
  Users,
  ExternalLink,
  X,
  Loader2,
  Download,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { DiningZone, DiningTable } from '../types/admin.types'

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export const DiningTablesTab: FC = () => {
  const { language } = useLanguageStore()

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [branchId, setBranchId] = useState<string | null>(
    localStorage.getItem('emenu_branch_id')
  )

  const [zones, setZones] = useState<DiningZone[]>([])
  const [tables, setTables] = useState<DiningTable[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [activeZone, setActiveZone] = useState<string>('all')
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [selectedTableForPrint, setSelectedTableForPrint] = useState<DiningTable | null>(null)

  // Batch Form State
  const [batchPrefix, setBatchPrefix] = useState('T-')
  const [batchCount, setBatchCount] = useState(6)
  const [batchCapacity, setBatchCapacity] = useState(4)
  const [batchZoneId, setBatchZoneId] = useState('')
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({})

  // Zone Form State
  const [zoneForm, setZoneForm] = useState({ name_en: '', name_km: '' })
  const [zoneErrors, setZoneErrors] = useState<Record<string, string>>({})



  // 1. Resolve Tenant Context
  const resolveTenant = useCallback(async () => {
    let biz = businessId
    let br = branchId

    if (!isUuid(biz)) {
      try {
        const bizRes = await api.get('/businesses')
        if (Array.isArray(bizRes.data) && bizRes.data.length > 0) {
          biz = bizRes.data[0].id
          setBusinessId(biz)
          localStorage.setItem('emenu_business_id', biz!)
        }
      } catch {
        // Handled in catch
      }
    }

    if (isUuid(biz) && !isUuid(br)) {
      try {
        const brRes = await api.get(`/businesses/${biz}/branches`)
        if (Array.isArray(brRes.data) && brRes.data.length > 0) {
          br = brRes.data[0].id
          setBranchId(br)
          localStorage.setItem('emenu_branch_id', br!)
        }
      } catch {
        // Handled in catch
      }
    }

    return { biz, br }
  }, [branchId, businessId])

  // 2. Fetch Isolated Tenant Zones and Tables
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const { biz, br } = await resolveTenant()

      if (!isUuid(biz) || !isUuid(br)) {
        setIsLoading(false)
        return
      }

      const [zonesRes, tablesRes] = await Promise.all([
        api.get(`/businesses/${biz}/branches/${br}/dining-areas`).catch(() => ({ data: [] })),
        api.get(`/businesses/${biz}/branches/${br}/tables`).catch(() => ({ data: [] })),
      ])

      const rawZones: any[] = Array.isArray(zonesRes.data) ? zonesRes.data : []
      const mappedZones: DiningZone[] = rawZones.map((z) => ({
        id: z.id,
        name_en: z.name_en,
        name_km: z.name_km || z.name_en,
        tables_count: z.tables_count || 0,
      }))
      setZones(mappedZones)
      if (mappedZones.length > 0 && !batchZoneId) {
        setBatchZoneId(mappedZones[0].id)
      }

      const rawTables: any[] = Array.isArray(tablesRes.data) ? tablesRes.data : []
      const mappedTables: DiningTable[] = rawTables.map((t) => ({
        id: t.id,
        table_number: t.table_number,
        zone_id: t.dining_area_id,
        zone_name: t.dining_area?.name_en || 'Main Area',
        capacity: t.capacity || 4,
        qr_token: t.qr_code_token || t.id,
        status: t.status || 'AVAILABLE',
      }))
      setTables(mappedTables)
    } catch {
      setErrorMessage(
        language === 'km'
          ? 'មិនអាចទាញយកទិន្នន័យតុបានទេ។'
          : 'Unable to load dining tables. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [batchZoneId, language, resolveTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 3. Delete Table from Tenant DB
  const handleDeleteTable = async (tableId: string) => {
    if (!isUuid(tableId)) {
      setTables(tables.filter((t) => t.id !== tableId))
      return
    }

    if (!confirm(language === 'km' ? 'តើអ្នកប្រាកដជាចង់លុបតុនេះទេ?' : 'Are you sure you want to delete this table?')) {
      return
    }

    try {
      const { biz, br } = await resolveTenant()
      if (isUuid(biz) && isUuid(br)) {
        await api.delete(`/businesses/${biz}/branches/${br}/tables/${tableId}`)
      }
      setTables(tables.filter((t) => t.id !== tableId))
    } catch {
      alert(language === 'km' ? 'មិនអាចលុបតុបានទេ' : 'Failed to delete table')
    }
  }

  // 4. Create Zone Form
  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!zoneForm.name_en.trim()) {
      setZoneErrors({ name_en: 'Zone name is required' })
      return
    }

    setIsSubmitting(true)
    try {
      const { biz, br } = await resolveTenant()
      if (isUuid(biz) && isUuid(br)) {
        const res = await api.post(`/businesses/${biz}/branches/${br}/dining-areas`, {
          name_en: zoneForm.name_en.trim(),
          name_km: zoneForm.name_km.trim() || zoneForm.name_en.trim(),
        })
        const newZ: DiningZone = {
          id: res.data.id,
          name_en: res.data.name_en,
          name_km: res.data.name_km,
          tables_count: 0,
        }
        setZones((prev) => [...prev, newZ])
        if (!batchZoneId) setBatchZoneId(newZ.id)
      }
      setZoneForm({ name_en: '', name_km: '' })
      setIsZoneModalOpen(false)
    } catch {
      alert('Failed to create dining area')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 5. Batch Generate Tables in Tenant DB
  const validateBatchForm = () => {
    const errs: Record<string, string> = {}
    if (!batchPrefix.trim()) {
      errs.batchPrefix = language === 'km' ? 'សូមបញ្ចូលបុព្វបទតុ' : 'Table prefix is required'
    }
    if (!batchCount || batchCount < 1 || batchCount > 50) {
      errs.batchCount = language === 'km' ? 'ចំនួនតុត្រូវនៅចន្លោះពី ១ ដល់ ៥០' : 'Table count must be between 1 and 50'
    }
    setBatchErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBatchForm()) return

    setIsSubmitting(true)
    try {
      const { biz, br } = await resolveTenant()
      if (isUuid(biz) && isUuid(br)) {
        const res = await api.post(`/businesses/${biz}/branches/${br}/tables/batch`, {
          prefix: batchPrefix.trim(),
          start_number: tables.length + 1,
          count: batchCount,
          capacity: batchCapacity,
          dining_area_id: isUuid(batchZoneId) ? batchZoneId : null,
        })

        if (Array.isArray(res.data)) {
          const generated: DiningTable[] = res.data.map((t: any) => ({
            id: t.id,
            table_number: t.table_number,
            zone_id: t.dining_area_id,
            zone_name: zones.find((z) => z.id === t.dining_area_id)?.name_en || 'Main Area',
            capacity: t.capacity || batchCapacity,
            qr_token: t.qr_code_token || t.id,
            status: t.status || 'AVAILABLE',
          }))
          setTables((prev) => [...prev, ...generated])
        }
      }
      setBatchErrors({})
      setIsBatchModalOpen(false)
    } catch {
      alert('Failed to generate batch tables')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 6. Download Table QR Batch ZIP Archive
  const handleDownloadBatchZip = async () => {
    setIsDownloadingZip(true)
    try {
      const { biz, br } = await resolveTenant()
      if (isUuid(biz) && isUuid(br)) {
        const response = await api.get(`/businesses/${biz}/branches/${br}/tables/qr/batch`, {
          responseType: 'blob',
        })
        const blob = new Blob([response.data], { type: 'application/zip' })
        const downloadUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        const branchCode = br ? br.slice(0, 8) : 'export'
        link.download = `table_qr_codes_${branchCode}.zip`

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(downloadUrl)
      }
    } catch {
      alert(language === 'km' ? 'មិនអាចទាញយកឯកសារ ZIP បានទេ' : 'Failed to download QR ZIP archive')
    } finally {
      setIsDownloadingZip(false)
    }
  }

  const filteredTables = tables.filter((t) => activeZone === 'all' || t.zone_id === activeZone)

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'ប្លង់តុ & QR កូដ' : 'Dining Tables & QR Stands'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {language === 'km'
              ? 'គ្រប់គ្រងតុអាហារ បង្កើត QR កូដជាក្រុម និងបោះពុម្ពកាតដាក់លើតុ'
              : 'Manage dining layout, batch generate QR codes, and print table stands.'}
          </p>
        </div>

        {errorMessage && (
          <p className="text-xs font-medium text-red-500">
            {errorMessage}
          </p>
        )}


        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadBatchZip}
            disabled={isDownloadingZip || tables.length === 0}
            className="text-xs sm:text-sm font-semibold px-3.5 py-1.5"
          >
            {isDownloadingZip ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            {language === 'km' ? 'ទាញយក QR ZIP' : 'Download QR ZIP'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsZoneModalOpen(true)}
            className="text-xs sm:text-sm font-semibold px-3.5 py-1.5"
          >
            {language === 'km' ? '+ តំបន់' : '+ Area'}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setBatchErrors({})
              setIsBatchModalOpen(true)
            }}
            className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {language === 'km' ? 'បង្កើតជាក្រុម' : 'Batch Generate'}
          </Button>
        </div>
      </div>

      {/* Zone Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveZone('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
            activeZone === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeZone === z.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              {language === 'km' ? z.name_km : z.name_en} ({count})
            </button>
          )
        })}
      </div>

      {/* Tables Grid */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-xs">
            {language === 'km' ? 'កំពុងទាញយកទិន្នន័យតុ...' : 'Loading tables...'}
          </p>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-zinc-500">
            {language === 'km' ? 'មិនទាន់មានតុនៅក្នុងតំបន់នេះទេ' : 'No tables in this area yet'}
          </p>
        </div>
      ) : (

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTables.map((tbl) => {
            const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
              `${window.location.origin}/t/${tbl.qr_token}`
            )}`

            return (
              <div
                key={tbl.id}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-bold text-zinc-950 dark:text-zinc-50 font-mono">
                        {tbl.table_number}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">({tbl.zone_name})</span>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 uppercase">
                      {tbl.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Users className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{tbl.capacity} {language === 'km' ? 'កៅអី' : 'Seats'}</span>
                  </div>

                  <div className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center justify-center space-y-1">
                    <img
                      src={qrSvgUrl}
                      alt={`QR for ${tbl.table_number}`}
                      className="w-20 h-20 rounded bg-white p-1"
                    />
                    <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">
                      /t/{tbl.qr_token}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <a
                    href={`/t/${tbl.qr_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
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
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Add Dining Area */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមតំបន់ / បន្ទប់' : 'Add Dining Area'}
              </h2>
              <button
                type="button"
                onClick={() => setIsZoneModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateZone} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ឈ្មោះជាភាសាអង់គ្លេស' : 'Name (English)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Garden Terrace"
                  value={zoneForm.name_en}
                  onChange={(e) => setZoneForm({ ...zoneForm, name_en: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                />
                {zoneErrors.name_en && (
                  <p className="text-xs text-red-500 mt-1">{zoneErrors.name_en}</p>
                )}

              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ឈ្មោះជាភាសាខ្មែរ' : 'Name (Khmer)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. រានហាលសួនច្បារ"
                  value={zoneForm.name_km}
                  onChange={(e) => setZoneForm({ ...zoneForm, name_km: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsZoneModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : language === 'km' ? 'រក្សាទុក' : 'Save Area'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Batch Generate Tables */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បង្កើតតុជាក្រុម' : 'Batch Generate Tables'}
              </h2>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'តំបន់' : 'Dining Area / Zone'}
                </label>
                <select
                  value={batchZoneId}
                  onChange={(e) => setBatchZoneId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {language === 'km' ? z.name_km : z.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'បុព្វបទ' : 'Prefix'}
                  </label>
                  <input
                    type="text"
                    required
                    value={batchPrefix}
                    onChange={(e) => setBatchPrefix(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm font-mono focus:outline-none focus:border-emerald-600"
                  />
                  {batchErrors.batchPrefix && (
                    <p className="text-xs text-red-500 mt-1">{batchErrors.batchPrefix}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'ចំនួនតុ' : 'Count'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={batchCount}
                    onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'ចំនួនកៅអី' : 'Capacity'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={batchCapacity}
                    onChange={(e) => setBatchCapacity(parseInt(e.target.value) || 4)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {batchErrors.batchCount && (
                <p className="text-xs text-red-500">{batchErrors.batchCount}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBatchModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    language === 'km' ? 'បង្កើតតុ' : 'Generate Tables'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Single Table QR Stand Print View */}
      {isPrintModalOpen && selectedTableForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'បោះពុម្ព QR តុ' : 'Print Table QR Stand'}
              </h3>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white text-zinc-900 space-y-3">
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
                Scan to Order
              </p>
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    `${window.location.origin}/t/${selectedTableForPrint.qr_token}`
                  )}`}
                  alt="QR Code"
                  className="w-40 h-40"
                />
              </div>
              <div>
                <p className="text-2xl font-black font-mono tracking-tight">
                  {selectedTableForPrint.table_number}
                </p>
                <p className="text-xs text-zinc-500 font-medium">
                  {selectedTableForPrint.zone_name} • {selectedTableForPrint.capacity} Seats
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPrintModalOpen(false)}
              >
                {language === 'km' ? 'បិទ' : 'Close'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => window.print()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                {language === 'km' ? 'បោះពុម្ព' : 'Print'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
