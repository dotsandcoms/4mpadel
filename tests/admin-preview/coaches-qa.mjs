import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(`${origin}/`) ? request.continue() : request.abort());
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${origin}/tests/admin-preview/coaches-qa.html`);
    await page.waitForSelector('.co-person');
    assert.equal(await page.$$eval('tbody tr', rows => rows.length), 25);
    await page.type('.co-filters input', 'coach1@example.test');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    const calls = await page.evaluate(() => window.coachCalls.length);
    // Every non-name cell opens the same profile; keyboard name activation remains.
    for (const column of [2, 3, 4, 5, 6]) {
      await page.$eval(`tbody tr td:nth-child(${column})`, cell => cell.click());
      await page.waitForSelector('dialog[open]');
      assert.ok(page.url().includes('coach=1'));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    }
    await page.focus('.co-person');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    assert.ok(await page.$eval('dialog', node => node.scrollWidth <= node.clientWidth + 1));
    await page.screenshot({ path: `/private/tmp/coaches-${width}.png` });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.coachCalls.length), calls);
    assert.ok(page.url().includes('coach_q='));
  }
  await page.goto(`${origin}/tests/admin-preview/coaches-qa.html?denied`);
  await page.waitForFunction(() => document.body.textContent.includes('No applications have been requested'));
  assert.equal(await page.evaluate(() => window.coachCalls.length), 0);
  console.log('Coaches: pagination, email search, drawer, retained filter, no reload on close, access gate and responsive layout passed');
} finally { await browser.close(); }
