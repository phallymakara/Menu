import { useState, useEffect, type FC } from 'react'
import {
  Clock,
  Check,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Flame,
  ArrowRightLeft,
  MessageSquareQuote,
  Utensils,
  XCircle,
  ShoppingBag,
  X,
} from 'lucide-react'

import { Modal } from '@/components/ui/Modal'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { KDSTicket, KDSTicketItem, OrderItemStatus } from '../types/kds.types'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'


export interface KDSTicketCardProps {
  ticket: KDSTicket
  index?: number
  onBumpItem: (orderItemId: string, targetStatus: OrderItemStatus) => Promise<void>
  onBumpTicket: (orderId: string) => Promise<void>
  onUndoItem?: (orderItemId: string) => Promise<void>
  onFireCourse?: (orderId: string) => Promise<void>
  onRerouteItem?: (orderItemId: string, targetStationId: string) => Promise<void>
  onAcceptOrder?: (orderId: string) => Promise<void>
  onRejectOrder?: (orderId: string, reason?: string) => Promise<void>
  stations?: { id: string; name: string }[]
}

export const KDSTicketCard: FC<KDSTicketCardProps> = ({
  ticket,
  index = 0,
  onBumpItem,
  onBumpTicket,
  onUndoItem,
  onFireCourse,
  onRerouteItem,
  onAcceptOrder,
  onRejectOrder,
  stations = [],
}) => {
  const { language } = useLanguageStore()

  // Live timer tick
  const [elapsedSecs, setElapsedSecs] = useState<number>(() => {
    const createdTime = new Date(ticket.created_at).getTime()
    return Math.max(0, Math.floor((Date.now() - createdTime) / 1000))
  })
  const [bumpingItemId, setBumpingItemId] = useState<string | null>(null)
  const [isBumpingTicket, setIsBumpingTicket] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [selectedReason, setSelectedReason] = useState<string>('Out of ingredients')
  const [customReason, setCustomReason] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<'pending' | 'accepted' | 'rejected' | null>(null)

  const isGuestOrder =
    ticket.order_source === 'guest_qr' ||
    Boolean(ticket.order_source && ticket.order_source.toLowerCase().includes('guest'))

  const isPendingOrder =
    ticket.order_status?.toLowerCase() === 'pending' ||
    (ticket.items.length > 0 &&
      ticket.items.every((i) => {
        const st = i.status?.toLowerCase()
        return st === 'pending' || st === 'held' || st === 'queued'
      }))

  const effectiveStatus: 'pending' | 'accepted' | 'rejected' = (() => {
    if (localStatus) return localStatus

    const orderSt = (ticket.order_status || '').toLowerCase()
    if (orderSt === 'cancelled' || orderSt === 'rejected') return 'rejected'
    if (
      orderSt === 'preparing' ||
      orderSt === 'cooking' ||
      orderSt === 'confirmed' ||
      orderSt === 'ready_to_serve' ||
      orderSt === 'served' ||
      orderSt === 'accepted'
    ) {
      return 'accepted'
    }

    if (ticket.items && ticket.items.length > 0) {
      const allVoided = ticket.items.every((i) => i.status?.toLowerCase() === 'voided')
      if (allVoided) return 'rejected'

      const anyActive = ticket.items.some((i) => {
        const st = (i.status || '').toLowerCase()
        return (
          st === 'cooking' ||
          st === 'preparing' ||
          st === 'ready_to_serve' ||
          st === 'ready' ||
          st === 'served'
        )
      })
      if (anyActive) return 'accepted'
    }

    if (isPendingOrder) return 'pending'
    return 'accepted'
  })()

  useEffect(() => {
    const timer = setInterval(() => {
      const createdTime = new Date(ticket.created_at).getTime()
      setElapsedSecs(Math.max(0, Math.floor((Date.now() - createdTime) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [ticket.created_at])

  useEffect(() => {
    if (!isReviewModalOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsReviewModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isReviewModalOpen])

  // Format Elapsed Time MM:SS
  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Format order created time (e.g. 11:25 AM)
  const formatTimeOnly = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const elapsedMins = Math.floor(elapsedSecs / 60)
  const targetPrepMins = ticket.max_target_prep_minutes || 15
  const isOverdue = elapsedMins >= targetPrepMins
  const isWarning = !isOverdue && elapsedMins >= targetPrepMins * 0.6

  // Item bump handler
  const handleItemClick = async (item: KDSTicketItem) => {
    if (isPendingOrder) {
      setInlineError(
        language === 'km'
          ? 'សូមចុច "ទទួលយក (Accept)" ឬ "បដិសេធ (Reject)" ការកុម្ម៉ង់ជាមុនសិន'
          : 'Please accept or reject this order ticket first.'
      )
      return
    }

    setInlineError(null)
    setBumpingItemId(item.id)

    let nextStatus: OrderItemStatus = 'cooking'
    const st = item.status.toLowerCase()

    if (st === 'held' || st === 'pending' || st === 'queued' || st === 'confirmed') {
      nextStatus = 'cooking'
    } else if (st === 'cooking' || st === 'preparing') {
      nextStatus = 'ready_to_serve'
    } else if (st === 'ready_to_serve' || st === 'ready') {
      nextStatus = 'served'
    }

    try {
      await onBumpItem(item.id, nextStatus)
      if (nextStatus === 'ready_to_serve') {
        playSuccessSound()
      }
    } catch {
      setInlineError(
        language === 'km' ? 'មិនអាចប្តូរស្ថានភាពមុខម្ហូបបានទេ។' : 'Failed to update item status.'
      )
    } finally {
      setBumpingItemId(null)
    }
  }

  // Entire ticket bump handler
  const handleTicketBump = async () => {
    setInlineError(null)
    setIsBumpingTicket(true)
    try {
      await onBumpTicket(ticket.order_id)
      playSuccessSound()
    } catch {
      setInlineError(
        language === 'km' ? 'មិនអាចបញ្ចប់សំបុត្របានទេ។' : 'Failed to bump ticket.'
      )
    } finally {
      setIsBumpingTicket(false)
    }
  }

  const handleAcceptOrder = async () => {
    if (!onAcceptOrder) return
    setIsAccepting(true)
    setLocalStatus('accepted')
    setInlineError(null)
    try {
      await onAcceptOrder(ticket.order_id)
      playSuccessSound()
      setTimeout(() => {
        setIsReviewModalOpen(false)
      }, 700)
    } catch {
      setLocalStatus(null)
      setInlineError(language === 'km' ? 'មិនអាចទទួលការកុម្ម៉ង់បានទេ' : 'Failed to accept order.')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleRejectOrderConfirm = async () => {
    if (!onRejectOrder) return
    const finalReason = selectedReason === 'other' ? (customReason.trim() || 'Kitchen rejected order') : selectedReason
    setIsRejecting(true)
    setLocalStatus('rejected')
    setIsRejectModalOpen(false)
    setInlineError(null)
    try {
      await onRejectOrder(ticket.order_id, finalReason)
      setTimeout(() => {
        setIsReviewModalOpen(false)
      }, 700)
    } catch {
      setLocalStatus(null)
      setInlineError(language === 'km' ? 'មិនអាចបដិសេធការកុម្ម៉ង់បានទេ' : 'Failed to reject order.')
    } finally {
      setIsRejecting(false)
    }
  }

  const totalItemsCount = ticket.items.length
  const readyItemsCount = ticket.items.filter((i) => {
    const st = i.status.toLowerCase()
    return st === 'ready_to_serve' || st === 'ready' || st === 'served'
  }).length

  const allItemsReady = totalItemsCount > 0 && readyItemsCount === totalItemsCount

  // 3-color status tier for incoming orders:
  // - First incoming (< 15 mins): GREEN
  // - Longer than 15 mins (15 - 25 mins): YELLOW
  // - Longer than 25 mins (> 25 mins): RED
  const incomingTier: 'green' | 'yellow' | 'red' =
    elapsedMins < 15 ? 'green' : elapsedMins < 25 ? 'yellow' : 'red'

  const tierStyles = {
    green: {
      card: 'border-emerald-500/80 dark:border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/20',
      strip: 'bg-emerald-500',
      filledContainer:
        'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-400/80 shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-400/20',
      banner: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200',
      bannerBadge: 'bg-emerald-600 text-white',
      bannerDotPing: 'bg-emerald-400',
      bannerDot: 'bg-emerald-500',
      timerBadge:
        'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-bold',
      progress: 'bg-emerald-500',
    },
    yellow: {
      card: 'border-amber-400 dark:border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-400/20',
      strip: 'bg-amber-400',
      filledContainer:
        'bg-amber-400 hover:bg-amber-500 text-amber-950 border-2 border-amber-300 shadow-lg shadow-amber-400/25 ring-2 ring-amber-300/30',
      banner: 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200',
      bannerBadge: 'bg-amber-500 text-white',
      bannerDotPing: 'bg-amber-400',
      bannerDot: 'bg-amber-500',
      timerBadge:
        'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold',
      progress: 'bg-amber-500',
    },
    red: {
      card: 'border-rose-500 dark:border-rose-600 shadow-lg shadow-rose-500/20 ring-2 ring-rose-500/30',
      strip: 'bg-rose-500',
      filledContainer:
        'bg-rose-600 hover:bg-rose-700 text-white border-2 border-rose-400/80 shadow-lg shadow-rose-600/30 ring-2 ring-rose-400/30',
      banner: 'bg-rose-500/15 border-rose-500/35 text-rose-900 dark:text-rose-200',
      bannerBadge: 'bg-rose-600 text-white font-extrabold',
      bannerDotPing: 'bg-rose-400',
      bannerDot: 'bg-rose-500',
      timerBadge:
        'bg-rose-500 text-white font-extrabold shadow-xs border border-rose-600',
      progress: 'bg-rose-500',
    },
  }[incomingTier]

  const orderNotes = ticket.guest_notes || (ticket as any).notes || ''

  // Right-Side Slide-Over Drawer (Styled matching POSOrderDrawer)
  const renderReviewDrawer = () => {
    if (!isReviewModalOpen) return null

    return (
      <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
        {/* Backdrop (transparent, no dark shadow/dimming outside) */}
        <div
          className="fixed inset-0 bg-transparent"
          onClick={() => setIsReviewModalOpen(false)}
          aria-hidden="true"
        />

        <div className="fixed inset-y-0 right-0 flex items-center justify-end p-4 sm:p-6 pointer-events-none">
          {/* Compact panel with fixed width and no shadow */}
          <div className="w-[calc(100vw-32px)] sm:w-[395px] md:w-[410px] pointer-events-auto rounded-[22px] sm:rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 h-[calc(100vh-24px)] max-h-[920px] flex flex-col justify-between shadow-none animate-in slide-in-from-right duration-300">

            {/* 1. Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <h3 className="font-extrabold text-lg text-zinc-950 dark:text-zinc-50">
                  {ticket.table_number || (language === 'km' ? 'យកទៅផ្ទះ' : 'Takeaway')}
                </h3>
                <span className="font-mono text-sm font-bold text-zinc-500 dark:text-zinc-400">
                  #{ticket.order_number.slice(-4)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 2. Scrollable Body */}
            <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 overscroll-contain">
              {/* Guest Notes */}
              {orderNotes && orderNotes.trim() && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 space-y-1 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <MessageSquareQuote className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>{language === 'km' ? 'ចំណាំរបស់ភ្ញៀវ' : 'Guest Notes'}</span>
                  </div>
                  <p className="text-xs text-amber-900 dark:text-amber-200 font-medium pl-5.5">
                    {orderNotes}
                  </p>
                </div>
              )}

              {/* Items List */}
              {totalItemsCount === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-10 text-center text-xs text-zinc-400 space-y-2">
                  <ShoppingBag className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 opacity-40" />
                  <p className="font-medium text-zinc-400 dark:text-zinc-500">
                    {language === 'km' ? '0 មុខម្ហូបក្នុងកន្ត្រក' : '0 items in cart'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {ticket.items.map((item, idx) => {
                    const displayName =
                      language === 'km'
                        ? (item as any).item_name_km || (item as any).name_km || (item as any).item_name_en || (item as any).name_en
                        : (item as any).item_name_en || (item as any).name_en || (item as any).item_name_km || (item as any).name_km
                    const variantName =
                      language === 'km'
                        ? (item as any).variant_name_km || (item as any).variant_name_en
                        : (item as any).variant_name_en || (item as any).variant_name_km
                    const itemPrice =
                      (item as any).subtotal_usd ??
                      (item as any).subtotal_price ??
                      ((item as any).unit_price ? (item as any).unit_price * item.quantity : undefined)
                    const modifiersSummary =
                      item.modifiers && item.modifiers.length > 0
                        ? item.modifiers
                            .map((m: any) => (language === 'km' && m.name_km ? m.name_km : m.name_en))
                            .join(', ')
                        : null

                    return (
                      <div
                        key={item.id || idx}
                        className="py-2 flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/60 last:border-b-0"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            <span className="font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                              {item.quantity}x
                            </span>
                            <span className="truncate">{displayName}</span>
                          </div>

                          {variantName && (
                            <span className="text-[11px] text-zinc-500 block">({variantName})</span>
                          )}

                          {modifiersSummary && (
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block leading-relaxed">
                              + {modifiersSummary}
                            </span>
                          )}

                          {item.special_instructions && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 italic block">
                              * {item.special_instructions}
                            </span>
                          )}
                        </div>

                        {itemPrice !== undefined && itemPrice !== null && (
                          <div className="shrink-0 text-right">
                            <CurrencyDisplay amountUSD={itemPrice} className="font-bold text-xs" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 3. Footer: Financial summary + Action buttons */}
            <div className="shrink-0 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
              {/* Financial breakdown */}
              {ticket.subtotal_usd !== undefined && ticket.subtotal_usd !== null && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-zinc-500">
                    <span>{language === 'km' ? 'សរុបបឋម' : 'Subtotal'}:</span>
                    <CurrencyDisplay amountUSD={ticket.subtotal_usd} />
                  </div>
                  {ticket.total_usd !== undefined && ticket.total_usd !== null && (
                    <div className="flex justify-between font-bold text-sm text-zinc-950 dark:text-zinc-50 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                      <span>{language === 'km' ? 'សរុប' : 'Total'}:</span>
                      <CurrencyDisplay amountUSD={ticket.total_usd} className="font-bold text-base" />
                    </div>
                  )}
                </div>
              )}

              {inlineError && (
                <p className="text-[11px] text-red-500 font-medium text-center">{inlineError}</p>
              )}

              {/* Accept / Reject buttons */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {onRejectOrder && (
                    <button
                      type="button"
                      onClick={() => setIsRejectModalOpen(true)}
                      disabled={isRejecting || isAccepting || effectiveStatus === 'accepted' || effectiveStatus === 'rejected'}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center shadow-none select-none ${
                        effectiveStatus === 'rejected'
                          ? 'border-red-400 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 pointer-events-none cursor-not-allowed opacity-80'
                          : effectiveStatus === 'accepted'
                          ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 pointer-events-none cursor-not-allowed opacity-40'
                          : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 cursor-pointer disabled:opacity-50 disabled:pointer-events-none'
                      }`}
                    >
                      <span>
                        {isRejecting
                          ? (language === 'km' ? 'កំពុងបដិសេធ...' : 'Rejecting...')
                          : effectiveStatus === 'rejected'
                          ? (language === 'km' ? 'បានបដិសេធ' : 'Rejected')
                          : (language === 'km' ? 'បដិសេធ' : 'Reject')}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      if (effectiveStatus === 'accepted' || effectiveStatus === 'rejected') return
                      await handleAcceptOrder()
                    }}
                    disabled={isAccepting || isRejecting || effectiveStatus === 'accepted' || effectiveStatus === 'rejected'}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center transition-all shadow-none select-none ${
                      effectiveStatus === 'accepted'
                        ? 'bg-emerald-600 text-white pointer-events-none cursor-not-allowed opacity-85'
                        : effectiveStatus === 'rejected'
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 pointer-events-none cursor-not-allowed opacity-40'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50 disabled:pointer-events-none'
                    }`}
                  >
                    <span>
                      {isAccepting
                        ? (language === 'km' ? 'កំពុងទទួល...' : 'Accepting...')
                        : effectiveStatus === 'accepted'
                        ? 'Accepted'
                        : (language === 'km' ? 'ទទួលយក' : 'Accept')}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderRejectModal = () => (
    <Modal
      isOpen={isRejectModalOpen}
      onClose={() => setIsRejectModalOpen(false)}
      title={language === 'km' ? 'បដិសេធការកុម្ម៉ង់ (Reject Order)' : 'Reject Customer Order'}
      description={
        language === 'km'
          ? `ជ្រើសរើសមូលហេតុនៃការបដិសេធការកុម្ម៉ង់សម្រាប់ ${
              ticket.table_number
                ? `តុ ${ticket.table_number}`
                : `Order #${ticket.order_number.slice(-4)}`
            }។ ការជូនដំណឹងនឹងត្រូវផ្ញើទៅភ្ញៀវភ្លាមៗ។`
          : `Select a reason for rejecting order for ${
              ticket.table_number
                ? `Table ${ticket.table_number}`
                : `Order #${ticket.order_number.slice(-4)}`
            }. A real-time notification will be sent to the customer.`
      }
      size="sm"
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          {[
            {
              id: 'ingredients',
              label_km: 'អស់គ្រឿងផ្សំ (Out of ingredients)',
              label_en: 'Out of ingredients',
              value: 'Out of ingredients',
            },
            {
              id: 'capacity',
              label_km: 'ផ្ទះបាយរវល់ខ្លាំង / លើសចំណុះ (Kitchen busy)',
              label_en: 'Kitchen at capacity',
              value: 'Kitchen at capacity',
            },
            {
              id: 'unavailable',
              label_km: 'មុខម្ហូបមិនមាន / បិទលក់ (Item unavailable)',
              label_en: 'Item unavailable',
              value: 'Item unavailable',
            },
            {
              id: 'other',
              label_km: 'ផ្សេងៗ (Other reason)',
              label_en: 'Other reason',
              value: 'other',
            },
          ].map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                selectedReason === r.value
                  ? 'border-red-500 bg-red-50/50 dark:bg-red-950/30 text-red-700 dark:text-red-300 ring-1 ring-red-500/20'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <input
                type="radio"
                name={`reject-reason-${ticket.order_id}`}
                value={r.value}
                checked={selectedReason === r.value}
                onChange={() => setSelectedReason(r.value)}
                className="accent-red-600"
              />
              <span>{language === 'km' ? r.label_km : r.label_en}</span>
            </label>
          ))}

          {selectedReason === 'other' && (
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder={language === 'km' ? 'បញ្ជាក់មូលហេតុ...' : 'Specify reason...'}
              className="w-full mt-2 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              autoFocus
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setIsRejectModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
          >
            {language === 'km' ? 'បោះបង់' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleRejectOrderConfirm}
            disabled={isRejecting}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>
              {isRejecting
                ? language === 'km'
                  ? 'កំពុងបដិសេធ...'
                  : 'Rejecting...'
                : language === 'km'
                ? 'បញ្ជាក់ការបដិសេធ'
                : 'Confirm Reject'}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  )

  // =========================================================================
  // =========================================================================
  // 1. SIMPLE CONTAINER VIEW FOR ORDERS (Pending, Accepted, Rejected)
  // =========================================================================
  const tableName = ticket.table_number
    ? `Table ${ticket.table_number}`
    : language === 'km'
    ? 'យកទៅផ្ទះ'
    : 'Takeaway'

  // Not fill color outside: clean card background with status-coded border, no shadow
  const containerBorderStyle =
    effectiveStatus === 'rejected'
      ? 'border-2 border-rose-500 dark:border-rose-500'
      : effectiveStatus === 'accepted'
      ? 'border-2 border-emerald-500 dark:border-emerald-500'
      : incomingTier === 'red'
      ? 'border-2 border-rose-500 dark:border-rose-500'
      : incomingTier === 'yellow'
      ? 'border-2 border-amber-400 dark:border-amber-500'
      : 'border-2 border-emerald-500 dark:border-emerald-500'

  return (
    <>
      {renderReviewDrawer()}
      {renderRejectModal()}

      <button
        type="button"
        onClick={() => setIsReviewModalOpen(true)}
        className={`relative w-[170px] sm:w-[185px] shrink-0 rounded-3xl bg-white dark:bg-zinc-900 ${containerBorderStyle} py-3.5 px-3 text-center min-h-[135px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800/80 cursor-pointer flex flex-col items-center justify-center gap-1.5 shadow-none overflow-hidden`}
      >
        {/* Sequential Order Number */}
        <span className="font-mono font-black text-3xl sm:text-4xl text-zinc-950 dark:text-zinc-50 leading-none tracking-tight">
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Table Name */}
        <h3 className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight truncate max-w-full">
          {tableName}
        </h3>

        {/* Order Number & Created Time */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          <span>#{ticket.order_number.slice(-4)}</span>
          <span>•</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {formatTimeOnly(ticket.created_at)}
          </span>
        </div>

        {/* Large Status Text (No fill color outside, no បានទទួល) */}
        <div className="mt-0.5">
          {effectiveStatus === 'accepted' ? (
            <span className="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Accepted
            </span>
          ) : effectiveStatus === 'rejected' ? (
            <span className="text-sm sm:text-base font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Rejected
            </span>
          ) : (
            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
              </span>
              <span>Pending</span>
            </span>
          )}
        </div>
      </button>
    </>
  )


  // =========================================================================
  // 2. ACTIVE TICKET VIEW (Once Accepted, Kitchen Cooks & Bumps Items)
  // =========================================================================
  const cardBorderColor = allItemsReady
    ? 'border-emerald-500/80 dark:border-emerald-500 shadow-emerald-500/10'
    : isOverdue
    ? 'border-rose-500 dark:border-rose-600 shadow-rose-500/10'
    : isWarning
    ? 'border-amber-400 dark:border-amber-500 shadow-amber-400/10'
    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'

  const docketStripColor = allItemsReady
    ? 'bg-emerald-500'
    : isOverdue
    ? 'bg-rose-500'
    : isWarning
    ? 'bg-amber-400'
    : 'bg-zinc-800 dark:bg-zinc-700'

  const timerBadgeClass = isOverdue
    ? 'bg-rose-500 text-white font-bold animate-pulse shadow-xs'
    : isWarning
    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700'
    : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 font-semibold border border-zinc-200 dark:border-zinc-700'

  return (
    <div
      className="relative rounded-3xl border border-gray-300 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between overflow-hidden min-h-[200px]"
    >
      {/* Top Ticket Docket Strip */}
      <div className={`h-1.5 w-full ${docketStripColor}`} />

      {/* 1. Receipt Header */}
      <div className="p-3.5 bg-zinc-50/70 dark:bg-zinc-900/60 border-b-2 border-dashed border-zinc-200 dark:border-zinc-800 space-y-2">
        {/* Pending Approval / Customer QR Order Banner */}
        {isPendingOrder && (
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-xs font-bold truncate">
                {isGuestOrder
                  ? (language === 'km' ? '🔔 ការកុម្ម៉ង់ថ្មីពីភ្ញៀវតាមតុ' : '🔔 New Customer QR Order')
                  : (language === 'km' ? '🔔 រង់ចាំផ្ទះបាយទទួល' : '🔔 Pending Approval')}
              </span>
            </div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white shrink-0">
              {language === 'km' ? 'ត្រូវសម្រេច' : 'Action'}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Table / Order Docket Identifier */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-sm sm:text-base text-zinc-950 dark:text-zinc-50 tracking-tight flex items-center gap-1.5 truncate">
              <Utensils className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
              {ticket.table_number ? `Table ${ticket.table_number}` : `Takeaway #${ticket.order_number.slice(-4)}`}
            </span>
            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 font-bold px-1.5 py-0.5 rounded-md bg-zinc-200/70 dark:bg-zinc-800 shrink-0">
              (R#{ticket.round_number})
            </span>
          </div>

          {/* Live SLA Timer Badge */}
          <div className={`px-2 py-0.5 rounded-md flex items-center gap-1 text-xs font-mono shrink-0 ${timerBadgeClass}`}>
            {isOverdue && <AlertTriangle className="w-3.5 h-3.5" />}
            {!isOverdue && <Clock className="w-3.5 h-3.5" />}
            <span>{formatTimer(elapsedSecs)}</span>
          </div>
        </div>

        {/* Receipt Sub-Header: Order # and timestamp */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
          <span>#{ticket.order_number.slice(-6).toUpperCase()}</span>
          <span>{formatTimeOnly(ticket.created_at)}</span>
        </div>

        {/* High Visibility Customer Note Box */}
        {ticket.guest_notes && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-start gap-2 shadow-xs">
            <MessageSquareQuote className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                {language === 'km' ? 'ចំណាំរបស់ភ្ញៀវ (Guest Note)' : 'Guest Note'}
              </span>
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-100 italic break-words mt-0.5">
                Note: "{ticket.guest_notes}"
              </p>
            </div>
          </div>
        )}
      </div>


      {/* 2. Receipt Ordered Items (Main Focus) */}
      <div className="p-3.5 divide-y divide-dashed divide-zinc-200 dark:divide-zinc-800 space-y-2.5 flex-1 max-h-[380px] overflow-y-auto">
        {ticket.items.map((item) => {
          const st = item.status.toLowerCase()
          const isReady = st === 'ready_to_serve' || st === 'ready' || st === 'served'
          const isCooking = st === 'cooking' || st === 'preparing'
          const isHeld = st === 'held'

          const displayName = language === 'km' && item.item_name_km ? item.item_name_km : item.item_name_en
          const isCurrentlyBumping = bumpingItemId === item.id

          return (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`pt-2.5 first:pt-0 cursor-pointer select-none rounded-xl p-2 transition-all ${
                isReady
                  ? 'opacity-45 bg-zinc-50/50 dark:bg-zinc-950/30'
                  : isCooking
                  ? 'bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 shadow-xs'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                {/* Quantity & Dish Details */}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span
                      className={`font-mono font-black text-xs px-2 py-0.5 rounded-md shrink-0 shadow-xs mt-0.5 ${
                        isReady
                          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                          : isCooking
                          ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-950'
                          : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      }`}
                    >
                      {item.quantity}x
                    </span>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`font-bold text-[13px] sm:text-sm text-zinc-950 dark:text-zinc-50 leading-snug block ${
                          isReady ? 'line-through text-zinc-400 dark:text-zinc-500' : ''
                        }`}
                      >
                        {displayName}
                      </span>

                      {/* Size Variant */}
                      {item.variant_name_en && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block mt-0.5">
                          • {item.variant_name_en}
                        </span>
                      )}

                      {/* Modifiers List */}
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 mt-0.5">
                          {item.modifiers.map((m, mi) => (
                            <span key={mi} className="block">
                              + {m.name_en}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Chef Special Cooking Notes */}
                      {item.special_instructions && (
                        <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-[11px] font-semibold">
                          <span>* {item.special_instructions}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Indicator Button */}
                <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                  {isReady ? (
                    <span className="px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold flex items-center gap-1 shadow-xs border border-emerald-200 dark:border-emerald-800">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      READY
                    </span>
                  ) : isCooking ? (
                    <span className="px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold flex items-center gap-1 shadow-xs border border-amber-200 dark:border-amber-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                      COOKING
                    </span>
                  ) : isHeld ? (
                    <span className="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-bold border border-zinc-200 dark:border-zinc-700">
                      HELD
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                      {isCurrentlyBumping ? '...' : 'QUEUED'}
                    </span>
                  )}

                  {/* Optional Reroute Button */}
                  {!isReady && onRerouteItem && stations.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const otherStation = stations.find((s) => s.id !== item.kitchen_station_id)
                        if (otherStation) {
                          onRerouteItem(item.id, otherStation.id)
                        }
                      }}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title={language === 'km' ? 'ផ្ទេរទៅស្ថានីយផ្សេង' : 'Reroute to other station'}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Optional Undo Button for accidentally bumped item */}
                  {isReady && onUndoItem && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUndoItem(item.id)
                      }}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Undo bump"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. Receipt Perforated Summary & Action Footer */}
      <div className="p-3.5 border-t-2 border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 space-y-2.5">
        {/* Items Summary & Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>
              {language === 'km' ? 'ស្ថានភាពមុខម្ហូប' : 'Order Progress'}
            </span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {readyItemsCount}/{totalItemsCount} {language === 'km' ? 'រួចរាល់' : 'Ready'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                allItemsReady ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{
                width: `${totalItemsCount > 0 ? (readyItemsCount / totalItemsCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Inline Error Message */}
        {inlineError && (
          <p className="text-[11px] text-red-500 font-medium text-center">
            {inlineError}
          </p>
        )}

        {/* Fire Held Course Button */}
        {ticket.items.some((i) => i.status.toLowerCase() === 'held') && onFireCourse && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation()
              setInlineError(null)
              try {
                await onFireCourse(ticket.order_id)
              } catch {
                setInlineError(language === 'km' ? 'មិនអាចបញ្ជូនមុខម្ហូបបានទេ' : 'Failed to fire course.')
              }
            }}
            className="w-full py-2 px-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            <Flame className="w-3.5 h-3.5 text-amber-600" />
            <span>{language === 'km' ? 'បញ្ជូនមុខម្ហូបទៅធ្វើ (Fire Course)' : 'Fire Held Course'}</span>
          </button>
        )}

        {/* Action Button: Bump for Active Orders */}
        <button
          onClick={handleTicketBump}
          disabled={isBumpingTicket}
          className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.99] shadow-sm ${
            allItemsReady
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/20'
              : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900'
          } disabled:opacity-50 cursor-pointer`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {isBumpingTicket
              ? language === 'km'
                ? 'កំពុងបញ្ចប់...'
                : 'Bumping...'
              : allItemsReady
              ? language === 'km'
                ? 'រួចរាល់ទាំងអស់ (Serve Ticket)'
                : 'Complete & Serve'
              : language === 'km'
              ? 'បញ្ចប់សំបុត្រ (Bump All)'
              : 'Bump Ticket'}
          </span>
        </button>
      </div>

      {renderRejectModal()}
    </div>
  )
}

