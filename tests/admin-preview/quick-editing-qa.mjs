import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith('http://127.0.0.1:5175/') ? request.continue() : request.abort());
  const base = 'http://127.0.0.1:5175/tests/admin-preview/quick-editing-qa.html';
  for (const scenario of ['unchanged', 'keep', 'change', 'remove', 'denied', 'stale', 'failure', 'missing', 'enable-empty']) {
    await page.goto(`${base}?${scenario}`);
    if (scenario === 'missing') { await page.waitForFunction(() => document.body.innerText.includes('exactly one division')); assert.equal(await page.evaluate(() => window.quickEditWrites.length), 0); continue; }
    await page.waitForFunction(() => window.quickEditEngine?.form.division_name === 'Existing Division');
    const form = await page.evaluate(() => window.quickEditEngine.form);
    assert.equal(form.entry_fee, '345'); assert.equal(form.format, 'Round Robin'); assert.equal(form.access_code, ''); assert.equal(form.require_access_code, scenario !== 'enable-empty');
    if (scenario === 'enable-empty') {
      await page.evaluate(() => window.quickEditEngine.setForm(previous => ({ ...previous, require_access_code: true })));
      await page.waitForFunction(() => window.quickEditEngine.form.require_access_code);
      await page.click('#save'); await page.waitForFunction(() => window.quickEditFinished);
      assert.equal(await page.evaluate(() => window.quickEditWrites.length), 0, 'Enabling code protection requires a new code before any writes');
      await page.click('#close'); assert.equal(await page.evaluate(() => window.quickEditClose.refresh), false);
      continue;
    }
    if (scenario === 'unchanged') { await page.click('#close'); assert.equal(await page.evaluate(() => window.quickEditClose.refresh), false); continue; }
    await page.evaluate(scenario => {
      if (scenario === 'stale') window.quickEditStale = true;
      window.quickEditEngine.setForm(previous => ({ ...previous, event_name: 'Updated Quick Event', ...(scenario === 'change' ? { access_code: 'NEWCODE99' } : {}), ...(scenario === 'remove' ? { require_access_code: false } : {}) }));
    }, scenario);
    await page.waitForFunction(() => window.quickEditEngine.form.event_name === 'Updated Quick Event');
    await page.click('#save'); await page.waitForFunction(() => window.quickEditFinished);
    const state = await page.evaluate(() => ({ writes: window.quickEditWrites, error: window.quickEditEngine.saveError, saved: window.quickEditEngine.savedDetails }));
    if (['denied','stale'].includes(scenario)) assert.equal(state.writes.length, 0);
    else {
      assert.equal(state.writes.filter(write => write.table === 'calendar').length, 1, 'no republish update');
      assert.equal(state.writes[0].payload.is_visible, false); assert.equal('sanction_status' in state.writes[0].payload, false);
      assert.equal(state.writes[0].payload.slug, 'existing-quick');
      assert(state.writes.filter(write => write.table).every(write => write.method === 'update'), 'never inserts during edit');
      assert.deepEqual(state.writes[1].filters, [['id', 888]]);
      const rpc = state.writes.find(write => write.rpc);
      if (scenario === 'change') assert.deepEqual(rpc.args, { p_event_id: 777, p_enabled: true, p_code: 'NEWCODE99' });
      else if (scenario === 'remove') assert.deepEqual(rpc.args, { p_event_id: 777, p_enabled: false, p_code: null });
      else assert.equal(rpc, undefined, 'blank access code preserves stored code');
      if (scenario === 'failure') assert.match(state.error, /review Calendar/);
      else assert.equal(state.saved.wasEditing, true);
    }
    if (!['denied','stale'].includes(scenario)) {
      await page.evaluate(() => { window.quickEditFinished = false; }); await page.click('#save'); await page.waitForFunction(() => window.quickEditFinished);
      assert.equal(await page.evaluate(() => window.quickEditWrites.length), state.writes.length, 'success/partial failure retry guard');
    }
    await page.click('#close'); assert.equal(await page.evaluate(() => window.quickEditClose.refresh), !['denied','stale'].includes(scenario));
  }
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}?ui`);
    await page.waitForSelector('#quick-event-event-name');
    assert.equal(await page.$eval('#quick-event-event-name', input => input.value), 'QA Existing Quick');
    for (let step = 1; step <= 5; step++) {
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const nav = dialog.querySelector('nav');
        return { pageWidth: document.documentElement.scrollWidth, innerWidth,
          outside: [...dialog.querySelectorAll('input:not([type="file"]),textarea,footer,button')].filter(el => {
            if (nav?.contains(el) || !el.getClientRects().length) return false;
            const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
          }).map(el => el.id || el.innerText) };
      });
      assert(layout.pageWidth <= layout.innerWidth, `page overflow at ${width} step ${step}`);
      assert.deepEqual(layout.outside, [], `field/action overflow at ${width} step ${step}`);
      if (step === 2) {
        assert(await page.evaluate(() => [...document.querySelectorAll('input')].some(input => input.value === 'Existing Division')));
        assert(await page.evaluate(() => [...document.querySelectorAll('input')].some(input => input.value === '345')));
        assert.equal(await page.$eval('#quick-event-access-code', input => input.value), '');
        assert.match(await page.evaluate(() => document.body.innerText), /leave blank to keep the current code/);
      }
      if (step === 5) {
        const copy = await page.evaluate(() => document.body.innerText);
        assert.match(copy, /Review & save/);
        assert.match(copy, /Ready to save/);
        assert.match(copy, /Existing access code retained/);
        assert.doesNotMatch(copy, /Review & create|before creating the event/);
      }
      await page.screenshot({ path: `/private/tmp/quick-editing-${width}-step-${step}.png`, fullPage: true });
      if (width === 390 && step === 2) {
        await page.$eval('[role="dialog"] main', main => { main.scrollTop = main.scrollHeight; });
        await page.screenshot({ path: '/private/tmp/quick-editing-390-step-2-bottom.png', fullPage: true });
      }
      if (step < 5) {
        await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Continue').click());
        await page.waitForFunction(expected => {
          const buttons = [...document.querySelectorAll('nav[aria-label="Quick event steps"] button')];
          return buttons[expected - 1]?.getAttribute('aria-current') === 'step';
        }, {}, step + 1);
      }
    }
    assert.equal(await page.evaluate(() => window.quickEditWrites.length), 0);
  }
  console.log('Quick editing QA passed: save guards and all five native UI steps at 1440/390, prefilled division and retained-code hint.');
} finally { await browser.close(); }
