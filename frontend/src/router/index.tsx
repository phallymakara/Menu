import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PageLoader } from '@/components/ui/PageLoader'

// Lazy-loaded route components for fast code-splitting and reduced initial bundle size
const LandingPage = lazy(() =>
  import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage }))
)
const GuestOrderPage = lazy(() =>
  import('@/features/guest/GuestOrderPage').then((m) => ({ default: m.GuestOrderPage }))
)
const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const RegisterPage = lazy(() =>
  import('@/features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage }))
)
const OnboardingWizardPage = lazy(() =>
  import('@/features/onboarding/OnboardingWizardPage').then((m) => ({
    default: m.OnboardingWizardPage,
  }))
)
const AdminLayout = lazy(() =>
  import('@/features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout }))
)
const DashboardOverviewTab = lazy(() =>
  import('@/features/admin/pages/DashboardOverviewTab').then((m) => ({
    default: m.DashboardOverviewTab,
  }))
)
const MenuManagementTab = lazy(() =>
  import('@/features/admin/pages/MenuManagementTab').then((m) => ({
    default: m.MenuManagementTab,
  }))
)
const DiningTablesTab = lazy(() =>
  import('@/features/admin/pages/DiningTablesTab').then((m) => ({
    default: m.DiningTablesTab,
  }))
)
const StoreSettingsTab = lazy(() =>
  import('@/features/admin/pages/StoreSettingsTab').then((m) => ({
    default: m.StoreSettingsTab,
  }))
)
const StaffManagementTab = lazy(() =>
  import('@/features/admin/pages/StaffManagementTab').then((m) => ({
    default: m.StaffManagementTab,
  }))
)
const InventoryManagementTab = lazy(() =>
  import('@/features/admin/pages/InventoryManagementTab').then((m) => ({
    default: m.InventoryTab,
  }))
)
const KDSPage = lazy(() =>
  import('@/features/kds/KDSPage').then((m) => ({
    default: m.KDSPage,
  }))
)
const POSPage = lazy(() =>
  import('@/features/pos/POSPage').then((m) => ({
    default: m.POSPage,
  }))
)

// Helper wrapper for Suspense
const withSuspense = (children: ReactNode) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(<LandingPage />),
  },
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/register',
    element: withSuspense(<RegisterPage />),
  },
  {
    path: '/onboarding',
    element: withSuspense(<OnboardingWizardPage />),
  },
  {
    path: '/admin',
    element: withSuspense(<AdminLayout />),
    children: [
      {
        index: true,
        element: withSuspense(<DashboardOverviewTab />),
      },
      {
        path: 'menu',
        element: withSuspense(<MenuManagementTab />),
      },
      {
        path: 'tables',
        element: withSuspense(<DiningTablesTab />),
      },
      {
        path: 'inventory',
        element: withSuspense(<InventoryManagementTab />),
      },
      {
        path: 'inventory/transfers',
        element: withSuspense(<InventoryManagementTab defaultSection="transfers" />),
      },
      {
        path: 'settings',
        element: withSuspense(<StoreSettingsTab />),
      },
      {
        path: 'staff',
        element: withSuspense(<StaffManagementTab />),
      },
      {
        path: 'kds',
        element: withSuspense(<KDSPage />),
      },
      {
        path: 'pos',
        element: withSuspense(<POSPage />),
      },
    ],
  },
  {
    path: '/pos',
    element: withSuspense(<POSPage />),
  },
  {
    path: '/kds',
    element: withSuspense(<KDSPage />),
  },
  {
    path: '/t/:qr_token',
    element: withSuspense(<GuestOrderPage />),
  },
  {
    path: '/order/:branch_id',
    element: withSuspense(<GuestOrderPage />),
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
