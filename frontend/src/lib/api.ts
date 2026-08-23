import axios from 'axios'

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
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
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
      // Optional: Clear tokens or dispatch logout event if not on guest routes
      const path = window.location.pathname
      if (!path.startsWith('/t/')) {
        // Only redirect staff users, guest QR users don't need redirect
        // localStorage.removeItem('emenu_access_token')
      }
    }
    return Promise.reject(error)
  }
)
