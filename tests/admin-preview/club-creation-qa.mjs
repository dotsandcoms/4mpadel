import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.setRequestInterception(true);
  const blocked = [];
  page.on('request', request => { if (/^(http:\/\/127\.0\.0\.1:5175\/|data:|blob:)/.test(request.url())) request.continue(); else { blocked.push(request.url()); request.abort(); } });
  const base = 'http://127.0.0.1:5175/tests/admin-preview/club-creation-qa.html';
  const click = async text => page.evaluate(text => { const item = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text); if (!item) throw new Error(`Missing ${text}`); item.click(); }, text);
  const waitTitle = text => page.waitForFunction(text => [...document.querySelectorAll('h3')].some(h => h.textContent === text), {}, text);
  const fill = async (placeholder, value) => { await page.type(`input[placeholder="${placeholder}"]`, value); };
  const upload = async () => page.evaluate(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['synthetic image'], 'qa.png', { type: 'image/png' })); const input = document.querySelector('.club-create-preview input[type=file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); });
  const fit = async (width, phase) => {
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.club-create-preview input:not([type=file]),.club-create-preview textarea,.club-create-preview .ap-select-trigger,.club-create-preview button')].filter(el => { const r = el.getBoundingClientRect(); return el.getClientRects().length && (r.left < -1 || r.right > innerWidth + 1); }).map(el => el.textContent || el.outerHTML.slice(0, 80)));
    assert.deepEqual(overflow, [], `${width} ${phase} overflow`);
    await page.screenshot({ path: `/private/tmp/club-creation-${width}-${phase}.png` });
    const footer = await page.$('.club-create-footer');
    if (footer) {
      await footer.evaluate(el => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
      const box = await footer.boundingBox(); assert(box.y >= 0 && box.y + box.height <= (width === 390 ? 844 : 1000) + 1, `${phase} footer reachable`);
      await page.screenshot({ path: `/private/tmp/club-creation-${width}-${phase}-footer.png` });
    }
  };
  const flow = async (width, query = '') => {
    await page.setViewport({ width, height: width === 390 ? 844 : 1000 }); await page.goto(`${base}${query}`); await waitTitle('Basic information');
    await fit(width, 'basic'); await fill('e.g. Net Set Sandton City', 'Synthetic New Club'); await fill('e.g. Premium rooftop padel in Sandton City.', 'Play together');
    if (width === 1440) { await upload(); await page.waitForSelector('img[alt="Club logo"]'); assert.equal(await page.evaluate(() => window.clubCreationQA.uploads.length), 1); }
    // Exercise the actual searchable control, not only the hidden select.
    await page.click('.ap-select-trigger'); await page.type('.ap-select-search input', 'Private');
    await page.evaluate(() => [...document.querySelectorAll('.ap-select-popover.is-open [role=option]')].find(option => option.textContent.includes('Private')).click());
    await click('Continue'); await waitTitle('Where are you located?');
    await fill('Start typing to search…', '123 Synthetic Road'); await fill('e.g. Sandton', 'Cape Town');
    if (width === 1440) {
      await page.waitForFunction(() => typeof window.clubCreationQA.choosePlace === 'function');
      await page.evaluate(() => window.clubCreationQA.choosePlace({ formatted_address: '123 Synthetic Road', address_components: [{ types: ['locality'], long_name: 'Cape Town' }, { types: ['administrative_area_level_1'], long_name: 'Western Cape' }], geometry: { location: { lat: () => -33.9, lng: () => 18.4 } } }));
    }
    await page.evaluate(() => { const select = [...document.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'Western Cape')); select.value = 'Western Cape'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await fit(width, 'location'); await click('Continue'); await waitTitle('What facilities do you offer?'); await click('Parking'); await click('Coaching'); await fit(width, 'facilities');
    await click('Continue'); await waitTitle('Tell us about your courts'); await fit(width, 'courts');
    await click('Continue'); await waitTitle('Add photos of your club'); await fit(width, 'photos');
    if (width === 1440) { await upload(); await page.waitForFunction(() => document.querySelector('.club-create-preview .aspect-square img')); await page.click('.club-create-preview button.aspect-square'); await click('Courts'); assert.equal(await page.evaluate(() => window.clubCreationQA.uploads.length), 2); }
    await click('Continue'); await waitTitle('Opening hours'); await fit(width, 'hours');
    await click('Customise individual days'); await fit(width, 'hours-custom'); await click('Continue'); await waitTitle('Review & publish'); await fit(width, 'review');
    assert.equal(await page.evaluate(() => window.clubCreationQA.writes.length), 0);
  };
  for (const width of [1440, 390]) {
    await flow(width); await click('Publish Club'); await waitTitle('Creating your club…'); await fit(width, 'publishing');
    await page.keyboard.press('Escape'); assert(await page.$('dialog[open]'), 'busy Escape keeps dialog open');
    await waitTitle('Your club is live!'); await fit(width, 'success');
    const state = await page.evaluate(() => window.clubCreationQA);
    assert.equal(state.writes.length, 1); assert.equal(state.writes[0].table, 'clubs');
    const payload = state.writes[0].payload[0]; assert.equal(payload.name, 'Synthetic New Club'); assert.equal(payload.status, 'published'); assert.equal(payload.verified, true);
    assert.equal(payload.province, 'Western Cape'); assert.equal(payload.courts.outdoor.count, 4);
    assert.deepEqual(payload.services.map(item => item.title), ['Parking', 'Coaching']);
    if (width === 1440) { assert(payload.logo_url.startsWith('data:image')); assert.equal(payload.gallery.length, 1); assert.equal(payload.gallery[0].category, 'courts'); assert.equal(payload.lat, -33.9); assert.equal(payload.lng, 18.4); }
    assert.equal(state.emails.length, 0); assert(state.guards.length >= 2, 'fresh authorization before insert');
    await click('Open club profile'); assert.equal(await page.evaluate(() => window.clubCreationQA.completed.id), 'created-qa');
  }
  await page.goto(`${base}?uploadFailure`); await waitTitle('Basic information'); await upload();
  await page.waitForFunction(() => document.querySelector('.club-create-preview [role=alert]')?.textContent.includes('Synthetic upload failed'));
  assert.equal(await page.evaluate(() => window.clubCreationQA.uploads.length), 1);
  assert.equal(await page.$eval('.club-create-preview input[type=file]', input => input.disabled), true);
  await upload(); assert.equal(await page.evaluate(() => window.clubCreationQA.uploads.length), 1, 'failed upload locked');
  await page.goto(base); await waitTitle('Basic information'); await page.evaluate(() => { window.clubCreationQA.role = 'admin'; }); await upload();
  await page.waitForSelector('.club-create-preview [role=alert]'); assert.equal(await page.evaluate(() => window.clubCreationQA.uploads.length), 0, 'fresh role before upload');
  await page.goto(`${base}?denied`); await page.waitForSelector('[role=alert]'); assert.equal(await page.$('.club-create-preview'), null);
  for (const query of ['?revoked', '?failure', '?lookupFailure']) {
    await flow(390, query); if (query === '?revoked') await page.evaluate(() => { window.clubCreationQA.role = 'admin'; }); await click('Publish Club');
    await page.waitForFunction(() => document.querySelector('.club-create-preview [role=alert]'));
    assert.equal(await page.evaluate(() => window.clubCreationQA.writes.length), query === '?failure' ? 1 : 0);
    const before = await page.evaluate(() => window.clubCreationQA.writes.length); await click('Publish Club');
    assert.equal(await page.evaluate(() => window.clubCreationQA.writes.length), before);
    await fit(390, query.slice(1));
  }
  await page.goto(base); await waitTitle('Basic information'); await fill('e.g. Net Set Sandton City', 'Discard me');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => document.body.innerText.includes('Discard this club setup?'));
  await click('Keep editing'); await page.keyboard.press('Escape'); await click('Discard setup'); assert.equal(await page.evaluate(() => window.clubCreationQA.cancelled), true);
  assert(!blocked.some(url => /functions\/v1|supabase/.test(url)), 'No live DB, storage or email requests attempted');
  console.log('Club creation QA passed: seven steps, publishing/success desktop/mobile, source payload and no emails, denied/error safeguards.');
} finally { await browser.close(); }
