import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixture = `
  import { createRoot } from 'react-dom/client';
  import Scan from './src/pages/admin-preview/ClubGoogleScan.jsx';
  const sample = window.fixture;
  const id = 'synthetic-actor';
  const cursor = '01234567-0000-4000-8000-000000000012';
  const client = {
    auth:{getUser:async()=>({data:{user:{id,email:'fixture@example.invalid'}}})},
    async rpc(name) {
      sample.calls.push(['rpc',name]);
      if (name==='is_super_admin') return {data:sample.platform};
      return {data:sample.active === true};
    },
    functions:{
      async invoke(name,{body}) {
        sample.calls.push(['scan',name,body]);
        if (sample.reject) return {error:{message:'Offline fixture'}};
        if (sample.unverified) return {data:{processed:12,queued:12,errors:[]}};
        if (body.after) return {data:{scan_version:1,processed:3,queued:3,skipped:0,errors:[],next_cursor:null}};
        return {data:{scan_version:1,processed:12,queued:10,skipped:1,errors:[{club:'Fixture club'}],next_cursor:cursor}};
      },
    },
  };
  createRoot(document.getElementById('root')).render(<Scan client={client} scopeId={sample.scope} userId={id}
    onScanned={()=>sample.calls.push(['reload'])} />);
`;

test('the native Google scan advances only on a separate reviewed operator click and checks live scope',async()=>{
  const result=await build({stdin:{contents:fixture,loader:'jsx',resolveDir:process.cwd()},bundle:true,format:'iife',write:false,jsx:'automatic',define:{'import.meta.env':'{}'},loader:{'.css':'empty'}});
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  async function pageFor(options) {
    const page=await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request',request=>request.abort());
    await page.setContent('<main id="root"></main>');
    await page.evaluate(options=>{window.fixture={calls:[],...options};},options);
    await page.addScriptTag({content:result.outputFiles[0].text});
    return page;
  }
  const text=(page,phrase)=>page.waitForFunction(phrase=>document.body.innerText.includes(phrase),{timeout:5000},phrase);
  const calls=page=>page.evaluate(()=>window.fixture.calls);
  const click=(page)=>page.$eval('button',button=>button.click());
  try {
    const denied=await pageFor({platform:false,active:false,scope:'all'});
    await denied.waitForFunction(()=>window.fixture.calls.length>0);
    assert.equal(await denied.$('button'),null);
    const tenant=await pageFor({platform:true,active:true,scope:'org:foreign'});
    assert.equal(await tenant.$('button'),null);
    assert.deepEqual(await calls(tenant),[]);

    const page=await pageFor({platform:true,active:true,scope:'all'});
    await text(page,'Scan from Google');
    assert.equal((await calls(page)).some(([kind])=>kind==='scan'),false);
    await click(page);
    await text(page,'Checked 12 · Queued 10 · Skipped 1 · Failed 1');
    await text(page,'Scan next batch');
    assert.equal((await calls(page)).filter(([kind])=>kind==='scan').length,1);
    await click(page);
    await text(page,'Checked 3 · Queued 3 · Skipped 0 · Failed 0 · Scan complete');
    assert.deepEqual((await calls(page)).filter(([kind])=>kind==='scan').map(([,route,input])=>[route,input]),
      [['scan-club-google-reviewed',{limit:12,after:null}],
        ['scan-club-google-reviewed',{limit:12,after:'01234567-0000-4000-8000-000000000012'}]]);
    assert.equal((await calls(page)).filter(([kind])=>kind==='reload').length,2);

    const revoked=await pageFor({platform:true,active:true,scope:'all'});
    await text(revoked,'Scan from Google');
    await revoked.evaluate(()=>{window.fixture.active=false;});
    await click(revoked);
    await text(revoked,'Active platform Clubs access is required for scanning.');
    assert.equal((await calls(revoked)).some(([kind])=>kind==='scan'),false);

    const unavailable=await pageFor({platform:true,active:true,scope:'all',unverified:true});
    await text(unavailable,'Scan from Google');
    await click(unavailable);
    await text(unavailable,'The Google scan could not be confirmed.');
    assert.equal((await calls(unavailable)).some(([kind])=>kind==='reload'),false);
    await unavailable.evaluate(()=>{window.fixture.unverified=false;});
    await text(unavailable,'Retry Google scan');
    await click(unavailable);
    await text(unavailable,'Scan next batch');
    assert.deepEqual((await calls(unavailable)).filter(([kind])=>kind==='scan').map(([, ,input])=>input.after),[null,null]);
  } finally { await browser.close(); }
});
