import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixture = {
    version: 1, owner_id: 'tester', copied_at: new Date().toISOString(),
    event: { id: 523, event_name: 'Weekend test event', start_date: '2026-11-07', end_date: '2026-11-08', start_time: '08:00', end_time: '18:00', courts_count: 2 },
    divisions: [{ id: 'division', event_id: 523, name: 'Open', is_active: true, sort_order: 0 }],
    registrations: Array.from({ length: 4 }, (_, i) => ({ id: `registration-${i}`, event_id: 523, division_id: 'division', full_name: `Player ${i * 2 + 1}`, email: `one-${i}@example.test`, partner_name: `Player ${i * 2 + 2}`, partner_email: `two-${i}@example.test`, status: 'registered', payment_status: 'paid' })),
    players: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `Player ${i + 1}`, email: `${i % 2 ? 'two' : 'one'}-${Math.floor(i / 2)}@example.test`, points: 800 - i * 50, license_type: 'full' })),
    play_days: [], ranking_tiers: [], ranking_points_table: [],
};
const bundle = await build({
    stdin: { contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import Rehearsal,{PrivateRehearsalEvents} from './src/components/admin/PrivateDrawRehearsal.jsx'; function App(){const[id,setId]=useState(null);return id?<Rehearsal eventId={id} onClose={()=>setId(null)}/>:<PrivateRehearsalEvents onStart={setId}/>;} createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-only', setup(build) {
        build.onResolve({ filter: /supabaseClient/ }, () => ({ path: 'fixture-client', namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const snapshot=${JSON.stringify(fixture)};export const supabase={rpc:async name=>({data:name==='list_private_draw_rehearsal_events'?[snapshot.event]:structuredClone(snapshot),error:null})};` }));
    } }],
});
const css = (await readFile('.tmp/private-draw-rehearsal/workspace.css', 'utf8')).replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g, '');
const workspace = await readFile('public/private-draw-rehearsal/index.html');
const html = `<!doctype html><html><head><style>${css}</style></head><body style="background:#080808"><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`;
const server = createServer((request, response) => { response.setHeader('content-type', 'text/html'); response.end(request.url === '/private-draw-rehearsal/index.html' ? workspace : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.env.REHEARSAL_BROWSER_PREVIEW === '1') {
    console.log(`Synthetic rehearsal preview: ${base}`);
    await new Promise(() => {});
}
let browser;
try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [], externalRequests = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('Page error:', error.message); });
    page.on('console', message => { if (message.type() === 'error') console.log('Browser:', message.text().slice(0, 600)); });
    page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
    await page.goto(base, { waitUntil: 'networkidle0' });
    async function clickText(context, text) {
        const button = await context.waitForFunction(text => {
            const scope = [...document.querySelectorAll('dialog[open]')].at(-1) || document;
            return [...scope.querySelectorAll('button')].find(button => !button.disabled && button.textContent.includes(text));
        }, {}, text);
        await button.asElement().click();
    }
    await clickText(page, 'Start private rehearsal');
    await page.waitForSelector('iframe');
    const frame = await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(() => document.body.innerText.includes('Your tournament at a glance'));
    console.log('Opened isolated event draw workspace');
    await clickText(frame, 'Continue Open');
    await clickText(frame, 'Confirm teams & continue');
    await clickText(frame, 'Generate preview');
    await clickText(frame, 'Save draw & continue');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('4m-private-draw-rehearsal-v1:tester:523'))?.tables?.draw_matches?.length === 3);
    await mkdir('.tmp/private-rehearsal-qa', { recursive: true });
    await page.screenshot({ path: '.tmp/private-rehearsal-qa/desktop.png', fullPage: true });
    console.log('Reviewed entrants, generated and saved the rehearsal draw');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('4m-private-draw-rehearsal-v1:tester:523')));
    assert.equal(saved.tables.draws.length, 1);
    assert.equal(saved.tables.draw_matches.length, 3);
    await clickText(frame, 'Automatically schedule tournament');
    await clickText(frame, 'Save schedule');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('4m-private-draw-rehearsal-v1:tester:523')).tables.draw_matches.every(match => match.scheduled_start));
    await clickText(frame, 'Close calendar');
    await clickText(frame, 'Publish & continue to results');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('4m-private-draw-rehearsal-v1:tester:523')).tables.draws[0].status === 'published');
    console.log('Scheduled and published the rehearsal without external requests');
    await clickText(page, 'Leave rehearsal');
    await clickText(page, 'Start private rehearsal');
    const reopened = await page.waitForFrame(frame => frame.parentFrame() && frame.url().endsWith('/private-draw-rehearsal/index.html'));
    await reopened.waitForFunction(() => document.body?.innerText.includes('Your tournament at a glance'));
    await clickText(reopened, 'Continue Open');
    await reopened.waitForFunction(() => [...document.querySelectorAll('h2')].some(heading => heading.textContent === 'Results & points'));
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: '.tmp/private-rehearsal-qa/mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const protectedFrame = await page.$eval('iframe', iframe => ({ sandbox: iframe.getAttribute('sandbox'), referrer: iframe.referrerPolicy }));
    assert.equal(protectedFrame.sandbox, 'allow-scripts allow-downloads');
    assert.equal(protectedFrame.referrer, 'no-referrer');
    const checks = await reopened.evaluate(async () => {
        let storageBlocked = false, parentBlocked = false, networkBlocked = false;
        try { void localStorage.length; } catch { storageBlocked = true; }
        try { void window.parent.document.body; } catch { parentBlocked = true; }
        try { await fetch('https://example.com/rehearsal-safety-check'); } catch { networkBlocked = true; }
        return { storageBlocked, parentBlocked, networkBlocked, csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content };
    });
    assert.equal(checks.storageBlocked, true); assert.equal(checks.parentBlocked, true); assert.equal(checks.networkBlocked, true);
    assert.ok(checks.csp.includes("connect-src 'none'"));
    // A blocked test fetch can appear as a request event; no integration may be attempted by the workflow.
    assert.deepEqual(externalRequests.filter(url => !url.includes('rehearsal-safety-check')), []);
    assert.deepEqual(errors, []);
    console.log('Passed: save/reopen, mobile layout, no parent/token access, no external workflow requests, CSP blocks network.');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
