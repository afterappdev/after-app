import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  base: '/app/',
  define: {
    'import.meta.env.BASE_URL': JSON.stringify('/app/'),
  },
  test: {
    environment: 'jsdom',
  },
})
