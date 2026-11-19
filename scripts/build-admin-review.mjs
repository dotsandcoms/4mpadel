import { build, loadEnv } from 'vite';
import { readFile, readdir, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('production', root, ''), ...process.env };
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || '').trim();
if (url !== 'https://uzglrpbixubfijvjbtgz.supabase.co') throw new Error('Admin review must point to the existing 4M Supabase project.');
let publicKey = key.startsWith('sb_publishable_') && key.length > 30;
try {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  publicKey = claims.role === 'anon' && claims.ref === 'uzglrpbixubfijvjbtgz';
} catch { /* Publishable keys do not contain JWT claims. */ }
if (!publicKey || key.startsWith('sb_secret_')) throw new Error('A public anon/publishable Supabase key is required; privileged keys are forbidden.');
await import('./build-private-draw-rehearsal.mjs');
await build({ configFile: fileURLToPath(new URL('../vite.admin-review.config.js', import.meta.url)) });
const output = new URL('../dist-admin-review/', import.meta.url);
await copyFile(new URL('../admin-review.vercel.json', import.meta.url), new URL('vercel.json', output));
await mkdir(new URL('private-draw-rehearsal/', output), { recursive: true });
await copyFile(new URL('../public/private-draw-rehearsal/index.html', import.meta.url), new URL('private-draw-rehearsal/index.html', output));
await writeFile(new URL('robots.txt', output), 'User-agent: *\nDisallow: /\n');

// Assert the upload boundary: compiled static assets only, no source or env files.
const files = await readdir(output, { recursive: true, withFileTypes: true });
const privateValues = Object.entries(env).filter(([name, value]) => /TOKEN|PASSWORD|SECRET|SERVICE_ROLE|PRIVATE_KEY/.test(name) && typeof value === 'string' && value.length >= 8).map(([, value]) => value);
for (const file of files) {
  if (!file.isFile()) continue;
  if (!/\.(?:js|css|html|json|txt|png|jpg|jpeg|webp|svg|woff2?)$/.test(file.name) || /^(?:\.env|auth\.json|project\.json|package)/.test(file.name) || file.name.endsWith('.map')) {
    throw new Error(`Unexpected deployment artifact: ${file.name}`);
  }
  if (/\.(?:js|css|html|json|txt)$/.test(file.name)) {
    const text = await readFile(`${file.parentPath}/${file.name}`, 'utf8');
    if (privateValues.some(value => text.includes(value)) || /sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) {
      throw new Error('A private credential was found in the compiled artifact. Deployment is blocked.');
    }
  }
}
const html = await readFile(new URL('admin-review.html', output), 'utf8');
if (html.includes('/src/') || !html.includes('noindex') || html.includes('serviceWorker')) throw new Error('Review entry failed publication checks.');
console.log('4madmin static artifact verified. Live project selected; public key only. No migrations or backend deployments.');
