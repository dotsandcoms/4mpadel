import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { createExploreHandler } from './api/pro-explore.js'
import path from 'path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'pro-explore-local',
    configureServer(server) {
      const env = loadEnv(server.config.mode, projectDirectory, '');
      const handler = createExploreHandler({ token: () => env.PADEL_API_TOKEN, providerEnv: env });
      server.middlewares.use('/api/pro-explore', (req, res) => {
        req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
        res.status = code => { res.statusCode = code; return res; };
        res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        handler(req, res);
      });
    },
  }],
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
