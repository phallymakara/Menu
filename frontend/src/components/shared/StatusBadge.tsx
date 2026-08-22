import { type FC } from 'react'
import { Badge } from '@/components/ui/Badge'
import { useLanguageStore } from '@/stores/useLanguageStore'

export type OrderStatusType = 'QUEUED' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED' | 'PAID' | 'PENDING'

export interface StatusBadgeProps {
  status: OrderStatusType | string
  className?: string
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status, className }) => {
  const { language } = useLanguageStore()

  const normalized = status.toUpperCase()

  const labels = {
    QUEUED: { en: 'Queued', km: 'ក្នុងជួរ', variant: 'neutral' as const },
    PREPARING: { en: 'Preparing', km: 'កំពុងចម្អិន', variant: 'warning' as const },
    READY: { en: 'Ready to Serve', km: 'រួចរាល់', variant: 'brand' as const },
    SERVED: { en: 'Served', km: 'បានជូន', variant: 'success' as const },
    VOIDED: { en: 'Cancelled', km: 'បានបោះបង់', variant: 'danger' as const },
    PAID: { en: 'Settled', km: 'បានទូទាត់', variant: 'success' as const },
    PENDING: { en: 'Pending', km: 'រង់ចាំ', variant: 'neutral' as const },
  }

  const config = labels[normalized as keyof typeof labels] || {
    en: normalized,
    km: normalized,
    variant: 'neutral' as const,
  }

  return (
    <Badge variant={config.variant} size="sm" className={className}>
      {language === 'km' ? config.km : config.en}
    </Badge>
  )
}
