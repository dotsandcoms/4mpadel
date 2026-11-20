import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, bundle;
before(async () => {
  const result = await build({
    stdin: { contents: `
      import { createRoot } from 'react-dom/client';
      import Payment from './src/pages/admin-preview/ImportedParticipantPaymentDialog.jsx';
      const fixture=window.fixture;
      const participant={id:'participant-a',event_id:11,full_name:'Fixture player',class_name:'Mixed Open',is_paid:fixture.mode==='unmark'};
      const event={id:11,event_name:'Imported cup',is_manual:false,organisation_id:'own-org'};
      const rpcResult=(value)=>({abortSignal(){return this},then(resolve,reject){return Promise.resolve(value).then(resolve,reject);}});
      const client={
        auth:{getUser:async()=>({data:{user:{id:'fixture-admin',email:'fixture@example.invalid'}}})},
        from(table){
          return {select(){return this},eq(){return this},abortSignal(){return this},
            async single(){fixture.calls.push([table]);return {data:event};}};
        },
        rpc(name,args){
          fixture.calls.push([name,args]);
          if(name==='is_super_admin')return rpcResult({data:fixture.mode!=='denied'});
          if(name!=='admin_review_imported_participant_payment')return rpcResult({data:true});
          if(fixture.mode==='missing')return rpcResult({error:{code:'PGRST202',message:'RPC missing'}});
          const unmark=fixture.mode==='unmark',action=unmark?'unmark':'mark';
          if(!args.p_expected) return rpcResult({data:{event_id:11,participant_id:'participant-a',token:'a'.repeat(64),
            participant_name:'Fixture player',division:'Mixed Open',action,amount:120,is_test:false,
            has_manual_receipt:unmark,resets_registration:unmark}});
          if(fixture.mode==='stale')return rpcResult({error:{message:'The participant or payment changed after review.'}});
          fixture.saved=true;
          return rpcResult({data:{event_id:11,participant_id:'participant-a',action,is_paid:!unmark,payment_id:'manual-payment',
            registration_reset:unmark}});
        },
      };
      const root=createRoot(document.getElementById('root'));
      root.render(<Payment client={client} event={event} participant={participant} session={{user:{id:'fixture-admin'}}}
        scopeId="org:own-org" onClose={result=>{fixture.closed=result;root.unmount()}}/>);
    `, resolveDir: process.cwd(), sourcefile: 'imported-payment-browser.jsx', loader: 'jsx' },
    bundle: true, format: 'iife', write: false, jsx: 'automatic', loader: { '.css': 'empty' },
  });
  bundle = result.outputFiles[0].text;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function withPayment(mode, run) {
  const page = await browser.newPage();
  page.setDefaultTimeout(6000);
  await page.setRequestInterception(true);
  page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
  try {
    await page.setContent('<main id="root"></main>');
    await page.evaluate(mode => { window.fixture = { mode, calls: [] }; }, mode);
    await page.addScriptTag({ content: bundle });
    await run(page);
  } catch (error) {
    error.message += '\nSynthetic screen: ' + await page.evaluate(() => document.body.innerText);
    throw error;
  } finally {
    await page.close();
  }
}
const text = (page, expected) => page.waitForFunction(text => document.body.innerText.includes(text), { polling: 50 }, expected);
const calls = page => page.evaluate(() => window.fixture.calls.filter(([name]) => name === 'admin_review_imported_participant_payment').map(([, args]) => args));
async function click(page, label) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')]
    .some(button => button.textContent.trim() === label && !button.disabled), { polling: 50 }, label);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label).click(), label);
}

test('imported mark-paid reviews the exact fee then records one scoped manual payment', async () => {
  await withPayment('mark', async page => {
    await text(page, 'Mark entry paid');
    await text(page, '120');
    assert.deepEqual(await calls(page), [{ p_event_id: 11, p_participant_id: 'participant-a', p_scope: 'org:own-org' }]);
    await page.type('textarea', '  EFT received fixture  ');
    await click(page, 'Confirm payment');
    await text(page, 'Manual entry payment recorded.');
    const [, request] = await calls(page);
    assert.deepEqual(request, { p_event_id: 11, p_participant_id: 'participant-a', p_scope: 'org:own-org', p_expected: 'a'.repeat(64), p_note: 'EFT received fixture' });
    await click(page, 'Done');
    assert.deepEqual(await page.evaluate(() => window.fixture.closed), { refresh: true });
  });
});

test('unmark reviews the eligible receipt and registration before correcting them', async () => {
  await withPayment('unmark', async page => {
    await text(page, 'cancel the linked manual receipt');
    await text(page, 'The linked registration will also return to unpaid.');
    await text(page, 'Use the refund workflow if money must be returned.');
    assert.equal((await calls(page)).length, 1);
    await click(page, 'Confirm correction');
    await text(page, 'Imported payment correction saved.');
    assert.equal((await calls(page))[1].p_expected, 'a'.repeat(64));
    assert.equal((await calls(page))[1].p_note, null);
  });
});

test('event-only read grants and uninstalled services show a closed payment action', async () => {
  await withPayment('denied', async page => {
    await text(page, 'verified super-admin account');
    assert.equal((await calls(page)).length, 0);
    assert.equal(await page.$('button[type=submit]'), null);
  });
  await withPayment('missing', async page => {
    await text(page, 'The imported payment service is unavailable.');
    assert.equal((await calls(page)).length, 1);
    assert.equal(await page.$('button[type=submit]'), null);
  });
});

test('a changed receipt blocks retry until the participant is refreshed', async () => {
  await withPayment('stale', async page => {
    await text(page, 'Mark entry paid');
    await click(page, 'Confirm payment');
    await text(page, 'The participant or payment changed after review.');
    assert.equal(await page.$eval('button[type=submit]', button => button.disabled), true);
    assert.equal(await page.evaluate(() => window.fixture.saved === true), false);
    assert.equal((await calls(page)).length, 2);
    await click(page, 'Close');
    assert.deepEqual(await page.evaluate(() => window.fixture.closed), { refresh: true });
  });
});

test('closing after review makes no payment write and requests no refresh', async () => {
  await withPayment('mark', async page => {
    await text(page, 'Mark entry paid');
    await click(page, 'Close');
    assert.deepEqual(await page.evaluate(() => window.fixture.closed), { refresh: false });
    assert.equal((await calls(page)).length, 1);
  });
});
