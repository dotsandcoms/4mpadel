import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, bundle;
before(async () => {
  const result = await build({
    stdin: { contents: `
      import { createRoot } from 'react-dom/client';
      import NameDialog from './src/pages/admin-preview/RegistrationProfileNameDialog.jsx';
      import PaymentDialog from './src/pages/admin-preview/EventPaymentDialog.jsx';
      import { canAlignRegistrationProfile } from './src/pages/admin-preview/registrationProfileName.js';
      import { findWithdrawnRegistrationReceipt, saveWithdrawnRegistrationReceipt } from './src/pages/admin-preview/withdrawnRegistrationReceipt.js';
      const fixture = window.fixture;
      const event={id:11,event_name:'Fixture cup',is_manual:true,event_status:'published',organisation_id:'mine'};
      const session={user:{id:'admin-a'}};
      const registration={id:'entry-a',event_id:11,status:fixture.mode.startsWith('name') ? 'registered':'withdrawn',
        full_name:'Registered spelling',email:'player@example.invalid',division:'Open',division_id:'division-a',
        payment_status:'paid',payment_method:'cash',
        _player:{id:8,name:'Profile spelling',email:fixture.mode==='name-other'?'other@example.invalid':'PLAYER@example.invalid'}};
      const receipt={id:'receipt-a',event_id:11,status:'success',payment_type:'event_entry_fee',
        payment_method:'cash',amount:100,reference:'MANUAL-ADMIN-entry-a',
        metadata:{collection_recipient:'4m',note:'Existing note',source:'manual_event_admin',registration_id:fixture.mode==='receipt-unrelated'?'unrelated':'entry-a'}};
      const privateRefund=[{status:'processing',payment_id:'receipt-a'}];
      const client={
        auth:{getUser:async()=>({data:{user:{email:'fixture@example.invalid',id:'admin-a'}}})},
        from(){return {select(){return this},eq(){return this},async single(){return {data:event}}}},
        async rpc(name,data){
          fixture.calls.push([name,data]);
          if(name==='admin_align_registration_profile_name')return fixture.mode==='name-stale'
            ? {error:{message:'The displayed registration or profile changed.'}}
            : {data:{event_id:11,registration_id:'entry-a',player_id:8,full_name:'Profile spelling'}};
          if(name==='admin_correct_withdrawn_registration_receipt')return {data:{paymentId:'receipt-a',method:data.p_method,recipient:data.p_recipient}};
          return {data:true};
        },
      };
      const root=createRoot(document.getElementById('root'));
      const onClose=result=>{fixture.close=result;root.unmount();};
      if(fixture.mode.startsWith('name')){
        root.render(canAlignRegistrationProfile(registration)
          ? <NameDialog {...{client,event,registration,session,onClose}} scopeId="org:mine"/>
          : <p>No exact matching name change</p>);
      } else {
        const matched=findWithdrawnRegistrationReceipt(registration,[{...receipt,id:'wrong-event',event_id:12},receipt],
          fixture.mode==='receipt-refund'?privateRefund:[]);
        root.render(matched
          ? <PaymentDialog {...{client,event,session,onClose}} scopeId="all" action={{type:'correct',registration:{...registration,_editablePayment:matched}}}
              divisions={[]} save={saveWithdrawnRegistrationReceipt}/>
          : <p>No eligible exact withdrawn receipt</p>);
      }
    `, resolveDir: process.cwd(), sourcefile: 'registry-history.jsx', loader: 'jsx' },
    write: false, bundle: true, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
    plugins: [{ name: 'no-live-client', setup(build) {
      build.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'supabase',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase = {}'}));
    } }],
  });
  bundle = result.outputFiles[0].text;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function withDialog(mode, run) {
  const page = await browser.newPage();
  page.setDefaultTimeout(6000);
  try {
    await page.setRequestInterception(true);
    page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
    await page.setContent('<main id="root"></main>');
    await page.evaluate(mode => { window.fixture = { mode, calls: [] }; }, mode);
    await page.addScriptTag({ content: bundle });
    await run(page);
  } catch (error) {
    error.message += '\nSynthetic screen: ' + await page.evaluate(() => document.body.innerText);
    throw error;
  } finally { await page.close(); }
}
const text = (page, expected) => page.waitForFunction(expected => document.body.innerText.includes(expected), { polling: 50 }, expected);
const writes = page => page.evaluate(() => window.fixture.calls.filter(([name]) => name.startsWith('admin_')));
async function click(page, name) {
  await page.waitForFunction(name => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === name && !button.disabled), { polling: 50 }, name);
  await page.evaluate(name => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === name).click(), name);
}

test('exact same-email profile name review saves one scoped registration and retains the original email', async () => {
  await withDialog('name', async page => {
    await text(page, 'Registered spelling'); await text(page, 'Profile spelling');
    assert.equal((await writes(page)).length, 0);
    await click(page, 'Confirm profile name'); await text(page, 'The registration now uses Profile spelling.');
    const [[name, request]] = await writes(page);
    assert.equal(name, 'admin_align_registration_profile_name');
    assert.deepEqual(request, { p_event: 11, p_registration: 'entry-a', p_player: 8, p_scope: 'org:mine',
      p_expected: { entry_name: 'Registered spelling', entry_email: 'player@example.invalid', profile_name: 'Profile spelling',
        profile_email: 'PLAYER@example.invalid', division: 'Open', division_id: 'division-a' } });
    await click(page, 'Done');
    assert.deepEqual(await page.evaluate(() => window.fixture.close), { refresh: true });
  });
});

test('a differently owned profile is absent and a stale exact profile requires fresh review', async () => {
  await withDialog('name-other', async page => {
    await text(page, 'No exact matching name change');
    assert.equal((await writes(page)).length, 0);
  });
  await withDialog('name-stale', async page => {
    await click(page, 'Confirm profile name'); await text(page, 'The displayed registration or profile changed.');
    assert.equal(await page.$eval('button[type=submit]', button => button.disabled), true);
    assert.equal((await writes(page)).length, 1);
  });
});

test('withdrawn receipt correction retains the amount and submits only the exact reviewed receipt', async () => {
  await withDialog('receipt', async page => {
    await text(page, 'Correct withdrawn receipt'); await text(page, 'The entry will stay withdrawn.');
    await text(page, '100');
    assert.equal((await writes(page)).length, 0);
    await page.$eval('textarea', node => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, 'Corrected note');
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(page, 'Save payment');
    await text(page, 'Payment updated successfully.');
    const [[name, request]] = await writes(page);
    assert.equal(name, 'admin_correct_withdrawn_registration_receipt');
    assert.equal(request.p_registration, 'entry-a');
    assert.equal(request.p_payment, 'receipt-a');
    assert.equal(request.p_method, 'cash');
    assert.equal(request.p_note, 'Corrected note');
    assert.equal(request.p_expected.amount, 100);
    assert.equal(request.p_expected.metadata.note, 'Existing note');
  });
});

test('a receipt with a different saved association or an active refund has no correction action', async () => {
  for (const mode of ['receipt-unrelated', 'receipt-refund']) {
    await withDialog(mode, async page => {
      await text(page, 'No eligible exact withdrawn receipt');
      assert.equal((await writes(page)).length, 0);
    });
  }
});
