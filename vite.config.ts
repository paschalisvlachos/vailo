import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProductionLike = mode === 'production' || env.VITE_APP_ENV === 'staging'

  return {
    base: isProductionLike ? '/app/' : '/',
    plugins: [
      react(),
      tailwindcss(),
    ],
  }
})
