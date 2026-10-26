import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

// Synthetic client and editor only; all external requests are blocked.
const origin = 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(`${origin}/`) ? request.continue() : request.abort());
  const click = async text => assert.ok(await page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
    button?.click();
    return Boolean(button);
  }, text), `Button: ${text}`);
  const reads = () => page.evaluate(() => window.calendarQA.client.calls.filter(call => call.table === 'calendar').length);
  await page.goto(`${origin}/tests/admin-preview/calendar-qa.html?integration=1&calendarEvent=9000&calView=list&cal_q=QA&calPage=2`);
  await page.waitForSelector('.cw-record-footer');
  const initialReads = await reads();
  await click('More actions');
  await click('Edit event details');
  await page.waitForSelector('[aria-label="Mock shared event editor"]');
  assert.equal(await page.$('.cw-editor'), null, 'Not the demo setup form');
  await click('Close without saving');
  await page.waitForSelector('.cw-record-footer');
  assert.equal(await reads(), initialReads, 'Closing without changes must not reread Calendar');
  assert.ok(page.url().includes('calPage=2'));
  await click('More actions');
  await click('Edit event details');
  await page.waitForSelector('[aria-label="Mock shared event editor"]');
  await click('Simulate saved change');
  await page.waitForFunction(() => document.querySelector('.cw-record-heading h3')?.textContent === 'QA updated event');
  // The 105-row fixture requires two pages per complete load.
  assert.equal(await reads(), initialReads * 2, 'One complete refresh after an attempted change');
  assert.ok(page.url().includes('cal_q=QA'));
  assert.ok(page.url().includes('calendarEvent=9000'));
  for (const query of ['calendarEvent=9000', 'integration=1&calendarEvent=9001']) {
    await page.goto(`${origin}/tests/admin-preview/calendar-qa.html?${query}`);
    await page.waitForSelector('.cw-record-footer');
    await click('More actions');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Edit event details')), false);
  }
  await page.goto(`${origin}/tests/admin-preview/calendar-qa.html?integration=1&calendarEvent=9002`);
  await page.waitForSelector('.cw-record-footer');
  const quickReads = await reads();
  await click('More actions');
  await click('Edit event details');
  await page.waitForSelector('[data-quick-editor]');
  await click('Close without saving');
  await page.waitForSelector('.cw-record-footer');
  assert.equal(await reads(), quickReads, 'Quick editor close without saving does not reload');
  await page.goto(`${origin}/tests/admin-preview/calendar-qa.html?integration=1&calView=list`);
  await page.waitForFunction(() => window.calendarQA.client.calls.some(call => call.table === 'calendar'));
  await click('Create event');
  await page.waitForSelector('[aria-label="Mock creation editor"]');
  await click('Simulate creation');
  await page.waitForFunction(() => document.querySelector('.cw-record-heading h3')?.textContent === 'QA newly created event');
  assert.ok(page.url().includes('calendarEvent=9999'));
  console.log('Calendar editor routing, no-op close, paginated refresh, filter retention, access/source gates and newly created event handoff: passed');
} finally {
  await browser.close();
}
