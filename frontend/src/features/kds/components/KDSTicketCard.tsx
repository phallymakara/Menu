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
} from 'lucide-react'
import { KDSTicket, KDSTicketItem, OrderItemStatus } from '../types/kds.types'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'

export interface KDSTicketCardProps {
  ticket: KDSTicket
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
  const [inlineError, setInlineError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      const createdTime = new Date(ticket.created_at).getTime()
      setElapsedSecs(Math.max(0, Math.floor((Date.now() - createdTime) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [ticket.created_at])

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

  const isPendingOrder =
    ticket.order_status?.toLowerCase() === 'pending' ||
    (ticket.items.length > 0 &&
      ticket.items.every((i) => {
        const st = i.status.toLowerCase()
        return st === 'pending' || st === 'held' || st === 'queued'
      }))

  const handleAcceptOrder = async () => {
    if (!onAcceptOrder) return
    setIsAccepting(true)
    setInlineError(null)
    try {
      await onAcceptOrder(ticket.order_id)
      playSuccessSound()
    } catch {
      setInlineError(language === 'km' ? 'មិនអាចទទួលការកុម្ម៉ង់បានទេ' : 'Failed to accept order.')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleRejectOrder = async () => {
    if (!onRejectOrder) return
    setIsRejecting(true)
    setInlineError(null)
    try {
      await onRejectOrder(ticket.order_id)
    } catch {
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

  // Docket container styling based on urgency & completion
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
      className={`relative rounded-2xl border-2 ${cardBorderColor} bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between overflow-hidden transition-all duration-200`}
    >
      {/* Top Ticket Docket Strip */}
      <div className={`h-1.5 w-full ${docketStripColor}`} />

      {/* 1. Receipt Header */}
      <div className="p-3.5 bg-zinc-50/70 dark:bg-zinc-900/60 border-b-2 border-dashed border-zinc-200 dark:border-zinc-800 space-y-2">
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

        {/* Action Button: Accept/Reject for Pending Orders, Bump for Active Orders */}
        {isPendingOrder && onAcceptOrder ? (
          <div className="flex items-center gap-2">
            {onRejectOrder && (
              <button
                type="button"
                onClick={handleRejectOrder}
                disabled={isRejecting || isAccepting}
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                title={language === 'km' ? 'បដិសេធការកុម្ម៉ង់' : 'Reject Order'}
              >
                <XCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>
                  {isRejecting
                    ? (language === 'km' ? 'កំពុងបដិសេធ...' : 'Rejecting...')
                    : (language === 'km' ? 'បដិសេធ' : 'Reject')}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAcceptOrder}
              disabled={isAccepting || isRejecting}
              className="flex-[1.5] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/20 active:scale-[0.99] disabled:opacity-50 shadow-sm cursor-pointer"
              title={language === 'km' ? 'ទទួលយកការកុម្ម៉ង់' : 'Accept Order'}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {isAccepting
                  ? (language === 'km' ? 'កំពុងទទួល...' : 'Accepting...')
                  : (language === 'km' ? 'ទទួលយក (Accept)' : 'Accept Order')}
              </span>
            </button>
          </div>
        ) : (
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
                ? (language === 'km' ? 'កំពុងបញ្ចប់...' : 'Bumping...')
                : allItemsReady
                ? (language === 'km' ? 'រួចរាល់ទាំងអស់ (Serve Ticket)' : 'Complete & Serve')
                : (language === 'km' ? 'បញ្ចប់សំបុត្រ (Bump All)' : 'Bump Ticket')}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
