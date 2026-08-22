import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LandingPage } from '@/features/landing/LandingPage'
import { GuestOrderPage } from '@/features/guest/GuestOrderPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/t/:qr_token',
    element: <GuestOrderPage />,
  },
  {
    path: '/demo',
    element: <Navigate to="/t/demo-table-08" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
