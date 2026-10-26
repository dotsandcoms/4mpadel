import {execFileSync} from 'node:child_process';
import {copyFileSync,readFileSync,readdirSync} from 'node:fs';
execFileSync('npx',['vite','build','--config','sandbox/draws/vite.config.mjs'],{stdio:'inherit'});
const out='.tmp/draw-sandbox-dist';
copyFileSync('sandbox/draws/vercel.json',`${out}/vercel.json`);
const javascript=readdirSync(`${out}/assets`).filter(name=>name.endsWith('.js')).map(name=>readFileSync(`${out}/assets/${name}`,'utf8')).join('\n');
if(!javascript.includes('cefmzkwabdqqoagxhekc')||javascript.includes('uzglrpbixubfijvjbtgz'))throw new Error('Sandbox build failed database isolation check.');
console.log('Verified: staging database only. Deploy .tmp/draw-sandbox-dist to 4mpadel-draw-sandbox.');
