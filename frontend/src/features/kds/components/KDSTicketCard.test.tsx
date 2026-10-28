import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { KDSTicketCard } from './KDSTicketCard'
import { KDSTicket } from '../types/kds.types'

const mockTicket: KDSTicket = {
  order_id: 'order-123',
  order_number: 'ORD-E346',
  table_number: 'BAR-03',
  round_number: 1,
  order_status: 'pending',
  order_source: 'guest_qr',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago (<15 mins, Green)
  items: [
    {
      id: 'item-1',
      menu_item_id: 'mi-1',
      name_en: 'Grilled Beef Skewers',
      name_km: 'សាច់គោអាំង',
      quantity: 2,
      status: 'pending',
      special_instructions: 'Less spicy',
      modifiers: [{ name_en: 'Extra sauce', name_km: 'ទឹកជ្រលក់បន្ថែម', price: 0.5 }],
    },
    {
      id: 'item-2',
      menu_item_id: 'mi-2',
      name_en: 'Iced Lemon Tea',
      name_km: 'តែក្រូចឆ្មាទឹកកក',
      quantity: 1,
      status: 'pending',
    },
  ],
  notes: 'Customer requests napkins',
}

describe('KDSTicketCard - Incoming Order Redesign', () => {
  it('renders simple filled container button for incoming order with green tier (< 15 mins)', () => {
    const onBumpItem = vi.fn()
    const onBumpTicket = vi.fn()
    const onAcceptOrder = vi.fn()
    const onRejectOrder = vi.fn()

    render(
      <KDSTicketCard
        ticket={mockTicket}
        onBumpItem={onBumpItem}
        onBumpTicket={onBumpTicket}
        onAcceptOrder={onAcceptOrder}
        onRejectOrder={onRejectOrder}
      />
    )

    // Table name, order number, and time on the container button
    expect(screen.getByText('Table BAR-03')).toBeDefined()
    expect(screen.getByText(/#E346/)).toBeDefined()
    expect(screen.getByText('Pending')).toBeDefined()

    // Clean container with emerald border (no outer fill color)
    const cardEl = screen.getByText('Table BAR-03').closest('.border-emerald-500')
    expect(cardEl).toBeDefined()
  })

  it('renders large Accepted text and emerald border when order is accepted', () => {
    const acceptedTicket: KDSTicket = {
      ...mockTicket,
      order_status: 'preparing',
      items: [
        {
          id: 'item-1',
          menu_item_id: 'mi-1',
          name_en: 'Grilled Beef Skewers',
          quantity: 2,
          status: 'cooking',
        },
      ],
    }

    render(
      <KDSTicketCard
        ticket={acceptedTicket}
        onBumpItem={vi.fn()}
        onBumpTicket={vi.fn()}
        onAcceptOrder={vi.fn()}
        onRejectOrder={vi.fn()}
      />
    )

    expect(screen.getByText('Accepted')).toBeDefined()
    const cardEl = screen.getByText('Table BAR-03').closest('.border-emerald-500')
    expect(cardEl).toBeDefined()
  })

  it('renders large Rejected text and rose border when order is cancelled', () => {
    const rejectedTicket: KDSTicket = {
      ...mockTicket,
      order_status: 'cancelled',
      items: [
        {
          id: 'item-1',
          menu_item_id: 'mi-1',
          name_en: 'Grilled Beef Skewers',
          quantity: 2,
          status: 'voided',
          void_reason: 'Out of ingredients',
        },
      ],
    }

    render(
      <KDSTicketCard
        ticket={rejectedTicket}
        onBumpItem={vi.fn()}
        onBumpTicket={vi.fn()}
        onAcceptOrder={vi.fn()}
        onRejectOrder={vi.fn()}
      />
    )

    expect(screen.getByText('Rejected')).toBeDefined()
    const cardEl = screen.getByText('Table BAR-03').closest('.border-rose-500')
    expect(cardEl).toBeDefined()
  })

  it('applies yellow tier border styling when order is between 15 and 25 mins old', () => {
    const yellowTicket: KDSTicket = {
      ...mockTicket,
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 mins ago
    }

    render(
      <KDSTicketCard
        ticket={yellowTicket}
        onBumpItem={vi.fn()}
        onBumpTicket={vi.fn()}
        onAcceptOrder={vi.fn()}
        onRejectOrder={vi.fn()}
      />
    )

    const cardEl = screen.getByText('Table BAR-03').closest('.border-amber-400')
    expect(cardEl).toBeDefined()
  })

  it('applies red tier border styling when order is longer than 25 mins old', () => {
    const redTicket: KDSTicket = {
      ...mockTicket,
      created_at: new Date(Date.now() - 26 * 60 * 1000).toISOString(), // 26 mins ago
    }

    render(
      <KDSTicketCard
        ticket={redTicket}
        onBumpItem={vi.fn()}
        onBumpTicket={vi.fn()}
        onAcceptOrder={vi.fn()}
        onRejectOrder={vi.fn()}
      />
    )

    const cardEl = screen.getByText('Table BAR-03').closest('.border-rose-500')
    expect(cardEl).toBeDefined()
  })

  it('opens right-side drawer when container button is clicked and shows guest notes, dishes with image, and both buttons', async () => {
    const onAcceptOrder = vi.fn().mockResolvedValue(undefined)
    const onRejectOrder = vi.fn().mockResolvedValue(undefined)

    render(
      <KDSTicketCard
        ticket={mockTicket}
        onBumpItem={vi.fn()}
        onBumpTicket={vi.fn()}
        onAcceptOrder={onAcceptOrder}
        onRejectOrder={onRejectOrder}
      />
    )

    // Click the table name container button to open right-side drawer
    const tableBtn = screen.getByText('Table BAR-03')
    fireEvent.click(tableBtn)

    // Right-side drawer should show table number, items count, guest notes, dishes and both Accept & Reject buttons
    await waitFor(() => {
      expect(screen.getByText('BAR-03')).toBeDefined()
      expect(screen.getByText('Customer requests napkins')).toBeDefined()
      expect(screen.getByText(/Grilled Beef Skewers|សាច់គោអាំង/i)).toBeDefined()
      expect(screen.getByText(/Iced Lemon Tea|តែក្រូចឆ្មាទឹកកក/i)).toBeDefined()
      expect(screen.getByRole('button', { name: /Accept|ទទួលយក/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Reject|បដិសេធ/i })).toBeDefined()
    })

    // Click Accept button inside right-side drawer
    const acceptBtn = screen.getByRole('button', { name: /Accept|ទទួលយក/i })
    fireEvent.click(acceptBtn)

    await waitFor(() => {
      expect(onAcceptOrder).toHaveBeenCalledWith('order-123')
    })
  })

  it('handles order rejection flow from right-side drawer with reason', async () => {
    const onRejectOrder = vi.fn().mockResolvedValue(undefined)

    render(
      <KDSTicketCard
        ticket={mockTicket}
        onBumpItem={vi.fn()}
        onBumpTicket={vi.fn()}
        onAcceptOrder={vi.fn()}
        onRejectOrder={onRejectOrder}
      />
    )

    // Click table name container button to open right-side drawer
    const tableBtn = screen.getByText('Table BAR-03')
    fireEvent.click(tableBtn)

    // Click Reject button inside the right-side drawer
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reject|បដិសេធ/i })).toBeDefined()
    })
    const rejectBtn = screen.getByRole('button', { name: /Reject|បដិសេធ/i })
    fireEvent.click(rejectBtn)

    // Modal with rejection reasons should be open
    await waitFor(() => {
      expect(screen.getByText(/Out of ingredients|អស់គ្រឿងផ្សំ/i)).toBeDefined()
    })

    // Click confirm reject
    const confirmBtn = screen.getByRole('button', { name: /Confirm Reject|បញ្ជាក់ការបដិសេធ/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onRejectOrder).toHaveBeenCalledWith('order-123', 'Out of ingredients')
    })
  })
})
