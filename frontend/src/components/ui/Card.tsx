import type { HTMLAttributes, FC, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
  children?: ReactNode
}

export const Card: FC<CardProps> = ({
  className,
  hoverable = false,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 transition-colors',
        hoverable && 'hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
