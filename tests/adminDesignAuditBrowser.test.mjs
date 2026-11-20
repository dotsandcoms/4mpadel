import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const url = 'http://event-activity.fixture.invalid/';
const contents = `
  import { createRoot } from 'react-dom/client';
  import EventActivityLog from './src/pages/admin-preview/EventActivityLog.jsx';
  import './src/pages/AdminPreview.css';
  const event = { id:42, event_name:'Fixture Open' };
  const row = { event_id:42, created_at:'2035-02-01T20:00:00Z', actor_role:'operator',
    actor_email:'private@example.invalid', details:{ private_field:'Private audit detail' } };
  const activity = [
    { ...row, id:'pay', summary:'Payment reviewed', category:'PAYMENT' },
    ...Array.from({length:50},(_,index)=>({ ...row, id:'draw-'+index, summary:'Draw updated '+(index+1), category:'DRAW' })),
    { ...row, id:'foreign', event_id:7, summary:'Foreign event changed', category:'PAYMENT' }
  ];
  window.mountActivity = includePrivate => createRoot(document.getElementById('root')).render(
    <EventActivityLog event={event} activity={activity} includePrivate={includePrivate} />
  );
`;

async function click(page, selector, text) {
  const element = await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].find(
    node => !node.disabled && node.getClientRects().length && node.textContent.includes(text)), {polling:50}, selector, text);
  await element.asElement().click();
}

test('event activity filters, paginates and opens the selected scoped audit record', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), '4m-event-activity-'));
  let browser;
  try {
    const outfile = path.join(folder,'fixture.js');
    await build({ stdin:{contents, loader:'jsx', resolveDir:process.cwd()}, bundle:true, platform:'browser', jsx:'automatic',
      define:{'import.meta.env':'{}'}, outfile });
    browser = await puppeteer.launch({headless:true, args:['--no-sandbox']});
    async function open(includePrivate) {
      const page = await browser.newPage();
      page.setDefaultTimeout(7000);
      await page.setRequestInterception(true);
      page.on('request', request => request.url() === url
        ? request.respond({contentType:'text/html',body:'<main class="ap-root" id="root"></main>'}) : request.abort());
      await page.goto(url);
      await page.addStyleTag({path:path.join(folder,'fixture.css')});
      await page.addScriptTag({path:outfile});
      await page.evaluate(value=>window.mountActivity(value), includePrivate);
      return page;
    }
    const scoped = await open(false);
    await click(scoped,'button','Next');
    await scoped.waitForFunction(()=>document.body.innerText.includes('Showing 51–51 of 51 entries'),{polling:50});
    await click(scoped,'button','Previous');
    await click(scoped,'button','Log options');
    await scoped.click('button[aria-label="Activity category"]');
    await click(scoped,'[role=option]','PAYMENT');
    await click(scoped,'button.ap-activity-row','Payment reviewed');
    const detail = 'dialog[open][aria-label="Event activity"]';
    await scoped.waitForSelector(detail);
    assert.match(await scoped.$eval(detail, node=>node.innerText), /Payment reviewed.*Fixture Open.*operator/s);
    assert.doesNotMatch(await scoped.$eval(detail, node=>node.innerText), /private@example|Private audit detail/);
    await scoped.keyboard.press('Escape');
    await scoped.waitForSelector(detail,{hidden:true});
    await scoped.type('input[placeholder="Search action or actor"]','foreign');
    await scoped.waitForFunction(()=>document.body.innerText.includes('No activity matches these filters.'),{polling:50});
    await click(scoped,'button','Clear activity filters');
    await scoped.waitForFunction(()=>document.body.innerText.includes('Showing 1–50 of 51 entries'),{polling:50});
    await scoped.close();
    const platform = await open(true);
    await click(platform,'button.ap-activity-row','Payment reviewed');
    assert.match(await platform.$eval(detail, node=>node.innerText), /private@example.invalid.*Private audit detail/s);
    await platform.click('button[aria-label="Close event activity"]');
    await platform.waitForSelector(detail,{hidden:true});
  } finally {
    await browser?.close();
    await rm(folder,{recursive:true,force:true});
  }
});
