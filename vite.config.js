import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-helmet-async', 'react-router-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@burkcorp/reactmath': path.resolve(__dirname, './reactmath-package'),
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
