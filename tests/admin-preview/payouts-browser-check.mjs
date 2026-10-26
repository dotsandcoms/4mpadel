import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().startsWith('http://127.0.0.1:5174/') || request.url().startsWith('data:') ? request.continue():request.abort());
  const url='http://127.0.0.1:5174/tests/admin-preview/payouts-qa.html';
  const click=text=>page.evaluate(value=>[...document.querySelectorAll('button')].find(b=>b.textContent===value)?.click(),text);
  await page.setViewport({width:1280,height:900});
  await page.goto(url);await page.waitForSelector('tbody tr');
  assert.equal(await page.$$eval('tbody tr',rows=>rows.length),10);
  await click('Next');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===2);
  await page.select('select','review');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===1);
  await page.click('tbody .fo-type-link');await page.waitForSelector('dialog[open]');
  assert.ok(await page.evaluate(()=>document.activeElement.tagName==='H2'));
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close payout details');
  await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Payout details content');
  await page.$eval('dialog',async dialog=>Promise.all(dialog.getAnimations().map(animation=>animation.finished)));
  assert.ok(await page.$eval('dialog',dialog=>dialog.getBoundingClientRect().right<=innerWidth+1));
  await page.screenshot({path:'/private/tmp/payout-details-desktop.png'});
  await page.keyboard.press('Escape');await page.waitForSelector('dialog',{hidden:true});
  assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('fo-type-link')));
  await click('Reset filters');
  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'deny'});
  await click('Export Excel');await page.waitForFunction(()=>document.body.textContent.includes('12 matching records across all pages'));
  await page.type('[aria-label="Search recorded payouts"]','no-such-event');
  await page.waitForFunction(()=>document.body.textContent.includes('No recorded payouts match'));
  await click('Reset filters');await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.click('tbody .fo-type-link');await page.waitForSelector('dialog[open]');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  assert.equal(await page.$eval('dialog',d=>getComputedStyle(d).animationName),'none');
  await page.screenshot({path:'/private/tmp/payout-details-mobile.png'});
  await page.keyboard.press('Escape');
  for(const [variant,text] of [['empty','No recorded payouts match'],['issues','Some event records need review'],['error','Payouts could not be loaded'],['denied','Platform super-admin access']]){
    await page.goto(`${url}?${variant}`);await page.waitForFunction(value=>document.body.textContent.includes(value),{},text);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: Payouts pagination, search, quality filter, drawer focus/escape, mobile, reduced motion, all-row export, empty/error/issues/access states.');
} finally {await browser.close();}
