import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  for (const denied of [false, true]) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(`${origin}/`) ? request.continue() : request.abort());
    await page.goto(`${origin}/tests/admin-preview/event-creation-qa.html${denied ? '?denied' : ''}`);
    await page.waitForFunction(() => window.engine?.ready);
    await page.evaluate(() => {
      window.engine.setForm(previous => ({ ...previous, event_name: 'Mock new event', start_date: '2026-11-01', end_date: '2026-11-02', venues: ['Mock Club'], city: 'Cape Town' }));
      window.engine.setDivisions([{ name: 'Open', entry_fee: 600 }]);
    });
    await page.waitForFunction(() => window.engine.form.event_name === 'Mock new event');
    await page.click('#draft');
    await page.waitForFunction(() => window.result);
    const state = await page.evaluate(() => ({ result: window.result, writes: window.writes, close: window.closeResult }));
    if (denied) {
      assert.equal(state.result.success, false);
      assert.equal(state.writes.length, 0);
      await page.click('#close');
      assert.deepEqual(await page.evaluate(() => window.closeResult), { refresh: false });
    } else {
      assert.equal(state.result.success, true);
      assert.deepEqual(state.close, { refresh: true, eventId: 777 });
      const inserts = state.writes.filter(write => write.table === 'calendar' && write.method === 'insert');
      assert.equal(inserts.length, 1);
      assert.equal(inserts[0].payload[0].is_visible, false);
      assert.equal(inserts[0].payload[0].event_name, 'Mock new event');
      assert.equal(state.writes.some(write => write.method === 'update'), false);
      // The real parent unmounts on success. Even if it did not, no repeat write.
      await page.evaluate(() => { window.result = null; });
      await page.click('#draft');
      await page.waitForFunction(() => window.result);
      assert.equal(await page.evaluate(() => window.writes.length), state.writes.length);
    }
    await page.close();
  }
  console.log('Actual creation engine: hidden draft insert, division save, saved-ID handoff, denied access and duplicate-save prevention passed');
} finally { await browser.close(); }
