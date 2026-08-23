import { type FC } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, QrCode, Download, ArrowRight, Store, Building2, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '../stores/useOnboardingStore'

export const Step4LaunchSummary: FC = () => {
  const { language } = useLanguageStore()
  const { businessProfile, branch, diningAreas, generatedTables } = useOnboardingStore()

  const totalTables = diningAreas.reduce((sum, a) => sum + Number(a.tables_count), 0)

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Ready Banner */}
      <div className="p-6 rounded-2xl border border-emerald-600/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-xl sm:text-2xl text-zinc-950 dark:text-zinc-50">
          {language === 'km' ? 'ហាងរបស់អ្នករួចរាល់សម្រាប់ការចាប់ផ្តើម!' : 'Your Restaurant Workspace is Ready!'}
        </h3>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 max-w-lg mx-auto leading-relaxed">
          {language === 'km'
            ? 'ព័ត៌មានអាជីវកម្ម សាខា និង QR កូដសម្រាប់តុនីមួយៗត្រូវបានរៀបចំរួចរាល់។'
            : 'Your business profile, first branch, and table QR tokens have been generated.'}
        </p>
      </div>

      {/* Summary 3-Col Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Business Info */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            <Store className="w-4 h-4 text-emerald-600" />
            <span>{language === 'km' ? 'អាជីវកម្ម' : 'Business'}</span>
          </div>
          <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {businessProfile.name_en}
          </h4>
          <div className="text-xs text-zinc-500 space-y-1">
            <p>{language === 'km' ? 'ឈ្មោះខ្មែរ' : 'Khmer Name'}: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{businessProfile.name_km || '—'}</span></p>
            <p>{language === 'km' ? 'ប្រភេទអាជីវកម្ម' : 'Business Type'}: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{businessProfile.business_type}</span></p>
          </div>
        </div>

        {/* 2. Branch & Bakong */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>{language === 'km' ? 'សាខាដំបូង' : 'First Outlet'}</span>
          </div>
          <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {branch.name_en}
          </h4>
          <div className="text-xs text-zinc-500 space-y-1">
            <p>{language === 'km' ? 'កូដ' : 'Code'}: <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{branch.branch_code}</span></p>
            <p>{language === 'km' ? 'ទូរស័ព្ទ' : 'Phone'}: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{branch.phone}</span></p>
            <p>{language === 'km' ? 'ទីតាំង' : 'Address'}: <span className="text-zinc-800 dark:text-zinc-200 truncate block">{branch.address || '—'}</span></p>
          </div>
        </div>

        {/* 3. Dining Tables */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            <LayoutGrid className="w-4 h-4 text-emerald-600" />
            <span>{language === 'km' ? 'ប្លង់តុ' : 'Tables & Areas'}</span>
          </div>
          <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {totalTables} {language === 'km' ? 'តុ' : 'Tables'} ({diningAreas.length} {language === 'km' ? 'តំបន់' : 'Zones'})
          </h4>
          <div className="text-xs text-zinc-500 space-y-1">
            {diningAreas.map((a, i) => (
              <p key={i}>
                • {a.name_en}: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{a.tables_count} tables</span> ({a.default_capacity} seats)
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Generated Table QR Preview Strip */}
      <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-600" />
            <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
              {language === 'km' ? 'QR កូដតុទាំងអស់ដែលបានបង្កើត' : 'Batch Table QR Codes Generated'}
            </h4>
          </div>
          <button
            type="button"
            onClick={() => alert(language === 'km' ? 'កំពុងរៀបចំកញ្ចប់ ZIP QR កូដសម្រាប់ទាញយក...' : 'Preparing high-resolution QR package for download...')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{language === 'km' ? 'ទាញយក QR Zip' : 'Download All QRs (ZIP)'}</span>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 pt-1">
          {generatedTables.slice(0, 10).map((tbl, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 shrink-0 text-center space-y-1.5 w-24"
            >
              <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-800 dark:text-zinc-200 font-mono font-bold text-xs">
                QR
              </div>
              <span className="font-mono font-bold text-xs block text-zinc-900 dark:text-zinc-100">
                {tbl.table_number}
              </span>
              <span className="text-[10px] text-zinc-400 block">{tbl.capacity} seats</span>
            </div>
          ))}
          {generatedTables.length > 10 && (
            <div className="p-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 shrink-0 flex items-center justify-center text-xs font-bold text-zinc-400 w-24">
              +{generatedTables.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* Launch Actions */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link to="/pos" className="w-full sm:w-auto">
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto min-w-[200px] h-12 text-base font-semibold justify-center"
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            {language === 'km' ? 'បើកផ្ទាំងគិតប្រាក់ POS' : 'Open Cashier POS'}
          </Button>
        </Link>

        <Link to="/t/demo-table-08" className="w-full sm:w-auto">
          <Button
            variant="primary"
            size="lg"
            className="w-full sm:w-auto min-w-[220px] h-12 text-base font-semibold justify-center"
          >
            {language === 'km' ? 'សាកល្បងកុម្ម៉ង់ QR លើតុ' : 'Test Live Table QR'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
