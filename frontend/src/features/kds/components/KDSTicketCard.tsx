import { useState, useEffect, type FC } from 'react'
import { Clock, Check, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react'
import { KDSTicket, KDSTicketItem, OrderItemStatus } from '../types/kds.types'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { playSuccessSound } from '@/lib/audio'

export interface KDSTicketCardProps {
  ticket: KDSTicket
  onBumpItem: (orderItemId: string, targetStatus: OrderItemStatus) => Promise<void>
  onBumpTicket: (orderId: string) => Promise<void>
  onUndoItem?: (orderItemId: string) => Promise<void>
}

export const KDSTicketCard: FC<KDSTicketCardProps> = ({
  ticket,
  onBumpItem,
  onBumpTicket,
  onUndoItem,
}) => {
  const { language } = useLanguageStore()

  // Live timer tick
  const [elapsedSecs, setElapsedSecs] = useState<number>(() => {
    const createdTime = new Date(ticket.created_at).getTime()
    return Math.max(0, Math.floor((Date.now() - createdTime) / 1000))
  })
  const [bumpingItemId, setBumpingItemId] = useState<string | null>(null)
  const [isBumpingTicket, setIsBumpingTicket] = useState(false)
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

  // Border & Header Styling by SLA Urgency (Zero Shadow, Clean Flat Borders)
  const borderColor = isOverdue
    ? 'border-red-500 dark:border-red-600'
    : isWarning
    ? 'border-amber-400 dark:border-amber-600'
    : 'border-zinc-200 dark:border-zinc-800'

  const timerBadgeColor = isOverdue
    ? 'bg-red-500 text-white font-bold'
    : isWarning
    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 font-bold'
    : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 font-semibold'

  const allItemsReady = ticket.items.every(
    (i) => i.status.toLowerCase() === 'ready_to_serve' || i.status.toLowerCase() === 'ready' || i.status.toLowerCase() === 'served'
  )

  return (
    <div
      className={`rounded-2xl border ${borderColor} bg-white dark:bg-zinc-900 flex flex-col justify-between overflow-hidden transition-colors`}
    >
      {/* 1. Ticket Header */}
      <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Table / Order Source Badge */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-sm text-zinc-950 dark:text-zinc-50 truncate">
              {ticket.table_number ? `Table ${ticket.table_number}` : `Takeaway #${ticket.order_number.slice(-4)}`}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 font-medium shrink-0">
              (R#{ticket.round_number})
            </span>
          </div>

          {/* Live SLA Timer Badge */}
          <div className={`px-2 py-0.5 rounded-md flex items-center gap-1 text-xs font-mono shrink-0 ${timerBadgeColor}`}>
            {isOverdue && <AlertTriangle className="w-3 h-3" />}
            {!isOverdue && <Clock className="w-3 h-3" />}
            <span>{formatTimer(elapsedSecs)}</span>
          </div>
        </div>

        {/* Guest Notes (if any) */}
        {ticket.guest_notes && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium italic truncate">
            Note: "{ticket.guest_notes}"
          </p>
        )}
      </div>

      {/* 2. Items List */}
      <div className="p-3.5 divide-y divide-zinc-100 dark:divide-zinc-800/80 space-y-2 flex-1 max-h-[380px] overflow-y-auto">
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
              className={`pt-2 first:pt-0 cursor-pointer select-none rounded-lg p-1.5 transition-colors ${
                isReady
                  ? 'opacity-40 line-through bg-zinc-50 dark:bg-zinc-950/40'
                  : isCooking
                  ? 'bg-amber-50/40 dark:bg-amber-950/20'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Quantity & Dish Name */}
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded-md ${
                        isReady
                          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      }`}
                    >
                      {item.quantity}x
                    </span>
                    <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 leading-tight">
                      {displayName}
                    </span>
                  </div>

                  {/* Size Variant */}
                  {item.variant_name_en && (
                    <span className="text-[11px] text-zinc-500 font-medium pl-8 block">
                      ({item.variant_name_en})
                    </span>
                  )}

                  {/* Modifiers List */}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="text-[11px] text-zinc-500 pl-8 space-y-0.5">
                      {item.modifiers.map((m, mi) => (
                        <span key={mi} className="block">
                          + {m.name_en}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Chef Special Cooking Notes */}
                  {item.special_instructions && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 italic pl-8 font-medium">
                      * {item.special_instructions}
                    </p>
                  )}
                </div>

                {/* Status Indicator Button */}
                <div className="shrink-0 flex items-center gap-1">
                  {isReady ? (
                    <span className="px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      READY
                    </span>
                  ) : isCooking ? (
                    <span className="px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                      COOKING
                    </span>
                  ) : isHeld ? (
                    <span className="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-bold">
                      HELD
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-[10px] font-medium">
                      {isCurrentlyBumping ? '...' : 'QUEUED'}
                    </span>
                  )}

                  {/* Optional Undo Button for accidentally bumped item */}
                  {isReady && onUndoItem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onUndoItem(item.id)
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      title="Undo bump"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. Ticket Footer & Actions */}
      <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/60 space-y-2">
        {/* Inline Error Message */}
        {inlineError && (
          <p className="text-[11px] text-red-500 font-medium text-center">
            {inlineError}
          </p>
        )}

        <button
          onClick={handleTicketBump}
          disabled={isBumpingTicket}
          className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
            allItemsReady
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900'
          } disabled:opacity-50`}
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
      </div>
    </div>
  )
}
