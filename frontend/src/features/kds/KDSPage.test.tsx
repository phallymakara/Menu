import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useKDSStore } from './stores/useKDSStore'
import { KDSPage } from './KDSPage'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
      },
    },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>
  )
}

function stubApi() {
  const fetchMock = vi.fn(async (request: Request) => {
    const url = request.url

    // Kitchen Stations
    if (url.includes('/kitchen-stations')) {
      return new Response(
        JSON.stringify([
          {
            id: 'station-grill',
            name_en: 'Grill Station',
            name_km: 'កន្លែងអាំង',
            code: 'GRILL',
            color_hex: '#f59e0b',
            is_active: true,
            display_order: 1,
            assigned_category_ids: [],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Expo Tickets
    if (url.includes('/kds/expo/tickets')) {
      return new Response(
        JSON.stringify([
          {
            order_id: 'order-101',
            order_number: 'A-101',
            order_type: 'dine_in',
            round_number: 1,
            table_number: 'T-05',
            created_at: new Date().toISOString(),
            elapsed_minutes: 4,
            max_target_prep_minutes: 15,
            is_ticket_overdue: false,
            ticket_urgency: 'normal',
            has_held_items: false,
            items: [
              {
                id: 'item-1',
                menu_item_id: 'menu-1',
                item_name_en: 'Grilled Salmon',
                item_name_km: 'ត្រីសាល់ម៉ុនអាំង',
                quantity: 2,
                course_stage: 'mains',
                status: 'cooking',
                kitchen_station_id: 'station-grill',
                station_name: 'Grill Station',
                station_code: 'GRILL',
                modifiers: [],
                elapsed_minutes: 4,
                target_prep_time_minutes: 15,
                is_overdue: false,
                urgency_level: 'normal',
              },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Station Recall / Metrics
    if (url.includes('/metrics')) {
      return new Response(
        JSON.stringify({
          station_id: 'station-grill',
          station_name: 'Grill Station',
          station_code: 'GRILL',
          active_tickets: 1,
          overdue_tickets: 0,
          avg_prep_time_minutes: 8.5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (url.includes('/recall')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Default mock response
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('KDSPage render stability', () => {
  it('mounts and renders without exceeding maximum update depth', async () => {
    useLanguageStore.setState({ language: 'en' })
    useKDSStore.setState({ selectedStationId: 'expo', tickets: [], recalledTickets: [] })
    localStorage.setItem('emenu_business_id', BIZ)
    localStorage.setItem('emenu_branch_id', BRANCH)
    localStorage.setItem('emenu_business_name_en', 'Taste of Cambodia')

    stubApi()

    renderWithClient(<KDSPage />)

    // Verify header loads
    expect(await screen.findByText('Taste of Cambodia')).toBeInTheDocument()

    // Verify ticket renders cleanly without infinite loop
    expect(await screen.findByText('Grilled Salmon')).toBeInTheDocument()
    expect(screen.getByText('Table T-05')).toBeInTheDocument()
    expect(screen.getByText('(R#1)')).toBeInTheDocument()
  })
})
