import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(`${origin}/`) ? request.continue() : request.abort());
  for (const scenario of ['', 'denied', 'failure']) {
    await page.goto(`${origin}/tests/admin-preview/quick-creation-qa.html?${scenario}`);
    await page.waitForFunction(() => window.engine);
    await page.evaluate(() => window.engine.setForm(previous => ({ ...previous,
      event_name: 'QA Quick', organiser_name: 'QA Club', start_date: '2026-11-01', end_date: '2026-11-01', start_time: '09:00', end_time: '17:00', registration_closes_at: '2026-10-31T17:00', venue: 'QA Club', payment_method: 'free', require_access_code: true, access_code: 'QAONLY88'
    })));
    await page.waitForFunction(() => window.engine.form.event_name === 'QA Quick');
    await page.click('#save');
    await page.waitForFunction(() => window.finished);
    const state = await page.evaluate(() => ({ writes: window.writes, saved: window.engine.savedDetails, error: window.engine.saveError, closed: window.closeResult }));
    assert.equal(state.closed, undefined, 'Keep the access-code confirmation until Done');
    if (scenario === 'denied') assert.equal(state.writes.length, 0);
    else if (scenario === 'failure') {
      assert.match(state.error, /review Calendar/);
      assert.equal(state.writes.some(write => write.method === 'update'), false);
    } else {
      assert.equal(state.saved.accessCode, 'QAONLY88');
      assert.equal(state.writes[0].payload[0].is_visible, false);
      assert.equal(state.writes[0].payload[0].is_quick_event, true);
      assert.equal(state.writes[0].payload[0].entry_fee, 0);
      assert.equal(state.writes[2].rpc, 'set_event_access_code');
      assert.deepEqual(state.writes[3].payload, { is_visible: true });
    }
    await page.evaluate(() => { window.finished = false; });
    await page.click('#save');
    await page.waitForFunction(() => window.finished);
    assert.equal(await page.evaluate(() => window.writes.length), state.writes.length);
    await page.click('#close');
    assert.equal(await page.evaluate(() => window.closeResult.refresh), scenario !== 'denied');
  }
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${origin}/tests/admin-preview/quick-creation-qa.html?ui`);
    await page.waitForSelector('.ap-quick-event-editor');
    for (let index = 0; index < 5; index++) {
      await page.evaluate(index => document.querySelectorAll('nav[aria-label="Quick event steps"] button')[index].click(), index);
      assert.ok(await page.$eval('.ap-quick-event-editor', node => node.scrollWidth <= node.clientWidth + 1));
    }
    await page.screenshot({ path: `/private/tmp/quick-creation-${width}.png` });
  }
  console.log('Quick creation: save ordering, access code, denied writes, failure retry guard and five-step desktop/mobile layout passed');
} finally { await browser.close(); }
