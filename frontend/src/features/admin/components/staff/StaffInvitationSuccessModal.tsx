import { useState, type FC } from 'react'
import { X, Check, Copy, Link2, Sparkles, Clock } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { InviteResponse } from '../../hooks/useStaffQueries'

interface StaffInvitationSuccessModalProps {
  invite: InviteResponse | null
  roleLabel?: string
  branchName?: string
  onClose: () => void
}

export const StaffInvitationSuccessModal: FC<StaffInvitationSuccessModalProps> = ({
  invite,
  roleLabel,
  branchName,
  onClose,
}) => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const [copied, setCopied] = useState(false)

  if (!invite) return null

  const inviteUrl = `${window.location.origin}/invite/${invite.invitation_token}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-none modal-dialog-animate z-10 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
              {isKm ? 'តំណអញ្ជើញត្រូវបានបង្កើត' : 'Invitation Link Ready'}
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

        {/* Content */}
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {isKm
              ? 'សូមចម្លងតំណអញ្ជើញនេះ ហើយផ្ញើទៅកាន់បុគ្គលិករបស់អ្នក។ ពួកគេអាចចុចលើតំណដើម្បីកំណត់ពាក្យសម្ងាត់ និងចូលរួមដំណើរការ។'
              : 'Share this secure invitation link with your staff member. They will set their password and join your restaurant team.'}
          </p>

          {/* Copyable URL Box */}
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              <Link2 className="w-4 h-4 text-emerald-600" />
              <span>{isKm ? 'តំណអញ្ជើញបុគ្គលិក' : 'Invitation Link'}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 select-all focus:outline-none"
              />
              <Button
                type="button"
                variant={copied ? 'primary' : 'outline'}
                size="sm"
                onClick={handleCopy}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>{isKm ? 'បានចម្លង' : 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isKm ? 'ចម្លង' : 'Copy'}</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Metadata Badges */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
              <span className="text-zinc-400 block text-[10px] uppercase">
                {isKm ? 'តួនាទី' : 'Assigned Role'}
              </span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase">
                {roleLabel || invite.role}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
              <span className="text-zinc-400 block text-[10px] uppercase">
                {isKm ? 'សាខា' : 'Branch'}
              </span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                {branchName || (isKm ? 'គ្រប់សាខា' : 'All Branches')}
              </span>
            </div>
          </div>

          {invite.expires_at && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {isKm ? 'ផុតកំណត់នៅថ្ងៃទី៖ ' : 'Expires: '}
                {new Date(invite.expires_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onClose}
            className="rounded-full px-6 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isKm ? 'រួចរាល់' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  )
}
