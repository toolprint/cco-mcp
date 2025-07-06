import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api/audit-log/stream': {
        target: 'http://localhost:8660',
        changeOrigin: true,
        // Important: SSE requires special handling
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('SSE proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // SSE requires these headers
            if (req.url?.includes('/stream')) {
              console.log('Proxying SSE request:', req.url);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Log SSE responses for debugging
            if (req.url?.includes('/stream')) {
              console.log('SSE response headers:', proxyRes.headers);
            }
          });
        },
      },
      '/api': {
        target: 'http://localhost:8660',
        changeOrigin: true,
      }
    }
  }
})