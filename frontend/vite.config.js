import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { env } from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: env.PSICOPANEL_USE_POLLING === 'true',
      interval: 300,
    },
  },
})
