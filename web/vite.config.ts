import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy API calls to the Go backend during local development.
    // npm run dev runs on :5173; the Go server runs on :8080.
    proxy: {
      '/api': 'http://localhost:8080',
      '/api-docs': 'http://localhost:8080',
    },
  },
})
