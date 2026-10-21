import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root=path.resolve('sandbox/draws');
export default defineConfig({root,envDir:root,publicDir:false,plugins:[{name:'staging-only-client',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient')||id.endsWith('supabaseClient.js'))return path.join(root,'client.js');}},react()],resolve:{alias:{'@burkcorp/reactmath':path.resolve('reactmath-package')}},build:{outDir:path.resolve('.tmp/draw-sandbox-dist'),emptyOutDir:true}});
