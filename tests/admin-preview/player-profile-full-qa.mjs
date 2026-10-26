import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(origin + '/') ? req.continue() : req.abort());
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(origin + '/tests/admin-preview/player-profile-edit-qa.html');
    await page.waitForSelector('select[name=racket_brand]');
    assert.deepEqual(await page.$$eval('select[name=racket_brand] option', options => options.map(o => o.value)), ['', 'Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux', 'Other']);
    for (const name of ['name', 'email', 'contact_number', 'nationality', 'gender', 'age_group', 'category', 'region', 'level', 'club_id', 'rank_label', 'points', 'win_rate', 'image_url', 'sponsors', 'bio', 'approved']) assert.ok(await page.$(`[name="${name}"]`), name);
    assert.equal(await page.$('[name="license_type"]'),null);
    assert.equal(await page.$('[name="paid_registration"]'),null);
    await page.select('[name=racket_brand]', 'Other');
    await page.type('[name=custom_racket_brand]', 'Custom Brand');
    await page.select('[name=club_id]', '1');
    await page.type('[name=points]', '125');
    await page.type('[name=sponsors]', 'Sponsor A, Sponsor B');
    assert.ok(await page.$eval('dialog', el => el.scrollWidth <= el.clientWidth + 1));
    await page.$eval('[name=racket_brand]', el => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `/private/tmp/player-profile-${width}.png` });
    await page.$eval('button.ap-primary', el => el.click());
    await page.waitForFunction(() => document.body.textContent.includes('Confirm profile changes'));
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await page.$eval('button.ap-primary', el => el.click());
    await page.waitForFunction(() => window.saved);
    assert.deepEqual(await page.evaluate(() => window.writes), [{ racket_brand: 'Custom Brand', points: 125, sponsors: '["Sponsor A","Sponsor B"]', club_id: 1, home_club: 'Test Club' }]);
  }
  assert.deepEqual(errors, []);
  console.log('Full player editor: source fields, dropdown/Other, club mapping, licence projections excluded, review-before-write, desktop/mobile passed.');
} finally { await browser.close(); }
