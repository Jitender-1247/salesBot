import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/widget2/',
  plugins: [
    react(),
  ],
  server: {
    port: 5175
  }
})
