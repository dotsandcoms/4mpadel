import { build } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
await build({ configFile: path.resolve('sandbox/private-draw-rehearsal/vite.config.mjs') });
const source = '.tmp/private-draw-rehearsal';
const script = await readFile(`${source}/workspace.js`, 'utf8');
// The isolated workspace uses system fallback fonts and makes no font requests.
const css = (await readFile(`${source}/workspace.css`, 'utf8')).replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g, '');
if (/uzglrpbixubfijvjbtgz|cefmzkwabdqqoagxhekc|sb_publishable_|supabase\.co/.test(script)) throw new Error('Private rehearsal contains a hosted database reference.');
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
await mkdir('public/private-draw-rehearsal', { recursive: true });
await writeFile('public/private-draw-rehearsal/index.html', `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private draw rehearsal</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root" role="status">Opening private rehearsal…</div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>`);
console.log('Private rehearsal built: no hosted database module, credentials or network access.');
