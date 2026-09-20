import axios from 'axios'
import { useAuthStore } from '@/stores/useAuthStore'

export const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: Attach JWT token and Tenant ID if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('emenu_access_token')
    // Ensure token is a valid JWT format (3 parts separated by dots)
    if (token) {
      if (token.startsWith('token_') || token.split('.').length !== 3) {
        // Clear corrupt or mock token
        localStorage.removeItem('emenu_access_token')
      } else if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    const tenantId =
      localStorage.getItem('emenu_tenant_id') ||
      localStorage.getItem('emenu_organization_id')
    if (tenantId && config.headers) {
      config.headers['X-Tenant-ID'] = tenantId
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: Global error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname
      // QR guest customer routes start with /t/ or /order/
      if (!path.startsWith('/t/') && !path.startsWith('/order/')) {
        // Clear auth store state & localStorage to stop endless 401 spam
        useAuthStore.getState().logout()

        // If on admin or protected route, redirect to home page with login modal trigger
        if (
          path.startsWith('/admin') ||
          path.startsWith('/pos') ||
          path.startsWith('/kds') ||
          path.startsWith('/onboarding')
        ) {
          if (!window.location.search.includes('auth=login')) {
            window.location.href = '/?auth=login'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)
