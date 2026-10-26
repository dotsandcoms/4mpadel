import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith('http://127.0.0.1:5175/') ? req.continue() : req.abort());
  await page.setViewport({width:1100,height:900});
  await page.goto('http://127.0.0.1:5175/tests/admin-preview/club-management-qa.html');
  const click=async text=>{for(const button of await page.$$('button'))if(await button.evaluate(el=>el.textContent)===text)return button.click();throw Error(`Missing button: ${text}`);};
  await click('Load members and claims');
  await page.waitForSelector('.clubs-management-list li');
  assert.equal((await page.$$('li')).length,5);
  await click('Next records');assert.equal((await page.$$('li')).length,3);
  await click('Claims (8)');assert.equal((await page.$$('li')).length,5);
  await click('Preview decision');await page.select('select','rejected');await click('Review local decision');
  assert.match(await page.$eval('body',el=>el.innerText),/Rejection feedback is required/);
  await page.type('textarea','Please supply ownership evidence.');await click('Review local decision');
  assert.match(await page.$eval('body',el=>el.innerText),/No record has changed/);
  await page.screenshot({path:'/private/tmp/club-management-desktop.png',fullPage:true});
  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/private/tmp/club-management-mobile.png',fullPage:true});
  await click('Discard decision');assert.equal((await page.$$('textarea')).length,0);
  console.log('Management preview passed: pagination, tabs, required feedback, decision review, discard and mobile layout; external requests blocked.');
}finally{await browser.close();}
