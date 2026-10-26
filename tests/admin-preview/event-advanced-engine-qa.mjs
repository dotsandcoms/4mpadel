// Run against local Vite: node tests/admin-preview/event-advanced-engine-qa.mjs
// All external requests are mocked or aborted, including every database write.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5175';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const browser = await puppeteer.launch({ headless: true });
try {
  for (const scenario of ['draft', 'publish', 'sanction', 'weekly', 'amendment', 'weekly-amendment', 'denied', 'load-error', 'write-error']) {
    const page = await browser.newPage(), writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.origin === origin) return request.continue();
      if (!url.pathname.startsWith('/rest/v1/')) return request.abort();
      const table = url.pathname.split('/').pop(), method = request.method();
      if (method === 'OPTIONS') return request.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      let data = [], status = 200;
      if (method !== 'GET') {
        writes.push({ table, method, body: JSON.parse(request.postData() || '{}') });
        if (scenario === 'write-error') { status = 400; data = { message: 'Mock failure' }; }
      } else if (table === 'tournament_divisions') {
        data = [{ id: 71, event_id: 61, name: "Men's Open", entry_fee: 600, gender: 'Men', format: 'Knockout', is_active: true, scoring_point: 'golden', license_required: false }];
        if (scenario === 'load-error') { status = 400; data = { message: 'Mock division load failure' }; }
      } else if (table === 'calendar' && scenario.includes('weekly')) {
        data = ['2026-11-20', '2026-11-27', '2026-12-04'].map((date, index) => ({ id: 61 + index, event_name: 'Engine Test Open', start_date: date, end_date: date, slug: `engine-test-${index}`, series_id: 'test-series', is_weekly: true }));
      } else if (table === 'federations') data = [{ id: 'federation-1', name: 'SAPA', slug: 'sapa' }];
      return request.respond({ status, headers, body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/tests/admin-preview/event-advanced-engine-qa.html?scenario=${scenario}`);
    await page.waitForFunction(() => window.engine && !window.engine.loading);
    await page.click(scenario === 'publish' || scenario === 'sanction' ? '#publish' : '#draft');
    await page.waitForFunction(() => window.saveResult);
    const result = await page.evaluate(() => window.saveResult);
    assert.deepEqual(errors, [], `${scenario}: runtime errors`);
    const blocked = ['weekly-amendment', 'denied', 'load-error'].includes(scenario);
    assert.equal(result.success, !blocked && scenario !== 'write-error', scenario);
    assert.equal(result.mutationAttempted, !blocked, scenario);
    if (blocked) assert.equal(writes.length, 0, scenario);
    if (scenario === 'weekly') {
      assert.deepEqual(writes.filter(row => row.table === 'calendar').map(row => row.body.start_date), ['2026-11-20', '2026-11-27', '2026-12-04']);
      assert(writes.every(row => !('slug' in row.body)));
    }
    if (scenario === 'amendment') {
      const row = writes.find(row => row.table === 'calendar').body;
      assert.equal(row.event_name, 'Amendment Name'); assert.equal(row.pending_changes, null); assert.equal(row.pending_changes_status, null);
    }
    if (scenario === 'sanction') assert.equal(writes.find(row => row.table === 'calendar').body.federation_sanction_status, 'pending');
    console.log(`${scenario}: passed (${writes.length} mocked writes)`);
    await page.close();
  }
  const tabs = ['Basics', 'Registration', 'Federation', 'Divisions', 'Media & Branding', 'Review & Publish'];
  const layouts = [];
  for (const legacy of [true, false]) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).origin === origin ? request.continue() : request.abort());
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(origin + '/tests/admin-preview/event-advanced-engine-qa.html?ui' + (legacy ? '&legacy' : ''));
    await page.waitForFunction(() => document.querySelector('input[name=event_name]')?.value === 'Engine Test Open');
    const layout = [];
    for (const tab of tabs) {
      await page.evaluate(tab => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === tab).click(), tab);
      await page.waitForFunction(tab => document.body.textContent.includes('— ' + tab), {}, tab);
      layout.push(await page.evaluate(() => [...document.querySelectorAll('label,input[name],textarea[name],select[name]')].map(el => el.tagName === 'LABEL' ? el.textContent.trim() : el.name)));
    }
    layouts.push(layout);
    assert.equal(await page.evaluate(() => window.mockWrites.length), 0, 'navigation must not write');
    if (!legacy) {
      const clickButton = text => page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text).click(), text);
      const clickGift = text => page.evaluate(text => [...document.querySelectorAll('label')].find(label => label.textContent.includes(text)).querySelector('input').click(), text);
      await clickButton('Registration');
      await clickButton('Player Gifts');
      assert.equal(await page.evaluate(() => document.body.textContent.includes('Allow player logo uploads')), false);
      await clickGift('Match T-shirt');
      await clickGift('Allow sponsor names');
      await clickGift('Allow player logo uploads');
      await clickButton('Save draft');
      await page.waitForFunction(() => window.mockWrites.some(row => row.payload?.allow_tshirt_logo_upload === true));
      assert.equal(await page.evaluate(() => window.mockWrites.find(row => row.table === 'calendar').payload.allow_tshirt_sponsor_name), true);
      await clickGift('Match T-shirt');
      assert.equal(await page.evaluate(() => document.body.textContent.includes('Allow player logo uploads')), false);
      await page.evaluate(() => { window.saved = null; });
      await clickButton('Save draft');
      await page.waitForFunction(() => window.saved);
      assert.equal(await page.evaluate(() => window.mockWrites.filter(row => row.table === 'calendar').at(-1).payload.allow_tshirt_logo_upload), false);
      assert.equal(await page.evaluate(() => window.mockWrites.filter(row => row.table === 'calendar').at(-1).payload.allow_tshirt_sponsor_name), false);
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Basics').click());
      for (const width of [1440, 390]) {
        await page.setViewport({ width, height: 900 });
        assert.equal(await page.evaluate(() => { const box = document.querySelector('.ap-live-event-editor > div'); return box.scrollWidth > box.clientWidth; }), false, 'preview editor overflow');
        await page.screenshot({ path: '/private/tmp/event-editor-parity-' + width + '.png' });
      }
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save draft').click());
      await page.waitForFunction(() => window.saved);
      assert.equal(await page.evaluate(() => window.mockWrites[0].payload.event_name), 'Engine Test Open');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  assert.deepEqual(layouts[1], layouts[0], 'all six tab field layouts must match live EventBuilder');
  console.log('six-tab live/new field parity, desktop/mobile and draft save: passed');
} finally { await browser.close(); }
