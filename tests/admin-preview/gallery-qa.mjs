import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({
  headless: true
});
try {
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.setRequestInterception(true);
  page.on('request', r => {
    if(process.env.GALLERY_QA_DEBUG) console.log(r.url());
    if (r.url().endsWith('/qa-gallery-image.svg')) return r.respond({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#315c46"/><circle cx="240" cy="160" r="70" fill="#c1e736"/></svg>'
    });
    if (/^(http:\/\/127\.0\.0\.1:5175\/|blob:|data:)/.test(r.url())) r.continue();else r.abort();
  });
  const click = async text => page.evaluate(text => {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    if (!b) throw Error('Missing ' + text);
    b.click();
  }, text);
  for (const width of [1440, 390]) {
    await page.setViewport({
      width,
      height: 1000
    });
    await page.goto('http://127.0.0.1:5175/tests/admin-preview/gallery-qa.html', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForSelector('.gw-album');
    await page.screenshot({
      path: `/private/tmp/gallery-${width}.png`
    });
    await page.click('.gw-album');
    await page.waitForSelector('.gw-photo');
    await page.click('.gw-photo-open');
    await page.waitForSelector('dialog[open]');
    await click('Use as cover locally');
    await click('Apply local change');
    await page.keyboard.press('Escape');
    await click('Edit album');
    await page.waitForSelector('.gw-fields');
    await page.screenshot({
      path: `/private/tmp/gallery-editor-${width}.png`
    });
    assert(await page.$('.ap-select-trigger'));
    await click('Review album');
    await click('Apply local album draft');
    await click('Shell refresh');
    await page.waitForSelector('dialog[open]');
    await click('Cancel');
    assert.equal(await page.evaluate(() => window.galleryQA.writes.length), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.goto('http://127.0.0.1:5175/tests/admin-preview/gallery-qa.html?restricted', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gw-album');
  assert.equal(await page.$$('.gw-album').then(rows => rows.length), 1);
  assert.equal(await page.evaluate(() => document.body.textContent.includes('Create album draft')), false);
  await page.click('.gw-album');
  await page.waitForSelector('.gw-photo');
  assert.equal(await page.evaluate(() => document.body.textContent.includes('Edit album')), false);
  await page.goto('http://127.0.0.1:5175/tests/admin-preview/gallery-qa.html?persistent', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gw-album');
  await page.click('.gw-album');
  await page.waitForSelector('.gw-photo');
  await page.click('.gw-photo-open');
  await click('Use as cover');
  assert.equal(await page.evaluate(() => window.galleryQA.simulated.length), 0);
  await click('Confirm staging change');
  await page.waitForFunction(() => window.galleryQA.simulated.length === 1);
  await page.keyboard.press('Escape');
  await click('Edit album');
  await click('Review album');
  assert.equal(await page.evaluate(() => window.galleryQA.simulated.length), 1);
  await click('Save album to staging');
  await page.waitForFunction(() => window.galleryQA.simulated.length === 2);
  await page.$('input[type=file]').then(input=>input.uploadFile('/private/tmp/gallery-1440.png'));
  await page.waitForSelector('dialog[open]');
  assert.equal(await page.evaluate(() => window.galleryQA.simulated.length), 2);
  await click('Confirm staging change');
  await page.waitForFunction(() => window.galleryQA.simulated.length === 3);
  await page.waitForFunction(() => document.querySelectorAll('.gw-photo').length === 3);
  await click('Select all photos');
  await click('Remove selected (3)');
  await click('Confirm staging change');
  await page.waitForFunction(() => window.galleryQA.simulated.length === 4);
  await page.waitForFunction(() => document.querySelectorAll('.gw-photo').length === 0);
  assert.equal(await page.evaluate(() => window.galleryQA.writes.length), 0);
  await page.goto('http://127.0.0.1:5175/tests/admin-preview/gallery-qa.html?persistent&failure', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gw-album');
  await page.click('.gw-album');
  await page.waitForSelector('.gw-photo');
  await page.click('.gw-photo-open');
  await click('Use as cover');
  await click('Confirm staging change');
  await page.waitForFunction(() => document.body.textContent.includes('Synthetic uncertain outcome'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm staging change').disabled),true);
  assert.equal(await page.evaluate(() => window.galleryQA.simulated.length), 1);
  console.log('Gallery QA passed desktop/mobile, restricted controls, album/photo opening, cover/editor review, mocked staging confirmation and refresh discard; zero real writes.');
} finally {
  await browser.close();
}
