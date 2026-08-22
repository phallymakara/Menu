import { type FC } from 'react'
import { formatUSD, formatKHR, DEFAULT_EXCHANGE_RATE } from '@/lib/currency'
import { cn } from '@/lib/utils'

export interface CurrencyDisplayProps {
  amountUSD: number | string | null | undefined
  exchangeRate?: number
  className?: string
  usdClassName?: string
  khrClassName?: string
  showKHR?: boolean
  layout?: 'inline' | 'stacked'
}

export const CurrencyDisplay: FC<CurrencyDisplayProps> = ({
  amountUSD,
  exchangeRate = DEFAULT_EXCHANGE_RATE,
  className,
  usdClassName,
  khrClassName,
  showKHR = true,
  layout = 'inline',
}) => {
  const usdNum = typeof amountUSD === 'string' ? parseFloat(amountUSD) : (amountUSD ?? 0)
  const usdStr = formatUSD(usdNum)
  const khrStr = formatKHR(usdNum * exchangeRate)

  if (!showKHR) {
    return <span className={cn('font-semibold font-mono', usdClassName, className)}>{usdStr}</span>
  }

  if (layout === 'stacked') {
    return (
      <div className={cn('flex flex-col items-start leading-tight', className)}>
        <span className={cn('font-bold text-sm text-zinc-900 dark:text-zinc-100 font-mono', usdClassName)}>
          {usdStr}
        </span>
        <span className={cn('text-xs text-zinc-500 font-mono mt-0.5', khrClassName)}>
          {khrStr}
        </span>
      </div>
    )
  }

  return (
    <span className={cn('inline-flex items-baseline gap-1.5 font-mono text-sm', className)}>
      <span className={cn('font-bold text-zinc-900 dark:text-zinc-100', usdClassName)}>{usdStr}</span>
      <span className="text-zinc-400 dark:text-zinc-600 font-normal">/</span>
      <span className={cn('text-xs text-zinc-500 dark:text-zinc-400 font-normal', khrClassName)}>{khrStr}</span>
    </span>
  )
}
