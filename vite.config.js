import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
const reactPath = path.resolve(__dirname, './node_modules/react')
const reactDomPath = path.resolve(__dirname, './node_modules/react-dom')

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-helmet-async'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@burkcorp/reactmath': path.resolve(__dirname, './reactmath-package'),
      react: reactPath,
      'react/jsx-runtime': path.join(reactPath, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(reactPath, 'jsx-dev-runtime.js'),
      'react-dom': reactDomPath,
      'react-dom/client': path.join(reactDomPath, 'client.js'),
      'react-helmet-async': path.resolve(__dirname, './node_modules/react-helmet-async'),
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
