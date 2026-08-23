import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LandingPage } from '@/features/landing/LandingPage'
import { GuestOrderPage } from '@/features/guest/GuestOrderPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { OnboardingWizardPage } from '@/features/onboarding/OnboardingWizardPage'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { DashboardOverviewTab } from '@/features/admin/pages/DashboardOverviewTab'
import { MenuManagementTab } from '@/features/admin/pages/MenuManagementTab'
import { DiningTablesTab } from '@/features/admin/pages/DiningTablesTab'
import { StoreSettingsTab } from '@/features/admin/pages/StoreSettingsTab'
import { StaffManagementTab } from '@/features/admin/pages/StaffManagementTab'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/onboarding',
    element: <OnboardingWizardPage />,
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <DashboardOverviewTab />,
      },
      {
        path: 'menu',
        element: <MenuManagementTab />,
      },
      {
        path: 'tables',
        element: <DiningTablesTab />,
      },
      {
        path: 'settings',
        element: <StoreSettingsTab />,
      },
      {
        path: 'staff',
        element: <StaffManagementTab />,
      },
    ],
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
