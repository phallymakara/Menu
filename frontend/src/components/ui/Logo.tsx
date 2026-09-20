import { type FC } from 'react'
import { cn } from '@/lib/utils'

export interface LogoProps {
  variant?: 'mark' | 'full'
  className?: string
  alt?: string
}

export const Logo: FC<LogoProps> = ({
  variant = 'mark',
  className,
  alt = 'E-Menu Cambodia',
}) => {
  const src = variant === 'full' ? '/logo.svg' : '/logo-mark.svg'

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        variant === 'full' ? 'h-10 w-auto object-contain' : 'w-7 h-7 object-contain',
        className
      )}
      loading="eager"
      decoding="async"
    />
  )
}
