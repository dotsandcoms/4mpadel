import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith('http://127.0.0.1:5175/') || /^(data:|blob:)/.test(request.url()) ? request.continue() : request.abort());
  const base = 'http://127.0.0.1:5175/tests/admin-preview/coach-profile-qa.html';
  async function click(label) { for (const button of await page.$$('button')) if ((await button.evaluate(node => node.textContent.trim())) === label) { await button.click(); return; } throw new Error(`Missing ${label}`); }
  async function fill(name, value) { await page.$eval(`[name="${name}"]`, node => { node.focus(); node.select(); }); await page.keyboard.type(value); }
  async function option(label, choice) {
    const trigger = await page.$(`.ap-select-trigger[aria-label="${label}"]`); assert(trigger, `dropdown ${label}`); await trigger.click();
    await page.type('.ap-select-popover.is-open input', choice);
    for (const node of await page.$$('.ap-select-popover.is-open [role="option"]')) if ((await node.evaluate(element => element.querySelector('span').textContent)) === choice) { await node.click(); return; }
    throw new Error(`Missing option ${choice}`);
  }
  await page.setViewport({ width: 1280, height: 1000 }); await page.goto(base); await page.waitForSelector('.co-profile-dialog');
  assert.equal(await page.$$eval('.co-bio p', nodes => nodes.map(node => node.textContent).join('\n\n')), await page.evaluate(() => window.initialCoachBio));
  assert.equal(await page.$eval('.co-status-management', node => node.open), false);
  assert.equal(await page.$$eval('button', nodes => nodes.some(node => node.textContent.trim() === 'Reject application')), false);
  await page.screenshot({ path: '/private/tmp/coach-profile-readonly-desktop.png' });
  await page.click('summary'); await click('Revoke approval');
  assert.equal(await page.evaluate(() => window.coachProfileWrites.length), 0);
  await click('Back'); assert.equal(await page.evaluate(() => window.coachProfileWrites.length), 0);
  await click('Edit coach profile'); await page.waitForSelector('input[name="firstName"]');
  const fields = { firstName: 'Jamie', lastName: 'Updated', email: 'jamie@example.test', contact_number: '0831234567', city: 'Durban', website_link: 'https://example.test/new', instagram_link: 'https://instagram.com/new', youtube_link: 'https://youtube.com/new', bio: 'Updated first paragraph.\nA second line.\n\nUpdated second paragraph.' };
  for (const [name, value] of Object.entries(fields)) await fill(name, value);
  await option('Gender', 'Female'); await option('Add coaching club', 'New Club');
  assert.equal(await page.$eval('.ap-select-trigger[aria-label="Add coaching club"]', node => node.disabled), true, '3-club source maximum');
  await page.click('button[aria-label="Remove Historic Club"]'); await option('Add coaching club', 'Fourth Club');
  await page.$eval('input[type="file"]', async node => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 500; canvas.getContext('2d').fillRect(0,0,1000,500);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'coach.png', { type: 'image/png' })); node.files = transfer.files; node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Review changes');
  assert.equal(await page.evaluate(() => window.coachProfileWrites.length), 0); assert.equal(await page.evaluate(() => window.coachPhotoWrites.length), 0);
  await page.screenshot({ path: '/private/tmp/coach-profile-review-desktop.png' });
  await click('Confirm coach changes'); await page.waitForSelector('.co-profile-layout');
  const writes = await page.evaluate(() => window.coachProfileWrites);
  assert.equal(writes.length, 1); assert.equal(writes[0].patch.full_name, 'Jamie Updated'); assert.equal(writes[0].patch.coaching_location, 'Existing Club · New Club · Fourth Club');
  for (const key of ['email','contact_number','city','website_link','instagram_link','youtube_link','bio']) assert.equal(writes[0].patch[key], fields[key]);
  assert.equal(writes[0].patch.gender, 'Female'); assert.equal('status' in writes[0].patch, false);
  const photos = await page.evaluate(() => window.coachPhotoWrites); assert.equal(photos.length, 1); assert.equal(photos[0].bucket, 'coach-profiles'); assert.equal(photos[0].type, 'image/jpeg');
  assert.equal(await page.$$eval('.co-bio p', nodes => nodes.map(node => node.textContent).join('\n\n')), fields.bio);

  // Fresh long profile at narrow viewport: scroll reaches approval/footer and editing actions.
  await page.setViewport({ width: 390, height: 844 }); await page.goto(base); await page.waitForSelector('.co-profile-dialog');
  assert.equal(await page.$eval('.co-profile-dialog', node => node.scrollWidth <= node.clientWidth), true);
  await page.$eval('summary', node => node.scrollIntoView({ block: 'center' }));
  assert.equal(await page.$eval('summary', node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true);
  await page.screenshot({ path: '/private/tmp/coach-profile-readonly-mobile.png' });
  await click('Edit coach profile'); await page.waitForSelector('input[name="firstName"]');
  await page.$eval('form footer', node => node.scrollIntoView({ block: 'end' }));
  assert.equal(await page.$eval('form footer', node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true);
  assert.equal(await page.$eval('.co-profile-dialog', node => node.scrollWidth <= node.clientWidth), true);
  await page.screenshot({ path: '/private/tmp/coach-profile-edit-mobile.png' });
  await click('Cancel'); assert.equal(await page.evaluate(() => window.coachProfileWrites.length), 0);
  assert.deepEqual(errors, []); console.log('Coach profile QA passed: approved disclosure, exact biography paragraphs, full edit+3club lookup, pre-save review, mocked photo, mobile scroll/overflow.');
} finally { await browser.close(); }
