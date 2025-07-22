import path from "path"
import tailwindcss from "tailwindcss"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://backend.syncsched.com',
        changeOrigin: true,
        secure: false
      },
      '/api/webflow/auth': {
        target: 'https://backend.syncsched.com',
        changeOrigin: true,
        secure: false
      },
      '/api/notion/webhook': {
        target: 'https://backend.syncsched.com',
        changeOrigin: true,
        secure: false
      }
    },
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      'frontend.syncsched.com'
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
