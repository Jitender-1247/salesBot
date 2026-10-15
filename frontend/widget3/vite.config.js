import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/widget3/',
  plugins: [
    react(),
  ],
  server: {
    port: 5176
  }
})
