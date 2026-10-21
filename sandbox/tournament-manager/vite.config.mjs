import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root = path.resolve('sandbox/tournament-manager');
export default defineConfig({
    root, envDir: root, publicDir: false,
    plugins: [{ name: 'local-only-tournament-client', enforce: 'pre', resolveId(id) {
        if (id.endsWith('supabaseClient') || id.endsWith('supabaseClient.js')) return path.join(root, 'client.js');
    } }, react()],
    server: { host: '127.0.0.1', port: 5186, strictPort: true },
    build: { outDir: path.resolve('.tmp/tournament-manager-demo'), emptyOutDir: true },
});
