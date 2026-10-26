import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5175';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(`${origin}/`) || request.url().startsWith('data:') ? request.continue() : request.abort());
  const fixture = `${origin}/tests/admin-preview/searchable-dropdown-qa.html`;
  async function button(text) { const buttons = await page.$$('button'); for (const node of buttons) if ((await node.evaluate(element => element.textContent.trim())) === text) return node; throw new Error(`Missing button ${text}`); }
  async function click(text) { await (await button(text)).click(); }
  async function trigger(name) {
    const handle = await page.evaluateHandle(name => {
      const select = document.querySelector(`select[name="${name}"]`);
      let parent = select?.parentElement;
      while (parent && parent !== document.body) { const candidate = parent.querySelector('.ap-select-trigger'); if (candidate) return candidate; parent = parent.parentElement; }
      throw new Error(`No trigger for ${name}`);
    }, name);
    return handle.asElement();
  }
  async function open(name) { await (await trigger(name)).click(); await page.waitForFunction(() => [...document.querySelectorAll('input')].some(node => node.getBoundingClientRect().width && !node.disabled)); }
  async function search(text) {
    const handle = await page.evaluateHandle(() => [...document.querySelectorAll('input')].find(node => node.getBoundingClientRect().width && !node.disabled));
    await handle.asElement().click(); await handle.asElement().type(text);
  }
  async function choose(label) {
    const options = await page.$$('.ap-select-popover.is-open [role="option"]');
    for (const option of options) if ((await option.evaluate(node => (node.querySelector('span')?.textContent || node.textContent).trim())) === label) { await option.click(); return; }
    throw new Error(`No option ${label}`);
  }
  const nativeValue = name => page.$eval(`select[name="${name}"]`, node => node.value);
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(fixture); await page.waitForSelector('.ap-select-trigger');

  // Native form semantics and external-label association.
  await page.click('label[for="controlled"]');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ap-select-trigger')), true, 'external label focuses trigger');
  await open('controlled'); await search('beta'); await choose('Beta club');
  assert.equal(await nativeValue('controlled'), 'beta');
  assert.equal(await page.$eval('[data-testid="controlled-value"]', node => node.textContent), 'beta');
  assert.deepEqual(await page.evaluate(() => window.dropdownChanges.at(-1)), { value: 'beta', name: 'controlled', target: 'SELECT', currentTarget: 'SELECT' });
  await open('controlled'); await search('no such team');
  assert.equal((await page.$$('.ap-select-popover.is-open [role="option"]')).length, 0, 'search filters options');
  assert.match(await page.$eval('.ap-select-popover.is-open', node => node.textContent), /No matching options/);
  await page.keyboard.press('Escape'); assert.equal(await nativeValue('controlled'), 'beta');

  // Disabled options/groups must not be selectable, and group choices stay searchable.
  await open('controlled');
  const disabledStates = await page.$$eval('.ap-select-popover.is-open [role="option"]', nodes => nodes.filter(node => /Blocked club|Closed club/.test(node.textContent)).map(node => node.getAttribute('aria-disabled') === 'true' || node.disabled));
  assert.equal(disabledStates.length, 2, 'both disabled option and optgroup are represented');
  assert(disabledStates.every(Boolean), 'disabled items or groups remain disabled');
  await page.$$eval('.ap-select-popover.is-open [role="option"]', nodes => nodes.filter(node => /Blocked club|Closed club/.test(node.textContent)).forEach(node => node.click()));
  assert.equal(await nativeValue('controlled'), 'beta', 'disabled options cannot change selection');
  await search('Cape Town'); await choose('Cape Town club'); assert.equal(await nativeValue('controlled'), 'cape');

  // Keyboard selection, uncontrolled state, required validity and form submission.
  await (await trigger('uncontrolled')).focus(); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.notEqual(await nativeValue('uncontrolled'), 'second', 'keyboard can change uncontrolled selection');
  await click('Submit choices');
  assert.equal(await page.evaluate(() => Boolean(window.dropdownFormData)), false, 'required field blocks submission');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ap-select-trigger')), true, 'required invalid field focuses visible trigger');
  await open('requiredChoice'); await choose('Ready option');
  await click('Submit choices');
  assert.equal(await page.evaluate(() => window.dropdownFormData.requiredChoice), 'ready');
  assert.equal(await page.evaluate(() => window.dropdownFormData.controlled), 'cape');
  assert.equal(await page.evaluate(() => 'disabledChoice' in window.dropdownFormData), false);
  await click('Reset choices');
  assert.equal(await nativeValue('controlled'), 'alpha'); assert.equal(await nativeValue('uncontrolled'), 'second'); assert.equal(await nativeValue('requiredChoice'), '');
  assert.match(await (await trigger('controlled')).evaluate(node => node.textContent), /Alpha club/);
  assert.match(await (await trigger('uncontrolled')).evaluate(node => node.textContent), /Second option/);
  await page.$eval('select[name="uncontrolled"]', node => node.closest('label').click());
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ap-select-trigger')), true, 'wrapped label focuses trigger');

  // A popup in a native modal must stay usable and Escape must close only the popup.
  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 844 });
    await click('Open modal'); await page.waitForSelector('dialog[open]');
    await open('modalChoice'); await search('Two');
    await page.screenshot({ path: `/private/tmp/searchable-dropdown-modal-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.$eval('.ap-select-popover.is-open', node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; }), true, 'popup stays within viewport');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('dialog', node => node.open), true, 'Escape preserves the containing modal');
    await open('modalChoice'); await search('Three'); await choose('Three teams'); assert.equal(await nativeValue('modalChoice'), 'three');
    await open('modalChoice'); await page.keyboard.press('Tab');
    assert.equal(await page.$eval('dialog', node => node.open), true);
    assert.equal((await page.$$('.ap-select-popover.is-open')).length, 0, 'Tab closes the popup');
    await click('Close modal'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  }
  assert.deepEqual(errors, []);
  console.log('Searchable dropdown QA passed: controlled/uncontrolled, form/reset/required, labels, disabled groups, filtering, keyboard and modal desktop/mobile.');
} finally { await browser.close(); }
