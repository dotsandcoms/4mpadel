import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))
const uploadSentrySourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    uploadSentrySourceMaps && sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      url: process.env.SENTRY_URL,
      telemetry: false,
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    }),
  ],
  build: { sourcemap: uploadSentrySourceMaps ? 'hidden' : false },
  // Shared API helpers also serve the native app. Web builds must not load
  // Expo's tsconfig or require mobile dependencies to transpile those files.
  esbuild: { tsconfigRaw: '{}' },
  // Expose only browser-safe settings; local maintenance scripts also use server credentials.
  envPrefix: [
    'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY',
    'VITE_YOUTUBE_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY', 'VITE_PAYSTACK_PUBLIC_KEY',
    'VITE_POSTHOG_PROJECT_TOKEN', 'VITE_POSTHOG_HOST', 'VITE_SENTRY_DSN', 'VITE_TELEMETRY_ENV',
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
