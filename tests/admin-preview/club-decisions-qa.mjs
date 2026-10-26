import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage(); await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith('http://127.0.0.1:5175/') ? request.continue() : request.abort());
  const base = 'http://127.0.0.1:5175/tests/admin-preview/club-decisions-qa.html';
  const click = text => page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text).click(), text);
  const open = async query => { await page.goto(base + query); await page.waitForSelector('select'); };
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900 });
    for (const kind of ['', '?claim']) {
      await open(kind); await click('Review decision'); await page.waitForFunction(() => document.body.innerText.includes('Confirm staging decision'));
      assert.equal(await page.evaluate(() => window.clubDecisionQA.calls.length), 0);
      await page.screenshot({ path: `/private/tmp/club-decision-${width}-${kind ? 'claim' : 'application'}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await click('Confirm staging decision'); await page.keyboard.press('Escape'); assert(await page.$('dialog[open]'));
      await page.waitForFunction(() => !!window.clubDecisionQA.saved);
      const call = await page.evaluate(() => window.clubDecisionQA.calls[0]);
      assert.equal(call.name, kind ? 'preview_decide_club_claim' : 'preview_decide_club_application');
      assert.equal(Object.keys(call.args).length, kind ? 5 : 4);
      assert.match(await page.evaluate(() => document.body.innerText), /queued; delivery is not confirmed/);
    }
  }
  await open('?claim&preview'); await click('Review local decision'); assert.equal(await page.evaluate(() => window.clubDecisionQA.calls.length), 0); assert(!await page.evaluate(() => document.body.innerText.includes('Confirm staging decision')));
  await open('?claim'); await page.select('select', 'rejected'); await click('Review decision'); await page.waitForSelector('[role=alert]'); assert.equal(await page.evaluate(() => window.clubDecisionQA.calls.length), 0);
  await page.type('textarea', 'Synthetic feedback'); await click('Review decision'); await page.waitForFunction(() => document.body.innerText.includes('Confirm staging decision')); await click('Confirm staging decision'); await page.waitForFunction(() => !!window.clubDecisionQA.saved);
  assert.equal(await page.evaluate(() => window.clubDecisionQA.calls[0].args.p_rejection_notes), 'Synthetic feedback');
  for (const scenario of ['failure', 'denied', 'context']) {
    await open(`?${scenario}&claim`); await click('Review decision'); await page.waitForFunction(() => document.body.innerText.includes('Confirm staging decision'));
    if (scenario === 'denied') await page.evaluate(() => { window.clubDecisionQA.role = 'custom'; });
    await click('Confirm staging decision');
    if (scenario === 'context') { await page.evaluate(() => window.clubDecisionQA.changeContext()); await new Promise(resolve => setTimeout(resolve, 450)); }
    else { await page.waitForSelector('[role=alert]'); assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Confirm staging decision').disabled), true); }
    assert.equal(await page.evaluate(() => window.clubDecisionQA.calls.length), scenario === 'failure' ? 1 : 0);
  }
  console.log('Staging decision UI QA passed: review/confirm, exact RPC snapshots, default preview off, fresh denial/stale context/retry guard, busy Escape, desktop/mobile.');
} finally { await browser.close(); }
