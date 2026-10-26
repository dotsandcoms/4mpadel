import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(origin + '/') ? request.continue() : request.abort());
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(origin + '/tests/admin-preview/coaches-qa.html');
    await page.waitForSelector('.co-person');
    await page.click('.co-person');
    await page.waitForSelector('.co-decision .ap-primary');
    const reads = await page.evaluate(() => window.coachCalls.length);
    await page.$eval('.co-decision .ap-primary', el => el.click());
    assert.equal(await page.evaluate(() => window.coachWrites.length), 0);
    await page.$eval('.co-decision', el => el.scrollIntoView({ block: 'center' }));
    assert.ok(await page.$eval('dialog', el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: `/private/tmp/coach-decision-${width}.png` });
    await page.$eval('.co-decision .ap-primary', el => el.click());
    await page.waitForFunction(() => document.querySelector('dialog .ap-status')?.textContent === 'approved');
    assert.deepEqual(await page.evaluate(() => window.coachWrites), [{ status: 'approved' }]);
    assert.equal(await page.evaluate(() => window.coachCalls.length), reads);
    await page.keyboard.press('Escape');
    assert.equal(await page.$('dialog[open]'), null);
  }
  await page.goto(origin + '/tests/admin-preview/coaches-qa.html?conflict');
  await page.waitForSelector('.co-person'); await page.click('.co-person');
  await page.$eval('.co-decision .ap-danger-button', el => el.click());
  await page.$eval('.co-decision .ap-danger-button', el => el.click());
  await page.waitForSelector('.co-decision [role=alert]');
  assert.ok(await page.$eval('.co-decision .ap-danger-button', el => el.disabled));
  assert.equal(await page.$eval('dialog .ap-status', el => el.textContent), 'pending');
  console.log('Coach decisions: confirmation, status-only save, no directory reload, failure lock, desktop/mobile passed.');
} finally { await browser.close(); }
