import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { KDSStationTabs } from './KDSStationTabs'
import type { KitchenStation } from '../types/kds.types'

const grill: KitchenStation = {
  id: 'station-grill',
  name: 'Grill',
  name_km: 'ឡអាំង',
  station_code: 'GRILL',
  is_active: true,
}

afterEach(() => {
  cleanup()
  useLanguageStore.setState({ language: 'en' })
})

describe('KDSStationTabs', () => {
  it('shows station names and an Expo tab to get back to all tickets', () => {
    useLanguageStore.setState({ language: 'en' })
    const onSelect = vi.fn()
    render(
      <KDSStationTabs stations={[grill]} selectedStationId={grill.id} onSelectStation={onSelect} />
    )

    expect(screen.getByText('Grill')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Expo (All)'))
    expect(onSelect).toHaveBeenCalledWith('expo')
  })

  it('uses the Khmer station name when the language is Khmer', () => {
    useLanguageStore.setState({ language: 'km' })
    render(<KDSStationTabs stations={[grill]} selectedStationId="expo" onSelectStation={vi.fn()} />)

    expect(screen.getByText('ឡអាំង')).toBeInTheDocument()
  })
})
