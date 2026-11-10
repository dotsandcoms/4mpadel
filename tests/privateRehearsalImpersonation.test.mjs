import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';

// Mount the actual Admin -> EventManagement -> rehearsal entry chain. The
// authenticated actor deliberately differs from the impersonated UI identity.
const bundle = await build({
    stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Admin from './src/pages/Admin.jsx';
            if(new URLSearchParams(location.search).get('mode')==='impersonated') sessionStorage.setItem('admin_test_login_email','greggogoski@gmail.com');
            else sessionStorage.removeItem('admin_test_login_email');
            createRoot(document.getElementById('root')).render(<Admin/>);`,
        resolveDir: process.cwd(), loader: 'jsx',
    },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'rehearsal-access-fixture', setup(builder) {
        builder.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
        builder.onResolve({ filter: /useAdminFeedNotifications$/ }, () => ({ path: 'notifications', namespace: 'fixture' }));
        builder.onResolve({ filter: /\/components\/admin\// }, args => args.importer.endsWith('/src/pages/Admin.jsx') && !args.path.endsWith('/EventManagement') ? { path: 'component', namespace: 'fixture' } : null);
        builder.onResolve({ filter: /^\.\/(?:EventFinance|EventMessaging)$/ }, args => args.importer.endsWith('/EventManagement.jsx') ? { path: args.path.endsWith('/EventFinance') ? 'finance' : 'component', namespace: 'fixture' } : null);
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: process.cwd(), contents: path === 'client' ? `
            const mode=new URLSearchParams(location.search).get('mode');
            const email=mode==='impersonated'?'markstillerman@gmail.com':mode==='outsider'?'other@example.test':'greggogoski@gmail.com';
            const actor={id:'authenticated-actor',email};
            window.__rehearsalCalls=[];
            export const supabase={
                auth:{getSession:async()=>({data:{session:{user:actor}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
                rpc:async(name,args)=>{window.__rehearsalCalls.push({name,args,actor:actor.email});
                    if(name==='can_start_private_draw_rehearsal')return {data:mode!=='outsider',error:null};
                    if(name==='list_private_draw_rehearsal_events')return {data:[{id:523,event_name:'Miks weekend fixture',start_date:'2026-11-06'}],error:null};
                    if(name==='private_draw_rehearsal_snapshot')return {data:{version:1,owner_id:actor.id,event:{id:523,event_name:'Miks weekend fixture'}},error:null};
                    throw new Error('Unexpected RPC '+name);
                },
                from:table=>{const query={then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)},
                    single:async()=>({data:table==='admin_sidebar_permissions'?{role:'custom',allowed_tabs:['event-mgmt'],module_permissions:{}}:null,error:null}),
                    maybeSingle:async()=>({data:null,error:null})};
                    for(const method of ['select','ilike','eq','in','order','limit'])query[method]=()=>query;return query;}
            };` : path === 'notifications' ? 'export const useAdminFeedNotifications=()=>({notifications:[]});' : path === 'finance' ? 'import React from "react";export default function Finance({onStartRehearsal}){return React.createElement("div",null,"Live event manager fixture",onStartRehearsal&&React.createElement("button",{onClick:()=>onStartRehearsal(523)},"Start private rehearsal"));}' : 'import React from "react";export default function Component(){return React.createElement("div",null,"Live event manager fixture");}' }));
    } }],
});

for (const mode of ['impersonated', 'direct', 'outsider']) test(`private rehearsal access: ${mode}`, async () => {
    const html = `<!doctype html><html><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`;
    const server = createServer((request, response) => {
        response.setHeader('content-type', 'text/html');
        response.end(request.url.startsWith('/private-draw-rehearsal/') ? '<!doctype html><html><body>Isolated frame fixture</body></html>' : html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/admin?tab=event-mgmt&mode=${mode}`);
        if (mode === 'outsider') {
            await page.waitForFunction(() => document.body.innerText.includes('Live event manager fixture'));
            assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Start private rehearsal'))), false);
            assert.equal(await page.evaluate(() => window.__rehearsalCalls.length), 0);
        } else {
            const start = await page.waitForFunction(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Start private rehearsal')));
            await start.asElement().click();
            await page.waitForSelector('dialog[open]', { timeout: 3000 });
            await page.waitForSelector('iframe[title="Private event draw workspace"]');
            const calls = await page.evaluate(() => window.__rehearsalCalls);
            assert.equal(calls.filter(call => call.name === 'private_draw_rehearsal_snapshot').length, 1);
            assert.equal(calls.find(call => call.name === 'private_draw_rehearsal_snapshot').actor, mode === 'impersonated' ? 'markstillerman@gmail.com' : 'greggogoski@gmail.com');
            assert.ok(calls.every(call => ['can_start_private_draw_rehearsal', 'list_private_draw_rehearsal_events', 'private_draw_rehearsal_snapshot'].includes(call.name)));
        }
        assert.deepEqual(errors, []);
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
