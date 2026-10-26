// Run with the local preview server: node tests/admin-preview/gateway-browser-check.mjs
// Synthetic fixture only; no live or staging API requests permitted.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:5174/') && !url.startsWith('data:')) {
      external.push(new URL(url).origin); request.abort();
    } else request.continue();
  });
  const click = label => page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent === text)?.click(), label);
  const ready = () => page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0);
  const base = 'http://127.0.0.1:5174/tests/admin-preview/gateway-qa.html';
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base); await ready();
  assert.equal(await page.$$eval('tbody tr', rows => rows.length), 10);
  assert.ok(await page.evaluate(() => document.body.textContent.includes('Synthetic Coastal Open')));
  for (const label of ['Records agree', 'Differences found', 'Incomplete comparison', 'Not compared', 'Amount differs']) {
    assert.ok(await page.evaluate(text => document.body.textContent.includes(text), label), label);
  }
  await page.screenshot({ path: '/private/tmp/gateway-comparisons.png' });
  await click('Next');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
  await page.select('select', 'failed'); await ready();
  assert.equal(await page.$$eval('tbody tr', rows => rows.length), 10);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('tbody tr')].every(row => row.cells[3].textContent === 'failed')));
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
  await click('Export page to Excel');
  await page.waitForFunction(() => document.body.textContent.includes('10 transactions from page 1 only'));
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow');
  assert.ok(await page.$eval('.fo-table-scroll', node => node.scrollWidth > node.clientWidth), 'Wide table stays in its own scroll region');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await click('Refresh gateway');
  await page.waitForSelector('.ap-loading-track');
  assert.equal(await page.$eval('.ap-loading-track span', node => getComputedStyle(node).animationName), 'none');
  await ready();
  await page.screenshot({ path: '/private/tmp/gateway-mobile-checked.png' });
  await page.goto(`${base}?blocked`);
  await page.waitForFunction(() => document.body.textContent.includes('requests are disabled'));
  assert.equal(await page.$$eval('tbody tr', rows => rows.length), 0);
  await page.goto(`${base}?error`);
  await page.waitForSelector('[role="alert"]');
  assert.ok(await page.evaluate(() => document.body.textContent.includes('took too long')));
  assert.deepEqual(errors, []);
  // Existing app styles may request fonts. Financial/API calls must never occur.
  assert.ok(external.every(origin => !origin.includes('supabase') && !origin.includes('paystack')));
  console.log('PASS: pagination, filters, names, export, mobile overflow, reduced motion, blocked environment and error state. No API calls.');
} finally { await browser.close(); }
