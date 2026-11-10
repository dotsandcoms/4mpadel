import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root = path.resolve('sandbox/private-draw-rehearsal');
export default defineConfig({
    root, envDir: root, publicDir: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
        name: 'private-rehearsal-isolation', enforce: 'pre',
        resolveId(id) {
            if (/supabaseClient(?:\.js)?$/.test(id)) return path.join(root, 'client.js');
            if (/hooks\/useRankedin(?:\.js)?$/.test(id)) return path.join(root, 'rankedin.js');
        },
        generateBundle() {
            for (const id of this.getModuleIds()) {
                if (id.includes('@supabase/') || /src\/supabaseClient/.test(id) || /src\/hooks\/useRankedin/.test(id)) this.error(`Live integration included in private rehearsal: ${id}`);
            }
        },
    }, react()],
    resolve: { alias: { '@burkcorp/reactmath': path.resolve('reactmath-package') } },
    build: {
        outDir: path.resolve('.tmp/private-draw-rehearsal'), emptyOutDir: true, cssCodeSplit: false,
        lib: { entry: path.join(root, 'main.jsx'), name: 'PrivateDrawRehearsal', formats: ['iife'], fileName: () => 'workspace.js', cssFileName: 'workspace' },
        rollupOptions: { output: { inlineDynamicImports: true } },
    },
});
