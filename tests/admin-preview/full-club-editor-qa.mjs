import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => /^(http:\/\/127\.0\.0\.1:5175\/|data:|blob:)/.test(request.url()) ? request.continue() : request.abort());
  const base = 'http://127.0.0.1:5175/tests/admin-preview/full-club-editor-qa.html';
  const button = async text => page.evaluate(text => { const target = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text); if (!target) throw new Error(`Missing button ${text}`); target.click(); }, text);
  const field = async (label, value) => page.evaluate(({ label, value }) => {
    const wrap = [...document.querySelectorAll('label')].find(item => item.firstElementChild?.textContent === label);
    const input = wrap?.querySelector('input,textarea'); if (!input) throw new Error(`Missing field ${label}`);
    Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { label, value });
  const open = async query => { await page.goto(`${base}${query || ''}`); await page.waitForSelector('.ap-full-club-fields'); };
  const state = () => page.evaluate(() => ({ writes: window.clubEditorQA.writes, uploads: window.clubEditorQA.uploads, saved: window.clubEditorQA.saved, closed: window.clubEditorQA.closed }));
  await page.setViewport({ width: 1440, height: 1000 });
  await open(); await button('Cancel'); assert.equal((await state()).closed, true, 'unchanged close');
  await open(); await field('Name', 'Unsaved name'); await button('Cancel');
  assert.match(await page.evaluate(() => document.body.innerText), /Discard unsaved club changes/);
  await button('Keep editing'); await button('Cancel'); await button('Discard changes');
  assert.equal((await state()).closed, true); assert.equal((await state()).writes.length, 0);

  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 1000 }); await open();
    await page.evaluate(() => document.querySelectorAll('.ap-full-club-section').forEach(section => { section.open = true; }));
    assert.equal(await page.$$eval('.ap-full-club-section', sections => sections.length), 11);
    const overflows = await page.evaluate(() => [...document.querySelectorAll('.ap-full-club-fields input,.ap-full-club-fields textarea,.ap-full-club-fields .ap-select-trigger')].filter(input => {
      const r = input.getBoundingClientRect(); return input.getClientRects().length && (r.left < -1 || r.right > innerWidth + 1);
    }).map(input => input.outerHTML.slice(0, 100)));
    assert.deepEqual(overflows, [], `controls fit ${width}`);
    await page.screenshot({ path: `/private/tmp/full-club-editor-${width}-top.png` });
    await page.evaluate(() => { const dialog = document.querySelector('dialog'); dialog.scrollTop = dialog.scrollHeight; document.querySelector('.clubs-full-footer').scrollIntoView({ block: 'end' }); });
    await page.screenshot({ path: `/private/tmp/full-club-editor-${width}-bottom.png` });
    assert.equal((await state()).writes.length, 0);
  }
  await page.setViewport({ width: 1440, height: 1000 }); await open();
  // Native select remains the shared searchable control's value authority.
  await page.evaluate(() => { const select = [...document.querySelectorAll('label')].find(label => label.firstElementChild?.textContent === 'Club group').querySelector('select'); select.value = 'g1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.firstElementChild?.textContent === 'Website').querySelector('input').disabled), true);
  assert.equal(await page.$('[aria-label="Upload Club logo"]'), null, 'inherited logo not editable');
  assert.match(await page.evaluate(() => document.body.innerText), /Inherited from QA Group/);
  await page.evaluate(() => { [...document.querySelectorAll('summary')].find(item => item.textContent === 'Courts').click(); });
  const csv = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(label => label.firstElementChild?.textContent === 'Features (comma-separated)').querySelector('input'));
  await csv.asElement().click({ clickCount: 3 }); await page.keyboard.type('Glass, LED lights, Shade');
  assert.equal(await csv.evaluate(input => input.value), 'Glass, LED lights, Shade', 'commas and spaces survive typing');
  const googleReady = await page.evaluate(() => typeof window.clubEditorQA.choosePlace === 'function');
  if (googleReady) {
    await page.evaluate(() => window.clubEditorQA.choosePlace({ formatted_address: 'Chosen address', address_components: [{ types: ['locality'], long_name: 'Chosen city' }], geometry: { location: { lat: () => -34, lng: () => 19 } } }));
    await page.waitForFunction(() => [...document.querySelectorAll('label')].find(label => label.firstElementChild?.textContent === 'City').querySelector('input').value === 'Chosen city');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.firstElementChild?.textContent === 'City').querySelector('input').value), 'Chosen city');
  }
  await page.evaluate(() => {
    const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII='), char => char.charCodeAt(0))], 'qa.png', { type: 'image/png' }));
    const input = document.querySelector('[aria-label="Upload Hero cover"]'); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => [...document.querySelectorAll('.ap-full-club-media img')].some(img => img.src.startsWith('blob:')));
  assert.equal((await state()).uploads.length, 0); assert.equal((await state()).writes.length, 0);
  await button('Review changes'); await page.waitForSelector('.clubs-full-review');
  assert.equal((await state()).uploads.length, 0); assert.equal((await state()).writes.length, 0);
  await button('Confirm club changes'); await page.waitForFunction(() => !!window.clubEditorQA.saved);
  const saved = await state(); assert.equal(saved.uploads.length, 1); assert.equal(saved.writes.length, 1);
  assert(saved.writes[0].patch.cover_image_url.startsWith('https://images.example.test/'));
  assert.equal(saved.writes[0].patch.group_id, 'g1');
  assert.deepEqual(saved.writes[0].patch.courts.indoor.features, ['Glass', 'LED lights', 'Shade']);
  if (googleReady) { assert.equal(saved.writes[0].patch.address, 'Chosen address'); assert.equal(saved.writes[0].patch.city, 'Chosen city'); assert.equal(saved.writes[0].patch.lat, -34); assert.equal(saved.writes[0].patch.lng, 19); }

  await page.goto(`${base}?denied`); await page.waitForSelector('[role="alert"]');
  assert.equal(await page.$('.ap-full-club-fields'), null); assert.equal((await state()).writes.length, 0);
  for (const scenario of ['stale', 'revoked', 'failure', 'uploadFailure']) {
    await open(scenario.includes('Failure') || scenario === 'failure' ? `?${scenario}` : ''); await field('Name', 'Reviewed name');
    if (scenario === 'uploadFailure') await page.evaluate(() => { const data = new DataTransfer(); data.items.add(new File(['synthetic'], 'qa.png', { type: 'image/png' })); const input = document.querySelector('[aria-label="Upload Hero cover"]'); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true })); });
    await button('Review changes'); await page.waitForSelector('.clubs-full-review');
    if (scenario === 'stale') await page.evaluate(() => { window.clubEditorQA.current.about = 'Changed by another editor'; });
    if (scenario === 'revoked') await page.evaluate(() => { window.clubEditorQA.role = 'admin'; });
    await button('Confirm club changes'); await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Close and reload'));
    assert.equal((await state()).writes.length, 0, scenario);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Confirm club changes').disabled), true, `${scenario} retry lock`);
    const count = (await state()).uploads.length; await button('Confirm club changes'); assert.equal((await state()).uploads.length, count);
    await button('Close editor'); assert.equal((await state()).closed, true);
  }
  console.log(`Full club editor QA passed: responsive sections, CSV, inheritance, staged upload/review/save, permissions/stale/failure locks, discard. Google mock ${googleReady ? 'verified' : 'unavailable (loader key gate)'}.`);
} finally { await browser.close(); }
