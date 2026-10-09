import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { StoreSettingsTab } from './StoreSettingsTab'

const BIZ = '11111111-1111-4111-8111-111111111111'

const business = {
  id: BIZ,
  organization_id: '22222222-2222-4222-8222-222222222222',
  name_en: 'Riverside Cafe',
  business_type: 'Cafe',
  base_currency: 'USD',
  exchange_rate: '4050.00',
  tax_percentage: '10.00',
  is_tax_inclusive: true,
  service_charge_percentage: '0.00',
  is_service_charge_inclusive: false,
  bakong_account_id: null,
  bakong_merchant_name: null,
  bakong_acquiring_bank: null,
  is_active: true,
  branches: [],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

function renderTab(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function stubApi(patchStatus = 200) {
  const fetchMock = vi.fn(async (request: Request) => {
    if (request.method === 'PATCH') {
      const body = patchStatus === 200 ? business : { detail: 'Your staff role does not allow this action.' }
      return new Response(JSON.stringify(body), { status: patchStatus, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify([business]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.setItem('emenu_access_token', 'test-token')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('StoreSettingsTab', () => {
  it('starts from the saved settings and saves changes to the business', async () => {
    useLanguageStore.setState({ language: 'en' })
    localStorage.setItem('emenu_business_id', BIZ)
    const fetchMock = stubApi()
    renderTab(<StoreSettingsTab />)

    const rate = await screen.findByDisplayValue('4050')
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
    fireEvent.change(rate, { target: { value: '4100' } })
    fireEvent.change(screen.getByPlaceholderText('Enter Bakong Account ID'), {
      target: { value: 'riverside_cafe@abaa' },
    })
    fireEvent.change(screen.getByPlaceholderText('Enter Merchant Display Name'), {
      target: { value: 'Riverside Cafe' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await screen.findByRole('button', { name: 'Saved!' })
    const patch = fetchMock.mock.calls
      .map(([request]) => request as Request)
      .find((request) => request.method === 'PATCH')
    expect(patch?.url).toContain(`/api/v1/businesses/${BIZ}`)
    expect(await patch?.json()).toMatchObject({
      exchange_rate: '4100',
      tax_percentage: '10',
      is_tax_inclusive: true,
      bakong_account_id: 'riverside_cafe@abaa',
      bakong_merchant_name: 'Riverside Cafe',
    })
  })

  it('shows the API error instead of claiming success', async () => {
    useLanguageStore.setState({ language: 'en' })
    stubApi(403)
    renderTab(<StoreSettingsTab />)

    await screen.findByDisplayValue('4050')
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Your staff role does not allow this action.')
    )
    expect(screen.queryByRole('button', { name: 'Saved!' })).not.toBeInTheDocument()
  })
})
