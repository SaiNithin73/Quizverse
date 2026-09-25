import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Node server owns the API and Socket.io. In production it also serves the
// built app, so the browser only ever talks to one origin. These proxies give
// the dev server the same behaviour, which keeps the host deck working over
// HTTPS, LAN addresses and tunnels instead of assuming port 3001 is reachable.
const backend = 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/socket.io': { target: backend, changeOrigin: true, ws: true }
    }
  }
})
