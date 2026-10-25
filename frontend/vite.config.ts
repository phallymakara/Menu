/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'

function getLocalIp(): string {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
  const wsBackendUrl = backendUrl.replace(/^http/, 'ws')
  const port = Number(env.PORT) || 3000

  return {
    define: {
      __DEV_LAN_IP__: JSON.stringify(getLocalIp()),
    },
    plugins: [react()],
    test: {
      environment: 'jsdom',
      environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
      setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/uploads': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/ws': {
          target: wsBackendUrl,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err: any) => {
              if (err?.code === 'ECONNRESET' || err?.code === 'EPIPE') return
              console.error('[vite] ws proxy error:', err)
            })
          },
        },
      },
    },
  }
})

