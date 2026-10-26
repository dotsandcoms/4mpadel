import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith('http://127.0.0.1:5174/') ? request.continue() : request.abort());
  await page.setViewport({ width: 1000, height: 900 });
  const url = 'http://127.0.0.1:5174/tests/admin-preview/club-media-qa.html';
  await page.goto(url);
  await page.waitForSelector('figure');
  assert.equal((await page.$$('figure')).length, 6);
  assert.equal((await page.$$('a')).length, 2);
  assert.ok(await page.$$eval('a', nodes => nodes.every(node => node.protocol === 'https:' && node.rel.includes('noopener'))));
  await page.click('nav button:last-child');
  assert.equal((await page.$$('figure')).length, 2);
  await page.waitForFunction(() => !document.querySelector('img'));
  await page.screenshot({ path: '/private/tmp/club-media-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/private/tmp/club-media-mobile.png', fullPage: true });
  await page.goto(`${url}?malformed`);
  await page.waitForFunction(() => document.body.innerText.includes('gallery record could not be interpreted'));
  assert.match(await page.$eval('body', node => node.innerText), /sponsor list could not be interpreted/);
  console.log('Club media checks passed: pagination, safe links, image fallback, mobile layout and malformed records.');
} finally { await browser.close(); }
