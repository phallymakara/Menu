import { useState, useEffect, type FC } from 'react'
import {
  Plus,
  Printer,
  Trash2,
  Users,
  ExternalLink,
  X,
  Loader2,
  Download,
  Pencil,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import { useBusinesses, useBranches } from '../hooks/useTenantQueries'
import {
  useDiningAreas,
  useCreateDiningArea,
  useUpdateDiningArea,
  useDeleteDiningArea,
  useReorderDiningAreas,
  useTables,
  useBatchCreateTables,
  useCreateTable,
  useTableDetail,
  useUpdateTable,
  useDeleteTable,
  useDownloadTableQrZip,
  useTableQrCodes,
  useSingleTableQr,
  useRegenerateTableQr,
  type DiningAreaResponse,
} from '../hooks/useTableQueries'
import type { DiningZone, DiningTable } from '../types/admin.types'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import { isUuid } from '@/lib/utils'

export const DiningTablesTab: FC = () => {
  const { language } = useLanguageStore()
  const queryClient = useQueryClient()

  const [businessId, setBusinessId] = useState<string | null>(
    localStorage.getItem('emenu_business_id')
  )
  const [branchId, setBranchId] = useState<string | null>(() => {
    const saved = localStorage.getItem('emenu_branch_id')
    return saved && saved !== 'all' && isUuid(saved) ? saved : null
  })

  const [zones, setZones] = useState<DiningZone[]>([])
  const [tables, setTables] = useState<DiningTable[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)
  const [errorMessage] = useState<string | null>(null)

  const [activeZone, setActiveZone] = useState<string>('all')
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [selectedTableForPrint, setSelectedTableForPrint] = useState<DiningTable | null>(null)

  // Batch Form State
  const [batchCount, setBatchCount] = useState('')
  const [batchCapacity, setBatchCapacity] = useState('')
  const [batchZoneId, setBatchZoneId] = useState('')
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({})

  // Zone Form State
  const [zoneForm, setZoneForm] = useState({
    name_en: '',
    name_km: '',
    service_charge: '',
    minimum_spend: '',
  })
  const [zoneErrors, setZoneErrors] = useState<Record<string, string>>({})

  // Area Management Modals State
  const [isEditAreaModalOpen, setIsEditAreaModalOpen] = useState(false)
  const [editAreaId, setEditAreaId] = useState<string | null>(null)
  const [editAreaForm, setEditAreaForm] = useState({
    name_en: '',
    name_km: '',
    service_charge: '',
    minimum_spend: '',
    is_active: true,
  })
  const [editAreaErrors, setEditAreaErrors] = useState<Record<string, string>>({})
  const [isDeleteAreaModalOpen, setIsDeleteAreaModalOpen] = useState(false)
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false)
  const [reorderList, setReorderList] = useState<DiningAreaResponse[]>([])

  // Table QR Actions State
  const [isDownloadingSingleQr, setIsDownloadingSingleQr] = useState(false)
  const [isRegenModalOpen, setIsRegenModalOpen] = useState(false)
  const [tableForRegen, setTableForRegen] = useState<DiningTable | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Single Table Form State
  const [isSingleTableModalOpen, setIsSingleTableModalOpen] = useState(false)
  const [singleTableForm, setSingleTableForm] = useState({
    table_number: '',
    capacity: '4',
    dining_area_id: '',
  })
  const [singleTableErrors, setSingleTableErrors] = useState<Record<string, string>>({})

  // Edit Table Form State
  const [isEditTableModalOpen, setIsEditTableModalOpen] = useState(false)
  const [editTableForm, setEditTableForm] = useState({
    id: '',
    table_number: '',
    capacity: '4',
    dining_area_id: '',
    is_active: true,
  })
  const [editTableErrors, setEditTableErrors] = useState<Record<string, string>>({})
  const [inspectingTableId, setInspectingTableId] = useState<string | null>(null)

  // 1. TanStack Query: Tenant Resolution
  const { data: businesses = [] } = useBusinesses()

  useEffect(() => {
    if (!businessId && businesses.length > 0) {
      setBusinessId(businesses[0].id)
      localStorage.setItem('emenu_business_id', businesses[0].id)
    }
  }, [businesses, businessId])

  const { data: branches = [] } = useBranches(businessId)

  useEffect(() => {
    if (branches.length > 0) {
      const stored = localStorage.getItem('emenu_branch_id')
      const target = stored && stored !== 'all' && isUuid(stored) && branches.some((b) => b.id === stored)
        ? stored
        : branches[0].id
      if (!branchId || (branchId !== target && !branches.some((b) => b.id === branchId))) {
        setBranchId(target)
      }
    }
  }, [branches, branchId])

  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)

  useEffect(() => {
    const handleBranchChanged = (e: any) => {
      const newBranchId = e.detail?.branchId
      const target = (newBranchId && newBranchId !== 'all' && isUuid(newBranchId)) ? newBranchId : branches[0]?.id
      if (target) {
        setIsSwitchingBranch(true)
        setBranchId(target)
        setTables([])
        setZones([])
        queryClient.invalidateQueries({ queryKey: ['dining-areas'] })
        queryClient.invalidateQueries({ queryKey: ['tables'] })
      }
    }
    window.addEventListener('emenu:branch-changed', handleBranchChanged)
    return () => window.removeEventListener('emenu:branch-changed', handleBranchChanged)
  }, [branches, queryClient])

  // 2. TanStack Query: Fetch Dining Areas & Tables
  const { data: rawAreas = [], isLoading: isAreasLoading } = useDiningAreas(businessId, branchId)
  const { data: rawTables = [], isLoading: isTablesLoading } = useTables(businessId, branchId)
  const createAreaMutation = useCreateDiningArea(businessId, branchId)
  const updateAreaMutation = useUpdateDiningArea(businessId, branchId)
  const deleteAreaMutation = useDeleteDiningArea(businessId, branchId)
  const reorderAreaMutation = useReorderDiningAreas(businessId, branchId)
  const batchCreateMutation = useBatchCreateTables(businessId, branchId)
  const createTableMutation = useCreateTable(businessId, branchId)
  const updateTableMutation = useUpdateTable(businessId, branchId)
  const { data: tableDetail, isLoading: isLoadingTableDetail } = useTableDetail(
    businessId,
    branchId,
    inspectingTableId
  )
  const deleteTableMutation = useDeleteTable(businessId, branchId)
  const downloadQrZipMutation = useDownloadTableQrZip(businessId, branchId)
  const singleQrMutation = useSingleTableQr(businessId, branchId)
  const regenQrMutation = useRegenerateTableQr(businessId, branchId)
  const { data: qrCodes } = useTableQrCodes(businessId, branchId)

  const isLoading = isSwitchingBranch || ((isAreasLoading || isTablesLoading) && tables.length === 0)

  useEffect(() => {
    const mappedZones: DiningZone[] = rawAreas.map((z) => ({
      id: z.id,
      name_en: z.name_en,
      name_km: z.name_km || z.name_en,
      tables_count: (z as any).tables_count || 0,
    }))
    setZones(mappedZones)
    if (!batchZoneId && mappedZones.length > 0) {
      setBatchZoneId(mappedZones[0].id)
    }
    setIsSwitchingBranch(false)
  }, [rawAreas, batchZoneId])

  useEffect(() => {
    const mappedTables: DiningTable[] = rawTables.map((t) => ({
      id: t.id,
      table_number: t.table_number,
      zone_id: t.dining_area_id || '',
      zone_name: rawAreas.find((a) => a.id === t.dining_area_id)?.name_en || 'Main Area',
      capacity: t.max_capacity || 4,
      qr_token: t.qr_code_token || t.id,
      status: (t.status || 'AVAILABLE') as any,
    }))
    setTables(mappedTables)
    setIsSwitchingBranch(false)
  }, [rawTables, rawAreas])

  useEffect(() => {
    if (!isAreasLoading && !isTablesLoading) {
      setIsSwitchingBranch(false)
    }
  }, [isAreasLoading, isTablesLoading])

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
      if (isUuid(businessId) && isUuid(branchId)) {
        await deleteTableMutation.mutateAsync(tableId)
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
      setZoneErrors({ name_en: language === 'km' ? 'សូមបញ្ចូលឈ្មោះតំបន់' : 'Zone name is required' })
      return
    }

    setIsSubmitting(true)
    try {
      if (isUuid(businessId) && isUuid(branchId)) {
        await createAreaMutation.mutateAsync({
          name_en: zoneForm.name_en.trim(),
          name_km: zoneForm.name_km.trim() || zoneForm.name_en.trim(),
          display_order: rawAreas.length + 1,
          is_active: true,
          service_charge_percentage: zoneForm.service_charge ? Number(zoneForm.service_charge) : null,
          minimum_spend: zoneForm.minimum_spend ? Number(zoneForm.minimum_spend) : null,
        })
      }
      setZoneForm({ name_en: '', name_km: '', service_charge: '', minimum_spend: '' })
      setIsZoneModalOpen(false)
    } catch {
      alert(language === 'km' ? 'មិនអាចបង្កើតតំបន់បានទេ' : 'Failed to create dining area')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4b. Open Edit Zone Modal (Calls single area GET endpoint)
  const handleOpenEditArea = async (areaId: string) => {
    if (!businessId || !branchId || !isUuid(areaId)) return
    setIsSubmitting(true)
    try {
      const area = unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/areas/{area_id}', {
          params: { path: { business_id: businessId, branch_id: branchId, area_id: areaId } },
        })
      )
      setEditAreaId(areaId)
      setEditAreaForm({
        name_en: area.name_en,
        name_km: area.name_km || '',
        service_charge: area.service_charge_percentage != null ? String(area.service_charge_percentage) : '',
        minimum_spend: area.minimum_spend != null ? String(area.minimum_spend) : '',
        is_active: area.is_active ?? true,
      })
      setEditAreaErrors({})
      setIsEditAreaModalOpen(true)
    } catch {
      alert(language === 'km' ? 'មិនអាចទាញយកព័ត៌មានតំបន់បានទេ' : 'Failed to load dining area details')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4c. Save Edit Zone Form (Calls PATCH endpoint)
  const handleSaveEditArea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editAreaId || !isUuid(businessId) || !isUuid(branchId)) return
    if (!editAreaForm.name_en.trim()) {
      setEditAreaErrors({ name_en: language === 'km' ? 'សូមបញ្ចូលឈ្មោះតំបន់' : 'Zone name is required' })
      return
    }

    setIsSubmitting(true)
    try {
      await updateAreaMutation.mutateAsync({
        areaId: editAreaId,
        payload: {
          name_en: editAreaForm.name_en.trim(),
          name_km: editAreaForm.name_km.trim() || editAreaForm.name_en.trim(),
          service_charge_percentage: editAreaForm.service_charge ? Number(editAreaForm.service_charge) : null,
          minimum_spend: editAreaForm.minimum_spend ? Number(editAreaForm.minimum_spend) : null,
          is_active: editAreaForm.is_active,
        },
      })
      setIsEditAreaModalOpen(false)
    } catch {
      alert(language === 'km' ? 'មិនអាចកែប្រែតំបន់បានទេ' : 'Failed to update dining area')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4d. Delete Zone (Calls DELETE endpoint)
  const handleDeleteArea = async () => {
    if (!activeZone || activeZone === 'all' || !isUuid(businessId) || !isUuid(branchId)) return
    setIsSubmitting(true)
    try {
      await deleteAreaMutation.mutateAsync(activeZone)
      setActiveZone('all')
      setIsDeleteAreaModalOpen(false)
    } catch {
      alert(language === 'km' ? 'មិនអាចលុបតំបន់បានទេ' : 'Failed to delete dining area')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4e. Reorder Zones (Calls PUT /reorder endpoint)
  const handleOpenReorderModal = () => {
    setReorderList([...rawAreas])
    setIsReorderModalOpen(true)
  }

  const handleMoveArea = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= reorderList.length) return
    const updated = [...reorderList]
    const [moved] = updated.splice(index, 1)
    updated.splice(targetIndex, 0, moved)
    setReorderList(updated)
  }

  const handleSaveReorder = async () => {
    if (!isUuid(businessId) || !isUuid(branchId)) return
    setIsSubmitting(true)
    try {
      await reorderAreaMutation.mutateAsync({
        area_ids: reorderList.map((a) => a.id),
      })
      setIsReorderModalOpen(false)
    } catch {
      alert(language === 'km' ? 'មិនអាចតម្រៀបតំបន់បានទេ' : 'Failed to reorder dining areas')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 5. Batch Generate Tables in Tenant DB
  const validateBatchForm = () => {
    const errs: Record<string, string> = {}
    const countNum = parseInt(batchCount, 10)
    if (!batchCount.trim() || isNaN(countNum) || countNum < 1 || countNum > 50) {
      errs.batchCount = language === 'km' ? 'សូមបញ្ចូលចំនួនតុ (១ - ៥០)' : 'Please enter table count (1 - 50)'
    }
    const capNum = parseInt(batchCapacity, 10)
    if (!batchCapacity.trim() || isNaN(capNum) || capNum < 1 || capNum > 50) {
      errs.batchCapacity = language === 'km' ? 'សូមបញ្ចូលចំនួនកៅអី (១ - ៥០)' : 'Please enter capacity (1 - 50)'
    }
    setBatchErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBatchForm()) return

    const countNum = parseInt(batchCount, 10)
    const capNum = parseInt(batchCapacity, 10)

    setIsSubmitting(true)
    try {
      if (isUuid(businessId) && isUuid(branchId)) {
        const start = tables.length + 1
        await batchCreateMutation.mutateAsync({
          prefix: 'T-',
          start_number: start,
          end_number: start + countNum - 1,
          min_capacity: 1,
          max_capacity: capNum,
          shape: 'rectangle',
          digits: 2,
          dining_area_id: isUuid(batchZoneId) ? batchZoneId : null,
        })
      }
      setBatchErrors({})
      setBatchCount('')
      setBatchCapacity('')
      setIsBatchModalOpen(false)
    } catch {
      alert('Failed to generate batch tables')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 5b. Single Table Creation
  const handleOpenSingleTableModal = () => {
    setSingleTableForm({
      table_number: '',
      capacity: '4',
      dining_area_id: activeZone !== 'all' ? activeZone : (zones[0]?.id || ''),
    })
    setSingleTableErrors({})
    setIsSingleTableModalOpen(true)
  }

  const handleCreateSingleTable = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!singleTableForm.table_number.trim()) {
      errs.table_number = language === 'km' ? 'សូមបញ្ចូលលេខតុ' : 'Please enter table number'
    }
    const capNum = parseInt(singleTableForm.capacity, 10)
    if (isNaN(capNum) || capNum < 1 || capNum > 100) {
      errs.capacity = language === 'km' ? 'ចំនួនកៅអីមិនត្រឹមត្រូវ (១ - ១០០)' : 'Invalid capacity (1 - 100)'
    }
    if (Object.keys(errs).length > 0) {
      setSingleTableErrors(errs)
      return
    }

    setIsSubmitting(true)
    try {
      if (isUuid(businessId) && isUuid(branchId)) {
        await createTableMutation.mutateAsync({
          table_number: singleTableForm.table_number.trim(),
          max_capacity: capNum,
          min_capacity: 1,
          dining_area_id: isUuid(singleTableForm.dining_area_id) ? singleTableForm.dining_area_id : null,
        })
      }
      setIsSingleTableModalOpen(false)
      setSingleTableForm({ table_number: '', capacity: '4', dining_area_id: '' })
      setSingleTableErrors({})
    } catch {
      alert(language === 'km' ? 'មិនអាចបង្កើតតុបានទេ' : 'Failed to create table')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 5c. Edit Table & Inspect Details
  const handleOpenEditTable = (table: DiningTable) => {
    setInspectingTableId(table.id)
    const raw = rawTables.find((t) => t.id === table.id)
    setEditTableForm({
      id: table.id,
      table_number: table.table_number,
      capacity: String(table.capacity),
      dining_area_id: table.zone_id && isUuid(table.zone_id) ? table.zone_id : '',
      is_active: raw?.is_active ?? true,
    })
    setEditTableErrors({})
    setIsEditTableModalOpen(true)
  }

  const handleUpdateTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!editTableForm.table_number.trim()) {
      errs.table_number = language === 'km' ? 'សូមបញ្ចូលលេខតុ' : 'Please enter table number'
    }
    const capNum = parseInt(editTableForm.capacity, 10)
    if (isNaN(capNum) || capNum < 1 || capNum > 100) {
      errs.capacity = language === 'km' ? 'ចំនួនកៅអីមិនត្រឹមត្រូវ (១ - ១០០)' : 'Invalid capacity (1 - 100)'
    }
    if (Object.keys(errs).length > 0) {
      setEditTableErrors(errs)
      return
    }

    setIsSubmitting(true)
    try {
      if (isUuid(businessId) && isUuid(branchId)) {
        await updateTableMutation.mutateAsync({
          tableId: editTableForm.id,
          payload: {
            table_number: editTableForm.table_number.trim(),
            max_capacity: capNum,
            dining_area_id: isUuid(editTableForm.dining_area_id) ? editTableForm.dining_area_id : null,
            is_active: editTableForm.is_active,
          },
        })
      }
      setIsEditTableModalOpen(false)
      setInspectingTableId(null)
    } catch {
      alert(language === 'km' ? 'មិនអាចកែប្រែតុបានទេ' : 'Failed to update table')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 6. Download Table QR Batch ZIP Archive
  const handleDownloadBatchZip = async () => {
    setIsDownloadingZip(true)
    try {
      if (isUuid(businessId) && isUuid(branchId)) {
        const blob = await downloadQrZipMutation.mutateAsync()
        const downloadUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        const branchCode = branchId ? branchId.slice(0, 8) : 'export'
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

  // 7. Download Single Table QR Image (PNG/SVG) (GET /{table_id}/qr)
  const handleDownloadSingleQr = async (table: DiningTable, format: 'png' | 'svg' = 'png') => {
    if (!businessId || !branchId || !isUuid(table.id)) return
    setIsDownloadingSingleQr(true)
    try {
      const blob = await singleQrMutation.mutateAsync({
        tableId: table.id,
        format,
        download: true,
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cleanNumber = table.table_number.replace(/[^a-zA-Z0-9_-]/g, '_')
      a.download = `table_${cleanNumber}_qr.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      alert(language === 'km' ? 'មិនអាចទាញយករូប QR បានទេ' : 'Failed to download table QR image')
    } finally {
      setIsDownloadingSingleQr(false)
    }
  }

  // 8. Regenerate / Rotate Single Table QR Code (POST /{table_id}/regenerate-qr)
  const handleConfirmRegenerateQr = async () => {
    if (!tableForRegen || !businessId || !branchId || !isUuid(tableForRegen.id)) return
    setIsRegenerating(true)
    try {
      const updatedQr = await regenQrMutation.mutateAsync(tableForRegen.id)
      if (selectedTableForPrint?.id === tableForRegen.id) {
        setSelectedTableForPrint({
          ...selectedTableForPrint,
          qr_token: updatedQr.qr_token,
        })
      }
      setIsRegenModalOpen(false)
      setTableForRegen(null)
    } catch {
      alert(language === 'km' ? 'មិនអាចបង្កើតកូដសម្ងាត់ QR ថ្មីបានទេ' : 'Failed to regenerate table QR token')
    } finally {
      setIsRegenerating(false)
    }
  }

  const filteredTables = tables.filter((t) => activeZone === 'all' || t.zone_id === activeZone)

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <div className="flex items-center justify-start gap-2 flex-wrap">
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

        {rawAreas.length > 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenReorderModal}
            className="text-xs sm:text-sm font-semibold px-3.5 py-1.5"
          >
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
            {language === 'km' ? 'រៀបលំដាប់តំបន់' : 'Reorder Areas'}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenSingleTableModal}
          className="text-xs sm:text-sm font-semibold px-3.5 py-1.5"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {language === 'km' ? '+ តុ' : '+ Add Table'}
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

      {errorMessage && (
        <p className="text-xs font-medium text-red-500">
          {errorMessage}
        </p>
      )}

      {/* Zone Filter Tabs & Actions */}
      <div className="space-y-3">
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

        {/* Selected Zone Control Bar */}
        {activeZone !== 'all' && (() => {
          const currentArea = rawAreas.find((a) => a.id === activeZone)
          if (!currentArea) return null
          return (
            <div className="flex items-center justify-between gap-3 p-3 sm:px-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-xs">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                  {language === 'km' ? currentArea.name_km || currentArea.name_en : currentArea.name_en}
                </span>
                {currentArea.service_charge_percentage != null && Number(currentArea.service_charge_percentage) > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-medium">
                    +{Number(currentArea.service_charge_percentage)}% {language === 'km' ? 'សេវាបន្ថែម' : 'Service Charge'}
                  </span>
                )}
                {currentArea.minimum_spend != null && Number(currentArea.minimum_spend) > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 font-medium">
                    {language === 'km' ? 'ចំណាយអប្បបរមា' : 'Min Spend'}: ${Number(currentArea.minimum_spend).toFixed(2)}
                  </span>
                )}
                {!currentArea.is_active && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                    {language === 'km' ? 'ផ្អាកដំណើរការ' : 'Inactive'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEditArea(activeZone)}
                  className="h-8 text-xs px-3 rounded-full"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  {language === 'km' ? 'កែប្រែ' : 'Edit Zone'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeleteAreaModalOpen(true)}
                  className="h-8 text-xs px-3 rounded-full text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400 dark:hover:border-red-800"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {language === 'km' ? 'លុប' : 'Delete'}
                </Button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Tables Grid */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center">
          <EmenuLoader
            size="md"
            message={language === 'km' ? 'កំពុងទាញយកទិន្នន័យតុ...' : 'Loading tables...'}
          />
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
            const qr = qrCodes?.get(tbl.id)

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
                    {qr ? (
                      <img
                        src={qr.qr_base64}
                        alt={`QR for ${tbl.table_number}`}
                        className="w-20 h-20 rounded bg-white p-1"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                    )}
                    <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">
                      {qr ? new URL(qr.ordering_url).pathname : '...'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <a
                    href={qr?.ordering_url}
                    aria-disabled={!qr}
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
                      onClick={() => handleOpenEditTable(tbl)}
                      title={language === 'km' ? 'កែប្រែតុ និងពិនិត្យលម្អិត' : 'Edit Table & Details'}
                      className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-400 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTableForPrint(tbl)
                        setIsPrintModalOpen(true)
                      }}
                      title={language === 'km' ? 'បោះពុម្ព QR តុ' : 'Print QR Stand'}
                      className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTableForRegen(tbl)
                        setIsRegenModalOpen(true)
                      }}
                      title={language === 'km' ? 'បង្កើតកូដសម្ងាត់ QR ថ្មី' : 'Regenerate QR Token'}
                      className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-amber-600 dark:hover:bg-zinc-800 dark:hover:text-amber-400 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteTable(tbl.id)}
                      title={language === 'km' ? 'លុបតុ' : 'Delete Table'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsZoneModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមតំបន់ / បន្ទប់' : 'Add Dining Area'}
              </h2>
              <button
                type="button"
                onClick={() => setIsZoneModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateZone} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ឈ្មោះជាភាសាអង់គ្លេស' : 'Name (English)'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះជាភាសាអង់គ្លេស' : 'Enter name in English'}
                  value={zoneForm.name_en}
                  onChange={(e) => {
                    setZoneForm({ ...zoneForm, name_en: e.target.value })
                    if (zoneErrors.name_en) {
                      setZoneErrors((prev) => ({ ...prev, name_en: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    zoneErrors.name_en ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600`}
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
                  placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះជាភាសាខ្មែរ' : 'Enter name in Khmer'}
                  value={zoneForm.name_km}
                  onChange={(e) => setZoneForm({ ...zoneForm, name_km: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'សេវាបន្ថែម (%)' : 'Service Charge (%)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={zoneForm.service_charge}
                    onChange={(e) => setZoneForm({ ...zoneForm, service_charge: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'ចំណាយអប្បបរមា ($)' : 'Min Spend ($)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={zoneForm.minimum_spend}
                    onChange={(e) => setZoneForm({ ...zoneForm, minimum_spend: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
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

      {/* Modal: Edit Dining Area (PATCH /{area_id}) */}
      {isEditAreaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsEditAreaModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'កែប្រែតំបន់ / បន្ទប់' : 'Edit Dining Area'}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditAreaModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditArea} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ឈ្មោះជាភាសាអង់គ្លេស' : 'Name (English)'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះជាភាសាអង់គ្លេស' : 'Enter name in English'}
                  value={editAreaForm.name_en}
                  onChange={(e) => {
                    setEditAreaForm({ ...editAreaForm, name_en: e.target.value })
                    if (editAreaErrors.name_en) {
                      setEditAreaErrors((prev) => ({ ...prev, name_en: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    editAreaErrors.name_en ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600`}
                />
                {editAreaErrors.name_en && (
                  <p className="text-xs text-red-500 mt-1">{editAreaErrors.name_en}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ឈ្មោះជាភាសាខ្មែរ' : 'Name (Khmer)'}
                </label>
                <input
                  type="text"
                  placeholder={language === 'km' ? 'បញ្ចូលឈ្មោះជាភាសាខ្មែរ' : 'Enter name in Khmer'}
                  value={editAreaForm.name_km}
                  onChange={(e) => setEditAreaForm({ ...editAreaForm, name_km: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'សេវាបន្ថែម (%)' : 'Service Charge (%)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={editAreaForm.service_charge}
                    onChange={(e) => setEditAreaForm({ ...editAreaForm, service_charge: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'ចំណាយអប្បបរមា ($)' : 'Min Spend ($)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editAreaForm.minimum_spend}
                    onChange={(e) => setEditAreaForm({ ...editAreaForm, minimum_spend: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAreaForm.is_active}
                    onChange={(e) => setEditAreaForm({ ...editAreaForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 dark:border-zinc-700"
                  />
                  <span>{language === 'km' ? 'ដំណើរការ (Active)' : 'Active / Visible'}</span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditAreaModalOpen(false)}
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
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : language === 'km' ? 'រក្សាទុក' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Dining Area Confirmation (DELETE /{area_id}) */}
      {isDeleteAreaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsDeleteAreaModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>{language === 'km' ? 'លុបតំបន់' : 'Delete Dining Area'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsDeleteAreaModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {language === 'km'
                ? 'តើអ្នកប្រាកដជាចង់លុបតំបន់នេះទេ? តុទាំងអស់ដែលស្ថិតក្នុងតំបន់នេះនឹងប្តូរមកជាតុទូទៅ (Unassigned)។'
                : 'Are you sure you want to delete this dining area? Any tables assigned to this zone will become unassigned general tables.'}
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteAreaModalOpen(false)}
              >
                {language === 'km' ? 'បោះបង់' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={handleDeleteArea}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : language === 'km' ? 'លុបតំបន់' : 'Delete Area'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reorder Dining Areas (PUT /reorder) */}
      {isReorderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsReorderModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-emerald-600" />
                  <span>{language === 'km' ? 'រៀបលំដាប់តំបន់' : 'Reorder Dining Areas'}</span>
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {language === 'km'
                    ? 'ចុចព្រួញឡើងលើ/ចុះក្រោមដើម្បីតម្រៀបលំដាប់តំបន់តុ'
                    : 'Use the up/down arrows to adjust the display order'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReorderModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {reorderList.map((area, idx) => (
                <div
                  key={area.id}
                  className="flex items-center justify-between p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {language === 'km' ? area.name_km || area.name_en : area.name_en}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {area.name_en}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveArea(idx, 'up')}
                      aria-label="Move Up"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === reorderList.length - 1}
                      onClick={() => handleMoveArea(idx, 'down')}
                      aria-label="Move Down"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReorderModalOpen(false)}
              >
                {language === 'km' ? 'បោះបង់' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={handleSaveReorder}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : language === 'km' ? 'រក្សាទុកលំដាប់' : 'Save Order'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Generate Tables */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsBatchModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បង្កើតតុជាក្រុម' : 'Batch Generate Tables'}
              </h2>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
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
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-emerald-600 transition-all"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {language === 'km' ? z.name_km : z.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'ចំនួនតុ' : 'Count'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder={language === 'km' ? 'បញ្ចូលចំនួនតុ' : 'Enter count'}
                    value={batchCount}
                    onKeyDown={(e) => {
                      if (
                        !/[0-9]/.test(e.key) &&
                        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
                      ) {
                        e.preventDefault()
                      }
                    }}
                    onChange={(e) => {
                      const numericVal = e.target.value.replace(/[^0-9]/g, '')
                      setBatchCount(numericVal)
                      if (batchErrors.batchCount) {
                        setBatchErrors((prev) => ({ ...prev, batchCount: '' }))
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border ${
                      batchErrors.batchCount ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                    } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                  />
                  {batchErrors.batchCount && (
                    <p className="text-xs text-red-500 mt-1">{batchErrors.batchCount}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    {language === 'km' ? 'ចំនួនកៅអី' : 'Capacity'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder={language === 'km' ? 'បញ្ចូលចំនួនកៅអី' : 'Enter capacity'}
                    value={batchCapacity}
                    onKeyDown={(e) => {
                      if (
                        !/[0-9]/.test(e.key) &&
                        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
                      ) {
                        e.preventDefault()
                      }
                    }}
                    onChange={(e) => {
                      const numericVal = e.target.value.replace(/[^0-9]/g, '')
                      setBatchCapacity(numericVal)
                      if (batchErrors.batchCapacity) {
                        setBatchErrors((prev) => ({ ...prev, batchCapacity: '' }))
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-full border ${
                      batchErrors.batchCapacity ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                    } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                  />
                  {batchErrors.batchCapacity && (
                    <p className="text-xs text-red-500 mt-1">{batchErrors.batchCapacity}</p>
                  )}
                </div>
              </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsPrintModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                {language === 'km' ? 'បោះពុម្ព QR តុ' : 'Print Table QR Stand'}
              </h3>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
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
                  src={qrCodes?.get(selectedTableForPrint.id)?.qr_base64}
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
                {selectedTableForPrint.qr_token && (
                  <p className="text-[10px] font-mono text-zinc-400 mt-1 truncate">
                    Token: ...{selectedTableForPrint.qr_token.slice(-8)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isDownloadingSingleQr}
                  onClick={() => handleDownloadSingleQr(selectedTableForPrint, 'png')}
                  className="text-xs h-8 px-2.5"
                  title="Download PNG image"
                >
                  {isDownloadingSingleQr ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1" />
                  )}
                  PNG
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTableForRegen(selectedTableForPrint)
                    setIsRegenModalOpen(true)
                  }}
                  className="text-xs h-8 px-2.5 text-amber-600 hover:text-amber-700 hover:border-amber-300 dark:text-amber-400 dark:hover:border-amber-800"
                  title={language === 'km' ? 'បង្កើតកូដសម្ងាត់ថ្មី' : 'Regenerate token'}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  {language === 'km' ? 'កូដថ្មី' : 'Regen'}
                </Button>
              </div>

              <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* Modal: Regenerate Table QR Confirmation (POST /{table_id}/regenerate-qr) */}
      {isRegenModalOpen && tableForRegen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsRegenModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                <span>{language === 'km' ? 'បង្កើត QR សម្ងាត់ថ្មី' : 'Regenerate Table QR'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsRegenModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed text-left">
              <p>
                {language === 'km'
                  ? `តើអ្នកប្រាកដជាចង់បង្កើតកូដសម្ងាត់ QR ថ្មីសម្រាប់តុ ${tableForRegen.table_number} ទេ?`
                  : `Are you sure you want to regenerate the QR security token for Table ${tableForRegen.table_number}?`}
              </p>
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs">
                ⚠️ {language === 'km'
                  ? 'ស្ទីគ័រ QR ចាស់ដែលបិទលើតុកំពុងប្រើប្រាស់ នឹងឈប់ដំណើរការភ្លាមៗ។ អ្នកនឹងត្រូវបោះពុម្ពស្ទីគ័រ QR ថ្មីនេះដើម្បីបិទលើតុជំនួស។'
                  : 'The existing printed QR sticker on this table will stop working immediately. You will need to print and place the newly generated QR code.'}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRegenModalOpen(false)}
              >
                {language === 'km' ? 'បោះបង់' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isRegenerating}
                onClick={handleConfirmRegenerateQr}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : language === 'km' ? 'បង្កើតកូដថ្មី' : 'Regenerate Now'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Single Table */}
      {isSingleTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setIsSingleTableModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>{language === 'km' ? 'បន្ថែមតុថ្មី' : 'Add Single Table'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsSingleTableModalOpen(false)}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSingleTable} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'លេខតុ' : 'Table Number'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={language === 'km' ? 'ឧ. T-01, VIP-1' : 'e.g. T-01, VIP-1'}
                  value={singleTableForm.table_number}
                  onChange={(e) => {
                    setSingleTableForm({ ...singleTableForm, table_number: e.target.value })
                    if (singleTableErrors.table_number) {
                      setSingleTableErrors((prev) => ({ ...prev, table_number: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    singleTableErrors.table_number ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                />
                {singleTableErrors.table_number && (
                  <p className="text-xs text-red-500 mt-1">{singleTableErrors.table_number}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ចំនួនកៅអី' : 'Seating Capacity'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={singleTableForm.capacity}
                  onChange={(e) => {
                    setSingleTableForm({ ...singleTableForm, capacity: e.target.value })
                    if (singleTableErrors.capacity) {
                      setSingleTableErrors((prev) => ({ ...prev, capacity: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    singleTableErrors.capacity ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                />
                {singleTableErrors.capacity && (
                  <p className="text-xs text-red-500 mt-1">{singleTableErrors.capacity}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'តំបន់' : 'Dining Area / Zone'}
                </label>
                <select
                  value={singleTableForm.dining_area_id}
                  onChange={(e) => setSingleTableForm({ ...singleTableForm, dining_area_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-emerald-600 transition-all"
                >
                  <option value="">{language === 'km' ? 'គ្មានតំបន់ (ចម្បង)' : 'No Area (General)'}</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {language === 'km' ? z.name_km : z.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSingleTableModalOpen(false)}
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
                    language === 'km' ? 'បង្កើតតុ' : 'Create Table'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Table & Inspect Details */}
      {isEditTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => {
              setIsEditTableModalOpen(false)
              setInspectingTableId(null)
            }}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 sm:p-7 space-y-4 shadow-2xl modal-dialog-animate z-10 my-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-emerald-600" />
                <span>{language === 'km' ? 'កែប្រែតុ' : 'Edit Table & Details'}</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsEditTableModalOpen(false)
                  setInspectingTableId(null)
                }}
                aria-label="Close"
                className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live table detail inspector summary */}
            {isLoadingTableDetail ? (
              <div className="py-2 flex items-center justify-center gap-2 text-xs text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{language === 'km' ? 'កំពុងពិនិត្យទិន្នន័យ...' : 'Loading details...'}</span>
              </div>
            ) : tableDetail ? (
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{language === 'km' ? 'ស្ថានភាព' : 'Status'}:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                    {tableDetail.status || 'AVAILABLE'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{language === 'km' ? 'រូបរាង' : 'Shape'}:</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                    {tableDetail.shape || 'Square'}
                  </span>
                </div>
                {tableDetail.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">{language === 'km' ? 'ឈ្មោះ' : 'Name'}:</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {tableDetail.name}
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            <form onSubmit={handleUpdateTableSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'លេខតុ' : 'Table Number'} *
                </label>
                <input
                  type="text"
                  required
                  value={editTableForm.table_number}
                  onChange={(e) => {
                    setEditTableForm({ ...editTableForm, table_number: e.target.value })
                    if (editTableErrors.table_number) {
                      setEditTableErrors((prev) => ({ ...prev, table_number: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    editTableErrors.table_number ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                />
                {editTableErrors.table_number && (
                  <p className="text-xs text-red-500 mt-1">{editTableErrors.table_number}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'ចំនួនកៅអី' : 'Seating Capacity'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={editTableForm.capacity}
                  onChange={(e) => {
                    setEditTableForm({ ...editTableForm, capacity: e.target.value })
                    if (editTableErrors.capacity) {
                      setEditTableErrors((prev) => ({ ...prev, capacity: '' }))
                    }
                  }}
                  className={`w-full px-4 py-2.5 rounded-full border ${
                    editTableErrors.capacity ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'
                  } bg-transparent text-sm focus:outline-none focus:border-emerald-600 transition-all`}
                />
                {editTableErrors.capacity && (
                  <p className="text-xs text-red-500 mt-1">{editTableErrors.capacity}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  {language === 'km' ? 'តំបន់' : 'Dining Area / Zone'}
                </label>
                <select
                  value={editTableForm.dining_area_id}
                  onChange={(e) => setEditTableForm({ ...editTableForm, dining_area_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-emerald-600 transition-all"
                >
                  <option value="">{language === 'km' ? 'គ្មានតំបន់ (ចម្បង)' : 'No Area (General)'}</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {language === 'km' ? z.name_km : z.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="table_is_active"
                  checked={editTableForm.is_active}
                  onChange={(e) => setEditTableForm({ ...editTableForm, is_active: e.target.checked })}
                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="table_is_active" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'បើកដំណើរការតុនេះ' : 'Active (Available for seating)'}
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditTableModalOpen(false)
                    setInspectingTableId(null)
                  }}
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
                    language === 'km' ? 'រក្សាទុក' : 'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
