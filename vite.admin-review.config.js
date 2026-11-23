import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import baseConfig from './vite.config.js';

export default mergeConfig(baseConfig, defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-admin-review',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: fileURLToPath(new URL('./admin-review.html', import.meta.url)) },
  },
}));
