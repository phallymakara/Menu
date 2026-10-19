import { type FC } from 'react'
import { X, Shield, Building, Mail, Phone, Key, CheckCircle } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useStaffMemberDetail } from '../../hooks/useStaffQueries'
import { EmenuLoader } from '@/components/ui/EmenuLoader'
import { Button } from '@/components/ui/Button'

interface StaffMemberDetailModalProps {
  orgId: string | null
  memberId: string | null
  branchName?: string
  onClose: () => void
}

export const StaffMemberDetailModal: FC<StaffMemberDetailModalProps> = ({
  orgId,
  memberId,
  branchName,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'

  const { data: member, isLoading, error } = useStaffMemberDetail(orgId, memberId)

  if (!memberId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-none modal-dialog-animate z-10 my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
              {isKm ? 'ព័ត៌មានលម្អិតបុគ្គលិក' : 'Staff Member Profile'}
            </h2>
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

        {/* Modal Content */}
        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <EmenuLoader />
          </div>
        ) : error || !member ? (
          <div className="py-8 text-center space-y-2 text-rose-500 text-sm">
            <p>{isKm ? 'មិនអាចទាញយកទិន្នន័យបុគ្គលិកបានទេ' : 'Unable to load staff member details'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header / Avatar & Role */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
              <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg overflow-hidden shrink-0">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt={member.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  member.full_name?.charAt(0) || 'U'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50 truncate">
                    {member.full_name}
                  </h3>
                  {member.is_owner && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                      {isKm ? 'ម្ចាស់ហាង' : 'Owner'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {member.role}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    {member.status || 'Active'}
                  </span>
                </div>
              </div>
            </div>

            {/* Grid of metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-zinc-400 block uppercase">
                    {isKm ? 'អ៊ីមែល' : 'Email'}
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate block">
                    {member.email || (isKm ? 'គ្មាន' : 'None')}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-zinc-400 block uppercase">
                    {isKm ? 'ទូរស័ព្ទ' : 'Phone'}
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate block">
                    {member.phone || (isKm ? 'គ្មាន' : 'None')}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center gap-2.5">
                <Building className="w-4 h-4 text-zinc-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-zinc-400 block uppercase">
                    {isKm ? 'សាខាដែលបានចាត់តាំង' : 'Branch Assignment'}
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate block">
                    {branchName || (isKm ? 'គ្រប់សាខាទាំងអស់' : 'All Branches')}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center gap-2.5">
                <Key className="w-4 h-4 text-zinc-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-zinc-400 block uppercase">
                    {isKm ? 'កូដ POS PIN' : 'POS PIN'}
                  </span>
                  <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200 tracking-wider">
                    {member.pos_pin || '••••'}
                  </span>
                </div>
              </div>
            </div>

            {/* POS Operational Permissions */}
            <div className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block">
                {isKm ? 'សិទ្ធិប្រតិបត្តិការ POS' : 'POS Operational Permissions'}
              </span>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-center">
                  <span className="text-zinc-400 block text-[10px] mb-0.5">Void Item</span>
                  <span
                    className={`font-semibold ${
                      member.pos_permissions?.can_void_item ? 'text-emerald-600' : 'text-zinc-400'
                    }`}
                  >
                    {member.pos_permissions?.can_void_item ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-center">
                  <span className="text-zinc-400 block text-[10px] mb-0.5">Cancel Order</span>
                  <span
                    className={`font-semibold ${
                      member.pos_permissions?.can_cancel_order ? 'text-emerald-600' : 'text-zinc-400'
                    }`}
                  >
                    {member.pos_permissions?.can_cancel_order ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-center">
                  <span className="text-zinc-400 block text-[10px] mb-0.5">Override Price</span>
                  <span
                    className={`font-semibold ${
                      member.pos_permissions?.can_override_price ? 'text-emerald-600' : 'text-zinc-400'
                    }`}
                  >
                    {member.pos_permissions?.can_override_price ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* IDs & Timestamps */}
            <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-[11px] text-zinc-500 space-y-1">
              <div className="flex justify-between items-center">
                <span>Member ID:</span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300 select-all">
                  {member.id}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>User ID:</span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300 select-all">
                  {member.user_id}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
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
