import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose only browser-safe settings; local maintenance scripts also use server credentials.
  envPrefix: [
    'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY',
    'VITE_YOUTUBE_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY', 'VITE_PAYSTACK_PUBLIC_KEY',
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-helmet-async', 'react-router-dom'],
    alias: {
      '@': path.resolve(projectDirectory, './src'),
      '@burkcorp/reactmath': path.resolve(projectDirectory, './reactmath-package'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-helmet-async',
    ],
  },
})
