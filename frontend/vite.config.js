import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[vite-proxy] Proxy error to backend:', err.message)
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                error: 'Backend API unreachable: Please ensure RippleCheck backend server is running on http://127.0.0.1:3000.'
              }))
            }
          })
        }
      }
    }
  }
})
